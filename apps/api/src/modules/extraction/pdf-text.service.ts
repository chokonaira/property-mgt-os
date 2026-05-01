import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { PrismaService } from '../../shared/prisma.service';
import { ExtractionError } from './extraction-error';

/**
 * One text item from the PDF: the literal string, the page it
 * appeared on, and a y-coordinate so callers (T-505) can render
 * "this came from the line near Y=…" citations. Coordinates are
 * the PDF coordinate system (origin bottom-left).
 */
export interface ExtractedTextItem {
  /** 1-indexed */
  page: number;
  text: string;
  /** PDF user-space x of the lower-left of the glyph run */
  x?: number;
  /** PDF user-space y of the lower-left of the glyph run */
  y?: number;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  items: ExtractedTextItem[];
}

export interface ExtractedDocument {
  text: string;
  pages: ExtractedPage[];
  /** Which extractor produced the result. Useful for ADR / debugging. */
  extractor: 'unpdf' | 'pdfjs-fallback';
}

/**
 * Both adapters return ExtractedPage[] — text plus per-glyph x/y —
 * so T-505's source-line popover renders citations no matter which
 * extractor produced the result. Adapters are injected so tests can
 * stub without dragging unpdf's wasm or pdfjs's font setup into the
 * test runtime.
 */
type PdfExtractor = (buffer: Buffer | Uint8Array) => Promise<ExtractedPage[]>;

interface PdfTextDeps {
  /** Primary extractor — wraps unpdf. */
  unpdfExtract: PdfExtractor;
  /** Fallback extractor — wraps pdfjs-dist directly. */
  pdfjsExtract: PdfExtractor;
}

interface PdfTextConfig {
  uploadDir: string;
}

@Injectable()
export class PdfTextService {
  private readonly logger = new Logger(PdfTextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PdfTextConfig,
    private readonly deps: PdfTextDeps,
  ) {}

  /**
   * Convenience for callers that only need the joined text (T-503's
   * OpenAI prompt). Throws ExtractionError('cannot_read_pdf') when
   * both primary + fallback fail.
   */
  async extractText(documentId: string): Promise<string> {
    const result = await this.extractTextWithSpans(documentId);
    return result.text;
  }

  /**
   * Returns text + per-page items so T-505 can render source-line
   * citations. unpdf is tried first because it's the modern,
   * maintained wrapper; pdfjs-dist runs as the explicit fallback
   * for the encrypted-PDF / malformed-xref / unusual-encoding
   * cases unpdf can't crack. Both failing surfaces as
   * ExtractionError('cannot_read_pdf').
   */
  async extractTextWithSpans(documentId: string): Promise<ExtractedDocument> {
    const buffer = await this.loadFromStorage(documentId);

    try {
      const pages = await this.deps.unpdfExtract(buffer);
      return {
        text: pages.map((p) => p.text).join('\n\n'),
        pages,
        extractor: 'unpdf',
      };
    } catch (error) {
      this.logger.warn(
        { documentId, err: messageOf(error) },
        'extraction.unpdf_failed_falling_back',
      );
      try {
        const pages = await this.deps.pdfjsExtract(buffer);
        return {
          text: pages.map((p) => p.text).join('\n\n'),
          pages,
          extractor: 'pdfjs-fallback',
        };
      } catch (fallbackError) {
        this.logger.error(
          {
            documentId,
            primary: messageOf(error),
            fallback: messageOf(fallbackError),
          },
          'extraction.pdf_unreadable',
        );
        throw new ExtractionError('cannot_read_pdf', 'Could not extract text from the PDF.', {
          primary: messageOf(error),
          fallback: messageOf(fallbackError),
        });
      }
    }
  }

  private async loadFromStorage(documentId: string): Promise<Buffer> {
    const row = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { storageKey: true },
    });
    if (!row) {
      throw new ExtractionError('document_missing', `Document ${documentId} not found.`);
    }
    if (!row.storageKey) {
      throw new ExtractionError('storage_missing', `Document ${documentId} has no storage key.`);
    }
    const absolute = path.join(this.config.uploadDir, row.storageKey);
    try {
      return await fs.readFile(absolute);
    } catch (cause) {
      throw new ExtractionError(
        'storage_missing',
        `Document ${documentId} payload is missing on disk.`,
        cause,
      );
    }
  }
}

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  // JSON.stringify throws on circular references, which would mask
  // the real error inside the same catch block. Fall back to
  // String(value) — never throws.
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

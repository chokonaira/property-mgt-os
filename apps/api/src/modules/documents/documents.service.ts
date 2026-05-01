import { promises as fs } from 'node:fs';
import path from 'node:path';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { DocumentUploadResponse } from '@buena/shared';
import { AppException } from '../../shared/exceptions';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { PrismaService } from '../../shared/prisma.service';

// PDF magic bytes: every conforming file begins with `%PDF-` per the
// ISO 32000-1 spec. The header check (multer's `mimetype === pdf`) is
// trivially spoofable since the client sets it; the buffer prefix is
// the actual proof.
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);

export interface UploadedFile {
  /** original client-supplied filename (sanitized before display) */
  originalname: string;
  /** in-memory buffer; multer is configured with memoryStorage */
  buffer: Buffer;
  /** size in bytes */
  size: number;
  /** mime type per the multipart Content-Type header (NOT trustworthy alone) */
  mimetype: string;
}

interface DocumentsConfig {
  uploadDir: string;
  maxBytes: number;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: DocumentsConfig,
  ) {}

  async upload(tenantId: string, file: UploadedFile): Promise<DocumentUploadResponse> {
    if (!file?.buffer || !Number.isFinite(file.size)) {
      throw new AppException(
        'VALIDATION_FAILED',
        'No file uploaded.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (file.size > this.config.maxBytes) {
      throw new AppException(
        'PAYLOAD_TOO_LARGE',
        `File exceeds the ${formatMb(this.config.maxBytes)} limit.`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    if (!isPdf(file.buffer, file.mimetype)) {
      // 415: the request semantics are valid, the media type is not.
      throw new AppException(
        'UNSUPPORTED_MEDIA_TYPE',
        'Only PDF uploads are accepted.',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const sanitizedFilename = sanitizeFilename(file.originalname);

    // Persist DB row first to obtain the cuid; the storageKey is then
    // derived from it. If any of the disk operations below fails the
    // row gets cleaned up so the table never points at a missing file.
    const created = await this.prisma.document.create({
      data: {
        tenantId,
        filename: sanitizedFilename,
        mimeType: 'application/pdf',
        bytes: file.size,
        storageKey: '',
      },
    });
    const storageKey = path.join(tenantId, `${created.id}.pdf`);
    const absolutePath = path.join(this.config.uploadDir, storageKey);

    try {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, file.buffer);
      await this.prisma.document.update({
        where: { id: created.id },
        data: { storageKey },
      });
    } catch (error) {
      await this.prisma.document.delete({ where: { id: created.id } }).catch(() => undefined);
      throw new AppException(
        'INTERNAL',
        'Failed to persist the uploaded file.',
        HttpStatus.INTERNAL_SERVER_ERROR,
        { cause: error instanceof Error ? error.message : 'unknown' },
      );
    }

    return {
      id: created.id,
      filename: sanitizedFilename,
      mimeType: 'application/pdf',
      bytes: file.size,
    };
  }
}

function isPdf(buffer: Buffer, mimetype: string): boolean {
  if (mimetype !== 'application/pdf') return false;
  if (buffer.length < PDF_MAGIC.length) return false;
  return buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

// Strip path separators + Windows-illegal characters + Unicode control
// characters; keep up to 200 chars of the basename so the DB record
// stays readable. The storageKey on disk is always `{cuid}.pdf` — the
// original name only flows into the `filename` column for display.
//
// The first character class deliberately uses no ranges so ESLint's
// no-control-regex doesn't misread byte-range boundaries as control
// characters. Real control chars are stripped by the second pass via
// the Unicode property escape.
export function sanitizeFilename(raw: string): string {
  const base = path.basename(raw || '');
  const cleaned = base
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\p{Cc}/gu, '')
    .trim();
  if (!cleaned) return 'document.pdf';
  return cleaned.slice(0, 200);
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

import type * as pdfjsTypes from 'pdfjs-dist';
import type { ExtractedPage } from './pdf-text.service';

/**
 * Production adapters for the two extractor strategies. Both return
 * the SAME shape (ExtractedPage[]) — text plus per-glyph x/y — so
 * T-505's source-line popover renders citations whether unpdf or
 * pdfjs ran. Adapters live in their own module so PdfTextService
 * can be unit-tested with stubs without dragging unpdf's wasm or
 * pdfjs-dist's font setup into the test runtime.
 */

interface PdfjsTextItem {
  str: string;
  transform?: number[];
}

interface PdfDocumentProxyLike {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
  destroy(): Promise<void>;
}

async function readPages(doc: PdfDocumentProxyLike): Promise<ExtractedPage[]> {
  const pages: ExtractedPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = (content.items as PdfjsTextItem[])
        .filter((item) => typeof item.str === 'string' && item.str.trim().length > 0)
        .map((item) => {
          const transform = item.transform ?? [];
          return {
            page: pageNumber,
            text: item.str,
            x: typeof transform[4] === 'number' ? transform[4] : undefined,
            y: typeof transform[5] === 'number' ? transform[5] : undefined,
          };
        });
      // Join items into a page-level text blob with single-space
      // separators. Per-item positions stay on items[] so T-505
      // can highlight a source line by y-coordinate.
      const text = items.map((item) => item.text).join(' ');
      pages.push({ pageNumber, text, items });
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

export async function unpdfExtract(buffer: Buffer | Uint8Array): Promise<ExtractedPage[]> {
  const { getDocumentProxy } = await import('unpdf');
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  // unpdf's getDocumentProxy hands back the underlying pdfjs
  // document with its serverless-friendly defaults (no worker,
  // font fallback sorted). We walk pages ourselves so positions
  // land on every item — same shape as the pdfjs-direct fallback.
  const doc = (await getDocumentProxy(data)) as unknown as PdfDocumentProxyLike;
  return readPages(doc);
}

export async function pdfjsExtract(buffer: Buffer | Uint8Array): Promise<ExtractedPage[]> {
  // The legacy bundle ships a CommonJS-friendly entry that doesn't
  // require a worker thread — important for our Nest server.
  // isEvalSupported: false hardens against CVE-2024-4367-style
  // exec-from-PDF regressions even though the current dep is
  // patched.
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as typeof pdfjsTypes;
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const params = {
    data,
    disableFontFace: true,
    isEvalSupported: false,
  } as Parameters<typeof pdfjs.getDocument>[0];
  const doc = (await pdfjs.getDocument(params).promise) as unknown as PdfDocumentProxyLike;
  return readPages(doc);
}

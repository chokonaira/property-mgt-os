import type * as pdfjsTypes from 'pdfjs-dist';
import type { ExtractedPage } from './pdf-text.service';

/**
 * Production adapters for the two extractor strategies. Kept in a
 * dedicated module so PdfTextService can be unit-tested with stubs
 * without dragging the unpdf wasm or pdfjs-dist's font setup into
 * the test runtime.
 */
export async function unpdfExtract(
  buffer: Buffer | Uint8Array,
): Promise<{ totalPages: number; text: string[] }> {
  const { extractText } = await import('unpdf');
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const result = await extractText(data, { mergePages: false });
  // unpdf can return either a per-page string[] (mergePages: false) or
  // a single string (mergePages: true). Normalise.
  const pages = Array.isArray(result.text) ? result.text : [result.text];
  return { totalPages: result.totalPages ?? pages.length, text: pages };
}

interface PdfjsTextItem {
  str: string;
  transform?: number[];
}

/**
 * pdfjs-dist legacy build keeps the Node runtime happy (avoids the
 * worker thread requirement of the modern build). We turn each
 * page's textContent into our ExtractedPage shape, joining items
 * line-by-line so T-505's "source line" popover has something
 * citation-shaped to work with.
 */
export async function pdfjsExtract(buffer: Buffer | Uint8Array): Promise<ExtractedPage[]> {
  // The legacy bundle ships a CommonJS-friendly entry that doesn't
  // require a worker thread — important for our Nest server.
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as typeof pdfjsTypes;
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data, disableFontFace: true }).promise;

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
      // Join items into a page-level text blob with a single space
      // separator. The per-item positions stay on the items array
      // so T-505 can highlight a source line by y-coordinate.
      const text = items.map((item) => item.text).join(' ');
      pages.push({ pageNumber, text, items });
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

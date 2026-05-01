import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtractionError } from '../modules/extraction/extraction-error';
import { PdfTextService, type ExtractedPage } from '../modules/extraction/pdf-text.service';
import type { PrismaService } from '../shared/prisma.service';

interface DocumentRow {
  id: string;
  storageKey: string;
}

function makePrisma(rows: DocumentRow[] = []) {
  const findUnique = vi.fn(
    async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
  );
  return {
    prisma: { document: { findUnique } } as unknown as PrismaService,
    findUnique,
  };
}

describe('PdfTextService', () => {
  let uploadDir: string;
  beforeEach(async () => {
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'buena-extract-'));
  });
  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
  });

  async function writeFile(storageKey: string, content = '%PDF-1.7\n') {
    const target = path.join(uploadDir, storageKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
    return target;
  }

  it('returns the joined text + pages with positions on the unpdf primary path', async () => {
    const harness = makePrisma([{ id: 'doc-1', storageKey: 'demo/doc-1.pdf' }]);
    await writeFile('demo/doc-1.pdf');
    const primaryPages: ExtractedPage[] = [
      {
        pageNumber: 1,
        text: 'Page one heading',
        items: [
          { page: 1, text: 'Page', x: 50, y: 700 },
          { page: 1, text: 'one', x: 90, y: 700 },
          { page: 1, text: 'heading', x: 130, y: 700 },
        ],
      },
      {
        pageNumber: 2,
        text: 'Page two',
        items: [
          { page: 2, text: 'Page', x: 50, y: 700 },
          { page: 2, text: 'two', x: 90, y: 700 },
        ],
      },
    ];
    const unpdfExtract = vi.fn().mockResolvedValue(primaryPages);
    const pdfjsExtract = vi.fn();
    const svc = new PdfTextService(harness.prisma, { uploadDir }, { unpdfExtract, pdfjsExtract });

    const result = await svc.extractTextWithSpans('doc-1');
    expect(result.extractor).toBe('unpdf');
    expect(result.text).toBe('Page one heading\n\nPage two');
    expect(result.pages).toHaveLength(2);
    // Positions land on every primary-path item — T-505 source citations
    // work whether unpdf or pdfjs ran.
    expect(result.pages[0]?.items.every((i) => typeof i.x === 'number')).toBe(true);
    expect(pdfjsExtract).not.toHaveBeenCalled();
  });

  it('falls back to pdfjs when unpdf throws', async () => {
    const harness = makePrisma([{ id: 'doc-2', storageKey: 'demo/doc-2.pdf' }]);
    await writeFile('demo/doc-2.pdf');
    const unpdfExtract = vi.fn().mockRejectedValue(new Error('encrypted'));
    const fallbackPages: ExtractedPage[] = [
      {
        pageNumber: 1,
        text: 'Hello world',
        items: [
          { page: 1, text: 'Hello', x: 50, y: 700 },
          { page: 1, text: 'world', x: 90, y: 700 },
        ],
      },
    ];
    const pdfjsExtract = vi.fn().mockResolvedValue(fallbackPages);
    const svc = new PdfTextService(harness.prisma, { uploadDir }, { unpdfExtract, pdfjsExtract });

    const result = await svc.extractTextWithSpans('doc-2');
    expect(result.extractor).toBe('pdfjs-fallback');
    expect(result.text).toBe('Hello world');
    expect(result.pages[0]?.items[0]?.x).toBe(50);
    expect(unpdfExtract).toHaveBeenCalledTimes(1);
    expect(pdfjsExtract).toHaveBeenCalledTimes(1);
  });

  it('throws ExtractionError(cannot_read_pdf) when both extractors fail', async () => {
    const harness = makePrisma([{ id: 'doc-3', storageKey: 'demo/doc-3.pdf' }]);
    await writeFile('demo/doc-3.pdf');
    const unpdfExtract = vi.fn().mockRejectedValue(new Error('boom'));
    const pdfjsExtract = vi.fn().mockRejectedValue(new Error('also boom'));
    const svc = new PdfTextService(harness.prisma, { uploadDir }, { unpdfExtract, pdfjsExtract });

    await expect(svc.extractTextWithSpans('doc-3')).rejects.toMatchObject({
      name: 'ExtractionError',
      reason: 'cannot_read_pdf',
    });
  });

  it('throws ExtractionError(document_missing) when the row is absent', async () => {
    const harness = makePrisma();
    const svc = new PdfTextService(
      harness.prisma,
      { uploadDir },
      { unpdfExtract: vi.fn(), pdfjsExtract: vi.fn() },
    );
    await expect(svc.extractTextWithSpans('nope')).rejects.toBeInstanceOf(ExtractionError);
    await expect(svc.extractTextWithSpans('nope')).rejects.toMatchObject({
      reason: 'document_missing',
    });
  });

  it('throws ExtractionError(storage_missing) when storageKey is empty', async () => {
    const harness = makePrisma([{ id: 'doc-4', storageKey: '' }]);
    const svc = new PdfTextService(
      harness.prisma,
      { uploadDir },
      { unpdfExtract: vi.fn(), pdfjsExtract: vi.fn() },
    );
    await expect(svc.extractTextWithSpans('doc-4')).rejects.toMatchObject({
      reason: 'storage_missing',
    });
  });

  it('throws ExtractionError(storage_missing) when the file is gone on disk', async () => {
    const harness = makePrisma([{ id: 'doc-5', storageKey: 'demo/doc-5.pdf' }]);
    // Note: NO writeFile — storageKey points at a missing path.
    const svc = new PdfTextService(
      harness.prisma,
      { uploadDir },
      { unpdfExtract: vi.fn(), pdfjsExtract: vi.fn() },
    );
    await expect(svc.extractTextWithSpans('doc-5')).rejects.toMatchObject({
      reason: 'storage_missing',
    });
  });

  it('extractText is a thin alias over extractTextWithSpans', async () => {
    const harness = makePrisma([{ id: 'doc-6', storageKey: 'demo/doc-6.pdf' }]);
    await writeFile('demo/doc-6.pdf');
    const unpdfExtract = vi.fn().mockResolvedValue([
      {
        pageNumber: 1,
        text: 'Quick brown fox',
        items: [{ page: 1, text: 'Quick brown fox', x: 50, y: 700 }],
      },
    ] satisfies ExtractedPage[]);
    const svc = new PdfTextService(
      harness.prisma,
      { uploadDir },
      { unpdfExtract, pdfjsExtract: vi.fn() },
    );
    expect(await svc.extractText('doc-6')).toBe('Quick brown fox');
  });
});

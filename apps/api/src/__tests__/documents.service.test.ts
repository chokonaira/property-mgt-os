import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentsService, sanitizeFilename } from '../modules/documents/documents.service';
import type { PrismaService } from '../shared/prisma.service';

interface DocRow {
  id: string;
  tenantId: string;
  filename: string;
  mimeType: string;
  bytes: number;
  storageKey: string;
  createdAt: Date;
}

function pdfBuffer(extraBytes = 0): Buffer {
  // Real PDFs start with `%PDF-` (0x25 50 44 46 2D). Pad to a realistic size.
  const header = Buffer.from('%PDF-1.7\n', 'utf8');
  const pad = Buffer.alloc(extraBytes);
  return Buffer.concat([header, pad]);
}

function makePrisma() {
  let nextId = 0;
  const id = () => `doc-${++nextId}`;
  const rows: DocRow[] = [];

  const create = vi.fn(async ({ data }: { data: Omit<DocRow, 'id' | 'createdAt'> }) => {
    const row: DocRow = {
      id: id(),
      tenantId: data.tenantId,
      filename: data.filename,
      mimeType: data.mimeType,
      bytes: data.bytes,
      storageKey: data.storageKey ?? '',
      createdAt: new Date(),
    };
    rows.push(row);
    return row;
  });
  const update = vi.fn(
    async ({ where, data }: { where: { id: string }; data: Partial<DocRow> }) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error(`Document ${where.id} not found`);
      Object.assign(row, data);
      return row;
    },
  );
  const del = vi.fn(async ({ where }: { where: { id: string } }) => {
    const idx = rows.findIndex((r) => r.id === where.id);
    if (idx === -1) throw new Error(`Document ${where.id} not found`);
    return rows.splice(idx, 1)[0];
  });

  return {
    prisma: { document: { create, update, delete: del } } as unknown as PrismaService,
    rows,
    create,
    update,
    delete: del,
  };
}

describe('sanitizeFilename', () => {
  it('strips path separators', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('/abs/path/file.pdf')).toBe('file.pdf');
  });

  it('falls back to "document.pdf" on empty input', () => {
    expect(sanitizeFilename('')).toBe('document.pdf');
    expect(sanitizeFilename('   ')).toBe('document.pdf');
  });

  it('truncates very long names to 200 chars', () => {
    const long = 'a'.repeat(500) + '.pdf';
    const out = sanitizeFilename(long);
    expect(out.length).toBe(200);
  });

  it('keeps a normal-looking name unchanged', () => {
    expect(sanitizeFilename('Teilungserklaerung_Parkview.pdf')).toBe(
      'Teilungserklaerung_Parkview.pdf',
    );
  });
});

describe('DocumentsService.upload', () => {
  let uploadDir: string;
  beforeEach(async () => {
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'buena-uploads-'));
  });
  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
  });

  it('persists the row + writes the file on the happy path', async () => {
    const harness = makePrisma();
    const svc = new DocumentsService(harness.prisma, { uploadDir, maxBytes: 10_000 });
    const buffer = pdfBuffer();
    const result = await svc.upload('demo', {
      originalname: 'sample.pdf',
      buffer,
      size: buffer.length,
      mimetype: 'application/pdf',
    });

    expect(result.id).toBeTruthy();
    expect(result.filename).toBe('sample.pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.bytes).toBe(buffer.length);
    expect(harness.rows).toHaveLength(1);
    expect(harness.rows[0]?.storageKey).toBe(path.join('demo', `${result.id}.pdf`));
    const stored = await fs.readFile(path.join(uploadDir, harness.rows[0]!.storageKey));
    expect(stored.equals(buffer)).toBe(true);
  });

  it('rejects a non-PDF mimetype with 415', async () => {
    const harness = makePrisma();
    const svc = new DocumentsService(harness.prisma, { uploadDir, maxBytes: 10_000 });
    await expect(
      svc.upload('demo', {
        originalname: 'evil.png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        size: 4,
        mimetype: 'image/png',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE' }),
    });
    expect(harness.rows).toHaveLength(0);
  });

  it('rejects spoofed mimetype when magic bytes do not match PDF', async () => {
    const harness = makePrisma();
    const svc = new DocumentsService(harness.prisma, { uploadDir, maxBytes: 10_000 });
    await expect(
      svc.upload('demo', {
        originalname: 'spoof.pdf',
        // mimetype lies — magic bytes are PNG.
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        size: 8,
        mimetype: 'application/pdf',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE' }),
    });
    expect(harness.rows).toHaveLength(0);
  });

  it('rejects oversize uploads with 413', async () => {
    const harness = makePrisma();
    const svc = new DocumentsService(harness.prisma, { uploadDir, maxBytes: 100 });
    const buffer = pdfBuffer(200);
    await expect(
      svc.upload('demo', {
        originalname: 'big.pdf',
        buffer,
        size: buffer.length,
        mimetype: 'application/pdf',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }),
    });
    expect(harness.rows).toHaveLength(0);
  });

  it('cleans up the DB row when the disk write fails', async () => {
    const harness = makePrisma();
    // Point at a path that cannot be created (a regular file masquerading
    // as a directory) so fs.writeFile blows up.
    const blockingFile = path.join(uploadDir, 'blocker');
    await fs.writeFile(blockingFile, 'x');
    const svc = new DocumentsService(harness.prisma, {
      uploadDir: blockingFile,
      maxBytes: 10_000,
    });
    const buffer = pdfBuffer();
    await expect(
      svc.upload('demo', {
        originalname: 'sample.pdf',
        buffer,
        size: buffer.length,
        mimetype: 'application/pdf',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INTERNAL' }),
    });
    expect(harness.rows).toHaveLength(0);
    expect(harness.delete).toHaveBeenCalledTimes(1);
  });

  it('isolates the file under the supplied tenantId', async () => {
    const harness = makePrisma();
    const svc = new DocumentsService(harness.prisma, { uploadDir, maxBytes: 10_000 });
    const buffer = pdfBuffer();
    const result = await svc.upload('tenant-a', {
      originalname: 'sample.pdf',
      buffer,
      size: buffer.length,
      mimetype: 'application/pdf',
    });
    const expectedDir = path.join(uploadDir, 'tenant-a');
    const exists = await fs
      .stat(path.join(expectedDir, `${result.id}.pdf`))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });
});

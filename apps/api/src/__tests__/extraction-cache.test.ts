import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { findCachedExtractionRun } from '../modules/extraction/lib/extraction-cache';

interface Row {
  id: string;
  documentId: string;
  status: 'ok' | 'failed';
  parsedResult: Prisma.JsonValue;
  confidence: Prisma.Decimal;
  durationMs: number;
  createdAt: Date;
}

function makeReader(rows: Row[]) {
  const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    const matches = rows
      .filter(
        (r) =>
          (where.documentId === undefined || r.documentId === where.documentId) &&
          (where.status === undefined || r.status === where.status),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0] ?? null;
  });
  return { reader: { findFirst }, findFirst };
}

const ok = (id: string, doc: string, ms: number, conf: number): Row => ({
  id,
  documentId: doc,
  status: 'ok',
  parsedResult: { property: { name: 'Cached', managementType: 'WEG' }, buildings: [] },
  confidence: new Prisma.Decimal(conf),
  durationMs: 100,
  createdAt: new Date(ms),
});

describe('findCachedExtractionRun', () => {
  it('returns null when no run exists for the document', async () => {
    const harness = makeReader([]);
    const result = await findCachedExtractionRun(harness.reader, 'doc-x');
    expect(result).toBeNull();
  });

  it('returns the most recent successful run', async () => {
    const harness = makeReader([ok('older', 'doc-1', 1000, 0.7), ok('newer', 'doc-1', 2000, 0.9)]);
    const result = await findCachedExtractionRun(harness.reader, 'doc-1');
    expect(result?.id).toBe('newer');
    expect(result?.confidence).toBe(0.9);
  });

  it('skips the cache when force=true', async () => {
    const harness = makeReader([ok('any', 'doc-1', 1000, 0.9)]);
    const result = await findCachedExtractionRun(harness.reader, 'doc-1', { force: true });
    expect(result).toBeNull();
    expect(harness.findFirst).not.toHaveBeenCalled();
  });

  it('does not return failed runs', async () => {
    const harness = makeReader([{ ...ok('failed', 'doc-1', 1000, 0), status: 'failed' as const }]);
    const result = await findCachedExtractionRun(harness.reader, 'doc-1');
    expect(result).toBeNull();
  });
});

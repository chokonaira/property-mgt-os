import type { Prisma } from '@prisma/client';
import type { ExtractionResult } from '@buena/shared';

/**
 * Idempotency cache for extraction runs (T-503 spec):
 * - Key: documentId.
 * - Hit: most-recent successful run for this document.
 * - Bypass: caller passes `force=true`.
 *
 * Persisted directly on the ExtractionRun table — survives restarts
 * and shares a single source of truth with the audit trail. Always-
 * on, independent of the in-memory rate-limit primitive (T-007).
 */

interface ExtractionRunReader {
  findFirst(args: {
    where: Prisma.ExtractionRunWhereInput;
    orderBy: Prisma.ExtractionRunOrderByWithRelationInput;
  }): Promise<{
    id: string;
    parsedResult: Prisma.JsonValue;
    confidence: Prisma.Decimal;
    durationMs: number;
  } | null>;
}

export interface CachedExtractionRun {
  id: string;
  parsedResult: ExtractionResult;
  confidence: number;
}

export async function findCachedExtractionRun(
  reader: ExtractionRunReader,
  documentId: string,
  options: { force?: boolean } = {},
): Promise<CachedExtractionRun | null> {
  if (options.force) return null;
  const row = await reader.findFirst({
    where: { documentId, status: 'ok' },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  return {
    id: row.id,
    parsedResult: row.parsedResult as unknown as ExtractionResult,
    confidence: Number(row.confidence.toString()),
  };
}

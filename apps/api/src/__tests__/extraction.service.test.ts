import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { ExtractionResult } from '@buena/shared';
import { ExtractionError } from '../modules/extraction/extraction-error';
import { ExtractionService } from '../modules/extraction/extraction.service';
import type { OpenAIService } from '../modules/extraction/openai.service';
import type { PdfTextService } from '../modules/extraction/pdf-text.service';
import type { PrismaService } from '../shared/prisma.service';

const MODEL_RESULT: ExtractionResult = {
  property: { name: 'Parkview', managementType: 'WEG', totalMea: 1000 },
  buildings: [{ label: 'Haus A', street: 'Am Fiktivpark', houseNumber: '12' }],
  units: [],
  contacts: [],
  confidenceByField: {
    'property.name': 0.9,
    'property.totalMea': 1.0,
  },
  sourceSpansByField: {
    'property.name': 'Parkview Residences Berlin',
    'property.totalMea': '1.000 Miteigentumsanteile (MEA)',
    'property.fake': 'never appears',
  },
  warnings: [],
};

const SOURCE_TEXT = `
Parkview Residences Berlin steht für ...
Das Eigentum am Grundstück wird in 1.000 Miteigentumsanteile (MEA) zerlegt.
`;

function makeHarness(
  overrides: {
    cached?: ExtractionRunRow | null;
    pdfText?: { text: string; pages: unknown[]; extractor: 'unpdf' | 'pdfjs-fallback' };
    openaiResult?: ExtractionResult;
    openaiError?: Error;
    charBudget?: number;
  } = {},
) {
  const runs: ExtractionRunRow[] = overrides.cached ? [overrides.cached] : [];
  const findFirst = vi.fn(async () => overrides.cached ?? null);
  const create = vi.fn(async ({ data }: { data: Omit<ExtractionRunRow, 'id'> }) => {
    const row: ExtractionRunRow = {
      id: `run-${runs.length + 1}`,
      documentId: data.documentId,
      status: data.status,
      parsedResult: data.parsedResult,
      confidence: data.confidence,
      durationMs: data.durationMs,
      createdAt: new Date(),
    };
    runs.push(row);
    return row;
  });
  const prisma = {
    extractionRun: { findFirst, create },
  } as unknown as PrismaService;
  const pdfText = {
    extractTextWithSpans: vi.fn(async () => ({
      text: overrides.pdfText?.text ?? SOURCE_TEXT,
      pages: overrides.pdfText?.pages ?? [],
      extractor: overrides.pdfText?.extractor ?? 'unpdf',
    })),
  } as unknown as PdfTextService;
  const openai = {
    extract: vi.fn(async () => {
      if (overrides.openaiError) throw overrides.openaiError;
      return {
        parsed: overrides.openaiResult ?? MODEL_RESULT,
        rawResponse: 'raw',
        durationMs: 1234,
        promptVersion: 'extract.v1',
        model: 'gpt-4o-mini',
      };
    }),
  } as unknown as OpenAIService;
  const svc = new ExtractionService(prisma, pdfText, openai, {
    maxTokens: overrides.charBudget ?? 1_000_000,
  });
  return { svc, prisma, pdfText, openai, create, findFirst, runs };
}

interface ExtractionRunRow {
  id: string;
  documentId: string;
  status: string;
  parsedResult: unknown;
  confidence: Prisma.Decimal;
  durationMs: number;
  createdAt: Date;
}

describe('ExtractionService.run', () => {
  it('returns the cached run + cached: true when the cache hits', async () => {
    const cached: ExtractionRunRow = {
      id: 'run-cached',
      documentId: 'doc-1',
      status: 'ok',
      parsedResult: MODEL_RESULT,
      confidence: new Prisma.Decimal(0.95),
      durationMs: 4321,
      createdAt: new Date(),
    };
    const harness = makeHarness({ cached });
    const result = await harness.svc.run('doc-1');
    expect(result.cached).toBe(true);
    expect(result.runId).toBe('run-cached');
    expect(result.durationMs).toBe(0);
    expect(harness.openai.extract).not.toHaveBeenCalled();
  });

  it('bypasses the cache when force=true', async () => {
    const cached: ExtractionRunRow = {
      id: 'run-cached',
      documentId: 'doc-1',
      status: 'ok',
      parsedResult: MODEL_RESULT,
      confidence: new Prisma.Decimal(0.95),
      durationMs: 4321,
      createdAt: new Date(),
    };
    const harness = makeHarness({ cached });
    await harness.svc.run('doc-1', { force: true });
    expect(harness.openai.extract).toHaveBeenCalled();
  });

  it('drops hallucinated source spans and emits an AMBIGUOUS_VALUE warning', async () => {
    const harness = makeHarness();
    const result = await harness.svc.run('doc-1');
    expect(result.extraction.sourceSpansByField).toHaveProperty('property.name');
    expect(result.extraction.sourceSpansByField).toHaveProperty('property.totalMea');
    expect(result.extraction.sourceSpansByField).not.toHaveProperty('property.fake');
    const ambiguous = result.warnings.find((w) => w.code === 'AMBIGUOUS_VALUE');
    expect(ambiguous?.fields).toContain('property.fake');
  });

  it('computes overall confidence as the mean of confidenceByField', async () => {
    const harness = makeHarness();
    const result = await harness.svc.run('doc-1');
    expect(result.confidence).toBeCloseTo(0.95, 4);
  });

  it('persists the ExtractionRun row on success', async () => {
    const harness = makeHarness();
    await harness.svc.run('doc-1');
    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.create.mock.calls[0]?.[0]?.data?.status).toBe('ok');
  });

  it('rejects with too_large + persists a failed run when budget exceeded', async () => {
    const harness = makeHarness({
      pdfText: {
        text: 'x'.repeat(200_000),
        pages: [],
        extractor: 'unpdf',
      },
      charBudget: 100,
    });
    await expect(harness.svc.run('doc-1')).rejects.toMatchObject({
      reason: 'too_large',
    });
    expect(harness.openai.extract).not.toHaveBeenCalled();
    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });

  it('persists a failed run when OpenAI throws ExtractionError', async () => {
    const harness = makeHarness({
      openaiError: new ExtractionError('timeout', 'OpenAI exceeded 15s'),
    });
    await expect(harness.svc.run('doc-1')).rejects.toMatchObject({
      reason: 'timeout',
    });
    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });
});

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ExtractionResult } from '@buena/shared';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { PrismaService } from '../../shared/prisma.service';
import { ExtractionError } from './extraction-error';
import { checkDocumentType } from './lib/document-type-guard';
import { findCachedExtractionRun, type CachedExtractionRun } from './lib/extraction-cache';
import { ensureMeaWarning } from './lib/mea-invariant';
import { checkTokenBudget, type Encoder } from './lib/token-budget';
import { verifySpans } from './lib/verify-spans';
import {
  AI_EXTRACTION_CLIENT,
  type AiExtractionClient,
  type ExtractionCallResult,
} from './ai-extraction.client';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { PdfTextService } from './pdf-text.service';

export interface ExtractionRunResponse {
  runId: string;
  extraction: ExtractionResult;
  warnings: ExtractionResult['warnings'];
  confidence: number;
  durationMs: number;
  cached: boolean;
}

interface ExtractionConfig {
  /** Cap on document size before we even call the model. */
  maxTokens: number;
  /** Token-counter; gpt-tokenizer in production, char/4 heuristic for tests. */
  encode?: Encoder;
}

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfText: PdfTextService,
    @Inject(AI_EXTRACTION_CLIENT) private readonly aiClient: AiExtractionClient,
    private readonly config: ExtractionConfig,
  ) {}

  /**
   * Run extraction for a previously-uploaded document. The flow:
   *
   *   1. Idempotency cache lookup (unless force=true).
   *   2. Load the PDF text via PdfTextService.
   *   3. Token budget guard — short-circuit on oversized docs so
   *      we never burn a slow OpenAI call we know would 429.
   *   4. Call OpenAI with structured output + retry-once.
   *   5. Verify source spans against the source text; drop
   *      hallucinated citations + emit MISSING_FIELD warnings for
   *      the unverified field paths.
   *   6. Compute the overall confidence (mean of confidenceByField).
   *   7. Persist ExtractionRun for the audit trail.
   *
   * Persisting on every outcome is a hard rule from the spec — even
   * timeouts + parse failures get a row so the eval set has data.
   */
  async run(documentId: string, options: { force?: boolean } = {}): Promise<ExtractionRunResponse> {
    const cached = await findCachedExtractionRun(this.prisma.extractionRun, documentId, options);
    if (cached) return this.fromCache(cached);

    const extracted = await this.pdfText.extractTextWithSpans(documentId);
    const sourceText = extracted.text;

    // Doc-type guard. Pre-LLM pass that rejects PDFs that aren't a
    // Teilungserklärung — burning a model call only to return
    // schema-fitted nonsense for a rental contract is worse than
    // refusing fast with a clear message. See document-type-guard
    // for the matched-signal heuristic.
    const docCheck = checkDocumentType(sourceText);
    if (!docCheck.ok) {
      await this.persistFailed(documentId, 'EXTRACTION_NOT_TEILUNGSERKLARUNG', {
        matchedSignals: docCheck.matchedSignals,
      });
      throw new ExtractionError(
        'not_teilungserklarung',
        docCheck.reason ?? 'Document is not a Teilungserklärung.',
      );
    }

    const budget = checkTokenBudget(sourceText, this.config.maxTokens, this.config.encode);
    if (budget.exceeds) {
      await this.persistFailed(documentId, 'EXTRACTION_TOO_LARGE', {
        estimated: budget.estimated,
        limit: budget.limit,
      });
      throw new ExtractionError(
        'too_large',
        `Document exceeds the ${budget.limit}-token budget (estimated ${budget.estimated}).`,
      );
    }

    let call: ExtractionCallResult;
    try {
      call = await this.aiClient.extract(sourceText);
    } catch (error) {
      if (error instanceof ExtractionError) {
        await this.persistFailed(documentId, error.reason, error.cause);
      } else {
        await this.persistFailed(documentId, 'unknown', { message: String(error) });
      }
      throw error;
    }

    // Drop hallucinated citations + warn on unverified spans.
    const verified = verifySpans(call.parsed.sourceSpansByField, sourceText);
    let finalExtraction: ExtractionResult = {
      ...call.parsed,
      sourceSpansByField: verified.verified,
      warnings: verified.unverified.length
        ? [
            ...call.parsed.warnings,
            {
              code: 'AMBIGUOUS_VALUE',
              message: `Could not verify ${verified.unverified.length} source span(s) against the document; chips will render as "Unverified".`,
              fields: verified.unverified,
            },
          ]
        : call.parsed.warnings,
    };

    // Server-side MEA invariant: recompute the unit-share sum vs the
    // declared total and inject a warning if the model didn't already.
    // The wedge demo hinges on this warning surfacing reliably.
    finalExtraction = ensureMeaWarning(finalExtraction);

    const confidence = computeOverallConfidence(finalExtraction.confidenceByField);

    const persisted = await this.prisma.extractionRun.create({
      data: {
        documentId,
        model: call.model,
        promptVersion: call.promptVersion,
        rawResponse: call.rawResponse as unknown as Prisma.InputJsonValue,
        parsedResult: finalExtraction as unknown as Prisma.InputJsonValue,
        confidence: new Prisma.Decimal(confidence),
        durationMs: call.durationMs,
        status: 'ok',
      },
    });

    return {
      runId: persisted.id,
      extraction: finalExtraction,
      warnings: finalExtraction.warnings,
      confidence,
      durationMs: call.durationMs,
      cached: false,
    };
  }

  private async fromCache(cached: CachedExtractionRun): Promise<ExtractionRunResponse> {
    return {
      runId: cached.id,
      extraction: cached.parsedResult,
      warnings: cached.parsedResult.warnings,
      confidence: cached.confidence,
      durationMs: 0,
      cached: true,
    };
  }

  private async persistFailed(documentId: string, reason: string, detail: unknown): Promise<void> {
    try {
      await this.prisma.extractionRun.create({
        data: {
          documentId,
          model: 'unknown',
          promptVersion: 'unknown',
          rawResponse: { reason, detail } as unknown as Prisma.InputJsonValue,
          parsedResult: {} as unknown as Prisma.InputJsonValue,
          confidence: new Prisma.Decimal(0),
          durationMs: 0,
          status: 'failed',
        },
      });
    } catch (writeError) {
      this.logger.error(
        { documentId, reason, writeError: String(writeError) },
        'extraction.persist_failed_run_error',
      );
    }
  }
}

export function computeOverallConfidence(
  confidenceByField: Record<string, number> | undefined,
): number {
  if (!confidenceByField) return 0;
  const values = Object.values(confidenceByField);
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, n) => acc + n, 0);
  return Math.round((sum / values.length) * 10000) / 10000;
}

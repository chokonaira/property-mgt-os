import { ExtractionResultSchema, type ExtractionResult } from '@buena/shared';

/** DI token for the active AI provider (OpenAI or Anthropic). */
export const AI_EXTRACTION_CLIENT = 'AI_EXTRACTION_CLIENT';

/**
 * Provider-agnostic interface for the structured-extraction LLM call.
 * The orchestrator (ExtractionService) depends on this contract, not
 * on a concrete vendor SDK — so OpenAI ↔ Anthropic swap is one factory
 * change in extraction.module.ts.
 */
export interface AiExtractionClient {
  extract(documentText: string): Promise<ExtractionCallResult>;
}

export interface ExtractionCallResult {
  parsed: ExtractionResult;
  rawResponse: string;
  durationMs: number;
  promptVersion: string;
  model: string;
}

/**
 * Inlined ExtractionResultSchema.safeParse — using a generic helper
 * would have collapsed Zod's distinct input / output types (the
 * schema has .default() on contacts / confidenceByField /
 * sourceSpansByField / warnings, so input ≠ output) and the parsed
 * `data` would surface as the input shape (optional) instead of the
 * output shape (required, defaults applied).
 */
export function parseExtraction(
  raw: string,
): { success: true; data: ExtractionResult } | { success: false; error: string } {
  if (!raw) return { success: false, error: 'empty model response' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'JSON parse failed',
    };
  }
  const result = ExtractionResultSchema.safeParse(json);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return { success: false, error: message };
  }
  return { success: true, data: result.data as ExtractionResult };
}

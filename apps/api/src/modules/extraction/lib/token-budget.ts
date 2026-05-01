/**
 * Pre-call token guard for the extraction prompt. We want to short-
 * circuit BEFORE the OpenAI request when a document is so big that
 * the call would either time out or eat half the daily budget.
 *
 * Estimation strategy:
 * - Production: gpt-tokenizer's encode() (real BPE).
 * - Tests / SSR: a deterministic char/4 heuristic so the budget
 *   helper is testable without loading the tokenizer's tables.
 *
 * The exported `estimateTokens(text, encode?)` keeps the heuristic
 * available for the no-encoder case and lets callers inject their
 * own (the production wiring passes gpt-tokenizer.encode).
 */

const HEURISTIC_DIVISOR = 4;

export type Encoder = (text: string) => { length: number };

export function estimateTokens(text: string, encode?: Encoder): number {
  if (!text) return 0;
  if (encode) return encode(text).length;
  return Math.ceil(text.length / HEURISTIC_DIVISOR);
}

export const DEFAULT_MAX_TOKENS = 25_000;

export interface TokenBudgetCheck {
  estimated: number;
  limit: number;
  exceeds: boolean;
}

export function checkTokenBudget(
  text: string,
  limit: number = DEFAULT_MAX_TOKENS,
  encode?: Encoder,
): TokenBudgetCheck {
  const estimated = estimateTokens(text, encode);
  return { estimated, limit, exceeds: estimated > limit };
}

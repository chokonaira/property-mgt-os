import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_TOKENS,
  checkTokenBudget,
  estimateTokens,
} from '../modules/extraction/lib/token-budget';

describe('estimateTokens', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('uses the char/4 heuristic when no encoder is supplied', () => {
    expect(estimateTokens('a'.repeat(20))).toBe(5);
    expect(estimateTokens('a'.repeat(17))).toBe(5); // ceil(17/4)
  });

  it('delegates to a supplied encoder when present', () => {
    const encode = (text: string) => ({ length: text.split(' ').length });
    expect(estimateTokens('one two three four', encode)).toBe(4);
  });
});

describe('checkTokenBudget', () => {
  it('reports under-budget for a short document', () => {
    const result = checkTokenBudget('short text');
    expect(result.exceeds).toBe(false);
    expect(result.limit).toBe(DEFAULT_MAX_TOKENS);
  });

  it('flags exceeds when text passes the limit', () => {
    const text = 'x'.repeat(200_000);
    const result = checkTokenBudget(text);
    expect(result.exceeds).toBe(true);
    expect(result.estimated).toBeGreaterThan(result.limit);
  });

  it('honours a custom limit', () => {
    const result = checkTokenBudget('x'.repeat(40), 5);
    expect(result.estimated).toBe(10);
    expect(result.exceeds).toBe(true);
  });
});

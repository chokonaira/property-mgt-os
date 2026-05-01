/**
 * Per-field confidence tiers for the AI Review Panel chips. Thresholds
 * mirror the ranges in `04-AI-EXTRACTION-SPEC.md` §6:
 *
 *   ≥ 0.85 → high (green)
 *   0.6–0.85 → medium (amber)
 *   < 0.6 → low (red)
 *
 * `unverified` is reserved for fields the model populated but whose
 * source span failed server-side `verifySpans` (no citation possible).
 */
export type ConfidenceTier = 'high' | 'medium' | 'low' | 'unverified';

export const CONFIDENCE_HIGH = 0.85;
export const CONFIDENCE_MEDIUM = 0.6;

export function classifyConfidence(score: number): ConfidenceTier {
  if (!Number.isFinite(score) || score < 0) return 'low';
  if (score >= CONFIDENCE_HIGH) return 'high';
  if (score >= CONFIDENCE_MEDIUM) return 'medium';
  return 'low';
}

/**
 * Picks the tier for a field. When the model emitted a confidence but
 * the span couldn't be verified server-side, callers pass
 * `verified: false` and we render the chip as 'unverified' regardless
 * of the numeric score — the value may still be useful, but we won't
 * let a green chip vouch for an ungrounded number.
 */
export function tierForField(score: number | undefined, verified: boolean): ConfidenceTier {
  if (score === undefined) return 'unverified';
  if (!verified) return 'unverified';
  return classifyConfidence(score);
}

import type { ExtractionResult } from '@buena/shared';

/**
 * Server-side MEA invariant check. The system prompt asks the
 * model to emit a MEA_MISMATCH warning when shares don't sum to
 * totalMea, but we don't trust it to compute reliably — we
 * recompute server-side and inject the warning if missing. The
 * model's existing warning (if any) is preserved.
 *
 * Tolerance: 0.01. Two-decimal rounding rounding errors don't
 * trip a noisy warning.
 */

const TOLERANCE = 0.01;

export interface MeaInvariantOutcome {
  matches: boolean;
  sum: number;
  total: number | undefined;
  delta: number;
}

export function computeMeaInvariant(extraction: ExtractionResult): MeaInvariantOutcome {
  const total = extraction.property.totalMea;
  const sum = extraction.units.reduce((acc, unit) => acc + (unit.meaShare ?? 0), 0);
  if (total === undefined) {
    return { matches: true, sum, total: undefined, delta: 0 };
  }
  const delta = total - sum;
  return { matches: Math.abs(delta) <= TOLERANCE, sum, total, delta };
}

export function ensureMeaWarning(extraction: ExtractionResult): ExtractionResult {
  const outcome = computeMeaInvariant(extraction);
  if (outcome.matches) return extraction;

  const alreadyEmitted = extraction.warnings.some((w) => w.code === 'MEA_MISMATCH');
  if (alreadyEmitted) return extraction;

  const sum = roundToOne(outcome.sum);
  const total = roundToOne(outcome.total ?? 0);
  return {
    ...extraction,
    warnings: [
      ...extraction.warnings,
      {
        code: 'MEA_MISMATCH',
        message: `Unit MEA shares sum to ${sum} but the document declares totalMea=${total}. ${roundToOne(outcome.total === undefined ? 0 : outcome.total - outcome.sum)} unaccounted.`,
        fields: ['property.totalMea', 'units[*].meaShare'],
      },
    ],
  };
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

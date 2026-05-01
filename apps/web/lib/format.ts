import type { Floor, Unit } from '@buena/shared';

/**
 * Single source of truth for floor display. Used by both the wizard
 * unit-table cell trigger and the AI Review Panel — they MUST agree
 * so a value previewed pre-accept renders identically post-accept.
 *
 * `placeholder` is the empty-state string used when no floor is
 * picked yet ("—" in the wizard cell, "" in the panel preview).
 */
export function formatFloor(floor: Floor | undefined, placeholder = '—'): string {
  if (!floor) return placeholder;
  switch (floor.kind) {
    case 'EG':
      return 'EG';
    case 'DG':
      return 'DG';
    case 'OG':
      return floor.qualifier ? `OG ${floor.level} ${floor.qualifier}` : `OG ${floor.level}`;
    case 'UG':
      return `UG ${floor.level}`;
    case 'STAFFEL':
      return floor.qualifier ? `Staffel ${floor.qualifier}` : 'Staffel';
  }
}

export function formatMea(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, '') || '0';
}

export function sumMea(units: Unit[]): number {
  return units.reduce((acc, u) => acc + u.meaShare, 0);
}

const NUMBER_DE = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 4,
});
const NUMBER_EN = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 4,
});

export function formatNumber(value: number, locale: string): string {
  return locale === 'de' ? NUMBER_DE.format(value) : NUMBER_EN.format(value);
}

export function formatSqm(value: number | undefined, locale: string): string {
  if (value === undefined) return '—';
  return `${formatNumber(value, locale)} m²`;
}

export interface MeaStatus {
  expected: number;
  matches: boolean;
  ratio: number;
  delta: number;
}

// `total` undefined ⇒ caller hasn't declared a target; we treat the running
// sum as the source of truth (always balanced). When `total` is 0 we still
// compare honestly against it: a non-zero sum is a mismatch.
export function evaluateMea(sum: number, total: number | undefined): MeaStatus {
  const tolerance = 0.01;
  const expected = total ?? sum;
  const delta = expected - sum;
  const matches = Math.abs(delta) <= tolerance;
  const ratio = expected > 0 ? Math.min(sum / expected, 1) : 0;
  return { expected, matches, ratio, delta };
}

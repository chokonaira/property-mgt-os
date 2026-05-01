import type { Floor, Unit } from '@buena/shared';

export function formatFloor(floor: Floor | undefined): string {
  if (!floor) return '—';
  switch (floor.kind) {
    case 'EG':
      return 'EG';
    case 'DG':
      return 'DG';
    case 'OG':
      return `OG ${floor.level}`;
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

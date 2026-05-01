import type { WizardDraftInput } from '@/lib/schemas/wizard-draft';

export interface BuildingBreakdownRow {
  /** Position of the building in the wizard's `buildings` array. */
  index: number;
  /** Display label — building.label, then nickname, then a fallback. */
  label: string;
  /** Sum of MEA shares across units that point at this buildingIndex. */
  sum: number;
}

export interface MeaBreakdownInput {
  buildings: WizardDraftInput['buildings'];
  units: WizardDraftInput['units'];
  /**
   * Fallback label when a building has no `label` or `nickname`. The
   * caller passes a localised string ("Building 1" / "Gebäude 1").
   */
  fallback: (oneBasedIndex: number) => string;
}

/**
 * Per-building MEA roll-up for the wizard's invariant bar. Pure: zero
 * RHF / next-intl coupling so unit tests can pin behaviour without
 * mounting the bar in a render harness.
 *
 * Units whose `meaShare` is non-numeric (the row hasn't been filled
 * in yet) contribute zero — surface as "0" in the breakdown rather
 * than skipping the building, so the user sees every card and where
 * the gap is.
 *
 * Units whose `buildingIndex` falls outside the buildings array are
 * dropped from the per-building rows but counted in the unscoped
 * `total` returned alongside.
 */
export interface MeaBreakdown {
  total: number;
  rows: BuildingBreakdownRow[];
}

export function computeMeaBreakdown({ buildings, units, fallback }: MeaBreakdownInput): MeaBreakdown {
  const total = units.reduce(
    (acc, u) => acc + (typeof u.meaShare === 'number' ? u.meaShare : 0),
    0,
  );
  const rows: BuildingBreakdownRow[] = buildings.map((b, idx) => {
    const sum = units
      .filter((u) => u.buildingIndex === idx)
      .reduce((acc, u) => acc + (typeof u.meaShare === 'number' ? u.meaShare : 0), 0);
    const label = b.label?.trim() || b.nickname?.trim() || fallback(idx + 1);
    return { index: idx, label, sum };
  });
  return { total, rows };
}

/**
 * Tone for the bar's chrome + fill. Pure mapping from sum / total →
 * { matched | short | exceeded }. 0.01 tolerance matches the
 * server-side `ensureMeaWarning` invariant so the wizard agrees with
 * the server's MEA_MISMATCH warning.
 */
export type MeaTone = 'matched' | 'short' | 'exceeded';

export function classifyMeaTone(sum: number, total: number | undefined): MeaTone {
  if (total === undefined) return 'matched';
  const delta = total - sum;
  if (Math.abs(delta) <= 0.01) return 'matched';
  if (delta > 0) return 'short';
  return 'exceeded';
}

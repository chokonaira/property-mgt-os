import type { WizardDraftInput } from '@/lib/schemas/wizard-draft';

export interface DuplicateRowInfo {
  /** The row index of the EARLIER occurrence — used in the toast / tooltip
   *  so the user can locate the original they duplicated. */
  duplicateOf: number;
  number: string;
  buildingLabel: string;
}

/**
 * Walks the wizard's units array and returns a map of row indices that
 * duplicate an earlier row's (buildingIndex, number). The first occurrence
 * is NOT in the map; only second + subsequent occurrences are flagged.
 *
 * Pure: no RHF or React coupling, unit-testable. Used by:
 *   - the unit-table cell renderer to paint red borders + tooltips
 *   - the step-3 validator so Save stays disabled until duplicates are
 *     resolved (server-side @@unique([buildingId, number]) would 409)
 */
export function findAllDuplicateUnitRows(
  units: WizardDraftInput['units'] | undefined,
  buildings: WizardDraftInput['buildings'] | undefined,
): Map<number, DuplicateRowInfo> {
  const result = new Map<number, DuplicateRowInfo>();
  if (!units || units.length === 0) return result;
  const seen = new Map<string, number>();
  for (let idx = 0; idx < units.length; idx += 1) {
    const unit = units[idx]!;
    const number = (unit.number ?? '').trim();
    if (number === '') continue;
    const buildingIndex = unit.buildingIndex;
    const key = `${buildingIndex}::${number}`;
    const existing = seen.get(key);
    if (existing !== undefined) {
      const building = buildings?.[buildingIndex];
      const buildingLabel =
        building?.label ||
        building?.nickname ||
        `${building?.street ?? ''} ${building?.houseNumber ?? ''}`.trim() ||
        `Building ${buildingIndex + 1}`;
      result.set(idx, { duplicateOf: existing, number, buildingLabel });
    } else {
      seen.set(key, idx);
    }
  }
  return result;
}

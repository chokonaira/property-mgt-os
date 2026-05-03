import type { ExtractionResult } from '@buena/shared';
import type {
  WizardBuildingDraft,
  WizardUnitDraft,
} from '@/lib/schemas/wizard-draft';

/**
 * Maps a PDF-extracted unit to one of the wizard's existing buildings.
 *
 * The PDF carries a free-form `buildingLabel` (e.g. "Haus A"), the
 * wizard carries a structured array of buildings the user has entered
 * (street + houseNumber + optional label / nickname). We try the
 * cheapest, most disambiguating signals first:
 *
 *   1. Exact case-insensitive match on `building.label`
 *   2. Match on `building.nickname`
 *   3. Substring match against "street + houseNumber" (handles cases
 *      where the PDF's label is "Haus A — Fiktivpark 12" and the
 *      wizard row is the address only)
 *   4. Last-ditch: if there is exactly ONE wizard building, use it
 *
 * Returning `null` means the row should be dropped from the import —
 * it would otherwise land on the wrong building or fail save.
 *
 * Pure helper: no React, no RHF — unit-testable in isolation.
 */
function matchBuildingIndex(
  pdfLabel: string,
  buildings: ReadonlyArray<WizardBuildingDraft>,
): number | null {
  const needle = pdfLabel.trim().toLowerCase();
  if (!needle) {
    // Single-building fallback: a *missing* label can't be wrong
    // when there's only one place the unit could go. We do NOT
    // extend this to the "label present but unmatched" case —
    // silently assigning "Haus C" to your one Haus A would launder
    // a wrong-property import into a clean save.
    return buildings.length === 1 ? 0 : null;
  }
  for (let i = 0; i < buildings.length; i += 1) {
    if ((buildings[i]?.label ?? '').toLowerCase() === needle) return i;
  }
  for (let i = 0; i < buildings.length; i += 1) {
    if ((buildings[i]?.nickname ?? '').toLowerCase() === needle) return i;
  }
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    if (!b) continue;
    const address = `${b.street ?? ''} ${b.houseNumber ?? ''}`.trim().toLowerCase();
    if (address && (address.includes(needle) || needle.includes(address))) return i;
  }
  return null;
}

export interface ImportPlan {
  /** Units the matcher could place into one of the wizard's buildings. */
  matched: WizardUnitDraft[];
  /** Numbers from `matched` that already exist in the same building. */
  conflicts: ReadonlyArray<{ rowIndex: number; number: string; buildingIndex: number }>;
  /** Units the matcher dropped (no building match). */
  droppedCount: number;
  /** Total units the extraction surfaced before matching / dedup. */
  incomingCount: number;
}

/**
 * Computes a dry-run plan: takes the AI extraction + the wizard's
 * current buildings + units state, and reports what would happen
 * for each of three commit modes (Replace / Merge / Discard).
 *
 * The dialog reads this once on extraction success and shows the
 * counts to the user before any mutation runs. The Replace and
 * Merge commit helpers below operate on this same plan so the
 * preview text is always honest about what the click will do.
 */
export function buildImportPlan(
  extraction: ExtractionResult,
  buildings: ReadonlyArray<WizardBuildingDraft>,
  existing: ReadonlyArray<{ buildingIndex: number; number: string }>,
): ImportPlan {
  const matched: WizardUnitDraft[] = [];
  let droppedCount = 0;
  for (const u of extraction.units) {
    const idx = matchBuildingIndex(u.buildingLabel, buildings);
    if (idx === null) {
      droppedCount += 1;
      continue;
    }
    matched.push(toUnitDraft(u, idx));
  }

  const existingKey = new Set(
    existing
      .filter((e) => (e.number ?? '').trim() !== '')
      .map((e) => `${e.buildingIndex}::${(e.number ?? '').trim()}`),
  );
  const conflicts: Array<{ rowIndex: number; number: string; buildingIndex: number }> = [];
  for (let i = 0; i < matched.length; i += 1) {
    const u = matched[i];
    if (!u) continue;
    const key = `${u.buildingIndex}::${(u.number ?? '').trim()}`;
    if (existingKey.has(key)) {
      conflicts.push({ rowIndex: i, number: u.number, buildingIndex: u.buildingIndex });
    }
  }

  return {
    matched,
    conflicts,
    droppedCount,
    incomingCount: extraction.units.length,
  };
}

/**
 * Merge: keep every existing row, append only matched units that
 * don't collide. The conflicting numbers are reported so the dialog
 * can surface "X kept, Y added, Z skipped because they collide."
 */
export function mergeKeepExisting(
  existing: ReadonlyArray<WizardUnitDraft>,
  plan: ImportPlan,
): WizardUnitDraft[] {
  const conflictRowSet = new Set(plan.conflicts.map((c) => c.rowIndex));
  const additions = plan.matched.filter((_u, i) => !conflictRowSet.has(i));
  // Strip the wizard's seeded empty-row stub if it's the only existing
  // row + the import has anything to add — otherwise the table opens
  // with a stale empty row above the imported block.
  const baseExisting = isPristineSeed(existing) && additions.length > 0 ? [] : existing.slice();
  return [...baseExisting, ...additions];
}

/**
 * Replace: drop every existing row, install the matched set as the
 * new units array. Destructive; the caller renders a confirm step
 * before invoking.
 */
export function replaceAll(plan: ImportPlan): WizardUnitDraft[] {
  return plan.matched.slice();
}

function isPristineSeed(units: ReadonlyArray<WizardUnitDraft>): boolean {
  if (units.length !== 1) return false;
  const only = units[0];
  if (!only) return false;
  return (only.number ?? '').trim() === '' && only.type === 'APARTMENT';
}

// Local copy of the extraction → draft mapper, kept in sync with
// extraction-to-wizard-draft.ts. Pulled in here so the import flow
// doesn't depend on the full-extraction translator (which also
// rewrites property + buildings — those must stay untouched in
// units-only mode to avoid regressing the step-1 flow).
function toUnitDraft(
  unit: ExtractionResult['units'][number],
  buildingIndex: number,
): WizardUnitDraft {
  const baseFields = {
    buildingIndex,
    number: unit.number,
    ...(unit.meaShare !== undefined ? { meaShare: unit.meaShare } : {}),
    ...(unit.sizeSqm !== undefined ? { sizeSqm: unit.sizeSqm } : {}),
    ...('floor' in unit && unit.floor ? { floor: unit.floor } : {}),
    ...('entranceLabel' in unit && unit.entranceLabel
      ? { entranceLabel: unit.entranceLabel }
      : {}),
    ...(unit.yearBuilt !== undefined ? { yearBuilt: unit.yearBuilt } : {}),
    ...(unit.description ? { description: unit.description } : {}),
  };
  switch (unit.type) {
    case 'APARTMENT':
      return {
        ...baseFields,
        type: 'APARTMENT',
        ...(unit.rooms !== undefined ? { rooms: unit.rooms } : {}),
        ...(unit.subCategory ? { subCategory: unit.subCategory } : {}),
      } as unknown as WizardUnitDraft;
    case 'OFFICE':
      return {
        ...baseFields,
        type: 'OFFICE',
        ...(unit.layoutNote ? { layoutNote: unit.layoutNote } : {}),
      } as unknown as WizardUnitDraft;
    case 'PARKING':
      return {
        ...baseFields,
        type: 'PARKING',
        ...(unit.parkingCode ? { parkingCode: unit.parkingCode } : {}),
      } as unknown as WizardUnitDraft;
    case 'GARDEN':
      return { ...baseFields, type: 'GARDEN' } as unknown as WizardUnitDraft;
  }
}

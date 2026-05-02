import type { ExtractionResult } from '@buena/shared';
import type {
  WizardBuildingDraft,
  WizardDraftInput,
  WizardUnitDraft,
} from '@/lib/schemas/wizard-draft';

/**
 * Translates a server-validated `ExtractionResult` into the wizard's
 * RHF draft input shape so the AI Review Panel can pre-fill the form
 * via `methods.reset()` when the user clicks Accept.
 *
 * Why a custom translator and not direct schema reuse: the extraction
 * shape carries `buildings[].label` (a free string the model picks up
 * from the document) while the wizard's `units[].buildingIndex` points
 * to the position of the building in the buildings array. We resolve
 * label → index here so the user never sees the indirection.
 *
 * Units whose `buildingLabel` doesn't match any extracted building
 * are dropped from the pre-fill — they would 422 on save with an
 * out-of-range `buildingIndex`. Dropped unit count is returned so
 * the UI can surface a "X units couldn't be matched to a building"
 * note alongside the panel summary.
 */
export interface ExtractionToWizardDraftResult {
  draft: WizardDraftInput;
  droppedUnits: number;
}

export function extractionToWizardDraft(
  extraction: ExtractionResult,
): ExtractionToWizardDraftResult {
  const buildings: WizardBuildingDraft[] = extraction.buildings.map((b) => ({
    street: b.street,
    houseNumber: b.houseNumber,
    ...(b.postalCode ? { postalCode: b.postalCode } : {}),
    ...(b.city ? { city: b.city } : {}),
    ...(b.label ? { label: b.label } : {}),
    ...(b.nickname ? { nickname: b.nickname } : {}),
    ...(b.yearBuilt !== undefined ? { yearBuilt: b.yearBuilt } : {}),
    ...(b.floorsCount !== undefined ? { floorsCount: b.floorsCount } : {}),
    ...(b.hasElevator !== undefined ? { hasElevator: b.hasElevator } : {}),
    ...(b.energyStandard ? { energyStandard: b.energyStandard } : {}),
    ...(b.heating ? { heating: b.heating } : {}),
    ...(b.buildingType ? { buildingType: b.buildingType } : {}),
  }));

  const labelToIndex = new Map<string, number>();
  for (let i = 0; i < extraction.buildings.length; i += 1) {
    const label = extraction.buildings[i]?.label;
    if (label) labelToIndex.set(label.toLowerCase(), i);
  }

  let droppedUnits = 0;
  const units: WizardUnitDraft[] = [];
  for (const u of extraction.units) {
    const idx = labelToIndex.get(u.buildingLabel.toLowerCase());
    if (idx === undefined) {
      droppedUnits += 1;
      continue;
    }
    units.push(toUnitDraft(u, idx));
  }

  return {
    draft: {
      general: {
        managementType: extraction.property.managementType,
        name: extraction.property.name,
        uniqueNumber: sanitizeUniqueNumber(extraction.property.uniqueNumber),
        ...(extraction.property.totalMea !== undefined
          ? { totalMea: extraction.property.totalMea }
          : {}),
      },
      buildings: buildings.length > 0 ? buildings : [{ street: '', houseNumber: '' }],
      // Wizard draft requires at least one unit to satisfy the schema's
      // .min(1). When the model returns no units we fall back to a
      // single empty row so the form is still operable.
      units: units.length > 0 ? units : [emptyApartment()],
    },
    droppedUnits,
  };
}

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

function emptyApartment(): WizardUnitDraft {
  return { type: 'APARTMENT', buildingIndex: 0, number: '' } as unknown as WizardUnitDraft;
}

/**
 * The wizard's `uniqueNumber` regex allows letters, digits, and hyphens
 * only. AI extractions from German Teilungserklärungen often surface
 * forms like `10.557PRB` (period as separator) or `10/557 PRB` (slash
 * + space) — both fail the schema and silently disable Next. Replace
 * any disallowed character with a hyphen, collapse runs, and trim
 * leading/trailing hyphens so the value lands valid in the form.
 */
export function sanitizeUniqueNumber(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

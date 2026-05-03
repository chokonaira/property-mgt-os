import type { PropertyDetail, ReplaceUnitWithId, Unit } from '@buena/shared';
import type {
  WizardBuildingDraft,
  WizardDraftInput,
  WizardUnitDraft,
} from '@/lib/schemas/wizard-draft';

/**
 * Translates a server-fetched PropertyDetail into the wizard's draft
 * input shape so the edit page can mount UnitTable + the dialogs
 * (Generate, Import) without per-component changes.
 *
 * Building order is preserved as returned by the server (cuid-asc =
 * create-time order). Each unit's `buildingIndex` is computed from
 * its DB `buildingId` against that ordering. The original DB unit
 * id is stashed on the draft row's optional `id` field — the Save
 * handler reads it back when building the replace payload so the
 * server can UPDATE in place rather than DELETE + INSERT.
 *
 * Pure helper: no React, no RHF — unit-testable.
 */
export function propertyDetailToWizardDraft(detail: PropertyDetail): WizardDraftInput {
  const buildings: WizardBuildingDraft[] = detail.buildings.map((b) => ({
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

  const buildingIdToIndex = new Map<string, number>();
  for (let i = 0; i < detail.buildings.length; i += 1) {
    buildingIdToIndex.set(detail.buildings[i]!.id, i);
  }

  const units: WizardUnitDraft[] = [];
  for (const b of detail.buildings) {
    const buildingIndex = buildingIdToIndex.get(b.id) ?? 0;
    for (const u of b.units) {
      units.push(unitToDraft(u, buildingIndex));
    }
  }

  return {
    general: {
      managementType: detail.managementType,
      name: detail.name,
      uniqueNumber: detail.uniqueNumber,
      ...(detail.totalMea !== undefined ? { totalMea: detail.totalMea } : {}),
      ...(detail.propertyManagerId ? { propertyManagerId: detail.propertyManagerId } : {}),
      ...(detail.accountantId ? { accountantId: detail.accountantId } : {}),
    },
    buildings: buildings.length > 0 ? buildings : [{ street: '', houseNumber: '' }],
    units: units.length > 0 ? units : [emptyApartment()],
  };
}

/**
 * Converts a single wizard draft row back into the
 * ReplaceUnitWithId payload the server expects. Carries over the
 * id stashed by `unitToDraft` so the server can UPDATE rather than
 * DELETE + INSERT — matters for the audit trail (one row reading
 * "edited Unit #07" beats two rows of "deleted Unit + created Unit").
 */
export function wizardUnitToReplacePayload(unit: WizardUnitDraft): ReplaceUnitWithId {
  // The id field lives on the draft via the `unknown` cast in
  // unitToDraft below; pull it back out at the typed boundary.
  const id = (unit as WizardUnitDraft & { id?: string }).id;
  const base = {
    ...(id ? { id } : {}),
    buildingIndex: unit.buildingIndex,
    number: unit.number,
    meaShare: unit.meaShare,
    sizeSqm: unit.sizeSqm,
    ...(unit.floor ? { floor: unit.floor } : {}),
    ...(unit.entranceLabel ? { entranceLabel: unit.entranceLabel } : {}),
    ...(unit.yearBuilt !== undefined ? { yearBuilt: unit.yearBuilt } : {}),
    ...(unit.description ? { description: unit.description } : {}),
  };
  switch (unit.type) {
    case 'APARTMENT':
      return {
        ...base,
        type: 'APARTMENT',
        rooms: unit.rooms,
        ...(unit.subCategory ? { subCategory: unit.subCategory } : {}),
      } as ReplaceUnitWithId;
    case 'OFFICE':
      return {
        ...base,
        type: 'OFFICE',
        ...(unit.layoutNote ? { layoutNote: unit.layoutNote } : {}),
      } as ReplaceUnitWithId;
    case 'PARKING':
      return {
        ...base,
        type: 'PARKING',
        ...(unit.parkingCode ? { parkingCode: unit.parkingCode } : {}),
      } as ReplaceUnitWithId;
    case 'GARDEN':
      return { ...base, type: 'GARDEN' } as ReplaceUnitWithId;
  }
}

function unitToDraft(unit: Unit, buildingIndex: number): WizardUnitDraft {
  // The wire Unit shape allows sizeSqm to be undefined (legacy data
  // surfaced from a partial extraction). For edit, we guard with
  // sane defaults that fail the schema's positive() check inline so
  // the user fills it in instead of silently saving 0.
  const baseFields = {
    id: unit.id,
    buildingIndex,
    number: unit.number,
    meaShare: unit.meaShare,
    ...(unit.sizeSqm !== undefined ? { sizeSqm: unit.sizeSqm } : {}),
    ...(unit.floor ? { floor: unit.floor } : {}),
    ...(unit.entranceLabel ? { entranceLabel: unit.entranceLabel } : {}),
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

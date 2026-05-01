import type { CreatePropertyRequest, CreateUnitWithBuildingIndex } from '@buena/shared';
import type { WizardDraft, WizardUnitDraft } from '@/lib/schemas/wizard-draft';

// Pure mapper: WizardDraft (the relaxed in-flight shape RHF holds) →
// CreatePropertyRequest (the strict wire shape POST /properties accepts).
//
// The mapper is intentionally non-coercing: if a required wire field
// is missing on the draft (e.g. APARTMENT.sizeSqm), the resulting
// payload will fail CreatePropertyRequestSchema.parse and the wizard
// surfaces the issue via the standard 422 envelope path. We do NOT
// fabricate defaults here — that would launder bad data past the
// strict server contract.
export function buildCreatePropertyRequest(draft: WizardDraft): CreatePropertyRequest {
  return {
    property: {
      managementType: draft.general.managementType,
      name: draft.general.name,
      uniqueNumber: draft.general.uniqueNumber,
      ...(draft.general.propertyManagerId
        ? { propertyManagerId: draft.general.propertyManagerId }
        : {}),
      ...(draft.general.accountantId ? { accountantId: draft.general.accountantId } : {}),
    },
    buildings: draft.buildings.map((b) => ({
      street: b.street,
      houseNumber: b.houseNumber,
      country: 'DE',
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
    })),
    units: draft.units.map(toCreateUnit),
  };
}

function toCreateUnit(unit: WizardUnitDraft): CreateUnitWithBuildingIndex {
  const base = {
    buildingIndex: unit.buildingIndex,
    number: unit.number,
    meaShare: unit.meaShare,
    // sizeSqm is required at the wire layer; passing through whatever
    // the draft holds (undefined falls through to the server which
    // 422s with path 'units.<idx>.sizeSqm').
    sizeSqm: unit.sizeSqm as number,
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
        rooms: unit.rooms as number,
        ...(unit.subCategory ? { subCategory: unit.subCategory } : {}),
      };
    case 'OFFICE':
      return {
        ...base,
        type: 'OFFICE',
        ...(unit.layoutNote ? { layoutNote: unit.layoutNote } : {}),
      };
    case 'PARKING':
      return {
        ...base,
        type: 'PARKING',
        ...(unit.parkingCode ? { parkingCode: unit.parkingCode } : {}),
      };
    case 'GARDEN':
      return { ...base, type: 'GARDEN' };
  }
}

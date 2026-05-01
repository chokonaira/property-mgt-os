import { describe, expect, it } from 'vitest';
import {
  EMPTY_BUILDING,
  EMPTY_UNIT,
  STEP_FIELDS,
  WIZARD_DRAFT_DEFAULTS,
  WizardBuildingDraftSchema,
  WizardBuildingsDraftSchema,
  WizardDraftSchema,
  WizardGeneralDraftSchema,
  WizardUnitDraftSchema,
  WizardUnitsDraftSchema,
} from '@/lib/schemas/wizard-draft';

describe('WizardGeneralDraftSchema', () => {
  it('accepts a fully filled general slice', () => {
    const result = WizardGeneralDraftSchema.safeParse({
      managementType: 'WEG',
      name: 'Parkview Residences',
      uniqueNumber: '10-557-PRB',
    });
    expect(result.success).toBe(true);
  });

  it('admits both management types', () => {
    expect(
      WizardGeneralDraftSchema.safeParse({
        managementType: 'MV',
        name: 'Sample',
        uniqueNumber: 'ABC-1',
      }).success,
    ).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = WizardGeneralDraftSchema.safeParse({
      managementType: 'WEG',
      name: '',
      uniqueNumber: 'ABC-1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['name']);
    }
  });

  it('rejects a uniqueNumber containing whitespace or punctuation', () => {
    expect(
      WizardGeneralDraftSchema.safeParse({
        managementType: 'WEG',
        name: 'A',
        uniqueNumber: 'BAD VALUE',
      }).success,
    ).toBe(false);
    expect(
      WizardGeneralDraftSchema.safeParse({
        managementType: 'WEG',
        name: 'A',
        uniqueNumber: 'BAD/VALUE',
      }).success,
    ).toBe(false);
  });

  it('admits hyphens and alphanumerics in uniqueNumber', () => {
    expect(
      WizardGeneralDraftSchema.safeParse({
        managementType: 'WEG',
        name: 'A',
        uniqueNumber: 'AB-12-cd',
      }).success,
    ).toBe(true);
  });
});

describe('WIZARD_DRAFT_DEFAULTS', () => {
  it('boots with empty name and uniqueNumber so step 1 starts invalid', () => {
    const result = WizardDraftSchema.safeParse(WIZARD_DRAFT_DEFAULTS);
    expect(result.success).toBe(false);
  });

  it('sets WEG as the default managementType', () => {
    expect(WIZARD_DRAFT_DEFAULTS.general.managementType).toBe('WEG');
  });

  it('seeds one empty building card so step 2 starts with the canonical card', () => {
    expect(WIZARD_DRAFT_DEFAULTS.buildings).toEqual([EMPTY_BUILDING]);
  });

  it('seeds one empty unit row so step 3 starts with the canonical row', () => {
    expect(WIZARD_DRAFT_DEFAULTS.units).toEqual([EMPTY_UNIT]);
  });
});

describe('WizardBuildingDraftSchema', () => {
  const valid = { street: 'Musterstr.', houseNumber: '1' };

  it('accepts the minimum required pair', () => {
    expect(WizardBuildingDraftSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a missing street', () => {
    expect(WizardBuildingDraftSchema.safeParse({ houseNumber: '1' }).success).toBe(false);
  });

  it('rejects a missing house number', () => {
    expect(WizardBuildingDraftSchema.safeParse({ street: 'Musterstr.' }).success).toBe(false);
  });

  it('rejects whitespace-only required fields', () => {
    expect(WizardBuildingDraftSchema.safeParse({ street: '   ', houseNumber: '1' }).success).toBe(
      false,
    );
    expect(WizardBuildingDraftSchema.safeParse({ street: 'A', houseNumber: '   ' }).success).toBe(
      false,
    );
  });

  it('admits a fully populated optional payload', () => {
    expect(
      WizardBuildingDraftSchema.safeParse({
        ...valid,
        postalCode: '10115',
        city: 'Berlin',
        label: 'Haus A',
        nickname: 'Parkside',
        yearBuilt: 1992,
        floorsCount: 5,
        hasElevator: true,
        energyStandard: 'B',
        heating: 'Fernwärme',
        buildingType: 'Mehrfamilienhaus',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-5-digit postcode', () => {
    expect(WizardBuildingDraftSchema.safeParse({ ...valid, postalCode: '1234' }).success).toBe(
      false,
    );
  });

  it('clamps yearBuilt to a reasonable range', () => {
    expect(WizardBuildingDraftSchema.safeParse({ ...valid, yearBuilt: 1700 }).success).toBe(false);
    const next = new Date().getFullYear() + 5;
    expect(WizardBuildingDraftSchema.safeParse({ ...valid, yearBuilt: next }).success).toBe(false);
  });
});

describe('WizardBuildingsDraftSchema', () => {
  it('rejects an empty array — at least one building is required', () => {
    expect(WizardBuildingsDraftSchema.safeParse([]).success).toBe(false);
  });

  it('accepts a single valid building', () => {
    expect(WizardBuildingsDraftSchema.safeParse([{ street: 'A', houseNumber: '1' }]).success).toBe(
      true,
    );
  });
});

describe('WizardUnitDraftSchema', () => {
  const apt = {
    type: 'APARTMENT' as const,
    buildingIndex: 0,
    number: '1',
    meaShare: 100,
  };

  it('accepts the minimum APARTMENT row', () => {
    expect(WizardUnitDraftSchema.safeParse(apt).success).toBe(true);
  });

  it('accepts each of the four discriminated types', () => {
    expect(WizardUnitDraftSchema.safeParse({ ...apt, type: 'OFFICE' }).success).toBe(true);
    expect(WizardUnitDraftSchema.safeParse({ ...apt, type: 'PARKING' }).success).toBe(true);
    expect(WizardUnitDraftSchema.safeParse({ ...apt, type: 'GARDEN' }).success).toBe(true);
  });

  it('rejects rows missing buildingIndex / number / meaShare', () => {
    expect(WizardUnitDraftSchema.safeParse({ type: 'APARTMENT' }).success).toBe(false);
    expect(WizardUnitDraftSchema.safeParse({ ...apt, number: '' }).success).toBe(false);
    expect(WizardUnitDraftSchema.safeParse({ ...apt, meaShare: -1 }).success).toBe(false);
  });

  it('admits an APARTMENT-only `rooms` field', () => {
    expect(WizardUnitDraftSchema.safeParse({ ...apt, rooms: 3 }).success).toBe(true);
  });

  it('admits the OFFICE / PARKING-specific fields', () => {
    expect(
      WizardUnitDraftSchema.safeParse({
        ...apt,
        type: 'OFFICE',
        layoutNote: 'open plan',
      }).success,
    ).toBe(true);
    expect(
      WizardUnitDraftSchema.safeParse({
        ...apt,
        type: 'PARKING',
        parkingCode: 'P-12',
      }).success,
    ).toBe(true);
  });

  it('admits each floor discriminant', () => {
    for (const floor of [
      { kind: 'EG' },
      { kind: 'DG' },
      { kind: 'OG', level: 3 },
      { kind: 'UG', level: 1 },
      { kind: 'STAFFEL', qualifier: 'A' },
    ] as const) {
      expect(WizardUnitDraftSchema.safeParse({ ...apt, floor }).success).toBe(true);
    }
  });

  it('rejects an OG floor with an out-of-range level', () => {
    expect(
      WizardUnitDraftSchema.safeParse({ ...apt, floor: { kind: 'OG', level: 100 } }).success,
    ).toBe(false);
  });
});

describe('WizardUnitsDraftSchema', () => {
  it('rejects an empty array — at least one unit is required', () => {
    expect(WizardUnitsDraftSchema.safeParse([]).success).toBe(false);
  });

  it('rejects the seeded EMPTY_UNIT until number is filled', () => {
    expect(WizardUnitsDraftSchema.safeParse([EMPTY_UNIT]).success).toBe(false);
    expect(WizardUnitsDraftSchema.safeParse([{ ...EMPTY_UNIT, number: '1' }]).success).toBe(true);
  });
});

describe('STEP_FIELDS', () => {
  it('lists the required general fields RHF must trigger for step 1', () => {
    expect(STEP_FIELDS.general).toEqual([
      'general.managementType',
      'general.name',
      'general.uniqueNumber',
    ]);
  });

  it('triggers the buildings array for step 2', () => {
    expect(STEP_FIELDS.buildings).toEqual(['buildings']);
  });

  it('triggers the units array for step 3', () => {
    expect(STEP_FIELDS.units).toEqual(['units']);
  });
});

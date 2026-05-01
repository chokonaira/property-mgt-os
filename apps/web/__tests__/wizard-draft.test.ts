import { describe, expect, it } from 'vitest';
import {
  STEP_FIELDS,
  WIZARD_DRAFT_DEFAULTS,
  WizardDraftSchema,
  WizardGeneralDraftSchema,
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

  it('starts with empty buildings and units arrays', () => {
    expect(WIZARD_DRAFT_DEFAULTS.buildings).toEqual([]);
    expect(WIZARD_DRAFT_DEFAULTS.units).toEqual([]);
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

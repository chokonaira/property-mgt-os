import { describe, expect, it } from 'vitest';
import { findDuplicateUnitNumber } from '@/components/wizard/wizard-chrome';
import type { WizardDraftInput } from '@/lib/schemas/wizard-draft';

const draft = (units: WizardDraftInput['units']): WizardDraftInput => ({
  general: { managementType: 'WEG', name: 'X', uniqueNumber: 'X' },
  buildings: [
    { street: 'Musterstr.', houseNumber: '1', label: 'Haus A' },
    { street: 'Musterstr.', houseNumber: '2', nickname: 'Side wing' },
  ],
  units,
});

describe('findDuplicateUnitNumber', () => {
  it('returns null when every (building, number) pair is unique', () => {
    const result = findDuplicateUnitNumber(
      draft([
        { type: 'APARTMENT', buildingIndex: 0, number: '01', meaShare: 100, sizeSqm: 70, rooms: 2 },
        { type: 'APARTMENT', buildingIndex: 0, number: '02', meaShare: 100, sizeSqm: 70, rooms: 2 },
      ]),
    );
    expect(result).toBeNull();
  });

  it('returns the second occurrence when a (buildingIndex, number) pair repeats', () => {
    const result = findDuplicateUnitNumber(
      draft([
        { type: 'APARTMENT', buildingIndex: 0, number: '01', meaShare: 100, sizeSqm: 70, rooms: 2 },
        { type: 'APARTMENT', buildingIndex: 0, number: '01', meaShare: 100, sizeSqm: 70, rooms: 2 },
      ]),
    );
    expect(result).toEqual({ rowIndex: 1, number: '01', buildingLabel: 'Haus A' });
  });

  it('uses the building nickname when label is missing', () => {
    const result = findDuplicateUnitNumber(
      draft([
        { type: 'APARTMENT', buildingIndex: 1, number: '5', meaShare: 100, sizeSqm: 70, rooms: 2 },
        { type: 'APARTMENT', buildingIndex: 1, number: '5', meaShare: 100, sizeSqm: 70, rooms: 2 },
      ]),
    );
    expect(result?.buildingLabel).toBe('Side wing');
  });

  it('falls back to "Building N" when label, nickname, street are all empty', () => {
    const result = findDuplicateUnitNumber({
      ...draft([]),
      buildings: [{ street: '', houseNumber: '' }],
      units: [
        { type: 'APARTMENT', buildingIndex: 0, number: '7', meaShare: 100, sizeSqm: 70, rooms: 2 },
        { type: 'APARTMENT', buildingIndex: 0, number: '7', meaShare: 100, sizeSqm: 70, rooms: 2 },
      ],
    });
    expect(result?.buildingLabel).toBe('Building 1');
  });

  it('does not flag the same number across different buildings', () => {
    const result = findDuplicateUnitNumber(
      draft([
        { type: 'APARTMENT', buildingIndex: 0, number: '01', meaShare: 100, sizeSqm: 70, rooms: 2 },
        { type: 'APARTMENT', buildingIndex: 1, number: '01', meaShare: 100, sizeSqm: 70, rooms: 2 },
      ]),
    );
    expect(result).toBeNull();
  });

  it('skips empty unit numbers (treats them as not-yet-typed)', () => {
    const result = findDuplicateUnitNumber(
      draft([
        { type: 'APARTMENT', buildingIndex: 0, number: '', meaShare: 100, sizeSqm: 70, rooms: 2 },
        { type: 'APARTMENT', buildingIndex: 0, number: '', meaShare: 100, sizeSqm: 70, rooms: 2 },
      ]),
    );
    expect(result).toBeNull();
  });

  it('whitespace-only numbers are treated as empty', () => {
    const result = findDuplicateUnitNumber(
      draft([
        { type: 'APARTMENT', buildingIndex: 0, number: '   ', meaShare: 100, sizeSqm: 70, rooms: 2 },
        { type: 'APARTMENT', buildingIndex: 0, number: '   ', meaShare: 100, sizeSqm: 70, rooms: 2 },
      ]),
    );
    expect(result).toBeNull();
  });
});

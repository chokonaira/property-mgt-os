import { describe, expect, it } from 'vitest';
import type { ExtractionResult } from '@buena/shared';
import { extractionToWizardDraft } from '@/lib/extraction-to-wizard-draft';

function base(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    property: {
      name: 'Parkview Residences Berlin',
      uniqueNumber: '10-557-PRB',
      managementType: 'WEG',
      totalMea: 1000,
    },
    buildings: [
      { label: 'Haus A', street: 'Hauptstraße', houseNumber: '12', postalCode: '10115' },
    ],
    units: [],
    contacts: [],
    confidenceByField: {},
    sourceSpansByField: {},
    warnings: [],
    ...overrides,
  };
}

describe('extractionToWizardDraft', () => {
  it('maps property fields into the general slice', () => {
    const { draft } = extractionToWizardDraft(base());
    expect(draft.general).toMatchObject({
      managementType: 'WEG',
      name: 'Parkview Residences Berlin',
      uniqueNumber: '10-557-PRB',
    });
  });

  it('falls back to empty uniqueNumber when missing', () => {
    const { draft } = extractionToWizardDraft(
      base({ property: { name: 'Test', managementType: 'WEG' } }),
    );
    expect(draft.general.uniqueNumber).toBe('');
  });

  it('sanitizes uniqueNumber so AI-extracted German variants pass the form regex', () => {
    // Real models have surfaced periods, slashes, and stray spaces
    // (`10.557PRB`, `10/557 PRB`). The wizard schema only accepts
    // letters, digits, and hyphens — without normalization the form
    // silently invalidates and Next stays disabled.
    const cases: Array<[string, string]> = [
      ['10.557PRB', '10-557PRB'],
      ['10/557 PRB', '10-557-PRB'],
      ['  10-557-PRB  ', '10-557-PRB'],
      ['10..557..PRB', '10-557-PRB'],
      ['---10-557---', '10-557'],
    ];
    for (const [input, expected] of cases) {
      const { draft } = extractionToWizardDraft(
        base({
          property: { name: 'Test', managementType: 'WEG', uniqueNumber: input },
        }),
      );
      expect(draft.general.uniqueNumber).toBe(expected);
    }
  });

  it('carries totalMea into the general draft when extracted', () => {
    const { draft } = extractionToWizardDraft(base());
    expect(draft.general.totalMea).toBe(1000);
  });

  it('omits totalMea from the draft when missing on the extraction', () => {
    const { draft } = extractionToWizardDraft(
      base({ property: { name: 'Test', managementType: 'WEG' } }),
    );
    expect(draft.general.totalMea).toBeUndefined();
  });

  it('preserves building order and copies optional fields', () => {
    const { draft } = extractionToWizardDraft(
      base({
        buildings: [
          { label: 'Haus A', street: 'Hauptstr.', houseNumber: '12', postalCode: '10115' },
          { label: 'Haus B', street: 'Nebenstr.', houseNumber: '5', city: 'Berlin' },
        ],
      }),
    );
    expect(draft.buildings).toHaveLength(2);
    expect(draft.buildings[0]).toMatchObject({
      street: 'Hauptstr.',
      houseNumber: '12',
      postalCode: '10115',
      label: 'Haus A',
    });
    expect(draft.buildings[1]).toMatchObject({ city: 'Berlin', label: 'Haus B' });
  });

  it('resolves unit buildingLabel → buildingIndex against the extracted buildings list', () => {
    const { draft, droppedUnits } = extractionToWizardDraft(
      base({
        buildings: [
          { label: 'Haus A', street: 'Hauptstr.', houseNumber: '1' },
          { label: 'Haus B', street: 'Nebenstr.', houseNumber: '5' },
        ],
        units: [
          { type: 'APARTMENT', number: '1.1', buildingLabel: 'Haus A', rooms: 3, sizeSqm: 80 },
          { type: 'APARTMENT', number: '2.1', buildingLabel: 'Haus B', rooms: 2, sizeSqm: 65 },
        ],
      }),
    );
    expect(droppedUnits).toBe(0);
    expect(draft.units).toHaveLength(2);
    expect(draft.units[0]).toMatchObject({ buildingIndex: 0, number: '1.1' });
    expect(draft.units[1]).toMatchObject({ buildingIndex: 1, number: '2.1' });
  });

  it('matches building labels case-insensitively', () => {
    const { draft, droppedUnits } = extractionToWizardDraft(
      base({
        buildings: [{ label: 'Haus A', street: 'Hauptstr.', houseNumber: '1' }],
        units: [
          { type: 'APARTMENT', number: '1', buildingLabel: 'haus a', rooms: 3, sizeSqm: 80 },
        ],
      }),
    );
    expect(droppedUnits).toBe(0);
    expect(draft.units[0]).toMatchObject({ buildingIndex: 0 });
  });

  it('drops units whose buildingLabel does not match any extracted building', () => {
    const { draft, droppedUnits } = extractionToWizardDraft(
      base({
        buildings: [{ label: 'Haus A', street: 'Hauptstr.', houseNumber: '1' }],
        units: [
          { type: 'APARTMENT', number: '1', buildingLabel: 'Haus A', rooms: 3, sizeSqm: 80 },
          { type: 'PARKING', number: 'P1', buildingLabel: 'Phantom Garage' },
        ],
      }),
    );
    expect(droppedUnits).toBe(1);
    expect(draft.units).toHaveLength(1);
    expect(draft.units[0]).toMatchObject({ type: 'APARTMENT' });
  });

  it('falls back to a single empty unit when no units survive matching', () => {
    const { draft } = extractionToWizardDraft(
      base({
        buildings: [{ label: 'Haus A', street: 'Hauptstr.', houseNumber: '1' }],
        units: [],
      }),
    );
    expect(draft.units).toHaveLength(1);
    expect(draft.units[0]).toMatchObject({ type: 'APARTMENT', buildingIndex: 0 });
  });

  it('preserves variant-specific fields per unit type', () => {
    const { draft } = extractionToWizardDraft(
      base({
        buildings: [{ label: 'Haus A', street: 'Hauptstr.', houseNumber: '1' }],
        units: [
          { type: 'OFFICE', number: 'O1', buildingLabel: 'Haus A', layoutNote: 'open plan' },
          { type: 'PARKING', number: 'P1', buildingLabel: 'Haus A', parkingCode: 'P-12' },
          { type: 'GARDEN', number: 'G1', buildingLabel: 'Haus A' },
        ],
      }),
    );
    expect(draft.units[0]).toMatchObject({ type: 'OFFICE', layoutNote: 'open plan' });
    expect(draft.units[1]).toMatchObject({ type: 'PARKING', parkingCode: 'P-12' });
    expect(draft.units[2]).toMatchObject({ type: 'GARDEN' });
  });
});

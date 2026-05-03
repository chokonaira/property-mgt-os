import { describe, expect, it } from 'vitest';
import type { PropertyDetail } from '@buena/shared';
import {
  propertyDetailToWizardDraft,
  wizardUnitToReplacePayload,
} from '@/components/edit-units/unit-mapper';
import type { WizardUnitDraft } from '@/lib/schemas/wizard-draft';

function detail(overrides: Partial<PropertyDetail> = {}): PropertyDetail {
  return {
    id: 'p1',
    tenantId: 'demo',
    name: 'Sample',
    uniqueNumber: 'SMP-1',
    managementType: 'WEG',
    createdAt: new Date(),
    updatedAt: new Date(),
    propertyManager: null,
    accountant: null,
    buildings: [],
    ...overrides,
  } as PropertyDetail;
}

describe('propertyDetailToWizardDraft', () => {
  it('preserves the building order returned by the server', () => {
    const draft = propertyDetailToWizardDraft(
      detail({
        buildings: [
          {
            id: 'b1',
            propertyId: 'p1',
            street: 'A-Str',
            houseNumber: '1',
            country: 'DE',
            units: [],
          },
          {
            id: 'b2',
            propertyId: 'p1',
            street: 'B-Str',
            houseNumber: '2',
            country: 'DE',
            units: [],
          },
        ] as PropertyDetail['buildings'],
      }),
    );
    expect(draft.buildings.map((b) => b.street)).toEqual(['A-Str', 'B-Str']);
  });

  it('maps each unit to the index of its parent building', () => {
    const draft = propertyDetailToWizardDraft(
      detail({
        buildings: [
          {
            id: 'b1',
            propertyId: 'p1',
            street: 'A',
            houseNumber: '1',
            country: 'DE',
            units: [
              {
                id: 'u1',
                buildingId: 'b1',
                type: 'APARTMENT',
                number: '01',
                meaShare: 100,
                sizeSqm: 80,
                areaMetric: 'WOHN',
                rooms: 3,
              },
            ],
          },
          {
            id: 'b2',
            propertyId: 'p1',
            street: 'B',
            houseNumber: '2',
            country: 'DE',
            units: [
              {
                id: 'u2',
                buildingId: 'b2',
                type: 'APARTMENT',
                number: '01',
                meaShare: 100,
                sizeSqm: 70,
                areaMetric: 'WOHN',
                rooms: 2,
              },
            ],
          },
        ] as PropertyDetail['buildings'],
      }),
    );
    expect(draft.units.map((u) => u.buildingIndex)).toEqual([0, 1]);
    // The DB id is stashed on each draft row so the Save handler
    // can carry it back to the server.
    expect((draft.units[0] as WizardUnitDraft & { id?: string }).id).toBe('u1');
    expect((draft.units[1] as WizardUnitDraft & { id?: string }).id).toBe('u2');
  });

  it('falls back to a single empty apartment when the property has no units', () => {
    const draft = propertyDetailToWizardDraft(
      detail({
        buildings: [
          {
            id: 'b1',
            propertyId: 'p1',
            street: 'A',
            houseNumber: '1',
            country: 'DE',
            units: [],
          },
        ] as PropertyDetail['buildings'],
      }),
    );
    expect(draft.units).toHaveLength(1);
    expect(draft.units[0]?.type).toBe('APARTMENT');
  });
});

describe('wizardUnitToReplacePayload', () => {
  it('carries the id back so the server can UPDATE in place', () => {
    const row = {
      id: 'u1',
      type: 'APARTMENT',
      buildingIndex: 0,
      number: '01',
      meaShare: 100,
      sizeSqm: 80,
      rooms: 3,
    } as unknown as WizardUnitDraft;
    expect(wizardUnitToReplacePayload(row)).toMatchObject({
      id: 'u1',
      type: 'APARTMENT',
      number: '01',
    });
  });

  it('omits id for new rows so the server INSERTs', () => {
    const row = {
      type: 'PARKING',
      buildingIndex: 1,
      number: 'TG-09',
      meaShare: 1,
      sizeSqm: 12.5,
    } as unknown as WizardUnitDraft;
    const result = wizardUnitToReplacePayload(row);
    expect('id' in result).toBe(false);
    expect(result.type).toBe('PARKING');
  });

  it('preserves variant-specific fields', () => {
    const apartment = wizardUnitToReplacePayload({
      type: 'APARTMENT',
      buildingIndex: 0,
      number: '01',
      meaShare: 100,
      sizeSqm: 80,
      rooms: 3,
      subCategory: 'Penthouse',
    } as unknown as WizardUnitDraft);
    expect(apartment).toMatchObject({ rooms: 3, subCategory: 'Penthouse' });

    const parking = wizardUnitToReplacePayload({
      type: 'PARKING',
      buildingIndex: 0,
      number: 'TG-01',
      meaShare: 1,
      sizeSqm: 12.5,
      parkingCode: 'A1',
    } as unknown as WizardUnitDraft);
    expect(parking).toMatchObject({ parkingCode: 'A1' });
  });
});

import { describe, expect, it } from 'vitest';
import { CreatePropertyRequestSchema } from '@buena/shared';
import { buildCreatePropertyRequest } from '@/lib/wizard-to-create-request';
import type { WizardDraft } from '@/lib/schemas/wizard-draft';

const happyDraft: WizardDraft = {
  general: {
    managementType: 'WEG',
    name: 'Parkview',
    uniqueNumber: 'AB-1',
  },
  buildings: [{ street: 'Hauptstr.', houseNumber: '1' }],
  units: [
    {
      type: 'APARTMENT',
      buildingIndex: 0,
      number: '1',
      meaShare: 100,
      sizeSqm: 70,
      rooms: 2,
    },
  ],
};

describe('buildCreatePropertyRequest', () => {
  it('produces a payload that satisfies CreatePropertyRequestSchema', () => {
    const payload = buildCreatePropertyRequest(happyDraft);
    expect(CreatePropertyRequestSchema.safeParse(payload).success).toBe(true);
  });

  it('forces country=DE on each building', () => {
    const payload = buildCreatePropertyRequest(happyDraft);
    expect(payload.buildings.every((b) => b.country === 'DE')).toBe(true);
  });

  it('drops empty optional contact ids rather than passing falsy strings through', () => {
    const draft: WizardDraft = {
      ...happyDraft,
      general: { ...happyDraft.general, propertyManagerId: '' as unknown as undefined },
    };
    const payload = buildCreatePropertyRequest(draft);
    expect(payload.property).not.toHaveProperty('propertyManagerId');
  });

  it('routes APARTMENT.subCategory + OFFICE.layoutNote + PARKING.parkingCode through their wire keys', () => {
    const draft: WizardDraft = {
      ...happyDraft,
      units: [
        {
          type: 'APARTMENT',
          buildingIndex: 0,
          number: '1',
          meaShare: 50,
          sizeSqm: 70,
          rooms: 2,
          subCategory: 'duplex',
        },
        {
          type: 'OFFICE',
          buildingIndex: 0,
          number: '2',
          meaShare: 25,
          sizeSqm: 80,
          layoutNote: 'open plan',
        },
        {
          type: 'PARKING',
          buildingIndex: 0,
          number: 'P1',
          meaShare: 5,
          sizeSqm: 12,
          parkingCode: 'P-12',
        },
      ],
    };
    const payload = buildCreatePropertyRequest(draft);
    expect(payload.units[0]).toMatchObject({ type: 'APARTMENT', subCategory: 'duplex' });
    expect(payload.units[1]).toMatchObject({ type: 'OFFICE', layoutNote: 'open plan' });
    expect(payload.units[2]).toMatchObject({ type: 'PARKING', parkingCode: 'P-12' });
  });

  it('passes the floor discriminant through unchanged', () => {
    const draft: WizardDraft = {
      ...happyDraft,
      units: [
        {
          type: 'APARTMENT',
          buildingIndex: 0,
          number: '1',
          meaShare: 100,
          sizeSqm: 70,
          rooms: 2,
          floor: { kind: 'OG', level: 3 },
        },
      ],
    };
    const payload = buildCreatePropertyRequest(draft);
    expect(payload.units[0]?.floor).toEqual({ kind: 'OG', level: 3 });
  });
});

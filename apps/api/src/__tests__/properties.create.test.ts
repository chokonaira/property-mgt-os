import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { CreatePropertyRequest } from '@buena/shared';
import { PropertiesService } from '../modules/properties/properties.service';
import type { PrismaService } from '../shared/prisma.service';

interface BuildingRow {
  id: string;
  propertyId: string;
  street: string;
  houseNumber: string;
  postalCode: string | null;
  city: string | null;
  country: string;
  label: string | null;
  nickname: string | null;
  yearBuilt: number | null;
  floorsCount: number | null;
  hasElevator: boolean | null;
  energyStandard: string | null;
  heating: string | null;
  buildingType: string | null;
  units: UnitRow[];
}

interface UnitRow {
  id: string;
  buildingId: string;
  number: string;
  type: 'APARTMENT' | 'OFFICE' | 'PARKING' | 'GARDEN';
  meaShare: Prisma.Decimal;
  sizeSqm: Prisma.Decimal | null;
  rooms: number | null;
  floorKind: 'EG' | 'OG' | 'UG' | 'DG' | 'STAFFEL' | null;
  floorLevel: number | null;
  floorQualifier: string | null;
  entranceLabel: string | null;
  entranceNote: string | null;
  yearBuilt: number | null;
  description: string | null;
  subCategory: string | null;
}

interface PropertyRow {
  id: string;
  tenantId: string;
  name: string;
  uniqueNumber: string;
  managementType: 'WEG' | 'MV';
  totalMea: Prisma.Decimal | null;
  notarialRollNo: string | null;
  notarizedAt: Date | null;
  declarationFileId: string | null;
  grundbuchOffice: string | null;
  grundbuchSheet: string | null;
  gemarkung: string | null;
  flur: string | null;
  flurstueck: string | null;
  totalAreaSqm: Prisma.Decimal | null;
  propertyManagerId: string | null;
  accountantId: string | null;
  createdAt: Date;
  updatedAt: Date;
  propertyManager: null;
  accountant: null;
  buildings: BuildingRow[];
}

function makePrisma() {
  let nextId = 0;
  const id = (prefix: string) => `${prefix}-${++nextId}`;
  const properties: PropertyRow[] = [];
  const buildings: BuildingRow[] = [];
  const units: UnitRow[] = [];

  const tx = {
    property: {
      create: vi.fn(async ({ data }: { data: Partial<PropertyRow> }) => {
        const row: PropertyRow = {
          id: id('p'),
          tenantId: data.tenantId ?? 'demo',
          name: data.name ?? '',
          uniqueNumber: data.uniqueNumber ?? '',
          managementType: data.managementType ?? 'WEG',
          totalMea: data.totalMea ?? null,
          notarialRollNo: data.notarialRollNo ?? null,
          notarizedAt: data.notarizedAt ?? null,
          declarationFileId: data.declarationFileId ?? null,
          grundbuchOffice: data.grundbuchOffice ?? null,
          grundbuchSheet: data.grundbuchSheet ?? null,
          gemarkung: data.gemarkung ?? null,
          flur: data.flur ?? null,
          flurstueck: data.flurstueck ?? null,
          totalAreaSqm: data.totalAreaSqm ?? null,
          propertyManagerId: data.propertyManagerId ?? null,
          accountantId: data.accountantId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          propertyManager: null,
          accountant: null,
          buildings: [],
        };
        properties.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const property = properties.find((p) => p.id === where.id);
        if (!property) return null;
        return {
          ...property,
          buildings: buildings
            .filter((b) => b.propertyId === property.id)
            .map((b) => ({ ...b, units: units.filter((u) => u.buildingId === b.id) })),
        };
      }),
    },
    building: {
      create: vi.fn(async ({ data }: { data: Omit<BuildingRow, 'id' | 'units'> }) => {
        const row: BuildingRow = { ...data, id: id('b'), units: [] };
        buildings.push(row);
        return row;
      }),
    },
    unit: {
      create: vi.fn(
        async ({ data }: { data: Omit<UnitRow, 'id'> & { entranceNote?: string | null } }) => {
          const row: UnitRow = {
            id: id('u'),
            buildingId: data.buildingId,
            number: data.number,
            type: data.type,
            meaShare: data.meaShare,
            sizeSqm: data.sizeSqm ?? null,
            rooms: data.rooms ?? null,
            floorKind: data.floorKind ?? null,
            floorLevel: data.floorLevel ?? null,
            floorQualifier: data.floorQualifier ?? null,
            entranceLabel: data.entranceLabel ?? null,
            entranceNote: data.entranceNote ?? null,
            yearBuilt: data.yearBuilt ?? null,
            description: data.description ?? null,
            subCategory: data.subCategory ?? null,
          };
          units.push(row);
          return row;
        },
      ),
    },
  };

  const $transaction = vi.fn(async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma));
  const prisma = { ...tx, $transaction } as unknown as PrismaService;
  return { prisma, tx, $transaction, snapshot: { properties, buildings, units } };
}

const baseProperty = {
  managementType: 'WEG' as const,
  name: 'Parkview Residences',
  uniqueNumber: '10-557-PRB',
};

describe('PropertiesService.create', () => {
  it('runs the work inside a single $transaction', async () => {
    const harness = makePrisma();
    const svc = new PropertiesService(harness.prisma);
    await svc.create('demo', {
      property: baseProperty,
      buildings: [{ street: 'Hauptstr.', houseNumber: '1', country: 'DE' }],
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
    } satisfies CreatePropertyRequest);

    expect(harness.$transaction).toHaveBeenCalledTimes(1);
    expect(harness.snapshot.properties).toHaveLength(1);
    expect(harness.snapshot.buildings).toHaveLength(1);
    expect(harness.snapshot.units).toHaveLength(1);
  });

  it('isolates the new property to the supplied tenantId — never trusts client', async () => {
    const harness = makePrisma();
    const svc = new PropertiesService(harness.prisma);
    await svc.create('demo', {
      property: baseProperty,
      buildings: [{ street: 'Hauptstr.', houseNumber: '1', country: 'DE' }],
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
    } satisfies CreatePropertyRequest);

    expect(harness.snapshot.properties[0]?.tenantId).toBe('demo');
  });

  it("resolves each unit's buildingIndex to the created building id", async () => {
    const harness = makePrisma();
    const svc = new PropertiesService(harness.prisma);
    await svc.create('demo', {
      property: baseProperty,
      buildings: [
        { street: 'Hauptstr.', houseNumber: '1', country: 'DE' },
        { street: 'Hauptstr.', houseNumber: '2', country: 'DE' },
      ],
      units: [
        {
          type: 'APARTMENT',
          buildingIndex: 0,
          number: 'A1',
          meaShare: 50,
          sizeSqm: 50,
          rooms: 2,
        },
        {
          type: 'APARTMENT',
          buildingIndex: 1,
          number: 'B1',
          meaShare: 50,
          sizeSqm: 60,
          rooms: 3,
        },
      ],
    } satisfies CreatePropertyRequest);

    const [b0, b1] = harness.snapshot.buildings;
    const unitsByNumber = Object.fromEntries(
      harness.snapshot.units.map((u) => [u.number, u.buildingId]),
    );
    expect(unitsByNumber.A1).toBe(b0?.id);
    expect(unitsByNumber.B1).toBe(b1?.id);
  });

  it('decomposes a discriminated Floor into kind / level / qualifier columns', async () => {
    const harness = makePrisma();
    const svc = new PropertiesService(harness.prisma);
    await svc.create('demo', {
      property: baseProperty,
      buildings: [{ street: 'Hauptstr.', houseNumber: '1', country: 'DE' }],
      units: [
        {
          type: 'OFFICE',
          buildingIndex: 0,
          number: '1',
          meaShare: 50,
          sizeSqm: 80,
          floor: { kind: 'OG', level: 3 },
          layoutNote: 'open plan',
        },
      ],
    } satisfies CreatePropertyRequest);

    const u = harness.snapshot.units[0];
    expect(u?.floorKind).toBe('OG');
    expect(u?.floorLevel).toBe(3);
    expect(u?.floorQualifier).toBeNull();
    // Variant-specific layoutNote collapses into the shared subCategory column.
    expect(u?.subCategory).toBe('open plan');
  });

  it('routes APARTMENT.subCategory and PARKING.parkingCode through the same column', async () => {
    const harness = makePrisma();
    const svc = new PropertiesService(harness.prisma);
    await svc.create('demo', {
      property: baseProperty,
      buildings: [{ street: 'Hauptstr.', houseNumber: '1', country: 'DE' }],
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
          type: 'PARKING',
          buildingIndex: 0,
          number: 'P-12',
          meaShare: 5,
          sizeSqm: 12,
          parkingCode: 'P-12',
        },
      ],
    } satisfies CreatePropertyRequest);

    const subCategories = harness.snapshot.units.map((u) => u.subCategory);
    expect(subCategories).toEqual(['duplex', 'P-12']);
  });

  it('returns the full PropertyDetail with mapped buildings + units', async () => {
    const harness = makePrisma();
    const svc = new PropertiesService(harness.prisma);
    const detail = await svc.create('demo', {
      property: baseProperty,
      buildings: [{ street: 'Hauptstr.', houseNumber: '1', country: 'DE' }],
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
    } satisfies CreatePropertyRequest);

    expect(detail.id).toBeTruthy();
    expect(detail.uniqueNumber).toBe('10-557-PRB');
    expect(detail.buildings).toHaveLength(1);
    expect(detail.buildings[0]?.units).toHaveLength(1);
    expect(detail.buildings[0]?.units[0]?.type).toBe('APARTMENT');
  });
});

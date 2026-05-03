import { describe, expect, it, vi } from 'vitest';
import { PropertiesService } from '../modules/properties/properties.service';
import type { PrismaService } from '../shared/prisma.service';

interface UnitRow {
  id: string;
}
interface BuildingRow {
  id: string;
  units: UnitRow[];
}
interface PropertyRow {
  id: string;
  tenantId: string;
  deletedAt: Date | null;
  buildings: BuildingRow[];
  // Plus the fields PropertiesService.getById's mapper reads. We
  // stub the minimum needed; the test asserts on the diff calls,
  // not the mapped detail (return value isn't checked here).
  name: string;
  uniqueNumber: string;
  managementType: 'WEG';
  totalMea: null;
  notarialRollNo: null;
  notarizedAt: null;
  declarationFileId: null;
  grundbuchOffice: null;
  grundbuchSheet: null;
  gemarkung: null;
  flur: null;
  flurstueck: null;
  totalAreaSqm: null;
  propertyManagerId: null;
  accountantId: null;
  createdAt: Date;
  updatedAt: Date;
  propertyManager: null;
  accountant: null;
}

function makeProperty(buildings: BuildingRow[]): PropertyRow {
  return {
    id: 'p1',
    tenantId: 'demo',
    deletedAt: null,
    buildings,
    name: 'Test',
    uniqueNumber: 'TST-1',
    managementType: 'WEG',
    totalMea: null,
    notarialRollNo: null,
    notarizedAt: null,
    declarationFileId: null,
    grundbuchOffice: null,
    grundbuchSheet: null,
    gemarkung: null,
    flur: null,
    flurstueck: null,
    totalAreaSqm: null,
    propertyManagerId: null,
    accountantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    propertyManager: null,
    accountant: null,
  };
}

interface MockUnit {
  delete: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
}

function makeHarness(property: PropertyRow): {
  prisma: PrismaService;
  unit: MockUnit;
} {
  const findFirst = vi.fn(async () => property);
  const unit: MockUnit = {
    delete: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
  };
  const $transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({ unit }),
  );
  const findUnique = vi.fn(async () => property);
  const prisma = {
    property: { findFirst, findUnique },
    $transaction,
  } as unknown as PrismaService;
  return { prisma, unit };
}

const APARTMENT_BASE = {
  type: 'APARTMENT' as const,
  number: '01',
  meaShare: 100,
  sizeSqm: 80,
  rooms: 3,
};

describe('PropertiesService.replaceUnits', () => {
  it('UPDATEs each unit whose id matches an existing row', async () => {
    const property = makeProperty([{ id: 'b1', units: [{ id: 'u1' }] }]);
    const { prisma, unit } = makeHarness(property);
    const svc = new PropertiesService(prisma);
    // The service calls getById() after the transaction to return
    // the mapped detail — the mock above doesn't fully model the
    // mapper's expected shape, so we swallow the post-transaction
    // throw and assert on the call counts that ran inside it.
    await svc
      .replaceUnits('demo', 'p1', [
        { ...APARTMENT_BASE, id: 'u1', buildingIndex: 0, number: '01-edited' },
      ])
      .catch(() => undefined);
    expect(unit.update).toHaveBeenCalledTimes(1);
    expect(unit.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
    expect(unit.delete).not.toHaveBeenCalled();
    expect(unit.create).not.toHaveBeenCalled();
  });

  it('CREATEs each unit without an id', async () => {
    const property = makeProperty([{ id: 'b1', units: [] }]);
    const { prisma, unit } = makeHarness(property);
    const svc = new PropertiesService(prisma);
    // The service calls getById() after the transaction to return
    // the mapped detail — the mock above doesn't fully model the
    // mapper's expected shape, so we swallow the post-transaction
    // throw and assert on the call counts that ran inside it.
    await svc
      .replaceUnits('demo', 'p1', [
        { ...APARTMENT_BASE, buildingIndex: 0, number: '01' },
        { ...APARTMENT_BASE, buildingIndex: 0, number: '02' },
      ])
      .catch(() => undefined);
    expect(unit.create).toHaveBeenCalledTimes(2);
    expect(unit.delete).not.toHaveBeenCalled();
    expect(unit.update).not.toHaveBeenCalled();
  });

  it('DELETEs each existing unit whose id is missing from the payload', async () => {
    const property = makeProperty([
      { id: 'b1', units: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }] },
    ]);
    const { prisma, unit } = makeHarness(property);
    const svc = new PropertiesService(prisma);
    // The service calls getById() after the transaction to return
    // the mapped detail — the mock above doesn't fully model the
    // mapper's expected shape, so we swallow the post-transaction
    // throw and assert on the call counts that ran inside it.
    await svc
      .replaceUnits('demo', 'p1', [
        { ...APARTMENT_BASE, id: 'u2', buildingIndex: 0 },
      ])
      .catch(() => undefined);
    expect(unit.delete).toHaveBeenCalledTimes(2);
    expect(unit.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(unit.delete).toHaveBeenCalledWith({ where: { id: 'u3' } });
  });

  it('runs deletes BEFORE updates/inserts to avoid (buildingId, number) collision', async () => {
    // Existing #01 should be deleted; payload reuses #01 in a new
    // row. Hard order-dependence: insert before delete would 409 on
    // the unique constraint.
    const property = makeProperty([{ id: 'b1', units: [{ id: 'u1' }] }]);
    const { prisma, unit } = makeHarness(property);
    const svc = new PropertiesService(prisma);
    // The service calls getById() after the transaction to return
    // the mapped detail — the mock above doesn't fully model the
    // mapper's expected shape, so we swallow the post-transaction
    // throw and assert on the call counts that ran inside it.
    await svc
      .replaceUnits('demo', 'p1', [
        { ...APARTMENT_BASE, buildingIndex: 0, number: '01' },
      ])
      .catch(() => undefined);
    const deleteCallOrder = unit.delete.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER;
    const createCallOrder = unit.create.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER;
    expect(deleteCallOrder).toBeLessThan(createCallOrder);
  });

  it('rejects an out-of-range buildingIndex with 422 + path detail', async () => {
    const property = makeProperty([{ id: 'b1', units: [] }]);
    const { prisma } = makeHarness(property);
    const svc = new PropertiesService(prisma);
    await expect(
      svc.replaceUnits('demo', 'p1', [{ ...APARTMENT_BASE, buildingIndex: 5 }]),
    ).rejects.toThrow(/out-of-range/i);
  });

  it('rejects a foreign unit id (id not on this property)', async () => {
    const property = makeProperty([{ id: 'b1', units: [{ id: 'u1' }] }]);
    const { prisma } = makeHarness(property);
    const svc = new PropertiesService(prisma);
    await expect(
      svc.replaceUnits('demo', 'p1', [
        { ...APARTMENT_BASE, id: 'u-foreign', buildingIndex: 0 },
      ]),
    ).rejects.toThrow(/do not belong/i);
  });

  it('404s when the property does not exist or is soft-deleted', async () => {
    const findFirst = vi.fn(async () => null);
    const prisma = {
      property: { findFirst },
    } as unknown as PrismaService;
    const svc = new PropertiesService(prisma);
    await expect(
      svc.replaceUnits('demo', 'missing', [{ ...APARTMENT_BASE, buildingIndex: 0 }]),
    ).rejects.toThrow(/not found/i);
  });
});

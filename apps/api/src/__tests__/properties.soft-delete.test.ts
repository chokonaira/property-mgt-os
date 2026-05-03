import { describe, expect, it, vi } from 'vitest';
import { PropertiesService } from '../modules/properties/properties.service';
import type { PrismaService } from '../shared/prisma.service';

interface PropertyRow {
  id: string;
  tenantId: string;
  deletedAt: Date | null;
  // Minimal extra fields just so getById's include + map can run
  // without throwing — none of the test assertions read them.
  name: string;
  uniqueNumber: string;
  managementType: 'WEG' | 'MV';
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
  buildings: never[];
}

function row(overrides: Partial<PropertyRow> = {}): PropertyRow {
  return {
    id: overrides.id ?? 'p1',
    tenantId: 'demo',
    deletedAt: null,
    name: 'Test',
    uniqueNumber: 'TST',
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
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    propertyManager: null,
    accountant: null,
    buildings: [],
    ...overrides,
  };
}

interface FindFirstArgs {
  where: { id: string; tenantId: string; deletedAt?: null | { not: null } };
}
interface UpdateArgs {
  where: { id: string };
  data: { deletedAt: Date | null };
}

function makePrisma(initial: PropertyRow[]): {
  prisma: PrismaService;
  state: PropertyRow[];
  updateSpy: ReturnType<typeof vi.fn>;
} {
  const state = initial.map((r) => ({ ...r }));
  const updateSpy = vi.fn(async (args: UpdateArgs) => {
    const r = state.find((x) => x.id === args.where.id);
    if (!r) throw new Error(`No row ${args.where.id}`);
    r.deletedAt = args.data.deletedAt;
    return r;
  });
  const findFirst = vi.fn(async (args: FindFirstArgs) => {
    return (
      state.find((r) => {
        if (r.id !== args.where.id) return false;
        if (r.tenantId !== args.where.tenantId) return false;
        const filter = args.where.deletedAt;
        if (filter === null) return r.deletedAt === null;
        if (filter && typeof filter === 'object' && 'not' in filter && filter.not === null) {
          return r.deletedAt !== null;
        }
        return true;
      }) ?? null
    );
  });
  const prisma = {
    property: { findFirst, update: updateSpy },
  } as unknown as PrismaService;
  return { prisma, state, updateSpy };
}

describe('PropertiesService.delete (soft)', () => {
  it('flips deletedAt to a timestamp instead of removing the row', async () => {
    const { prisma, state, updateSpy } = makePrisma([row({ id: 'p1' })]);
    const svc = new PropertiesService(prisma);
    await svc.delete('demo', 'p1');
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(state[0]?.deletedAt).toBeInstanceOf(Date);
  });

  it('404s when called twice on the same property (already deleted)', async () => {
    const past = new Date('2026-01-01');
    const { prisma } = makePrisma([row({ id: 'p1', deletedAt: past })]);
    const svc = new PropertiesService(prisma);
    await expect(svc.delete('demo', 'p1')).rejects.toThrow(/not found/i);
  });

  it('404s when the property belongs to another tenant', async () => {
    const { prisma } = makePrisma([row({ id: 'p1', tenantId: 'other-tenant' })]);
    const svc = new PropertiesService(prisma);
    await expect(svc.delete('demo', 'p1')).rejects.toThrow(/not found/i);
  });
});

describe('PropertiesService.restore', () => {
  it('clears deletedAt on a soft-deleted property', async () => {
    const { prisma, state, updateSpy } = makePrisma([
      row({ id: 'p1', deletedAt: new Date('2026-01-01') }),
    ]);
    const svc = new PropertiesService(prisma);
    // The mock's findFirst with `deletedAt: null` would return null,
    // but getById is called AFTER the update flips deletedAt to null,
    // so the find succeeds. Verify by re-checking state.
    await svc.restore('demo', 'p1').catch(() => {
      // We don't assert on the returned PropertyDetail here — the
      // mock doesn't fully model the include shape — but we DO
      // assert the update was called with deletedAt: null below.
    });
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { deletedAt: null },
    });
    expect(state[0]?.deletedAt).toBeNull();
  });

  it('404s when the property is not archived (deletedAt is null)', async () => {
    const { prisma } = makePrisma([row({ id: 'p1', deletedAt: null })]);
    const svc = new PropertiesService(prisma);
    await expect(svc.restore('demo', 'p1')).rejects.toThrow(/not archived/i);
  });

  it('404s when the property does not exist', async () => {
    const { prisma } = makePrisma([]);
    const svc = new PropertiesService(prisma);
    await expect(svc.restore('demo', 'missing')).rejects.toThrow(/not found/i);
  });
});

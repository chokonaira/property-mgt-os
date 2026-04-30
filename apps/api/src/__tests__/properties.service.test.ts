import { describe, expect, it, vi } from 'vitest';
import { PropertiesService } from '../modules/properties/properties.service';
import type { PrismaService } from '../shared/prisma.service';

interface SeedRow {
  id: string;
  name: string;
  uniqueNumber: string;
  managementType: 'WEG' | 'MV';
  createdAt: Date;
}

const seed: SeedRow[] = [
  {
    id: 'cm0p001',
    name: 'Parkview Residences Berlin',
    uniqueNumber: '10-557-PRB',
    managementType: 'WEG',
    createdAt: new Date('2026-04-01T10:00:00Z'),
  },
  {
    id: 'cm0p002',
    name: 'Cityside Apartments',
    uniqueNumber: '20-100-CSA',
    managementType: 'MV',
    createdAt: new Date('2026-04-15T10:00:00Z'),
  },
];

interface FindManyArgs {
  where: { tenantId: string; uniqueNumber?: string };
  orderBy: { createdAt: 'asc' | 'desc' };
  take: number;
  skip: number;
}

function makePrisma(rows: SeedRow[]): PrismaService {
  const findMany = vi.fn(async (args: FindManyArgs) => {
    const filtered = rows
      .filter((r) => (args.where.uniqueNumber ? r.uniqueNumber === args.where.uniqueNumber : true))
      .sort((a, b) =>
        args.orderBy.createdAt === 'desc'
          ? b.createdAt.getTime() - a.createdAt.getTime()
          : a.createdAt.getTime() - b.createdAt.getTime(),
      );
    return filtered.slice(args.skip, args.skip + args.take);
  });
  const count = vi.fn(async (args: { where: { uniqueNumber?: string } }) => {
    return rows.filter((r) =>
      args.where.uniqueNumber ? r.uniqueNumber === args.where.uniqueNumber : true,
    ).length;
  });
  const $transaction = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
  return { property: { findMany, count }, $transaction } as unknown as PrismaService;
}

describe('PropertiesService.list', () => {
  it('returns items ordered by createdAt desc with envelope counts', async () => {
    const service = new PropertiesService(makePrisma(seed));
    const result = await service.list('demo', { take: 50, skip: 0 });

    expect(result.total).toBe(2);
    expect(result.take).toBe(50);
    expect(result.skip).toBe(0);
    expect(result.items.map((i) => i.uniqueNumber)).toEqual(['20-100-CSA', '10-557-PRB']);
    expect(result.items[0]).toMatchObject({
      id: 'cm0p002',
      name: 'Cityside Apartments',
      managementType: 'MV',
      uniqueNumber: '20-100-CSA',
    });
  });

  it('honours take + skip pagination', async () => {
    const service = new PropertiesService(makePrisma(seed));
    const page1 = await service.list('demo', { take: 1, skip: 0 });
    const page2 = await service.list('demo', { take: 1, skip: 1 });

    expect(page1.items).toHaveLength(1);
    expect(page2.items).toHaveLength(1);
    expect(page1.items[0]?.uniqueNumber).not.toBe(page2.items[0]?.uniqueNumber);
    expect(page1.total).toBe(2);
    expect(page2.total).toBe(2);
  });

  it('applies the uniqueNumber filter and returns at most one match', async () => {
    const service = new PropertiesService(makePrisma(seed));
    const result = await service.list('demo', {
      take: 50,
      skip: 0,
      uniqueNumber: '10-557-PRB',
    });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.uniqueNumber).toBe('10-557-PRB');
  });

  it('returns empty items + total=0 when uniqueNumber matches nothing', async () => {
    const service = new PropertiesService(makePrisma(seed));
    const result = await service.list('demo', {
      take: 50,
      skip: 0,
      uniqueNumber: '99-999-XXX',
    });
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('returns empty items when no properties seeded for the tenant', async () => {
    const service = new PropertiesService(makePrisma([]));
    const result = await service.list('demo', { take: 50, skip: 0 });
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { ContactsService } from '../modules/contacts/contacts.service';
import type { PrismaService } from '../shared/prisma.service';

interface Row {
  id: string;
  tenantId: string;
  name: string;
  role: string;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
}

const seed: Row[] = [
  {
    id: 'cm0c1',
    tenantId: 'demo',
    name: 'immoGuard Berlin GmbH',
    role: 'WEG-Verwalter',
    street: 'Musterstraße',
    houseNumber: '1',
    postalCode: '10115',
    city: 'Berlin',
    email: null,
    phone: null,
  },
  {
    id: 'cm0c2',
    tenantId: 'demo',
    name: 'FinanzExpertise Müller & Co KG',
    role: 'Buchhaltung',
    street: 'Rechnungsallee',
    houseNumber: '99',
    postalCode: '10557',
    city: 'Berlin',
    email: null,
    phone: null,
  },
  {
    id: 'cm0c3',
    tenantId: 'other-tenant',
    name: 'Other Tenant Manager',
    role: 'WEG-Verwalter',
    street: null,
    houseNumber: null,
    postalCode: null,
    city: null,
    email: null,
    phone: null,
  },
];

function makePrisma(rows: Row[] = seed) {
  const findMany = vi.fn(async (args: { where: { tenantId: string; role: { in: string[] } } }) => {
    return rows.filter(
      (r) => r.tenantId === args.where.tenantId && args.where.role.in.includes(r.role),
    );
  });
  let nextId = rows.length;
  const create = vi.fn(async (args: { data: Omit<Row, 'id'> }) => {
    nextId += 1;
    const row: Row = {
      id: `gen-${nextId}`,
      tenantId: args.data.tenantId,
      name: args.data.name,
      role: args.data.role,
      street: args.data.street ?? null,
      houseNumber: args.data.houseNumber ?? null,
      postalCode: args.data.postalCode ?? null,
      city: args.data.city ?? null,
      email: args.data.email ?? null,
      phone: args.data.phone ?? null,
    };
    rows.push(row);
    return row;
  });
  return {
    prisma: { contact: { findMany, create } } as unknown as PrismaService,
    findMany,
    create,
  };
}

describe('ContactsService.list', () => {
  it('filters PROPERTY_MANAGER role labels', async () => {
    const svc = new ContactsService(makePrisma().prisma);
    const result = await svc.list('demo', { role: 'PROPERTY_MANAGER' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('immoGuard Berlin GmbH');
  });

  it('filters ACCOUNTANT role labels', async () => {
    const svc = new ContactsService(makePrisma().prisma);
    const result = await svc.list('demo', { role: 'ACCOUNTANT' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('FinanzExpertise Müller & Co KG');
  });

  it('does not leak contacts from other tenants', async () => {
    const svc = new ContactsService(makePrisma().prisma);
    const result = await svc.list('demo', { role: 'PROPERTY_MANAGER' });
    expect(result.items.find((c) => c.tenantId !== 'demo')).toBeUndefined();
  });

  it('returns empty items when no contacts match', async () => {
    const svc = new ContactsService(makePrisma([]).prisma);
    const result = await svc.list('demo', { role: 'PROPERTY_MANAGER' });
    expect(result.items).toEqual([]);
  });
});

describe('ContactsService.create', () => {
  it('substitutes the canonical German label for PROPERTY_MANAGER', async () => {
    const { prisma, create } = makePrisma([]);
    const svc = new ContactsService(prisma);
    const result = await svc.create('demo', {
      role: 'PROPERTY_MANAGER',
      name: 'New Verwalter',
    });
    expect(result.role).toBe('WEG-Verwalter');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'demo', role: 'WEG-Verwalter' }),
      }),
    );
  });

  it('substitutes the canonical German label for ACCOUNTANT', async () => {
    const { prisma } = makePrisma([]);
    const svc = new ContactsService(prisma);
    const result = await svc.create('demo', {
      role: 'ACCOUNTANT',
      name: 'New Buchhalter',
    });
    expect(result.role).toBe('Buchhaltung');
  });

  it('coerces missing optional fields to null on the row', async () => {
    const { prisma, create } = makePrisma([]);
    const svc = new ContactsService(prisma);
    await svc.create('demo', { role: 'PROPERTY_MANAGER', name: 'Sparse' });
    const data = create.mock.calls[0]?.[0]?.data;
    expect(data?.street).toBeNull();
    expect(data?.email).toBeNull();
  });

  it('persists the address + contact fields it receives', async () => {
    const { prisma, create } = makePrisma([]);
    const svc = new ContactsService(prisma);
    const result = await svc.create('demo', {
      role: 'ACCOUNTANT',
      name: 'Detailed',
      street: 'Hauptstr.',
      houseNumber: '12',
      postalCode: '10115',
      city: 'Berlin',
      email: 'finance@example.com',
      phone: '+49 30 12345',
    });
    expect(result).toMatchObject({
      name: 'Detailed',
      street: 'Hauptstr.',
      houseNumber: '12',
      postalCode: '10115',
      city: 'Berlin',
      email: 'finance@example.com',
      phone: '+49 30 12345',
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('isolates new contacts to the supplied tenant', async () => {
    const { prisma } = makePrisma([]);
    const svc = new ContactsService(prisma);
    await svc.create('tenant-a', { role: 'PROPERTY_MANAGER', name: 'Tenant A Mgr' });
    const otherList = await svc.list('tenant-b', { role: 'PROPERTY_MANAGER' });
    expect(otherList.items).toEqual([]);
  });
});

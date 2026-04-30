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

function makePrisma(rows: Row[] = seed): PrismaService {
  const findMany = vi.fn(async (args: { where: { tenantId: string; role: { in: string[] } } }) => {
    return rows.filter(
      (r) => r.tenantId === args.where.tenantId && args.where.role.in.includes(r.role),
    );
  });
  return { contact: { findMany } } as unknown as PrismaService;
}

describe('ContactsService.list', () => {
  it('filters PROPERTY_MANAGER role labels', async () => {
    const svc = new ContactsService(makePrisma());
    const result = await svc.list('demo', { role: 'PROPERTY_MANAGER' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('immoGuard Berlin GmbH');
  });

  it('filters ACCOUNTANT role labels', async () => {
    const svc = new ContactsService(makePrisma());
    const result = await svc.list('demo', { role: 'ACCOUNTANT' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('FinanzExpertise Müller & Co KG');
  });

  it('does not leak contacts from other tenants', async () => {
    const svc = new ContactsService(makePrisma());
    const result = await svc.list('demo', { role: 'PROPERTY_MANAGER' });
    expect(result.items.find((c) => c.tenantId !== 'demo')).toBeUndefined();
  });

  it('returns empty items when no contacts match', async () => {
    const svc = new ContactsService(makePrisma([]));
    const result = await svc.list('demo', { role: 'PROPERTY_MANAGER' });
    expect(result.items).toEqual([]);
  });
});

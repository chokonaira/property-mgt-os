import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { HttpStatus } from '@nestjs/common';
import { PropertiesService } from '../modules/properties/properties.service';
import type { PrismaService } from '../shared/prisma.service';
import { AppException } from '../shared/exceptions';

const PARKVIEW = {
  id: 'cm0pp0001',
  tenantId: 'demo',
  name: 'Parkview Residences Berlin',
  uniqueNumber: '10-557-PRB',
  managementType: 'WEG' as const,
  totalMea: new Prisma.Decimal('1000.00'),
  notarialRollNo: '2024/05-B',
  notarizedAt: new Date('2024-03-15'),
  declarationFileId: null,
  grundbuchOffice: 'Berlin-Mitte',
  grundbuchSheet: 'Blatt 12345',
  gemarkung: 'Berlin-Mitte',
  flur: '12',
  flurstueck: '456/78',
  totalAreaSqm: new Prisma.Decimal('2450.00'),
  propertyManagerId: 'cm0c1',
  accountantId: 'cm0c2',
  createdAt: new Date('2026-04-01T10:00:00Z'),
  updatedAt: new Date('2026-04-01T10:00:00Z'),
  propertyManager: {
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
  accountant: {
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
  buildings: [
    {
      id: 'cm0bA',
      propertyId: 'cm0pp0001',
      street: 'Am Fiktivpark',
      houseNumber: '12',
      postalCode: '10557',
      city: 'Berlin',
      country: 'DE',
      label: 'Haus A',
      nickname: 'Parkside',
      yearBuilt: 2023,
      floorsCount: 5,
      hasElevator: true,
      energyStandard: 'KfW 40',
      heating: 'Fernwärme',
      buildingType: 'Wohngebäude',
      units: [
        {
          id: 'cm0u01',
          buildingId: 'cm0bA',
          number: '01',
          type: 'APARTMENT' as const,
          floorKind: 'EG' as const,
          floorLevel: 0,
          floorQualifier: null,
          entranceLabel: 'A',
          entranceNote: 'Haupteingang',
          sizeSqm: new Prisma.Decimal('95.00'),
          areaMetric: 'WOHN' as const,
          meaShare: new Prisma.Decimal('110.00'),
          rooms: 3,
          yearBuilt: 2023,
          subCategory: 'Erdgeschosswohnung',
          description: 'Erdgeschosswohnung links gelegen, inklusive Terrasse',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'cm0u09',
          buildingId: 'cm0bA',
          number: '09',
          type: 'PARKING' as const,
          floorKind: 'UG' as const,
          floorLevel: 1,
          floorQualifier: null,
          entranceLabel: null,
          entranceNote: null,
          sizeSqm: new Prisma.Decimal('12.50'),
          areaMetric: 'NUTZ' as const,
          meaShare: new Prisma.Decimal('1.00'),
          rooms: null,
          yearBuilt: 2023,
          subCategory: 'TG-01',
          description: 'Tiefgaragenstellplatz',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    },
  ],
};

function makePrisma(rows: (typeof PARKVIEW)[] | null = [PARKVIEW]) {
  const findFirst = vi.fn(async (args: { where: { id: string; tenantId: string } }) => {
    if (rows === null) return null;
    return rows.find((r) => r.id === args.where.id && r.tenantId === args.where.tenantId) ?? null;
  });
  return { property: { findFirst } } as unknown as PrismaService;
}

describe('PropertiesService.getById', () => {
  it('returns the property with buildings, units, and inlined contacts', async () => {
    const service = new PropertiesService(makePrisma());
    const result = await service.getById('demo', 'cm0pp0001');

    expect(result.id).toBe('cm0pp0001');
    expect(result.name).toBe('Parkview Residences Berlin');
    expect(result.totalMea).toBe(1000);
    expect(result.buildings).toHaveLength(1);
    expect(result.buildings[0]?.units).toHaveLength(2);
    expect(result.propertyManager?.name).toBe('immoGuard Berlin GmbH');
    expect(result.accountant?.name).toBe('FinanzExpertise Müller & Co KG');
  });

  it('coerces Prisma.Decimal to plain numbers on units (sizeSqm + meaShare)', async () => {
    const service = new PropertiesService(makePrisma());
    const result = await service.getById('demo', 'cm0pp0001');
    const apt = result.buildings[0]?.units.find((u) => u.type === 'APARTMENT');
    expect(typeof apt?.sizeSqm).toBe('number');
    expect(apt?.sizeSqm).toBe(95);
    expect(apt?.meaShare).toBe(110);
  });

  it('preserves the discriminated unit shape per type', async () => {
    const service = new PropertiesService(makePrisma());
    const result = await service.getById('demo', 'cm0pp0001');
    const parking = result.buildings[0]?.units.find((u) => u.type === 'PARKING');
    expect(parking).toMatchObject({ type: 'PARKING', areaMetric: 'NUTZ', parkingCode: 'TG-01' });
  });

  it('throws AppException(NOT_FOUND, 404) when no row matches the id+tenant scope', async () => {
    const service = new PropertiesService(makePrisma([]));
    await expect(service.getById('demo', 'missing-id')).rejects.toThrowError(AppException);
    try {
      await service.getById('demo', 'missing-id');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('NOT_FOUND');
      expect((err as AppException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    }
  });

  it('does not leak rows from a different tenant', async () => {
    const service = new PropertiesService(makePrisma([PARKVIEW]));
    await expect(service.getById('other-tenant', PARKVIEW.id)).rejects.toThrowError(AppException);
  });
});

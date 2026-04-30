import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  Building,
  Contact,
  Floor,
  PropertyDetail,
  PropertyListItem,
  PropertyListQuery,
  PropertyListResponse,
  Unit,
} from '@buena/shared';
import { AppException } from '../../shared/exceptions';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { PrismaService } from '../../shared/prisma.service';

type PropertyWithRelations = Prisma.PropertyGetPayload<{
  include: {
    propertyManager: true;
    accountant: true;
    buildings: { include: { units: true } };
  };
}>;
type BuildingWithUnits = PropertyWithRelations['buildings'][number];
type UnitRow = BuildingWithUnits['units'][number];
type ContactRow = NonNullable<PropertyWithRelations['propertyManager']>;

const decimal = (value: Prisma.Decimal | null | undefined): number | undefined =>
  value === null || value === undefined ? undefined : Number(value.toString());

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: PropertyListQuery): Promise<PropertyListResponse> {
    const { take, skip, uniqueNumber } = query;
    const where = { tenantId, ...(uniqueNumber ? { uniqueNumber } : {}) };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: { id: true, name: true, uniqueNumber: true, managementType: true },
      }),
      this.prisma.property.count({ where }),
    ]);

    const items: PropertyListItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      uniqueNumber: row.uniqueNumber,
      managementType: row.managementType,
    }));

    return { items, total, take, skip };
  }

  async getById(tenantId: string, id: string): Promise<PropertyDetail> {
    const row = await this.prisma.property.findFirst({
      where: { id, tenantId },
      include: {
        propertyManager: true,
        accountant: true,
        buildings: { include: { units: true } },
      },
    });
    if (!row) {
      throw new AppException('NOT_FOUND', `Property ${id} not found.`, HttpStatus.NOT_FOUND);
    }
    return mapPropertyDetail(row);
  }
}

function mapPropertyDetail(row: PropertyWithRelations): PropertyDetail {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    uniqueNumber: row.uniqueNumber,
    managementType: row.managementType,
    totalMea: decimal(row.totalMea),
    notarialRollNo: row.notarialRollNo ?? undefined,
    notarizedAt: row.notarizedAt ?? undefined,
    declarationFileId: row.declarationFileId ?? undefined,
    grundbuchOffice: row.grundbuchOffice ?? undefined,
    grundbuchSheet: row.grundbuchSheet ?? undefined,
    gemarkung: row.gemarkung ?? undefined,
    flur: row.flur ?? undefined,
    flurstueck: row.flurstueck ?? undefined,
    totalAreaSqm: decimal(row.totalAreaSqm),
    propertyManagerId: row.propertyManagerId ?? undefined,
    accountantId: row.accountantId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    propertyManager: row.propertyManager ? mapContact(row.propertyManager) : null,
    accountant: row.accountant ? mapContact(row.accountant) : null,
    buildings: row.buildings.map(mapBuilding),
  };
}

function mapBuilding(b: BuildingWithUnits): Building & { units: Unit[] } {
  return {
    id: b.id,
    propertyId: b.propertyId,
    street: b.street,
    houseNumber: b.houseNumber,
    postalCode: b.postalCode ?? undefined,
    city: b.city ?? undefined,
    country: b.country ?? 'DE',
    label: b.label ?? undefined,
    nickname: b.nickname ?? undefined,
    yearBuilt: b.yearBuilt ?? undefined,
    floorsCount: b.floorsCount ?? undefined,
    hasElevator: b.hasElevator ?? undefined,
    energyStandard: b.energyStandard ?? undefined,
    heating: b.heating ?? undefined,
    buildingType: b.buildingType ?? undefined,
    units: b.units.map(mapUnit),
  };
}

function buildFloor(row: UnitRow): Floor | undefined {
  if (!row.floorKind) return undefined;
  switch (row.floorKind) {
    case 'EG':
    case 'DG':
      return { kind: row.floorKind };
    case 'OG':
      return row.floorLevel != null && row.floorLevel >= 1 && row.floorLevel <= 99
        ? { kind: 'OG', level: row.floorLevel }
        : undefined;
    case 'UG':
      return row.floorLevel != null && row.floorLevel >= 1 && row.floorLevel <= 9
        ? { kind: 'UG', level: row.floorLevel }
        : undefined;
    case 'STAFFEL':
      return { kind: 'STAFFEL', qualifier: row.floorQualifier ?? undefined };
    default:
      return undefined;
  }
}

function mapUnit(row: UnitRow): Unit {
  const floor = buildFloor(row);
  const base = {
    id: row.id,
    buildingId: row.buildingId,
    number: row.number,
    meaShare: Number(row.meaShare.toString()),
    floor,
    entranceLabel: row.entranceLabel ?? undefined,
    entranceNote: row.entranceNote ?? undefined,
    yearBuilt: row.yearBuilt ?? undefined,
    description: row.description ?? undefined,
  } as const;

  const sizeSqm = decimal(row.sizeSqm) ?? 0;

  switch (row.type) {
    case 'APARTMENT':
      return {
        ...base,
        type: 'APARTMENT',
        sizeSqm,
        areaMetric: 'WOHN',
        rooms: row.rooms ?? 0,
        subCategory: row.subCategory ?? undefined,
      };
    case 'OFFICE':
      return {
        ...base,
        type: 'OFFICE',
        sizeSqm,
        areaMetric: 'NUTZ',
        layoutNote: row.subCategory ?? undefined,
      };
    case 'PARKING':
      return {
        ...base,
        type: 'PARKING',
        sizeSqm,
        areaMetric: 'NUTZ',
        parkingCode: row.subCategory ?? undefined,
      };
    case 'GARDEN':
      return {
        ...base,
        type: 'GARDEN',
        sizeSqm,
        areaMetric: 'GROUND',
      };
    default: {
      const exhaustive: never = row.type;
      throw new Error(`Unknown unit type: ${String(exhaustive)}`);
    }
  }
}

function mapContact(c: ContactRow): Contact {
  return {
    id: c.id,
    tenantId: c.tenantId,
    name: c.name,
    role: c.role,
    street: c.street ?? undefined,
    houseNumber: c.houseNumber ?? undefined,
    postalCode: c.postalCode ?? undefined,
    city: c.city ?? undefined,
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
  };
}

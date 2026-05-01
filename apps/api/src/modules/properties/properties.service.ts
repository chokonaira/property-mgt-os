import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Building,
  Contact,
  CreatePropertyRequest,
  CreateUnitWithBuildingIndex,
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

  /**
   * Atomic create: property + N buildings + M units in a single
   * Prisma `$transaction`. Either everything persists or nothing
   * does. Tenant scoping is enforced server-side; clients never
   * supply `tenantId`.
   *
   * The wizard sends each unit with a `buildingIndex` (its position
   * in the buildings array). We create the buildings first, capture
   * the assigned id at each index, then resolve `buildingIndex` →
   * `buildingId` when inserting units. The Zod superRefine has
   * already verified the index is in-range.
   *
   * `uniqueNumber` collisions are not pre-checked: that race would
   * still let two concurrent requests pass and then collide at
   * insert. Instead, the DB unique constraint trips P2002, which
   * the PrismaExceptionFilter maps to a 409 envelope with a
   * `path: 'uniqueNumber'` detail the form can pin to its input.
   */
  async create(tenantId: string, dto: CreatePropertyRequest): Promise<PropertyDetail> {
    return this.prisma.$transaction(async (tx) => {
      const property = await tx.property.create({
        data: {
          tenantId,
          managementType: dto.property.managementType,
          name: dto.property.name,
          uniqueNumber: dto.property.uniqueNumber,
          totalMea: dto.property.totalMea ?? null,
          notarialRollNo: dto.property.notarialRollNo ?? null,
          notarizedAt: dto.property.notarizedAt ?? null,
          declarationFileId: dto.property.declarationFileId ?? null,
          grundbuchOffice: dto.property.grundbuchOffice ?? null,
          grundbuchSheet: dto.property.grundbuchSheet ?? null,
          gemarkung: dto.property.gemarkung ?? null,
          flur: dto.property.flur ?? null,
          flurstueck: dto.property.flurstueck ?? null,
          totalAreaSqm: dto.property.totalAreaSqm ?? null,
          propertyManagerId: dto.property.propertyManagerId ?? null,
          accountantId: dto.property.accountantId ?? null,
        },
      });

      const buildingIds: string[] = [];
      for (const building of dto.buildings) {
        const created = await tx.building.create({
          data: {
            propertyId: property.id,
            street: building.street,
            houseNumber: building.houseNumber,
            postalCode: building.postalCode ?? null,
            city: building.city ?? null,
            country: building.country,
            label: building.label ?? null,
            nickname: building.nickname ?? null,
            yearBuilt: building.yearBuilt ?? null,
            floorsCount: building.floorsCount ?? null,
            hasElevator: building.hasElevator ?? null,
            energyStandard: building.energyStandard ?? null,
            heating: building.heating ?? null,
            buildingType: building.buildingType ?? null,
          },
        });
        buildingIds.push(created.id);
      }

      // Inserting units one-by-one inside the transaction keeps the
      // invariant that a single failure rolls everything back. With
      // ~14 units in the seed, throughput is fine; for >100-unit
      // imports we would batch via createMany when AI extraction
      // lands.
      for (const unit of dto.units) {
        const buildingId = buildingIds[unit.buildingIndex];
        if (!buildingId) {
          // The Zod superRefine already guards this, but a defensive
          // throw inside the transaction keeps the error surface
          // honest if anyone bypasses the pipe.
          throw new AppException(
            'VALIDATION_FAILED',
            `Unit references buildingIndex ${unit.buildingIndex}, which is out of range.`,
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        await tx.unit.create({
          data: { buildingId, ...unitToData(unit) },
        });
      }

      const detail = await tx.property.findUnique({
        where: { id: property.id },
        include: {
          propertyManager: true,
          accountant: true,
          buildings: { include: { units: true } },
        },
      });
      if (!detail) {
        // Unreachable inside the transaction, but Prisma's findUnique
        // type insists on null possibility.
        throw new AppException(
          'INTERNAL',
          'Failed to read back the created property.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      return mapPropertyDetail(detail);
    });
  }
}

function unitToData(
  unit: CreateUnitWithBuildingIndex,
): Omit<Prisma.UnitUncheckedCreateInput, 'buildingId'> {
  const floor = unit.floor;
  // Discriminated-union flatten: every variant collapses to the same
  // (floorKind / floorLevel / floorQualifier) trio the row stores.
  const floorKind = floor?.kind ?? null;
  const floorLevel = floor?.kind === 'OG' || floor?.kind === 'UG' ? floor.level : null;
  const floorQualifier = floor?.kind === 'STAFFEL' ? (floor.qualifier ?? null) : null;
  // The DB has a single `subCategory` column shared across variants.
  // Each wire variant carries its own field name (subCategory /
  // layoutNote / parkingCode); collapse to the column on write.
  let subCategory: string | null = null;
  if (unit.type === 'APARTMENT') subCategory = unit.subCategory ?? null;
  else if (unit.type === 'OFFICE') subCategory = unit.layoutNote ?? null;
  else if (unit.type === 'PARKING') subCategory = unit.parkingCode ?? null;

  return {
    type: unit.type,
    number: unit.number,
    meaShare: new Prisma.Decimal(unit.meaShare),
    sizeSqm: new Prisma.Decimal(unit.sizeSqm),
    rooms: unit.type === 'APARTMENT' ? unit.rooms : null,
    floorKind,
    floorLevel,
    floorQualifier,
    entranceLabel: unit.entranceLabel ?? null,
    yearBuilt: unit.yearBuilt ?? null,
    description: unit.description ?? null,
    subCategory,
  };
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

  // Pass DB nulls through as undefined — fabricating defaults (sizeSqm=0
  // or rooms=0) would launder bad data into a Zod-valid response and
  // hide it from the dashboard. The wire UnitSchema explicitly allows
  // undefined here; CreateUnitSchema still requires both at write time.
  const sizeSqm = decimal(row.sizeSqm);

  switch (row.type) {
    case 'APARTMENT':
      return {
        ...base,
        type: 'APARTMENT',
        sizeSqm,
        areaMetric: 'WOHN',
        rooms: row.rooms ?? undefined,
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

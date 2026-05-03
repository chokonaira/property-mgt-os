import { promises as fs } from 'node:fs';
import path from 'node:path';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
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
  UpdateProperty,
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

interface PropertiesServiceConfig {
  /** Resolved upload directory; deleted-property storage cleanup writes here. */
  uploadDir: string;
}

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PropertiesServiceConfig = { uploadDir: './uploads' },
  ) {}

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
      // Tenant-scoped foreign-key check. The wire schema only proves the
      // ids are well-formed strings; the only authoritative check is
      // "does this id belong to MY tenant?". Without this gate a crafted
      // request could attach another tenant's contact and read it back
      // through the response. Failing surfaces as a 422 with a path-
      // pointed detail so the form pins the wrong-tenant id back to its
      // combobox without leaking whether the id exists elsewhere.
      await assertTenantOwnsContacts(tx, tenantId, [
        { path: 'property.propertyManagerId', id: dto.property.propertyManagerId },
        { path: 'property.accountantId', id: dto.property.accountantId },
      ]);

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

  /**
   * Partial property update — accepts any subset of the create-time
   * fields and persists only what was supplied. Tenant scope is
   * enforced by a pre-flight findFirst against `(id, tenantId)`; the
   * subsequent `update({ where: { id } })` is safe because we proved
   * ownership server-side. Contact-id refs (propertyManager /
   * accountant) re-run the same tenant ownership check the create
   * path uses.
   *
   * Audit history (Property updated, with field-level diff) is
   * written automatically by the Prisma audit middleware — no
   * explicit emit here, which keeps "what gets logged" co-located
   * with "what gets written."
   *
   * `uniqueNumber` collisions surface as P2002 → 409 via the
   * PrismaExceptionFilter, mirroring the create flow's behavior so
   * the form pins the same inline error.
   */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateProperty,
  ): Promise<PropertyDetail> {
    const existing = await this.prisma.property.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new AppException('NOT_FOUND', `Property ${id} not found.`, HttpStatus.NOT_FOUND);
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.propertyManagerId !== undefined || dto.accountantId !== undefined) {
        await assertTenantOwnsContacts(tx, tenantId, [
          { path: 'propertyManagerId', id: dto.propertyManagerId },
          { path: 'accountantId', id: dto.accountantId },
        ]);
      }

      // Build the patch set explicitly so we never pass an undefined
      // through to Prisma (which Prisma treats as "no change", but
      // mixing it with other fields invites accidental nulls). Each
      // optional column collapses null when the caller sent the
      // empty string equivalent on the wire so downstream reads
      // don't have to special-case "blanked-out by edit."
      const data: Prisma.PropertyUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.uniqueNumber !== undefined) data.uniqueNumber = dto.uniqueNumber;
      if (dto.managementType !== undefined) data.managementType = dto.managementType;
      if (dto.totalMea !== undefined) data.totalMea = dto.totalMea ?? null;
      if (dto.notarialRollNo !== undefined) data.notarialRollNo = dto.notarialRollNo ?? null;
      if (dto.notarizedAt !== undefined) data.notarizedAt = dto.notarizedAt ?? null;
      if (dto.declarationFileId !== undefined) {
        data.declarationFile = dto.declarationFileId
          ? { connect: { id: dto.declarationFileId } }
          : { disconnect: true };
      }
      if (dto.grundbuchOffice !== undefined) data.grundbuchOffice = dto.grundbuchOffice ?? null;
      if (dto.grundbuchSheet !== undefined) data.grundbuchSheet = dto.grundbuchSheet ?? null;
      if (dto.gemarkung !== undefined) data.gemarkung = dto.gemarkung ?? null;
      if (dto.flur !== undefined) data.flur = dto.flur ?? null;
      if (dto.flurstueck !== undefined) data.flurstueck = dto.flurstueck ?? null;
      if (dto.totalAreaSqm !== undefined) data.totalAreaSqm = dto.totalAreaSqm ?? null;
      if (dto.propertyManagerId !== undefined) {
        data.propertyManager = dto.propertyManagerId
          ? { connect: { id: dto.propertyManagerId } }
          : { disconnect: true };
      }
      if (dto.accountantId !== undefined) {
        data.accountant = dto.accountantId
          ? { connect: { id: dto.accountantId } }
          : { disconnect: true };
      }

      // Skip the round-trip when the caller sent an empty body — no
      // audit row, no row mutation, just return the unchanged record.
      if (Object.keys(data).length > 0) {
        await tx.property.update({ where: { id }, data });
      }
    });

    return this.getById(tenantId, id);
  }

  /**
   * Atomic delete with cascade. Schema-level `onDelete: Cascade` handles
   * Building → Property and Unit → Building, but the Document attached
   * via `declarationFileId` is referenced from Property and survives a
   * naive Property delete (orphan row + orphan PDF on disk + orphan
   * ExtractionRun rows pointing at the document). This service deletes
   * the Property row first (DB cascade collects its buildings + units),
   * then the document's extraction-run history, then the document row,
   * inside one transaction. Storage cleanup runs best-effort after
   * commit so a transient FS error doesn't undo the DB delete.
   */
  async delete(tenantId: string, id: string): Promise<void> {
    const property = await this.prisma.property.findFirst({
      where: { id, tenantId },
      select: { id: true, declarationFileId: true },
    });
    if (!property) {
      throw new AppException('NOT_FOUND', `Property ${id} not found.`, HttpStatus.NOT_FOUND);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.property.delete({ where: { id: property.id } });
      if (property.declarationFileId) {
        await tx.extractionRun.deleteMany({
          where: { documentId: property.declarationFileId },
        });
        await tx.document.delete({ where: { id: property.declarationFileId } });
      }
    });

    if (property.declarationFileId) {
      const storageKey = path.join(tenantId, `${property.declarationFileId}.pdf`);
      const absolutePath = path.join(this.config.uploadDir, storageKey);
      fs.unlink(absolutePath).catch((err: unknown) => {
        // The DB row is gone; storage residue is best-effort. Log so
        // operators can sweep stale files later but never rollback.
        this.logger.warn(
          { storageKey, err: err instanceof Error ? err.message : String(err) },
          'properties.delete_storage_unlink_failed',
        );
      });
    }
  }
}

interface TenantContactRef {
  path: string;
  id: string | undefined;
}

async function assertTenantOwnsContacts(
  tx: Prisma.TransactionClient,
  tenantId: string,
  refs: TenantContactRef[],
): Promise<void> {
  const present = refs.filter((r): r is { path: string; id: string } => Boolean(r.id));
  if (present.length === 0) return;
  const ids = present.map((r) => r.id);
  const owned = await tx.contact.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((row) => row.id));
  const offending = present.filter((r) => !ownedSet.has(r.id));
  if (offending.length === 0) return;
  throw new AppException(
    'VALIDATION_FAILED',
    'One or more contact references are not in this tenant.',
    HttpStatus.UNPROCESSABLE_ENTITY,
    offending.map((r) => ({
      path: r.path,
      message: 'Contact does not exist or belongs to another tenant.',
      code: 'invalid_reference',
    })),
  );
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

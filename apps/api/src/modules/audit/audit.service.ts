import { Injectable } from '@nestjs/common';
import type { AuditEntity, AuditFieldChange, AuditLogEntry, AuditLogListResponse } from '@buena/shared';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { PrismaService } from '../../shared/prisma.service';

interface AuditQuery {
  take: number;
  skip: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns every audit entry that touches `propertyId` — the property
   * itself OR any of its child buildings / units. Newest first, paged.
   * `changedFields` is computed server-side so the UI renders a sleek
   * "field: old → new" timeline without re-parsing JSON snapshots.
   *
   * Cross-entity scope: a property's history is the property's own
   * edits PLUS the buildings under it PLUS the units under those
   * buildings. The query stays one Prisma round-trip via OR over the
   * id sets we already have.
   */
  async listForProperty(
    tenantId: string,
    propertyId: string,
    query: AuditQuery,
  ): Promise<AuditLogListResponse> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, tenantId },
      select: {
        id: true,
        buildings: {
          select: {
            id: true,
            units: { select: { id: true } },
          },
        },
      },
    });
    if (!property) return { items: [], total: 0, take: query.take, skip: query.skip };

    const buildingIds = property.buildings.map((b) => b.id);
    const unitIds = property.buildings.flatMap((b) => b.units.map((u) => u.id));

    const where = {
      tenantId,
      OR: [
        { entity: 'Property', entityId: propertyId },
        ...(buildingIds.length > 0 ? [{ entity: 'Building', entityId: { in: buildingIds } }] : []),
        ...(unitIds.length > 0 ? [{ entity: 'Unit', entityId: { in: unitIds } }] : []),
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.take,
        skip: query.skip,
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((row) => ({
        id: row.id,
        entity: row.entity as AuditEntity,
        entityId: row.entityId,
        action: row.action as AuditLogEntry['action'],
        actor: row.actor,
        createdAt: row.createdAt.toISOString(),
        changedFields: diffFields(row.entity, row.before, row.after),
        before: row.before as AuditLogEntry['before'],
        after: row.after as AuditLogEntry['after'],
      })),
      total,
      take: query.take,
      skip: query.skip,
    };
  }
}

/**
 * Computes per-field changes between before / after snapshots.
 * Whitelisted to user-visible fields so the timeline doesn't show
 * `updatedAt` flips on every save.
 */
const VISIBLE_FIELDS_BY_ENTITY: Record<string, ReadonlyArray<string>> = {
  Property: [
    'name',
    'uniqueNumber',
    'managementType',
    'totalMea',
    'notarialRollNo',
    'notarizedAt',
    'grundbuchOffice',
    'grundbuchSheet',
    'gemarkung',
    'flur',
    'flurstueck',
    'totalAreaSqm',
    'propertyManagerId',
    'accountantId',
  ],
  Building: [
    'street',
    'houseNumber',
    'postalCode',
    'city',
    'label',
    'nickname',
    'yearBuilt',
    'floorsCount',
    'hasElevator',
    'energyStandard',
    'heating',
    'buildingType',
  ],
  Unit: [
    'number',
    'type',
    'floorKind',
    'floorLevel',
    'floorQualifier',
    'entranceLabel',
    'sizeSqm',
    'meaShare',
    'rooms',
    'yearBuilt',
    'subCategory',
    'description',
  ],
  Contact: ['name', 'role', 'street', 'houseNumber', 'postalCode', 'city', 'email', 'phone'],
};

export function diffFields(
  entity: string,
  before: unknown,
  after: unknown,
): AuditFieldChange[] {
  // Create / delete don't carry a diff — the whole snapshot IS the
  // change. Skip and let the UI render a "Created" / "Deleted" pill.
  if (before === null || after === null) return [];
  if (typeof before !== 'object' || typeof after !== 'object') return [];

  const beforeObj = before as Record<string, unknown>;
  const afterObj = after as Record<string, unknown>;
  const fields = VISIBLE_FIELDS_BY_ENTITY[entity] ?? Object.keys(afterObj);

  const out: AuditFieldChange[] = [];
  for (const field of fields) {
    const a = beforeObj[field];
    const b = afterObj[field];
    if (!shallowEqual(a, b)) {
      out.push({ field, before: a, after: b });
    }
  }
  return out;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined && b === undefined) return true;
  // Decimal values come back as objects with a toString — compare
  // their string forms so 100 vs Decimal(100) doesn't read as a change.
  return String(a) === String(b);
}

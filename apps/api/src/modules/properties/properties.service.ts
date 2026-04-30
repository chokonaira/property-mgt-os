import { Injectable } from '@nestjs/common';
import type { PropertyListItem, PropertyListQuery, PropertyListResponse } from '@buena/shared';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { PrismaService } from '../../shared/prisma.service';

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
}

import { Injectable } from '@nestjs/common';
import {
  CONTACT_ROLE_LABELS,
  type Contact,
  type ContactListQuery,
  type ContactListResponse,
  type CreateContactRequest,
} from '@buena/shared';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { PrismaService } from '../../shared/prisma.service';

interface ContactRow {
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

function toWire(c: ContactRow): Contact {
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

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ContactListQuery): Promise<ContactListResponse> {
    const labels = CONTACT_ROLE_LABELS[query.role];
    const rows = await this.prisma.contact.findMany({
      where: { tenantId, role: { in: labels } },
      orderBy: { name: 'asc' },
    });
    return { items: rows.map(toWire) };
  }

  async create(tenantId: string, dto: CreateContactRequest): Promise<Contact> {
    const labels = CONTACT_ROLE_LABELS[dto.role];
    const canonicalRole = labels[0];
    if (!canonicalRole) {
      throw new Error(`No canonical role label for ${dto.role}`);
    }
    const row = await this.prisma.contact.create({
      data: {
        tenantId,
        role: canonicalRole,
        name: dto.name,
        street: dto.street ?? null,
        houseNumber: dto.houseNumber ?? null,
        postalCode: dto.postalCode ?? null,
        city: dto.city ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
      },
    });
    return toWire(row);
  }
}

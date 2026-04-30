import { Injectable } from '@nestjs/common';
import {
  CONTACT_ROLE_LABELS,
  type Contact,
  type ContactListQuery,
  type ContactListResponse,
} from '@buena/shared';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { PrismaService } from '../../shared/prisma.service';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ContactListQuery): Promise<ContactListResponse> {
    const labels = CONTACT_ROLE_LABELS[query.role];
    const rows = await this.prisma.contact.findMany({
      where: { tenantId, role: { in: labels } },
      orderBy: { name: 'asc' },
    });
    const items: Contact[] = rows.map((c) => ({
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
    }));
    return { items };
  }
}

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  type Contact,
  ContactListQuerySchema,
  type ContactListQuery,
  type ContactListResponse,
  CreateContactRequestSchema,
  type CreateContactRequest,
} from '@buena/shared';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { ContactsService } from './contacts.service';

const TENANT_ID = process.env.TENANT_DEFAULT_ID ?? 'demo';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ContactListQuerySchema)) query: ContactListQuery,
  ): Promise<ContactListResponse> {
    return this.contacts.list(TENANT_ID, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(CreateContactRequestSchema)) body: CreateContactRequest,
  ): Promise<Contact> {
    return this.contacts.create(TENANT_ID, body);
  }
}

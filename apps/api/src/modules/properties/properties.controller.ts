import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { IdempotencyInterceptor } from '../../shared/idempotency.interceptor';
import {
  CreatePropertyRequestSchema,
  PropertyListQuerySchema,
  ReplaceUnitsRequestSchema,
  UpdatePropertySchema,
  type CreatePropertyRequest,
  type PropertyDetail,
  type PropertyListQuery,
  type PropertyListResponse,
  type ReplaceUnitsRequest,
  type UpdateProperty,
} from '@buena/shared';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { PropertiesService } from './properties.service';

const TENANT_ID = process.env.TENANT_DEFAULT_ID ?? 'demo';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(PropertyListQuerySchema)) query: PropertyListQuery,
  ): Promise<PropertyListResponse> {
    return this.properties.list(TENANT_ID, query);
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<PropertyDetail> {
    return this.properties.getById(TENANT_ID, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  // Idempotency interceptor lets a client send `X-Idempotency-Key`
  // and have a duplicate POST replay the original response instead
  // of creating a second property. Defends against double-clicked
  // Save buttons + retried network errors.
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @Body(new ZodValidationPipe(CreatePropertyRequestSchema)) body: CreatePropertyRequest,
  ): Promise<PropertyDetail> {
    return this.properties.create(TENANT_ID, body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePropertySchema)) body: UpdateProperty,
  ): Promise<PropertyDetail> {
    return this.properties.update(TENANT_ID, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.properties.delete(TENANT_ID, id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@Param('id') id: string): Promise<PropertyDetail> {
    return this.properties.restore(TENANT_ID, id);
  }

  @Put(':id/units')
  // Bulk-replace endpoint for the units edit flow. The body is the
  // full units array as the user wants them post-save; the service
  // diffs against existing rows and emits insert/update/delete via
  // the audit middleware automatically.
  replaceUnits(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReplaceUnitsRequestSchema)) body: ReplaceUnitsRequest,
  ): Promise<PropertyDetail> {
    return this.properties.replaceUnits(TENANT_ID, id, body.units);
  }
}

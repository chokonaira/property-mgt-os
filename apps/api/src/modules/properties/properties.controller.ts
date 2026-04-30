import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  PropertyListQuerySchema,
  type PropertyDetail,
  type PropertyListQuery,
  type PropertyListResponse,
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
}

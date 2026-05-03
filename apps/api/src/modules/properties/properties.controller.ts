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
  Query,
} from '@nestjs/common';
import {
  CreatePropertyRequestSchema,
  PropertyListQuerySchema,
  UpdatePropertySchema,
  type CreatePropertyRequest,
  type PropertyDetail,
  type PropertyListQuery,
  type PropertyListResponse,
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
}

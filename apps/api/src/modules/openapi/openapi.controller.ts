import { Controller, Get, Header } from '@nestjs/common';
import { buildOpenApiDocument } from './openapi.builder';

@Controller()
export class OpenApiController {
  @Get('/openapi.json')
  @Header('content-type', 'application/json; charset=utf-8')
  @Header('cache-control', 'public, max-age=60')
  spec(): unknown {
    return buildOpenApiDocument();
  }
}

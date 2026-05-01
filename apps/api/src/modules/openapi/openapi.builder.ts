import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  ApiErrorEnvelopeSchema,
  ContactListQuerySchema,
  ContactListResponseSchema,
  ContactSchema,
  CreateContactRequestSchema,
  PropertyDetailSchema,
  PropertyListQuerySchema,
  PropertyListResponseSchema,
} from '@buena/shared';

extendZodWithOpenApi(z);

// Centralised registry for the public API. Each schema is registered with
// a stable component name so the generator can reference it from path
// definitions and clients can map types one-to-one. This file lives in
// apps/api on purpose — packages/shared stays free of the openapi dep.
export function buildOpenApiDocument(): ReturnType<OpenApiGeneratorV31['generateDocument']> {
  const registry = new OpenAPIRegistry();

  // Components
  registry.register('ApiErrorEnvelope', ApiErrorEnvelopeSchema);
  registry.register('Contact', ContactSchema);
  registry.register('ContactList', ContactListResponseSchema);
  registry.register('CreateContactRequest', CreateContactRequestSchema);
  registry.register('PropertyList', PropertyListResponseSchema);
  registry.register('PropertyDetail', PropertyDetailSchema);

  // Routes
  registry.registerPath({
    method: 'get',
    path: '/healthz',
    summary: 'Liveness probe',
    description: 'Returns a static `{ status: "ok" }` envelope.',
    responses: {
      200: {
        description: 'Service is alive.',
        content: {
          'application/json': {
            schema: z.object({ status: z.literal('ok') }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/properties',
    summary: 'List properties',
    description: 'Paginated list of properties for the calling tenant.',
    request: {
      query: PropertyListQuerySchema,
    },
    responses: {
      200: {
        description: 'Page of properties.',
        content: {
          'application/json': { schema: PropertyListResponseSchema },
        },
      },
      422: errorResponse('Invalid query parameters.'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/properties/{id}',
    summary: 'Get property detail',
    description: 'Full read-only detail including buildings + units + contacts.',
    request: {
      params: z.object({ id: z.string().min(1) }),
    },
    responses: {
      200: {
        description: 'Property detail.',
        content: {
          'application/json': { schema: PropertyDetailSchema },
        },
      },
      404: errorResponse('Property not found.'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/contacts',
    summary: 'List contacts by role category',
    description:
      'Lists contacts filtered by role category. Maps PROPERTY_MANAGER/ACCOUNTANT to canonical German row labels via CONTACT_ROLE_LABELS.',
    request: {
      query: ContactListQuerySchema,
    },
    responses: {
      200: {
        description: 'List of contacts.',
        content: {
          'application/json': { schema: ContactListResponseSchema },
        },
      },
      422: errorResponse('Missing or invalid role.'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/contacts',
    summary: 'Create a contact',
    description:
      'Creates a tenant-scoped contact and substitutes the canonical German role label before persisting.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: CreateContactRequestSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Contact created.',
        content: {
          'application/json': { schema: ContactSchema },
        },
      },
      422: errorResponse('Validation failed.'),
    },
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Buena Property OS API',
      version: '0.1.0',
      description:
        'Read + write surface for the property dashboard, wizard, and AI extraction. Tenant scoping is implicit (TENANT_DEFAULT_ID resolved server-side).',
    },
    servers: [{ url: 'http://localhost:3001', description: 'Local dev' }],
  });
}

function errorResponse(description: string) {
  return {
    description,
    content: {
      'application/json': { schema: ApiErrorEnvelopeSchema },
    },
  };
}

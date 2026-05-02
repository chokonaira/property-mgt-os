import { describe, expect, it } from 'vitest';
import {
  buildAnthropicResponseSchema,
  buildOpenAiResponseSchema,
} from '../modules/extraction/extraction.module';

describe('buildAnthropicResponseSchema', () => {
  it('emits a top-level object schema (no $ref wrapper)', () => {
    const schema = buildAnthropicResponseSchema();
    expect(schema.type).toBe('object');
    expect(schema).not.toHaveProperty('$ref');
    expect(schema).toHaveProperty('properties');
  });

  it('includes the four core extraction sections in properties', () => {
    const schema = buildAnthropicResponseSchema();
    const properties = schema.properties as Record<string, unknown>;
    for (const key of ['property', 'buildings', 'units', 'contacts']) {
      expect(properties).toHaveProperty(key);
    }
  });
});

describe('buildOpenAiResponseSchema', () => {
  it('returns the named, $ref-wrapped openAi-dialect shape', () => {
    const schema = buildOpenAiResponseSchema();
    expect(schema).toHaveProperty('$ref', '#/definitions/ExtractionResult');
    expect(schema).toHaveProperty('definitions');
    const root = (schema.definitions as Record<string, { type?: unknown }>).ExtractionResult;
    expect(root?.type).toBe('object');
  });
});

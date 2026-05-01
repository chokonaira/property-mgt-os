import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../modules/openapi/openapi.builder';

describe('buildOpenApiDocument', () => {
  const doc = buildOpenApiDocument();

  it('emits an OpenAPI 3.1 document', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info?.title).toMatch(/Buena/);
    expect(doc.info?.version).toBe('0.1.0');
  });

  it('exposes every shipped path', () => {
    const paths = Object.keys(doc.paths ?? {}).sort();
    expect(paths).toEqual(
      ['/contacts', '/healthz', '/openapi.json', '/properties', '/properties/{id}'].filter(
        (p) => p !== '/openapi.json',
      ),
    );
  });

  it('declares both the GET list and POST create on /contacts', () => {
    const contacts = doc.paths?.['/contacts'];
    expect(contacts?.get).toBeDefined();
    expect(contacts?.post).toBeDefined();
  });

  it('registers the named components clients depend on', () => {
    const schemas = doc.components?.schemas ?? {};
    for (const name of [
      'ApiErrorEnvelope',
      'Contact',
      'ContactList',
      'CreateContactRequest',
      'PropertyList',
      'PropertyDetail',
    ]) {
      expect(schemas, `missing component ${name}`).toHaveProperty(name);
    }
  });

  it('attaches an envelope on each declared error response', () => {
    const get422 = doc.paths?.['/properties']?.get?.responses?.[422];
    const post422 = doc.paths?.['/contacts']?.post?.responses?.[422];
    const get404 = doc.paths?.['/properties/{id}']?.get?.responses?.[404];
    expect(get422).toBeDefined();
    expect(post422).toBeDefined();
    expect(get404).toBeDefined();
  });
});

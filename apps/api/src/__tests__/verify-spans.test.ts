import { describe, expect, it } from 'vitest';
import { verifySpans } from '../modules/extraction/lib/verify-spans';

const SOURCE = `
Das gesamte Objekt wird unter dem Namen "Parkview Residences Berlin" geführt;
intern trägt es zur Identifikation die Objektnummer 10-557-PRB.

Das Eigentum am Grundstück wird in 1.000 Miteigentumsanteile (MEA) zerlegt.
`;

describe('verifySpans', () => {
  it('returns empty for an undefined map', () => {
    expect(verifySpans(undefined, SOURCE)).toEqual({ verified: {}, unverified: [] });
  });

  it('verifies spans that appear verbatim', () => {
    const result = verifySpans(
      {
        'property.name': 'Parkview Residences Berlin',
        'property.uniqueNumber': 'Objektnummer 10-557-PRB',
      },
      SOURCE,
    );
    expect(result.verified).toHaveProperty('property.name');
    expect(result.verified).toHaveProperty('property.uniqueNumber');
    expect(result.unverified).toEqual([]);
  });

  it('drops spans that do not appear in the source', () => {
    const result = verifySpans(
      {
        'property.name': 'Parkview Residences Berlin',
        'property.fake': 'this never appears anywhere',
      },
      SOURCE,
    );
    expect(result.verified).toHaveProperty('property.name');
    expect(result.verified).not.toHaveProperty('property.fake');
    expect(result.unverified).toEqual(['property.fake']);
  });

  it('normalises whitespace + soft hyphens before matching', () => {
    const result = verifySpans(
      {
        'property.totalMea': '1.000  Miteigentumsanteile',
      },
      SOURCE,
    );
    expect(result.verified).toHaveProperty('property.totalMea');
  });

  it('rejects empty span values', () => {
    const result = verifySpans({ 'property.name': '   ' }, SOURCE);
    expect(result.unverified).toEqual(['property.name']);
  });

  it('match is case-insensitive', () => {
    const result = verifySpans({ 'property.name': 'parkview residences BERLIN' }, SOURCE);
    expect(result.verified).toHaveProperty('property.name');
  });
});

import { describe, expect, it } from 'vitest';
import { parsePastedRows, shouldHandleAsBulkPaste } from '@/lib/parse-tsv';

describe('parsePastedRows', () => {
  it('returns empty when input is blank', () => {
    const result = parsePastedRows('', { buildingsCount: 1 });
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.headerSkipped).toBe(false);
  });

  it('parses TSV rows into wizard unit drafts', () => {
    const tsv = '1\tAPARTMENT\t0\t80\t3\t250\n2\tAPARTMENT\t0\t65\t2\t250';
    const result = parsePastedRows(tsv, { buildingsCount: 1 });
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toEqual([]);
    expect(result.headerSkipped).toBe(false);
    expect(result.rows[0]).toMatchObject({
      number: '1',
      type: 'APARTMENT',
      buildingIndex: 0,
      sizeSqm: 80,
      rooms: 3,
      meaShare: 250,
    });
  });

  it('detects and skips a header row when every cell maps to a column', () => {
    const tsv = '#\tType\tBuilding\tSize\tRooms\tMEA\n1\tAPARTMENT\t0\t80\t3\t250';
    const result = parsePastedRows(tsv, { buildingsCount: 1 });
    expect(result.headerSkipped).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ number: '1', type: 'APARTMENT' });
  });

  it('falls back to comma when no tabs are present', () => {
    const csv = '1,APARTMENT,0,80,3,250';
    const result = parsePastedRows(csv, { buildingsCount: 1 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ number: '1', sizeSqm: 80 });
  });

  it('accepts case-insensitive type values', () => {
    const tsv = '1\tapartment\t0\n2\tParking\t0\n3\tGARDEN\t0';
    const result = parsePastedRows(tsv, { buildingsCount: 1 });
    expect(result.rows.map((r) => r.type)).toEqual(['APARTMENT', 'PARKING', 'GARDEN']);
  });

  it('records errors for unknown unit types but keeps the row', () => {
    const tsv = '1\tFlubber\t0';
    const result = parsePastedRows(tsv, { buildingsCount: 1 });
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ field: 'type' });
  });

  it('clamps out-of-range buildingIndex to 0 with an error', () => {
    const tsv = '1\tAPARTMENT\t99';
    const result = parsePastedRows(tsv, { buildingsCount: 2 });
    expect(result.rows[0]?.buildingIndex).toBe(0);
    expect(result.errors[0]).toMatchObject({ field: 'buildingIndex' });
  });

  it('parses German number format (1.234,56) into a finite number', () => {
    const tsv = '1\tAPARTMENT\t0\t1.234,56';
    const result = parsePastedRows(tsv, { buildingsCount: 1 });
    expect(result.rows[0]?.sizeSqm).toBeCloseTo(1234.56, 4);
  });

  it('parses English number format (1,234.56) into a finite number', () => {
    const tsv = '1\tAPARTMENT\t0\t1,234.56';
    const result = parsePastedRows(tsv, { buildingsCount: 1 });
    expect(result.rows[0]?.sizeSqm).toBeCloseTo(1234.56, 4);
  });

  it('rejects non-integer values for integer columns (rooms / yearBuilt)', () => {
    const tsv = '1\tAPARTMENT\t0\t80\t3.5';
    const result = parsePastedRows(tsv, { buildingsCount: 1 });
    expect(result.errors[0]).toMatchObject({ field: 'rooms' });
  });

  it('skips blank cells without producing errors', () => {
    const tsv = '1\tAPARTMENT\t0\t\t3';
    const result = parsePastedRows(tsv, { buildingsCount: 1 });
    expect(result.rows[0]).toMatchObject({ number: '1', rooms: 3 });
    expect(result.rows[0]).not.toHaveProperty('sizeSqm');
    expect(result.errors).toEqual([]);
  });

  it('drops empty lines from the row count', () => {
    const tsv = '1\tAPARTMENT\t0\n\n2\tAPARTMENT\t0';
    const result = parsePastedRows(tsv, { buildingsCount: 1 });
    expect(result.rows).toHaveLength(2);
  });

  it('handles \\r\\n line endings (Windows / Excel)', () => {
    const tsv = '1\tAPARTMENT\t0\r\n2\tAPARTMENT\t0';
    const result = parsePastedRows(tsv, { buildingsCount: 1 });
    expect(result.rows).toHaveLength(2);
  });
});

describe('shouldHandleAsBulkPaste', () => {
  // The unit table's container-level paste handler routes based on
  // this rule. False here = let the focused input handle the paste
  // natively. True = bulk-paste path (event.preventDefault + parse).

  it('returns false on empty / whitespace-only input', () => {
    expect(shouldHandleAsBulkPaste('')).toBe(false);
  });

  it('returns true for multi-line content (Excel rows always have \\n)', () => {
    expect(shouldHandleAsBulkPaste('1\tAPARTMENT\n2\tAPARTMENT')).toBe(true);
    expect(shouldHandleAsBulkPaste('1,APARTMENT\n2,APARTMENT')).toBe(true);
  });

  it('returns true for single-line TSV (tab is unambiguous)', () => {
    expect(shouldHandleAsBulkPaste('1\tAPARTMENT\t0')).toBe(true);
  });

  it('returns false for single-line German numbers ("1.234,56")', () => {
    expect(shouldHandleAsBulkPaste('1.234,56')).toBe(false);
  });

  it('returns false for single-line prose with a comma ("Berlin, 10115")', () => {
    expect(shouldHandleAsBulkPaste('Berlin, 10115')).toBe(false);
    expect(shouldHandleAsBulkPaste('Hi, world')).toBe(false);
  });

  it('returns false for plain single-cell content', () => {
    expect(shouldHandleAsBulkPaste('EG')).toBe(false);
    expect(shouldHandleAsBulkPaste('80')).toBe(false);
    expect(shouldHandleAsBulkPaste('Apartment')).toBe(false);
  });

  it('handles \\r\\n line endings as multi-row', () => {
    expect(shouldHandleAsBulkPaste('1\tAPARTMENT\r\n2\tAPARTMENT')).toBe(true);
  });
});

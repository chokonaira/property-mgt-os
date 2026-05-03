import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAD_WIDTH,
  DEFAULT_PREFIX_BY_TYPE,
  GENERATE_MAX_COUNT,
  findStartAtCollisions,
  formatGeneratedNumber,
  generateUnits,
  nextSequenceForPrefix,
} from '@/lib/generate-units';

describe('generateUnits', () => {
  it('returns empty when count is zero', () => {
    expect(generateUnits({ type: 'APARTMENT', buildingIndex: 0, count: 0 })).toEqual({
      rows: [],
      skipped: 0,
    });
  });

  it('uses zero-padded numbers by default', () => {
    const { rows, skipped } = generateUnits({ type: 'APARTMENT', buildingIndex: 0, count: 3 });
    expect(rows.map((r) => r.number)).toEqual(['01', '02', '03']);
    expect(skipped).toBe(0);
  });

  it('uses TG- prefix for PARKING by default (sample document case)', () => {
    const { rows } = generateUnits({ type: 'PARKING', buildingIndex: 0, count: 5 });
    expect(rows.map((r) => r.number)).toEqual(['TG-01', 'TG-02', 'TG-03', 'TG-04', 'TG-05']);
  });

  it('uses G- prefix for GARDEN, O- for OFFICE', () => {
    const garden = generateUnits({ type: 'GARDEN', buildingIndex: 0, count: 2 });
    const office = generateUnits({ type: 'OFFICE', buildingIndex: 0, count: 2 });
    expect(garden.rows.map((r) => r.number)).toEqual(['G-01', 'G-02']);
    expect(office.rows.map((r) => r.number)).toEqual(['O-01', 'O-02']);
  });

  it('respects an explicit prefix override', () => {
    const { rows } = generateUnits({
      type: 'APARTMENT',
      buildingIndex: 0,
      count: 2,
      prefix: 'WHG-',
    });
    expect(rows.map((r) => r.number)).toEqual(['WHG-01', 'WHG-02']);
  });

  it('starts numbering from startAt and pads to padWidth', () => {
    const { rows } = generateUnits({
      type: 'APARTMENT',
      buildingIndex: 0,
      count: 3,
      startAt: 9,
      padWidth: 3,
    });
    expect(rows.map((r) => r.number)).toEqual(['009', '010', '011']);
  });

  it('writes the buildingIndex on every row', () => {
    const { rows } = generateUnits({ type: 'APARTMENT', buildingIndex: 1, count: 2 });
    expect(rows.every((r) => r.buildingIndex === 1)).toBe(true);
  });

  it('applies template values when provided', () => {
    const { rows } = generateUnits({
      type: 'APARTMENT',
      buildingIndex: 0,
      count: 2,
      template: { sizeSqm: 80, meaShare: 250, rooms: 3 },
    });
    for (const row of rows) {
      expect(row).toMatchObject({ sizeSqm: 80, meaShare: 250, rooms: 3 });
    }
  });

  it('omits template fields when not supplied (schema fails inline at the form layer)', () => {
    const { rows } = generateUnits({ type: 'APARTMENT', buildingIndex: 0, count: 1 });
    expect(rows[0]).not.toHaveProperty('sizeSqm');
    expect(rows[0]).not.toHaveProperty('meaShare');
    expect(rows[0]).not.toHaveProperty('rooms');
  });

  it('drops template.rooms for non-APARTMENT types', () => {
    const { rows } = generateUnits({
      type: 'PARKING',
      buildingIndex: 0,
      count: 1,
      template: { rooms: 99 },
    });
    expect(rows[0]).not.toHaveProperty('rooms');
  });

  it('exports the documented default prefixes', () => {
    expect(DEFAULT_PREFIX_BY_TYPE).toEqual({
      APARTMENT: '',
      OFFICE: 'O-',
      PARKING: 'TG-',
      GARDEN: 'G-',
    });
  });

  it('exports a sane upper bound', () => {
    expect(GENERATE_MAX_COUNT).toBeGreaterThanOrEqual(100);
  });

  // existingNumbers — auto-skip behavior so the form can't queue up
  // rows that would 409 on save. Each test asserts the generator
  // produced count fresh numbers and reports the skip count truthfully.
  describe('existingNumbers (skip-and-advance)', () => {
    it('skips a candidate that already exists in the same building', () => {
      const { rows, skipped } = generateUnits(
        { type: 'APARTMENT', buildingIndex: 0, count: 3, startAt: 1 },
        new Set(['01']),
      );
      expect(rows.map((r) => r.number)).toEqual(['02', '03', '04']);
      expect(skipped).toBe(1);
    });

    it('advances past a contiguous block of existing numbers', () => {
      const { rows, skipped } = generateUnits(
        { type: 'APARTMENT', buildingIndex: 0, count: 3, startAt: 1 },
        new Set(['01', '02', '03']),
      );
      expect(rows.map((r) => r.number)).toEqual(['04', '05', '06']);
      expect(skipped).toBe(3);
    });

    it('skips non-contiguous existing numbers (holes in the sequence)', () => {
      const { rows, skipped } = generateUnits(
        { type: 'APARTMENT', buildingIndex: 0, count: 3, startAt: 1 },
        new Set(['02', '04']),
      );
      expect(rows.map((r) => r.number)).toEqual(['01', '03', '05']);
      expect(skipped).toBe(2);
    });

    it('respects the prefix when comparing against existing numbers', () => {
      const { rows, skipped } = generateUnits(
        { type: 'PARKING', buildingIndex: 0, count: 2, startAt: 1 },
        new Set(['TG-01']),
      );
      expect(rows.map((r) => r.number)).toEqual(['TG-02', 'TG-03']);
      expect(skipped).toBe(1);
    });

    it('returns skipped=0 when no candidates collide', () => {
      const { rows, skipped } = generateUnits(
        { type: 'APARTMENT', buildingIndex: 0, count: 2, startAt: 5 },
        new Set(['01', '02']),
      );
      expect(rows.map((r) => r.number)).toEqual(['05', '06']);
      expect(skipped).toBe(0);
    });

    it('still produces count fresh rows when existingNumbers covers the entire start range', () => {
      const { rows, skipped } = generateUnits(
        { type: 'APARTMENT', buildingIndex: 0, count: 5, startAt: 1 },
        new Set(['01', '02', '03', '04', '05']),
      );
      expect(rows).toHaveLength(5);
      expect(rows.map((r) => r.number)).toEqual(['06', '07', '08', '09', '10']);
      expect(skipped).toBe(5);
    });
  });
});

// nextSequenceForPrefix — seeds the dialog's startAt input so the
// preview text matches reality. The user-visible promise: clicking
// Generate twice in a row, with no edits to startAt, must produce
// contiguous, non-colliding rows on every click.
describe('nextSequenceForPrefix', () => {
  it('returns 1 for an empty / undefined existingNumbers set', () => {
    expect(nextSequenceForPrefix(undefined, '')).toBe(1);
    expect(nextSequenceForPrefix(new Set<string>(), '')).toBe(1);
    expect(nextSequenceForPrefix(new Set<string>(), 'TG-')).toBe(1);
  });

  it('returns max + 1 over zero-padded apartment numbers', () => {
    expect(nextSequenceForPrefix(new Set(['01', '02', '03']), '')).toBe(4);
  });

  it('treats padded and unpadded numbers as the same sequence', () => {
    // "1" and "01" both parse to 1 — the user-visible numeric
    // identity is what counts; padding is presentation.
    expect(nextSequenceForPrefix(new Set(['1', '02', '003']), '')).toBe(4);
  });

  it('only counts numbers that match the active prefix', () => {
    // PARKING (TG-NN) and APARTMENT (bare integer) coexist in the
    // same building — a fresh PARKING run shouldn't think "07"
    // counts toward TG- numbering.
    const mixed = new Set(['01', '02', 'TG-05', 'TG-06', 'G-99']);
    expect(nextSequenceForPrefix(mixed, '')).toBe(3);
    expect(nextSequenceForPrefix(mixed, 'TG-')).toBe(7);
    expect(nextSequenceForPrefix(mixed, 'G-')).toBe(100);
  });

  it('ignores entries that do not parse as prefix + digits', () => {
    // Free-text numbers (parking signs like "Hobby" or "1.1")
    // shouldn't poison the next-sequence calc.
    expect(nextSequenceForPrefix(new Set(['01', 'Hobby', '1.1', '02']), '')).toBe(3);
  });

  it('handles whitespace around the stored number', () => {
    expect(nextSequenceForPrefix(new Set(['  05  ', '07']), '')).toBe(8);
  });

  it('handles a prefix containing regex metacharacters safely', () => {
    // A user-supplied custom prefix like "[A]." must be matched
    // literally, not interpreted as a character class. The escape
    // behavior is the production safety net here.
    expect(nextSequenceForPrefix(new Set(['[A].01', '[A].02']), '[A].')).toBe(3);
  });

  it('returns 1 when no entry matches the prefix', () => {
    expect(nextSequenceForPrefix(new Set(['01', '02']), 'TG-')).toBe(1);
  });

  it('scales to large existing sets without mis-counting (60 + 100 row case)', () => {
    // The brief: a user with 60 existing apartments hits Generate
    // for 100 more and should land at 61..160 — not 1..100 (which
    // would collide), and not skip-and-advance into the void.
    const sixty = new Set<string>();
    for (let i = 1; i <= 60; i += 1) sixty.add(String(i).padStart(2, '0'));
    expect(nextSequenceForPrefix(sixty, '')).toBe(61);

    const hundred = new Set<string>();
    for (let i = 1; i <= 100; i += 1) hundred.add(String(i).padStart(2, '0'));
    expect(nextSequenceForPrefix(hundred, '')).toBe(101);
  });

  it('agrees with the generator: starting at next-sequence produces no skips', () => {
    // Round-trip: existing 01..05 → next is 6 → generating 5 from 6
    // hits no collisions, so skipped === 0. This is the contract that
    // makes the dialog's preview honest.
    const existing = new Set(['01', '02', '03', '04', '05']);
    const start = nextSequenceForPrefix(existing, '');
    const { rows, skipped } = generateUnits(
      { type: 'APARTMENT', buildingIndex: 0, count: 5, startAt: start },
      existing,
    );
    expect(rows.map((r) => r.number)).toEqual(['06', '07', '08', '09', '10']);
    expect(skipped).toBe(0);
  });

  it('agrees with the generator at scale: 60 existing → bulk 100 lands cleanly', () => {
    const existing = new Set<string>();
    for (let i = 1; i <= 60; i += 1) existing.add(String(i).padStart(2, '0'));
    const start = nextSequenceForPrefix(existing, '');
    const { rows, skipped } = generateUnits(
      { type: 'APARTMENT', buildingIndex: 0, count: 100, startAt: start },
      existing,
    );
    expect(rows).toHaveLength(100);
    expect(rows[0]?.number).toBe('61');
    expect(rows[rows.length - 1]?.number).toBe('160');
    expect(skipped).toBe(0);
  });
});

// findStartAtCollisions — feeds the dialog's "Start at" inline
// validation. Generate is disabled when this returns a non-empty
// list so a user can never queue up rows that would collide on save.
describe('findStartAtCollisions', () => {
  it('returns [] when count is zero', () => {
    expect(findStartAtCollisions(new Set(['01']), 1, 0, '')).toEqual([]);
  });

  it('returns [] when there are no existing numbers', () => {
    expect(findStartAtCollisions(undefined, 1, 5, '')).toEqual([]);
    expect(findStartAtCollisions(new Set(), 1, 5, '')).toEqual([]);
  });

  it('returns the formatted numbers that collide', () => {
    expect(findStartAtCollisions(new Set(['02', '03']), 1, 5, '')).toEqual(['02', '03']);
  });

  it('reports the entire overlap, not just the first hit', () => {
    expect(
      findStartAtCollisions(new Set(['03', '04', '05']), 1, 10, ''),
    ).toEqual(['03', '04', '05']);
  });

  it('respects the prefix when matching against existing numbers', () => {
    // "03" exists as APARTMENT, but the user is generating PARKING
    // (TG-NN). No collision, even though the integer overlaps.
    expect(findStartAtCollisions(new Set(['03']), 1, 5, 'TG-')).toEqual([]);
    expect(
      findStartAtCollisions(new Set(['TG-03']), 1, 5, 'TG-'),
    ).toEqual(['TG-03']);
  });

  it('respects an explicit pad width', () => {
    expect(findStartAtCollisions(new Set(['001']), 1, 3, '', 3)).toEqual(['001']);
  });

  it('returns [] when the start is comfortably past the existing block', () => {
    expect(findStartAtCollisions(new Set(['01', '02', '03']), 4, 3, '')).toEqual([]);
  });
});

describe('formatGeneratedNumber', () => {
  // Single source of truth for the dialog preview + the generator
  // output. If these ever diverge, both consumers break together
  // (which is what we want — fail loudly, not silently).

  it('zero-pads the sequence to padWidth', () => {
    expect(formatGeneratedNumber('', 1, 2)).toBe('01');
    expect(formatGeneratedNumber('', 9, 2)).toBe('09');
  });

  it('overflows pad width naturally', () => {
    expect(formatGeneratedNumber('TG-', 99, 2)).toBe('TG-99');
    expect(formatGeneratedNumber('TG-', 100, 2)).toBe('TG-100');
  });

  it('respects padWidth = 3', () => {
    expect(formatGeneratedNumber('WHG-', 1, 3)).toBe('WHG-001');
    expect(formatGeneratedNumber('WHG-', 99, 3)).toBe('WHG-099');
  });

  it('exports the documented default padWidth', () => {
    expect(DEFAULT_PAD_WIDTH).toBe(2);
  });

  it('agrees with the generator for the same input', () => {
    const { rows } = generateUnits({ type: 'PARKING', buildingIndex: 0, count: 5 });
    const previewLast = formatGeneratedNumber(
      DEFAULT_PREFIX_BY_TYPE.PARKING,
      5,
      DEFAULT_PAD_WIDTH,
    );
    expect(rows[rows.length - 1]?.number).toBe(previewLast);
  });
});

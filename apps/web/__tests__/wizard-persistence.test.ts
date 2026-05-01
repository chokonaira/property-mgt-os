import { describe, expect, it } from 'vitest';
import { WIZARD_DRAFT_VERSION, parseStoredDraft, serializeDraft } from '@/lib/wizard-persistence';
import { WIZARD_DRAFT_DEFAULTS } from '@/lib/schemas/wizard-draft';

describe('serializeDraft', () => {
  it('wraps the draft with the current version + savedAt timestamp', () => {
    const raw = serializeDraft(WIZARD_DRAFT_DEFAULTS);
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(WIZARD_DRAFT_VERSION);
    expect(typeof parsed.savedAt).toBe('string');
    expect(() => new Date(parsed.savedAt)).not.toThrow();
    expect(parsed.draft).toEqual(WIZARD_DRAFT_DEFAULTS);
  });
});

describe('parseStoredDraft', () => {
  it('returns null on a null / missing key', () => {
    expect(parseStoredDraft(null)).toBeNull();
    expect(parseStoredDraft('')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseStoredDraft('{not json')).toBeNull();
  });

  it('returns null on a version mismatch', () => {
    const future = JSON.stringify({
      version: WIZARD_DRAFT_VERSION + 99,
      savedAt: new Date().toISOString(),
      draft: WIZARD_DRAFT_DEFAULTS,
    });
    expect(parseStoredDraft(future)).toBeNull();
  });

  it('returns null when the inner draft does not match the schema shape', () => {
    const bad = JSON.stringify({
      version: WIZARD_DRAFT_VERSION,
      savedAt: new Date().toISOString(),
      draft: { something: 'else' },
    });
    expect(parseStoredDraft(bad)).toBeNull();
  });

  it('round-trips a populated draft', () => {
    const populated = {
      general: {
        managementType: 'WEG' as const,
        name: 'Parkview',
        uniqueNumber: 'AB-1',
      },
      buildings: [{ street: 'Musterstr.', houseNumber: '1' }],
      units: [
        {
          type: 'APARTMENT' as const,
          buildingIndex: 0,
          number: '1',
          meaShare: 100,
        },
      ],
    };
    const round = parseStoredDraft(serializeDraft(populated));
    expect(round?.draft).toEqual(populated);
    expect(typeof round?.savedAt).toBe('string');
  });
});

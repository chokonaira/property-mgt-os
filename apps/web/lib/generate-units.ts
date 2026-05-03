import { EMPTY_UNIT, type WizardUnitDraft, type WizardUnitType } from '@/lib/schemas/wizard-draft';

export interface GenerateUnitsConfig {
  type: WizardUnitType;
  buildingIndex: number;
  /** Sequence start (inclusive). Defaults to 1. */
  startAt?: number;
  /** How many rows to generate. Caller validates the upper bound. */
  count: number;
  /** Optional fixed string prefix prepended to every generated number. */
  prefix?: string;
  /** Pad width for the numeric suffix. Defaults to 2 ("01", "02", …). */
  padWidth?: number;
  /** Optional template values applied to every generated row. */
  template?: {
    sizeSqm?: number;
    meaShare?: number;
    rooms?: number;
  };
}

/**
 * Default number prefix per unit type. Matches the conventions in the
 * sample Teilungserklärung — apartments are bare integers, parking
 * spots are `TG-NN`, gardens `G-NN`, offices `O-NN`.
 */
export const DEFAULT_PREFIX_BY_TYPE: Record<WizardUnitType, string> = {
  APARTMENT: '',
  OFFICE: 'O-',
  PARKING: 'TG-',
  GARDEN: 'G-',
};

export const GENERATE_MAX_COUNT = 200;
export const DEFAULT_PAD_WIDTH = 2;

/**
 * Single source of truth for the generated unit number string.
 * The dialog's live preview ("Will create 5 rows numbered TG-01…TG-05")
 * and the generator itself both call this so the preview never
 * diverges from the actual output.
 */
export function formatGeneratedNumber(prefix: string, seq: number, padWidth: number): string {
  return `${prefix}${String(seq).padStart(padWidth, '0')}`;
}

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reports the formatted numbers in [startAt, startAt+count) that
 * collide with `existingNumbers`. Used by the Generate-units dialog
 * to BLOCK a Generate click whose range would land on top of rows
 * the user already has — without this, the generator's skip-and-
 * advance loop would silently shift the produced numbers past the
 * collision and the dialog's preview would lie about the result.
 *
 * Returns an empty array when there's no overlap, and is safe to
 * call with an undefined existing set (e.g. fresh wizard / fresh
 * building) — that path short-circuits to "no collisions".
 */
export function findStartAtCollisions(
  existingNumbers: ReadonlySet<string> | undefined,
  startAt: number,
  count: number,
  prefix: string,
  padWidth: number = DEFAULT_PAD_WIDTH,
): string[] {
  if (count <= 0 || !existingNumbers || existingNumbers.size === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const candidate = formatGeneratedNumber(prefix, startAt + i, padWidth);
    if (existingNumbers.has(candidate)) out.push(candidate);
  }
  return out;
}

/**
 * Computes the next sequence number to seed the dialog's `startAt`
 * input so a user clicking Generate immediately gets fresh numbers
 * past whatever already exists, instead of always starting at 1 and
 * relying on the skip-and-advance loop to dig out from under existing
 * rows.
 *
 * Parses any number in `existingNumbers` that matches the active
 * prefix followed by a numeric tail (e.g. prefix="TG-" matches
 * "TG-01", "TG-9", "TG-100"; pad width is incidental — the parse
 * reads digits, not width). Returns max+1, or 1 when no match exists.
 *
 * Empty / null / non-matching strings are skipped so a building that
 * mixes APARTMENT (bare integers) with PARKING ("TG-NN") rows can ask
 * each prefix independently and get the right next-sequence.
 */
export function nextSequenceForPrefix(
  existingNumbers: ReadonlySet<string> | undefined,
  prefix: string,
): number {
  if (!existingNumbers || existingNumbers.size === 0) return 1;
  const re = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`);
  let max = 0;
  for (const raw of existingNumbers) {
    const match = raw.trim().match(re);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

export interface GenerateUnitsResult {
  /** Unit drafts ready to push into the field array. */
  rows: WizardUnitDraft[];
  /** How many sequence numbers were skipped because they already exist. */
  skipped: number;
}

/**
 * Pure generator. Returns wizard unit drafts ready to push into the
 * field array. When `existingNumbers` is supplied, the generator skips
 * any candidate that already exists in the same building and keeps
 * advancing the sequence until it has produced `count` fresh numbers —
 * so a Generate-5-from-01 against a building that already has 01..03
 * yields 04..08 instead of colliding with the existing rows.
 *
 * Type-specific variant fields (rooms, subCategory, layoutNote,
 * parkingCode) start undefined so the user can fill them in cell-by-
 * cell after generation; APARTMENT.rooms is an exception when supplied
 * via `template.rooms`.
 *
 * Safety bound: caps the seek loop at `count + max(count × 4, 100)` so
 * a pathological existingNumbers set can't pin the generator forever.
 */
export function generateUnits(
  config: GenerateUnitsConfig,
  existingNumbers?: ReadonlySet<string>,
): GenerateUnitsResult {
  if (config.count <= 0) return { rows: [], skipped: 0 };
  const start = config.startAt ?? 1;
  const padWidth = config.padWidth ?? DEFAULT_PAD_WIDTH;
  const prefix = config.prefix ?? DEFAULT_PREFIX_BY_TYPE[config.type];

  const rows: WizardUnitDraft[] = [];
  let seq = start;
  let skipped = 0;
  const maxAttempts = config.count + Math.max(config.count * 4, 100);
  for (let attempts = 0; attempts < maxAttempts && rows.length < config.count; attempts += 1) {
    const number = formatGeneratedNumber(prefix, seq, padWidth);
    seq += 1;
    if (existingNumbers && existingNumbers.has(number)) {
      skipped += 1;
      continue;
    }
    const draft: Record<string, unknown> = {
      ...EMPTY_UNIT,
      type: config.type,
      buildingIndex: config.buildingIndex,
      number,
    };
    if (config.template?.sizeSqm !== undefined) draft.sizeSqm = config.template.sizeSqm;
    if (config.template?.meaShare !== undefined) draft.meaShare = config.template.meaShare;
    if (config.type === 'APARTMENT' && config.template?.rooms !== undefined) {
      draft.rooms = config.template.rooms;
    }
    rows.push(draft as unknown as WizardUnitDraft);
  }
  return { rows, skipped };
}

import {
  EMPTY_UNIT,
  WIZARD_UNIT_TYPES,
  type WizardUnitDraft,
  type WizardUnitType,
} from '@/lib/schemas/wizard-draft';

/**
 * Columns the paste parser knows how to populate, ordered the same way
 * the wizard's TanStack Table renders them so a paste-from-Excel works
 * left-to-right by visual order. Two synonyms permitted on the header
 * row: `building` is accepted as `buildingIndex`, `mea` as `meaShare`.
 */
export const PASTE_COLUMNS = [
  'number',
  'type',
  'buildingIndex',
  'sizeSqm',
  'rooms',
  'meaShare',
  'yearBuilt',
  'description',
] as const;
export type PasteColumn = (typeof PASTE_COLUMNS)[number];

const HEADER_SYNONYMS: Record<string, PasteColumn> = {
  number: 'number',
  '#': 'number',
  type: 'type',
  building: 'buildingIndex',
  buildingindex: 'buildingIndex',
  size: 'sizeSqm',
  sizesqm: 'sizeSqm',
  rooms: 'rooms',
  mea: 'meaShare',
  meashare: 'meaShare',
  year: 'yearBuilt',
  yearbuilt: 'yearBuilt',
  description: 'description',
};

export interface PasteRowError {
  /** 1-based source-row index (row 0 is the optional header). */
  rowIndex: number;
  field: PasteColumn;
  message: string;
}

/**
 * Decision helper for the unit-table's container-level paste handler.
 * Returns `true` only when the clipboard text is unambiguous bulk
 * paste; single-line content with a comma is NOT a bulk-paste signal
 * because German numbers ("1.234,56") and prose ("Berlin, 10115") are
 * common single-cell pastes that must reach the focused input.
 *
 * Pure: no DOM / RHF coupling so the rule can be unit-tested.
 */
export function shouldHandleAsBulkPaste(raw: string): boolean {
  if (!raw) return false;
  const candidate = raw.replace(/\r\n?/g, '\n');
  if (candidate.includes('\n')) return true; // multi-row → unambiguous
  if (candidate.includes('\t')) return true; // single-line TSV → unambiguous
  return false; // single-line + comma is too noisy to claim
}

export interface ParsedPaste {
  /** Strict draft rows ready to push into the field-array. */
  rows: WizardUnitDraft[];
  /** Per-cell parse errors for rows that still made it in (cell stays empty / wrong-typed). */
  errors: PasteRowError[];
  /** True when the first source row was detected as a header and skipped. */
  headerSkipped: boolean;
}

/**
 * Parses TSV / CSV pasted text into wizard unit drafts.
 *
 *   - Splits on \r?\n into rows; empty trailing rows dropped.
 *   - Auto-detects delimiter per row: prefers tab when present,
 *     otherwise comma. Mixed-delimiter pastes are not supported (the
 *     paster is generally one source).
 *   - Detects a header row when every cell maps to a known column
 *     (case-insensitive); otherwise treats every row as data.
 *   - Type field is case-insensitive. Unknown types fall back to
 *     APARTMENT and are reported as a per-cell error.
 *   - Numeric fields tolerate German decimals (`1.234,56` → `1234.56`)
 *     and English (`1,234.56` → `1234.56`).
 *
 * Out-of-range buildingIndex (≥ buildingsCount) gets clamped to 0 with
 * an error so the row still renders and the user can fix the
 * dropdown.
 */
export function parsePastedRows(
  raw: string,
  options: { buildingsCount: number },
): ParsedPaste {
  const errors: PasteRowError[] = [];
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [], headerSkipped: false };
  }

  // Per-row delimiter detection — prefer tab if any row has a tab,
  // otherwise comma. Mixed-source pastes are an edge case we don't
  // optimise for.
  const delimiter = lines.some((line) => line.includes('\t')) ? '\t' : ',';

  const headerCells = splitRow(lines[0] ?? '', delimiter);
  const headerMap = detectHeader(headerCells);
  const headerSkipped = headerMap !== null;
  const columnOrder = headerMap ?? [...PASTE_COLUMNS];
  const dataLines = headerSkipped ? lines.slice(1) : lines;

  const rows: WizardUnitDraft[] = dataLines.map((line, idx) => {
    const cells = splitRow(line, delimiter);
    const sourceRow = idx + (headerSkipped ? 1 : 0);
    const draft = { ...EMPTY_UNIT } as Record<string, unknown>;

    for (let col = 0; col < cells.length && col < columnOrder.length; col += 1) {
      const column = columnOrder[col];
      if (!column) continue;
      const cell = cells[col]?.trim() ?? '';
      if (cell === '') continue;
      try {
        applyCell(draft, column, cell, options.buildingsCount);
      } catch (err) {
        errors.push({
          rowIndex: sourceRow,
          field: column,
          message: err instanceof Error ? err.message : 'Invalid value',
        });
      }
    }

    return draft as unknown as WizardUnitDraft;
  });

  return { rows, errors, headerSkipped };
}

function splitRow(line: string, delimiter: string): string[] {
  // Lightweight CSV — no quoted-field handling. Excel pastes via
  // clipboard generally arrive as TSV without quoting; if a user
  // pastes truly quoted CSV we'd need a real parser, but the AC
  // treats this surface as best-effort.
  return line.split(delimiter);
}

function detectHeader(cells: string[]): PasteColumn[] | null {
  const mapped = cells.map((cell) => HEADER_SYNONYMS[cell.trim().toLowerCase()] ?? null);
  if (mapped.every((column) => column !== null)) return mapped as PasteColumn[];
  return null;
}

function applyCell(
  draft: Record<string, unknown>,
  column: PasteColumn,
  value: string,
  buildingsCount: number,
): void {
  switch (column) {
    case 'number':
      draft.number = value;
      return;
    case 'type': {
      const type = parseType(value);
      if (!type) throw new Error(`Unknown unit type: ${value}`);
      draft.type = type;
      return;
    }
    case 'buildingIndex': {
      const idx = Number(value);
      if (!Number.isInteger(idx) || idx < 0) throw new Error(`Invalid building index: ${value}`);
      if (buildingsCount > 0 && idx >= buildingsCount) {
        draft.buildingIndex = 0;
        throw new Error(`Building index ${idx} out of range; clamped to 0`);
      }
      draft.buildingIndex = idx;
      return;
    }
    case 'sizeSqm':
    case 'meaShare': {
      const n = parseNumber(value);
      if (n === undefined) throw new Error(`Not a number: ${value}`);
      draft[column] = n;
      return;
    }
    case 'rooms':
    case 'yearBuilt': {
      const n = parseNumber(value);
      if (n === undefined || !Number.isInteger(n)) {
        throw new Error(`Not an integer: ${value}`);
      }
      draft[column] = n;
      return;
    }
    case 'description':
      draft.description = value;
      return;
  }
}

function parseType(value: string): WizardUnitType | null {
  const upper = value.trim().toUpperCase();
  return WIZARD_UNIT_TYPES.find((t) => t === upper) ?? null;
}

/**
 * Tolerates both "1.234,56" (de) and "1,234.56" (en).
 *   - If both `.` and `,` present, the LAST one is the decimal
 *     separator; the other one separates thousands.
 *   - If only one is present, treat it as the decimal separator.
 *   - Plain digits parse as-is.
 */
function parseNumber(raw: string): number | undefined {
  const trimmed = raw.replace(/\s/g, '').trim();
  if (trimmed === '') return undefined;
  const lastDot = trimmed.lastIndexOf('.');
  const lastComma = trimmed.lastIndexOf(',');
  let normalised = trimmed;
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      // German: dot = thousands, comma = decimal.
      normalised = trimmed.replace(/\./g, '').replace(',', '.');
    } else {
      // English: comma = thousands, dot = decimal.
      normalised = trimmed.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    normalised = trimmed.replace(',', '.');
  }
  const n = Number(normalised);
  return Number.isFinite(n) ? n : undefined;
}

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

/**
 * Pure generator. Returns an array of wizard unit drafts ready to push
 * into the field array. Type-specific variant fields (rooms,
 * subCategory, layoutNote, parkingCode) start undefined so the user
 * can fill them in cell-by-cell after generation; APARTMENT.rooms is
 * an exception when supplied via `template.rooms`.
 */
export function generateUnits(config: GenerateUnitsConfig): WizardUnitDraft[] {
  if (config.count <= 0) return [];
  const start = config.startAt ?? 1;
  const padWidth = config.padWidth ?? DEFAULT_PAD_WIDTH;
  const prefix = config.prefix ?? DEFAULT_PREFIX_BY_TYPE[config.type];

  const rows: WizardUnitDraft[] = [];
  for (let i = 0; i < config.count; i += 1) {
    const number = formatGeneratedNumber(prefix, start + i, padWidth);
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
  return rows;
}

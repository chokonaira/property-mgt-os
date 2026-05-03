import { describe, expect, it } from 'vitest';
import type { ExtractionResult } from '@buena/shared';
import {
  buildImportPlan,
  mergeKeepExisting,
  replaceAll,
} from '@/lib/import-units-from-extraction';
import type { WizardBuildingDraft, WizardUnitDraft } from '@/lib/schemas/wizard-draft';

// Minimal extraction-result factory — every test starts from this and
// overrides only the fields it cares about. Keeps each test scoped to
// the one rule it verifies and stops boilerplate from drowning the
// signal.
function makeExtraction(overrides: {
  buildings?: ExtractionResult['buildings'];
  units?: ExtractionResult['units'];
}): ExtractionResult {
  return {
    property: {
      name: 'Sample',
      uniqueNumber: 'SMP-1',
      managementType: 'WEG',
    },
    buildings:
      overrides.buildings ??
      ([{ street: 'Hauptstr.', houseNumber: '1', label: 'Haus A' }] as ExtractionResult['buildings']),
    units: overrides.units ?? [],
    contacts: [],
    confidenceByField: {},
    sourceSpansByField: {},
    warnings: [],
  };
}

function apartment(
  buildingLabel: string,
  number: string,
  extra: Partial<ExtractionResult['units'][number]> = {},
): ExtractionResult['units'][number] {
  return {
    type: 'APARTMENT',
    buildingLabel,
    number,
    sizeSqm: 80,
    meaShare: 100,
    rooms: 3,
    ...extra,
  } as ExtractionResult['units'][number];
}

const HAUS_A: WizardBuildingDraft = { street: 'Am Fiktivpark', houseNumber: '12', label: 'Haus A' };
const HAUS_B: WizardBuildingDraft = { street: 'Urbanstraße', houseNumber: '88', label: 'Haus B' };

describe('buildImportPlan', () => {
  it('matches PDF units to wizard buildings by exact label', () => {
    const plan = buildImportPlan(
      makeExtraction({
        units: [apartment('Haus A', '01'), apartment('Haus B', '02')],
      }),
      [HAUS_A, HAUS_B],
      [],
    );
    expect(plan.matched.map((u) => u.buildingIndex)).toEqual([0, 1]);
    expect(plan.droppedCount).toBe(0);
    expect(plan.incomingCount).toBe(2);
  });

  it('matches case-insensitively against label', () => {
    const plan = buildImportPlan(
      makeExtraction({ units: [apartment('haus a', '01')] }),
      [HAUS_A],
      [],
    );
    expect(plan.matched).toHaveLength(1);
  });

  it('falls back to nickname when label does not match', () => {
    const plan = buildImportPlan(
      makeExtraction({ units: [apartment('parkside', '01')] }),
      [{ ...HAUS_A, label: undefined, nickname: 'Parkside' }],
      [],
    );
    expect(plan.matched).toHaveLength(1);
    expect(plan.droppedCount).toBe(0);
  });

  it('falls back to street + houseNumber when neither label nor nickname match', () => {
    const plan = buildImportPlan(
      makeExtraction({ units: [apartment('Am Fiktivpark 12', '01')] }),
      [{ ...HAUS_A, label: undefined, nickname: undefined }],
      [],
    );
    expect(plan.matched).toHaveLength(1);
  });

  it('drops unmatched units instead of placing them on the wrong building', () => {
    const plan = buildImportPlan(
      makeExtraction({
        units: [apartment('Haus C', '01'), apartment('Haus A', '02')],
      }),
      [HAUS_A],
      [],
    );
    expect(plan.matched).toHaveLength(1);
    expect(plan.droppedCount).toBe(1);
  });

  it('flags conflicts where (buildingIndex, number) already exists', () => {
    const plan = buildImportPlan(
      makeExtraction({
        units: [apartment('Haus A', '01'), apartment('Haus A', '02')],
      }),
      [HAUS_A],
      [{ buildingIndex: 0, number: '01' }],
    );
    expect(plan.conflicts.map((c) => c.number)).toEqual(['01']);
  });

  it('does not flag a same-number-different-building combo as a conflict', () => {
    // Per-building uniqueness — TG-01 in Haus A is a different
    // identity from TG-01 in Haus B.
    const plan = buildImportPlan(
      makeExtraction({ units: [apartment('Haus A', 'TG-01')] }),
      [HAUS_A, HAUS_B],
      [{ buildingIndex: 1, number: 'TG-01' }],
    );
    expect(plan.conflicts).toHaveLength(0);
  });

  it('ignores blank existing numbers when computing conflicts', () => {
    // The wizard's seeded empty row would otherwise produce a phantom
    // "" key that nothing matches but which would still grow the set.
    const plan = buildImportPlan(
      makeExtraction({ units: [apartment('Haus A', '01')] }),
      [HAUS_A],
      [{ buildingIndex: 0, number: '' }, { buildingIndex: 0, number: '   ' }],
    );
    expect(plan.conflicts).toHaveLength(0);
  });
});

describe('mergeKeepExisting', () => {
  it('appends only non-conflicting matched units', () => {
    const existing: WizardUnitDraft[] = [
      { type: 'APARTMENT', buildingIndex: 0, number: '01' } as WizardUnitDraft,
    ];
    const plan = buildImportPlan(
      makeExtraction({
        units: [apartment('Haus A', '01'), apartment('Haus A', '02')],
      }),
      [HAUS_A],
      existing.map((u) => ({ buildingIndex: u.buildingIndex, number: u.number ?? '' })),
    );
    const result = mergeKeepExisting(existing, plan);
    expect(result.map((u) => u.number)).toEqual(['01', '02']);
  });

  it('strips the pristine seeded empty row when adding rows', () => {
    // A fresh wizard has one apartment row with number=''. Without
    // this stripping, merge would land a useless empty header row
    // on top of the imported block.
    const seeded: WizardUnitDraft[] = [
      { type: 'APARTMENT', buildingIndex: 0, number: '' } as WizardUnitDraft,
    ];
    const plan = buildImportPlan(
      makeExtraction({ units: [apartment('Haus A', '01')] }),
      [HAUS_A],
      [],
    );
    const result = mergeKeepExisting(seeded, plan);
    expect(result.map((u) => u.number)).toEqual(['01']);
  });

  it('keeps a hand-typed pristine row when nothing would be added', () => {
    // Only strip the seed when the merge has something to contribute.
    // Otherwise we'd silently delete the user's empty starter row.
    const seeded: WizardUnitDraft[] = [
      { type: 'APARTMENT', buildingIndex: 0, number: '' } as WizardUnitDraft,
    ];
    const plan = buildImportPlan(
      makeExtraction({ units: [apartment('Haus C', '01')] }),
      [HAUS_A],
      [],
    );
    const result = mergeKeepExisting(seeded, plan);
    expect(result).toHaveLength(1);
  });
});

describe('replaceAll', () => {
  it('returns just the matched set, dropping all existing rows', () => {
    const plan = buildImportPlan(
      makeExtraction({
        units: [apartment('Haus A', '01'), apartment('Haus A', '02')],
      }),
      [HAUS_A],
      [{ buildingIndex: 0, number: 'KEEP-ME' }],
    );
    const result = replaceAll(plan);
    expect(result.map((u) => u.number)).toEqual(['01', '02']);
    expect(result.find((u) => u.number === 'KEEP-ME')).toBeUndefined();
  });
});

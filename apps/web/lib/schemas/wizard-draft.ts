import { z } from 'zod';
import { ManagementTypeSchema } from '@buena/shared';

// Per-step draft slices. The wizard owns the union; each step's form
// trigger validates only its own keys via methods.trigger(['general.*']).
// Sub-arrays for buildings + units are intentionally permissive at this
// shell layer — T-301 + T-401 replace them with the strict create schemas
// when real fields land.
// Custom messages on the schema would short-circuit zodI18nResolver, so
// the regex constraint here intentionally relies on Zod's default
// invalid_string issue and the helper text on the input describes the
// format expectation.
export const WizardGeneralDraftSchema = z.object({
  managementType: ManagementTypeSchema,
  name: z.string().min(1).max(200),
  uniqueNumber: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/),
  propertyManagerId: z.string().min(1).optional(),
  accountantId: z.string().min(1).optional(),
});
export type WizardGeneralDraft = z.infer<typeof WizardGeneralDraftSchema>;

// Per-building draft. `street` + `houseNumber` are required (the AC
// gates these); everything else is optional and lives behind a "Show
// more" toggle in the UI. `country` defaults to 'DE' — same as the
// strict CreateBuildingSchema in @buena/shared, intentional.
export const WizardBuildingDraftSchema = z.object({
  street: z.string().trim().min(1).max(200),
  houseNumber: z.string().trim().min(1).max(20),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/)
    .optional(),
  city: z.string().trim().min(1).max(120).optional(),
  label: z.string().trim().min(1).max(64).optional(),
  nickname: z.string().trim().min(1).max(64).optional(),
  yearBuilt: z
    .number()
    .int()
    .min(1800)
    .max(new Date().getFullYear() + 1)
    .optional(),
  floorsCount: z.number().int().min(0).max(50).optional(),
  hasElevator: z.boolean().optional(),
  energyStandard: z.string().trim().min(1).max(40).optional(),
  heating: z.string().trim().min(1).max(60).optional(),
  buildingType: z.string().trim().min(1).max(60).optional(),
});
export type WizardBuildingDraft = z.infer<typeof WizardBuildingDraftSchema>;

export const WizardBuildingsDraftSchema = z.array(WizardBuildingDraftSchema).min(1);
export const WizardUnitsDraftSchema = z.array(z.unknown());

export const WizardDraftSchema = z.object({
  general: WizardGeneralDraftSchema,
  buildings: WizardBuildingsDraftSchema,
  units: WizardUnitsDraftSchema,
});
export type WizardDraft = z.infer<typeof WizardDraftSchema>;

export type WizardDraftInput = z.input<typeof WizardDraftSchema>;

export const EMPTY_BUILDING: WizardBuildingDraft = {
  street: '',
  houseNumber: '',
};

export const WIZARD_DRAFT_DEFAULTS: WizardDraftInput = {
  general: {
    managementType: 'WEG',
    name: '',
    uniqueNumber: '',
  },
  buildings: [EMPTY_BUILDING],
  units: [],
};

// Field paths each step must validate via RHF's `trigger`. The wizard
// chrome calls `methods.trigger(STEP_FIELDS[step])` if no explicit
// validator is registered for that step.
export const STEP_FIELDS = {
  general: ['general.managementType', 'general.name', 'general.uniqueNumber'],
  buildings: ['buildings'],
  units: ['units'],
} as const;

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

export const WizardBuildingsDraftSchema = z.array(z.unknown());
export const WizardUnitsDraftSchema = z.array(z.unknown());

export const WizardDraftSchema = z.object({
  general: WizardGeneralDraftSchema,
  buildings: WizardBuildingsDraftSchema,
  units: WizardUnitsDraftSchema,
});
export type WizardDraft = z.infer<typeof WizardDraftSchema>;

export type WizardDraftInput = z.input<typeof WizardDraftSchema>;

export const WIZARD_DRAFT_DEFAULTS: WizardDraftInput = {
  general: {
    managementType: 'WEG',
    name: '',
    uniqueNumber: '',
  },
  buildings: [],
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

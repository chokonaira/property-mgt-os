export const WIZARD_STEPS = ['general', 'buildings', 'units'] as const;
export type WizardStepId = (typeof WIZARD_STEPS)[number];

export const STEP_PATHS: Record<WizardStepId, string> = {
  general: '/properties/new',
  buildings: '/properties/new/buildings',
  units: '/properties/new/units',
};

export function pathForStep(step: WizardStepId): string {
  return STEP_PATHS[step];
}

export function stepFromPath(pathname: string): WizardStepId {
  if (pathname.endsWith('/properties/new/units')) return 'units';
  if (pathname.endsWith('/properties/new/buildings')) return 'buildings';
  return 'general';
}

export function previousStep(step: WizardStepId): WizardStepId | null {
  const idx = WIZARD_STEPS.indexOf(step);
  return idx > 0 ? WIZARD_STEPS[idx - 1]! : null;
}

export function nextStep(step: WizardStepId): WizardStepId | null {
  const idx = WIZARD_STEPS.indexOf(step);
  return idx >= 0 && idx < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[idx + 1]! : null;
}

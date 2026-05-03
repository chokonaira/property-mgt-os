'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { WizardContext, type WizardContextValue } from '@/components/wizard/wizard-context';

/**
 * Lightweight provider for the units-edit page. Reuses the same
 * `WizardContext` object the wizard step uses, so UnitTable's
 * `useWizard()` resolves transparently in BOTH the create flow
 * and the edit flow with zero per-component changes.
 *
 * What's stubbed vs the wizard's full provider:
 *   - No localStorage persistence (would clobber any in-progress
 *     create-wizard draft).
 *   - No step-validity map (single-step page; the local Save
 *     button drives validation directly via methods.trigger).
 *   - No declaration-file / extraction-meta state (the edit page
 *     doesn't surface AI extraction; users edit values that are
 *     already saved).
 *   - markFieldEdited is a no-op (no AI chips to clear).
 *
 * `errorsVisible` IS real state because UnitTable + the validation-
 * summary banner gate their inline error display on it. The Save
 * button on the page flips it to true on first failed validate.
 */
export function EditUnitsProvider({ children }: { children: ReactNode }) {
  const [errorsVisible, setErrorsVisible] = useState(false);
  const noopValidate = useCallback(async () => true, []);
  const value: WizardContextValue = {
    validity: { general: true, buildings: true, units: true },
    registerValidator: () => undefined,
    setStepValid: () => undefined,
    validateStep: noopValidate,
    reset: () => undefined,
    declarationFile: undefined,
    setDeclarationFile: () => undefined,
    extractionMeta: null,
    setExtractionMeta: () => undefined,
    markFieldEdited: () => undefined,
    hydrated: true,
    lastSavedAt: null,
    errorsVisible,
    setErrorsVisible,
  };
  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

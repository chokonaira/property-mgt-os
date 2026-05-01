'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  STEP_FIELDS,
  WIZARD_DRAFT_DEFAULTS,
  WizardDraftSchema,
  type WizardDraft,
  type WizardDraftInput,
} from '@/lib/schemas/wizard-draft';
import { WIZARD_STEPS, type WizardStepId } from './steps';

type ValidatorFn = () => Promise<boolean> | boolean;
type StepValidityMap = Record<WizardStepId, boolean>;

interface WizardContextValue {
  validity: StepValidityMap;
  registerValidator: (step: WizardStepId, fn: ValidatorFn | null) => void;
  setStepValid: (step: WizardStepId, valid: boolean) => void;
  validateStep: (step: WizardStepId) => Promise<boolean>;
  reset: () => void;
}

const initialValidity: StepValidityMap = {
  general: false,
  buildings: false,
  units: false,
};

const WizardContext = createContext<WizardContextValue | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  // Single shared FormProvider for the wizard. Step-specific validation
  // is delegated to RHF's `trigger`, scoped to the field paths declared
  // in STEP_FIELDS. Step components can still register a custom
  // validator (e.g. when they cross-check against the API) — registered
  // validators take precedence over the schema trigger.
  const methods = useForm<WizardDraftInput, unknown, WizardDraft>({
    defaultValues: WIZARD_DRAFT_DEFAULTS,
    resolver: zodResolver(WizardDraftSchema),
    mode: 'onTouched',
  });

  const [validity, setValidity] = useState<StepValidityMap>(initialValidity);
  const validators = useRef<Partial<Record<WizardStepId, ValidatorFn>>>({});

  const registerValidator = useCallback((step: WizardStepId, fn: ValidatorFn | null) => {
    if (fn) {
      validators.current[step] = fn;
    } else {
      delete validators.current[step];
    }
  }, []);

  const setStepValid = useCallback((step: WizardStepId, valid: boolean) => {
    setValidity((prev) => (prev[step] === valid ? prev : { ...prev, [step]: valid }));
  }, []);

  const validateStep = useCallback(
    async (step: WizardStepId) => {
      const fn = validators.current[step];
      const result = fn ? await fn() : await methods.trigger(STEP_FIELDS[step]);
      setStepValid(step, result);
      return result;
    },
    [methods, setStepValid],
  );

  const reset = useCallback(() => {
    setValidity(initialValidity);
    validators.current = {};
    methods.reset(WIZARD_DRAFT_DEFAULTS);
  }, [methods]);

  const value = useMemo<WizardContextValue>(
    () => ({ validity, registerValidator, setStepValid, validateStep, reset }),
    [validity, registerValidator, setStepValid, validateStep, reset],
  );

  return (
    <FormProvider {...methods}>
      <WizardContext.Provider value={value}>{children}</WizardContext.Provider>
    </FormProvider>
  );
}

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useWizard must be used within <WizardProvider>');
  return ctx;
}

export function useStepValidator(step: WizardStepId, validator: ValidatorFn | null) {
  const { registerValidator } = useWizard();
  useEffect(() => {
    registerValidator(step, validator);
    return () => registerValidator(step, null);
  }, [step, validator, registerValidator]);
}

export function isPriorStepValid(validity: StepValidityMap, step: WizardStepId): boolean {
  const idx = WIZARD_STEPS.indexOf(step);
  if (idx <= 0) return true;
  return WIZARD_STEPS.slice(0, idx).every((s) => validity[s]);
}

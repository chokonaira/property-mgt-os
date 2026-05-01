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
      if (!fn) return false;
      const result = await fn();
      setStepValid(step, result);
      return result;
    },
    [setStepValid],
  );

  const reset = useCallback(() => {
    setValidity(initialValidity);
    validators.current = {};
  }, []);

  const value = useMemo<WizardContextValue>(
    () => ({ validity, registerValidator, setStepValid, validateStep, reset }),
    [validity, registerValidator, setStepValid, validateStep, reset],
  );

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
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

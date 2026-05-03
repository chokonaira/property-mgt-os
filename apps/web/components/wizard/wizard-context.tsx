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
import { useTranslations } from 'next-intl';
import { zodI18nResolver } from '@/lib/zod-i18n';
import {
  clearPersistedWizardDraft,
  useWizardPersistence,
} from '@/lib/hooks/use-wizard-persistence';
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

/**
 * Extraction metadata that survives the AI Review Panel "Accept all"
 * action so the form can render per-field provenance chips against
 * AI-populated inputs. Contract:
 *
 *   confidenceByField: Record<string, number>   (0..1, server-trusted)
 *   sourceSpansByField: Record<string, string>  (only verified spans)
 *   editedFields: Set<string>                   (paths the user changed)
 *
 * A chip for `<path>` renders only when `editedFields` does NOT contain
 * the path. Editing a field calls `markFieldEdited(path)`, which clears
 * the chip until the next extraction lands.
 */
export interface WizardExtractionMeta {
  confidenceByField: Record<string, number>;
  sourceSpansByField: Record<string, string>;
  editedFields: ReadonlySet<string>;
}

export interface WizardContextValue {
  validity: StepValidityMap;
  registerValidator: (step: WizardStepId, fn: ValidatorFn | null) => void;
  setStepValid: (step: WizardStepId, valid: boolean) => void;
  validateStep: (step: WizardStepId) => Promise<boolean>;
  reset: () => void;
  // Stepwise file picks live on the layout-level provider so the user
  // doesn't lose their selection when they Back out of step 1.
  declarationFile: File | undefined;
  setDeclarationFile: (file: File | undefined) => void;
  extractionMeta: WizardExtractionMeta | null;
  setExtractionMeta: (
    meta: { confidenceByField: Record<string, number>; sourceSpansByField: Record<string, string> } | null,
  ) => void;
  markFieldEdited: (path: string) => void;
  /**
   * False until the persisted draft (if any) has been restored AND
   * each step's validity has been derived from the restored values.
   * Consumers (notably WizardChrome's redirect guard) must wait for
   * this before acting on `validity`, otherwise a hard refresh of
   * /properties/new/buildings or /units kicks the user back to step 1
   * before the persisted draft has had a chance to seed validity.
   */
  hydrated: boolean;
  /** Epoch ms of the last localStorage write; null until the first save. */
  lastSavedAt: number | null;
  /**
   * Becomes true the first time the user clicks Save. Field-level
   * components gate red borders and inline error messages on
   * (dirtyFields[path] || errorsVisible) so a freshly-loaded step
   * doesn't flash validation against inputs the user hasn't touched.
   */
  errorsVisible: boolean;
  setErrorsVisible: (next: boolean) => void;
}

const initialValidity: StepValidityMap = {
  general: false,
  buildings: false,
  units: false,
};

// Exported so the EditUnitsProvider (used by the units-edit page)
// can reuse the same context object — UnitTable's `useWizard()`
// then resolves correctly under EITHER provider without any
// per-component refactor.
export const WizardContext = createContext<WizardContextValue | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  // Single shared FormProvider for the wizard. Step-specific validation
  // is delegated to RHF's `trigger`, scoped to the field paths declared
  // in STEP_FIELDS. Step components can still register a custom
  // validator (e.g. when they cross-check against the API) — registered
  // validators take precedence over the schema trigger.
  // Route Zod errors through the next-intl resolver so messages render
  // in the active locale rather than the library default English copy.
  const tErr = useTranslations('errors');
  const methods = useForm<WizardDraftInput, unknown, WizardDraft>({
    defaultValues: WIZARD_DRAFT_DEFAULTS,
    resolver: zodResolver(WizardDraftSchema, { errorMap: zodI18nResolver(tErr) }),
    mode: 'onTouched',
  });
  // Restore from + persist into localStorage so a hard refresh on any step
  // brings the user back to where they left off (T-303 / T-410).
  const { hydrated: persistenceHydrated, lastSavedAt } = useWizardPersistence(methods);

  const [validity, setValidity] = useState<StepValidityMap>(initialValidity);
  const [validityHydrated, setValidityHydrated] = useState(false);
  const [declarationFile, setDeclarationFile] = useState<File | undefined>(undefined);
  const [extractionMeta, setExtractionMetaState] = useState<WizardExtractionMeta | null>(null);
  const [errorsVisible, setErrorsVisible] = useState(false);
  const validators = useRef<Partial<Record<WizardStepId, ValidatorFn>>>({});
  // Generation counter — bumped on every reset(). The hydration trigger
  // pass captures its generation at start and only commits validity if
  // it still matches at completion, so a Discard mid-hydration cannot
  // overwrite the freshly-cleared map with stale pre-discard truth.
  const hydrationGeneration = useRef(0);

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
    // Bump the generation FIRST so any in-flight hydration trigger pass
    // sees a stale generation when it tries to write back its result.
    hydrationGeneration.current += 1;
    setValidity(initialValidity);
    setValidityHydrated(false);
    setDeclarationFile(undefined);
    setExtractionMetaState(null);
    setErrorsVisible(false);
    validators.current = {};
    methods.reset(WIZARD_DRAFT_DEFAULTS);
    clearPersistedWizardDraft();
  }, [methods]);

  const setExtractionMeta = useCallback(
    (
      meta: {
        confidenceByField: Record<string, number>;
        sourceSpansByField: Record<string, string>;
      } | null,
    ) => {
      if (!meta) {
        setExtractionMetaState(null);
        return;
      }
      setExtractionMetaState({
        confidenceByField: meta.confidenceByField,
        sourceSpansByField: meta.sourceSpansByField,
        editedFields: new Set(),
      });
    },
    [],
  );

  const markFieldEdited = useCallback((path: string) => {
    setExtractionMetaState((prev) => {
      if (!prev) return prev;
      if (prev.editedFields.has(path)) return prev;
      const next = new Set(prev.editedFields);
      next.add(path);
      return { ...prev, editedFields: next };
    });
  }, []);

  // After the persisted draft is restored, run schema-level validation per
  // step to seed the validity map with the truth of the *restored* state.
  // Without this, /properties/new/buildings booted from a refresh sees
  // {general:false, buildings:false} and the chrome redirects to step 1
  // even though the saved draft would have been valid.
  useEffect(() => {
    if (!persistenceHydrated) return;
    let cancelled = false;
    const myGeneration = hydrationGeneration.current;
    void (async () => {
      const results = await Promise.all(
        WIZARD_STEPS.map(async (step) => [step, await methods.trigger(STEP_FIELDS[step])] as const),
      );
      // Bail if the effect was torn down OR if reset() bumped the
      // generation while we were awaiting. Either way the in-flight
      // result is now stale.
      if (cancelled || hydrationGeneration.current !== myGeneration) return;
      setValidity((prev) => {
        const next = { ...prev };
        for (const [step, ok] of results) next[step] = ok;
        return next;
      });
      setValidityHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [persistenceHydrated, methods]);

  const hydrated = persistenceHydrated && validityHydrated;

  const value = useMemo<WizardContextValue>(
    () => ({
      validity,
      registerValidator,
      setStepValid,
      validateStep,
      reset,
      declarationFile,
      setDeclarationFile,
      extractionMeta,
      setExtractionMeta,
      markFieldEdited,
      hydrated,
      lastSavedAt,
      errorsVisible,
      setErrorsVisible,
    }),
    [
      validity,
      registerValidator,
      setStepValid,
      validateStep,
      reset,
      declarationFile,
      extractionMeta,
      setExtractionMeta,
      markFieldEdited,
      hydrated,
      lastSavedAt,
      errorsVisible,
    ],
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

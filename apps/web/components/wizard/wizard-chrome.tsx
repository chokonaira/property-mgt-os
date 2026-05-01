'use client';

import { useEffect, useTransition, type ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import { ArrowLeft, ArrowRight, Loader2, Save, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useRouter, usePathname } from '@/i18n/navigation';
import { ApiError } from '@/lib/api-client';
import { useCreateProperty } from '@/lib/hooks/use-create-property';
import { Button } from '@/components/ui/button';
import { LastSavedIndicator } from './last-saved-indicator';
import { StepIndicator } from './step-indicator';
import { WIZARD_STEPS, nextStep, pathForStep, previousStep, stepFromPath } from './steps';
import { isPriorStepValid, useWizard } from './wizard-context';
import type { WizardDraft, WizardDraftInput } from '@/lib/schemas/wizard-draft';
import { buildCreatePropertyRequest } from '@/lib/wizard-to-create-request';

const FIELD_DETAIL_PREFIX_TO_STEP: Array<[RegExp, string]> = [
  [/^(property|general)\./, '/properties/new'],
  [/^buildings(\.|$)/, '/properties/new/buildings'],
  [/^units(\.|$)/, '/properties/new/units'],
];

// The wire schema (CreatePropertyRequestSchema) reports server paths
// rooted at `property.…`, while the wizard's RHF form holds the same
// fields under `general.…`. Translate at the boundary so setError pins
// the inline error to the actual input rather than a phantom path.
function serverPathToFormPath(serverPath: string): string {
  if (serverPath === 'property') return 'general';
  if (serverPath.startsWith('property.')) return `general.${serverPath.slice('property.'.length)}`;
  return serverPath;
}

export function WizardChrome({ children }: { children: ReactNode }) {
  const t = useTranslations('wizard');
  const tToasts = useTranslations('wizard.toasts');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const pathname = usePathname();
  const currentStep = stepFromPath(pathname);
  const { validity, validateStep, reset, hydrated, lastSavedAt } = useWizard();
  const { setError, getValues, trigger } = useFormContext<WizardDraftInput, unknown, WizardDraft>();
  const [isPending, startTransition] = useTransition();
  const createProperty = useCreateProperty();
  const isLastStep = currentStep === WIZARD_STEPS[WIZARD_STEPS.length - 1];

  // Don't redirect until the persisted draft has been restored AND each
  // step's validity has been derived from it. Otherwise a hard refresh on
  // /properties/new/buildings or /units kicks the user back to step 1
  // before the saved draft has had a chance to seed validity.
  useEffect(() => {
    if (!hydrated) return;
    if (!isPriorStepValid(validity, currentStep)) {
      router.replace(pathForStep(WIZARD_STEPS[0]));
    }
  }, [hydrated, currentStep, validity, router]);

  const back = previousStep(currentStep);
  const next = nextStep(currentStep);

  async function handleNext() {
    const ok = await validateStep(currentStep);
    if (!ok || !next) return;
    startTransition(() => router.push(pathForStep(next)));
  }

  function handleBack() {
    if (!back) return;
    startTransition(() => router.push(pathForStep(back)));
  }

  function handleDiscard() {
    if (!window.confirm(t('discardConfirm'))) return;
    reset();
    startTransition(() => router.push('/'));
  }

  async function handleSave() {
    // Trigger every step's validation up front so the user lands on
    // the correct step if something earlier is broken (e.g. someone
    // tampered with the persisted draft).
    const allOk = await trigger();
    if (!allOk) {
      toast.error(tToasts('failureValidation'));
      return;
    }
    const draft = getValues() as WizardDraft;
    const payload = buildCreatePropertyRequest(draft);

    createProperty.mutate(payload, {
      onSuccess: (detail) => {
        reset();
        toast.success(tToasts('success'));
        startTransition(() => router.push(`/properties/${detail.id}`));
      },
      onError: (error) => {
        if (error instanceof ApiError) {
          if (error.status === 409) {
            // PrismaExceptionFilter pins the conflicting column in details.
            const details = (error.body.details ?? []) as Array<{ path?: string }>;
            const onUniqueNumber = details.some((d) => d.path?.includes('uniqueNumber'));
            if (onUniqueNumber) {
              setError('general.uniqueNumber', {
                type: 'conflict',
                message: tErr('conflictUniqueNumber'),
              });
              startTransition(() => router.push(pathForStep(WIZARD_STEPS[0])));
              toast.error(tErr('conflictUniqueNumber'));
              return;
            }
          }
          if (error.status === 422 && Array.isArray(error.body.details)) {
            type Detail = { path?: string; message?: string };
            const details = error.body.details as Detail[];
            for (const issue of details) {
              if (!issue.path) continue;
              const formPath = serverPathToFormPath(issue.path);
              setError(formPath as keyof WizardDraftInput, {
                type: 'server',
                message: issue.message ?? tToasts('failureValidation'),
              });
            }
            // Route the user to the first step that owns a flagged field.
            const firstPath = details.find((d) => Boolean(d.path))?.path;
            if (firstPath) {
              const route = FIELD_DETAIL_PREFIX_TO_STEP.find(([re]) => re.test(firstPath))?.[1];
              if (route && route !== pathname) {
                startTransition(() => router.push(route));
              }
            }
            toast.error(tToasts('failureValidation'));
            return;
          }
        }
        toast.error(tToasts('failureGeneric'));
      },
    });
  }

  const saving = createProperty.isPending;
  const advanceLabel = isLastStep ? t('save') : t('next');
  const advanceIcon = isLastStep ? (
    saving ? (
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    ) : (
      <Save className="h-4 w-4" aria-hidden="true" />
    )
  ) : (
    <ArrowRight className="h-4 w-4" aria-hidden="true" />
  );
  const advanceDisabled = isPending || saving || !validity[currentStep] || (!isLastStep && !next);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDiscard}
          disabled={saving}
          className="self-start text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t('discard')}
        </Button>
      </header>
      <StepIndicator currentStep={currentStep} />
      <section
        key={currentStep}
        aria-live="polite"
        className="rounded-lg border border-border bg-card p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 sm:p-6"
      >
        {children}
      </section>
      <footer className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={!back || isPending || saving}
          className="sm:min-w-32"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('back')}
        </Button>
        <div className="flex flex-1 items-center justify-center sm:flex-1">
          <LastSavedIndicator lastSavedAt={lastSavedAt} />
        </div>
        <Button
          onClick={isLastStep ? handleSave : handleNext}
          disabled={advanceDisabled}
          className="sm:min-w-32"
        >
          {!isLastStep ? <span>{advanceLabel}</span> : null}
          {advanceIcon}
          {isLastStep ? <span>{advanceLabel}</span> : null}
        </Button>
      </footer>
    </main>
  );
}

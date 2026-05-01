'use client';

import { useEffect, useTransition, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { StepIndicator } from './step-indicator';
import { WIZARD_STEPS, nextStep, pathForStep, previousStep, stepFromPath } from './steps';
import { isPriorStepValid, useWizard } from './wizard-context';

export function WizardChrome({ children }: { children: ReactNode }) {
  const t = useTranslations('wizard');
  const router = useRouter();
  const pathname = usePathname();
  const currentStep = stepFromPath(pathname);
  const { validity, validateStep, reset, hydrated } = useWizard();
  const [isPending, startTransition] = useTransition();

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
          className="self-start text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t('discard')}
        </Button>
      </header>
      <StepIndicator currentStep={currentStep} />
      <section aria-live="polite" className="rounded-lg border border-border bg-card p-4 sm:p-6">
        {children}
      </section>
      <footer className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={!back || isPending}
          className="sm:min-w-32"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('back')}
        </Button>
        <Button
          onClick={handleNext}
          disabled={!next || isPending || !validity[currentStep]}
          className="sm:min-w-32"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </footer>
    </main>
  );
}

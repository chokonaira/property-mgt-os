'use client';

import { useTranslations } from 'next-intl';
import { useStepValidator } from './wizard-context';
import type { WizardStepId } from './steps';

interface StepPlaceholderProps {
  step: WizardStepId;
  ticketRef: string;
}

export function StepPlaceholder({ step, ticketRef }: StepPlaceholderProps) {
  const t = useTranslations(`wizard.placeholders.${step}`);
  useStepValidator(step, () => false);
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <p className="text-base font-medium text-foreground">{t('title')}</p>
      <p className="max-w-md text-sm text-muted-foreground">{t('description')}</p>
      <p className="mt-2 font-mono text-xs text-muted-foreground">{ticketRef}</p>
    </div>
  );
}

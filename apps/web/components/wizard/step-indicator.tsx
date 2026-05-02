'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useWizard } from './wizard-context';
import { WIZARD_STEPS, type WizardStepId } from './steps';
import { cn } from '@/lib/utils';

interface StepIndicatorProps {
  currentStep: WizardStepId;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const t = useTranslations('wizard');
  const { validity } = useWizard();
  const currentIdx = WIZARD_STEPS.indexOf(currentStep);

  return (
    <ol aria-label={t('progress')} className="flex w-full items-center gap-2 sm:gap-4">
      {WIZARD_STEPS.map((step, idx) => {
        const isCurrent = step === currentStep;
        const isCompleted = idx < currentIdx && validity[step];
        const isPending = idx > currentIdx;
        const label = t(`step${(idx + 1) as 1 | 2 | 3}`);
        return (
          <li
            key={step}
            className={cn(
              'flex items-center gap-2 sm:gap-3',
              // Every step after the first owns the connector line that
              // visually leads into it. Combined with `flex-1`, this
              // pins step 1 to the left edge, the last step to the
              // right edge, and distributes the lines through the
              // middle — so the indicator spans the full container.
              idx > 0 && 'flex-1',
            )}
          >
            {idx > 0 ? (
              <span
                aria-hidden="true"
                className={cn(
                  'h-px flex-1',
                  idx <= currentIdx ? 'bg-success/60' : 'bg-border',
                )}
              />
            ) : null}
            <span
              aria-current={isCurrent ? 'step' : undefined}
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                isCompleted && 'bg-success text-success-foreground',
                isCurrent && 'bg-accent text-accent-foreground',
                isPending && 'bg-muted text-muted-foreground',
              )}
            >
              {isCompleted ? <Check className="h-4 w-4" aria-hidden="true" /> : idx + 1}
            </span>
            <span
              className={cn(
                'truncate text-xs font-medium sm:text-sm',
                isCurrent ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

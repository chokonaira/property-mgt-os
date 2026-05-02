'use client';

import { AlertCircle, Check, Loader2, RefreshCcw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { extractionErrorKey } from '@/lib/extraction-error-key';
import { cn } from '@/lib/utils';

interface ExtractionLoadingProps {
  stage: 'uploading' | 'extracting';
}

/**
 * Multi-stage progress card for the AI handoff. Splits the wait into
 * three visible steps (upload → extract → review) with the active
 * stage spinning, completed stages checked, and the final "review"
 * stage muted until the panel takes over. The Stripe-grade pattern:
 * the user sees motion + concrete progress for the entire 5–10 s
 * wait instead of a single ambiguous spinner.
 */
export function ExtractionLoading({ stage }: ExtractionLoadingProps) {
  const t = useTranslations('extraction.status');
  const stages: Array<{ key: 'upload' | 'extract' | 'review'; state: 'done' | 'active' | 'pending' }> =
    stage === 'uploading'
      ? [
          { key: 'upload', state: 'active' },
          { key: 'extract', state: 'pending' },
          { key: 'review', state: 'pending' },
        ]
      : [
          { key: 'upload', state: 'done' },
          { key: 'extract', state: 'active' },
          { key: 'review', state: 'pending' },
        ];

  return (
    <Card
      className="border-primary/30"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <CardContent className="flex flex-col gap-3 py-4">
        <ol className="flex flex-col gap-2.5">
          {stages.map((s) => (
            <li key={s.key} className="flex items-center gap-3">
              <StageIcon state={s.state} />
              <span
                className={cn(
                  'text-sm font-medium transition-colors',
                  s.state === 'done' && 'text-muted-foreground',
                  s.state === 'active' && 'text-foreground',
                  s.state === 'pending' && 'text-muted-foreground/60',
                )}
              >
                {t(`stages.${s.key}`)}
              </span>
            </li>
          ))}
        </ol>
        <p className="pl-7 text-xs text-muted-foreground">{t('hint')}</p>
      </CardContent>
    </Card>
  );
}

function StageIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground"
      >
        <Check className="h-2.5 w-2.5" />
      </span>
    );
  }
  if (state === 'active') {
    return (
      <Loader2
        aria-hidden="true"
        className="h-4 w-4 shrink-0 animate-spin text-primary"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 shrink-0 rounded-full border border-border"
    />
  );
}

interface ExtractionErrorBannerProps {
  error: unknown;
  onRetry: () => void;
  /** Optional dismiss action; renders a "Fill manually" button next to Retry. */
  onDismiss?: () => void;
}

export function ExtractionErrorBanner({ error, onRetry, onDismiss }: ExtractionErrorBannerProps) {
  const t = useTranslations('extraction.status');
  const messageKey = extractionErrorKey(error);
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-destructive" role="alert">
              {t(`errors.${messageKey}`)}
            </p>
            <p className="text-xs text-destructive/80">{t('errors.fallbackHint')}</p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-shrink-0 sm:items-center">
          {onDismiss ? (
            <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {t('fillManually')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t('retry')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


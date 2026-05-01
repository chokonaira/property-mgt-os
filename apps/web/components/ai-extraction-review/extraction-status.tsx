'use client';

import { AlertCircle, Loader2, RefreshCcw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { extractionErrorKey } from '@/lib/extraction-error-key';

interface ExtractionLoadingProps {
  stage: 'uploading' | 'extracting';
}

export function ExtractionLoading({ stage }: ExtractionLoadingProps) {
  const t = useTranslations('extraction.status');
  return (
    <Card className="border-primary/30 motion-safe:animate-pulse motion-safe:[animation-duration:2s]">
      <CardContent className="flex items-start gap-3 py-4">
        <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p
            className="text-sm font-medium text-foreground"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            {stage === 'uploading' ? t('uploading') : t('extracting')}
          </p>
          <p className="text-xs text-muted-foreground">{t('hint')}</p>
        </div>
      </CardContent>
    </Card>
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


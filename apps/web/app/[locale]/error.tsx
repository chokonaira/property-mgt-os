'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/error-state';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Locale-segment error boundary. Catches render-time exceptions
 * inside `app/[locale]/**`. The translations + theme + providers
 * are already mounted at this layer, so the surface can be fully
 * localised.
 *
 * Logs the digest to the browser console so the reviewer can
 * correlate with server logs (Next bakes a stable hash per error
 * during the build). When real telemetry lands, swap the
 * console.error for a sink call — the rest of this boundary
 * stays the same.
 */
export default function LocaleError({ error, reset }: ErrorBoundaryProps) {
  const t = useTranslations('errors.boundary');
  const tCommon = useTranslations('errors');

  useEffect(() => {
    // eslint-disable-next-line no-console -- intentional structured error log
    console.error('app.error', {
      event: 'app.error',
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <ErrorState
      variant="error"
      title={t('title')}
      description={t('description')}
      primaryAction={{ label: tCommon('tryAgain'), onClick: reset }}
      secondaryAction={{ label: tCommon('backToDashboard'), href: '/' }}
    />
  );
}

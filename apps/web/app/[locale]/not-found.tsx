import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/error-state';

/**
 * 404 fallback inside the locale segment. Reached when a route
 * under `/{locale}/...` doesn't match any segment. Localised
 * because next-intl providers are already mounted at this layer.
 */
export default function LocaleNotFound() {
  const t = useTranslations('errors.notFoundFull');
  const tCommon = useTranslations('errors');

  return (
    <ErrorState
      variant="notFound"
      title={t('title')}
      description={t('description')}
      primaryAction={{ label: tCommon('backToDashboard'), href: '/' }}
    />
  );
}

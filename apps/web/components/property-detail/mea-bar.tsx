import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MeaBarProps {
  sum: number;
  total: number | undefined;
}

export function MeaBar({ sum, total }: MeaBarProps) {
  const t = useTranslations('propertyDetail.mea');
  const locale = useLocale();
  const expected = total ?? sum;
  const diff = expected - sum;
  const tolerance = 0.01;
  const matches = Math.abs(diff) <= tolerance || expected === 0;
  const ratio = expected > 0 ? Math.min(sum / expected, 1) : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:gap-6',
        matches ? 'border-success/30 bg-success/5' : 'border-warning/40 bg-warning/10',
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        {matches ? (
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
        )}
        <span>
          Σ {formatNumber(sum, locale)}
          {total !== undefined ? <> / {formatNumber(total, locale)}</> : null}
        </span>
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full transition-[width] duration-300 ease-out',
            matches ? 'bg-success' : 'bg-warning',
          )}
          style={{ width: `${ratio * 100}%` }}
          aria-hidden="true"
        />
      </div>
      <p className="text-xs text-muted-foreground sm:text-right">
        {matches ? t('balanced') : t('mismatch', { delta: formatNumber(Math.abs(diff), locale) })}
      </p>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, XOctagon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useFormContext, useWatch } from 'react-hook-form';
import { formatNumber } from '@/lib/format';
import { classifyMeaTone, computeMeaBreakdown, type MeaTone } from '@/lib/mea-breakdown';
import type { WizardDraftInput } from '@/lib/schemas/wizard-draft';
import { cn } from '@/lib/utils';

/**
 * Sticky MEA invariant bar for the wizard's units step. Visible only
 * for WEG properties; MV doesn't carry the share contract. Shows the
 * running sum vs the declared total with three states:
 *
 *   green   — sum equals total within 0.01 tolerance
 *   yellow  — sum < total (shares unaccounted)
 *   red     — sum > total (over-allocated; data is inconsistent)
 *
 * Click expands a per-building breakdown so the user can locate which
 * card holds the over- or under-allocated rows. The bar is non-blocking:
 * Next stays enabled regardless, and the same warning re-surfaces on
 * the review screen + as a server-side `MEA_MISMATCH` warning.
 */
export function WizardMeaBar() {
  const t = useTranslations('wizard.meaBar');
  const tBuildings = useTranslations('wizard.buildings');
  const locale = useLocale();
  const { control } = useFormContext<WizardDraftInput>();
  const [expanded, setExpanded] = useState(false);

  const managementType = useWatch({ control, name: 'general.managementType' });
  const totalMea = useWatch({ control, name: 'general.totalMea' });
  const buildingsWatch = useWatch({ control, name: 'buildings' });
  const unitsWatch = useWatch({ control, name: 'units' });

  const breakdown = useMemo(
    () =>
      computeMeaBreakdown({
        buildings: buildingsWatch ?? [],
        units: unitsWatch ?? [],
        fallback: (idx) => tBuildings('cardTitle', { index: idx }),
      }),
    [buildingsWatch, unitsWatch, tBuildings],
  );

  if (managementType !== 'WEG') return null;

  const sum = breakdown.total;
  const tone: MeaTone = classifyMeaTone(sum, totalMea);
  const delta = totalMea !== undefined ? totalMea - sum : 0;
  const ratio = totalMea && totalMea > 0 ? Math.min(sum / totalMea, 1) : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="wizard-mea-bar"
      className={cn(
        'sticky bottom-0 left-0 right-0 z-30 border-t backdrop-blur-sm',
        TONE_CHROME[tone],
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls="wizard-mea-breakdown"
            className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-foreground"
          >
            <ToneIcon tone={tone} />
            <span className="tabular-nums">
              {t('summary', {
                sum: formatNumber(sum, locale),
                total: totalMea !== undefined ? formatNumber(totalMea, locale) : t('noTotal'),
              })}
            </span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                expanded && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>
          <div className="hidden h-2 flex-1 overflow-hidden rounded-full bg-muted/60 sm:block">
            <div
              className={cn('h-full transition-[width] duration-300 ease-out', TONE_FILL[tone])}
              style={{ width: `${ratio * 100}%` }}
              aria-hidden="true"
            />
          </div>
          <p className="text-xs text-muted-foreground sm:text-right">
            {messageFor(t, tone, delta, locale)}
          </p>
        </div>
        {expanded ? (
          <ul
            id="wizard-mea-breakdown"
            className="grid grid-cols-1 gap-2 border-t border-border/50 pt-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {breakdown.rows.map((row) => (
              <li
                key={row.index}
                className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-3 py-1.5 text-sm"
              >
                <span className="truncate text-muted-foreground">{row.label}</span>
                <span className="font-mono tabular-nums text-foreground">
                  {formatNumber(row.sum, locale)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

const TONE_CHROME = {
  matched: 'border-success/30 bg-success/5',
  short: 'border-warning/40 bg-warning/10',
  exceeded: 'border-destructive/40 bg-destructive/5',
} as const;

const TONE_FILL = {
  matched: 'bg-success',
  short: 'bg-warning',
  exceeded: 'bg-destructive',
} as const;

function ToneIcon({ tone }: { tone: MeaTone }) {
  switch (tone) {
    case 'matched':
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />;
    case 'short':
      return <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />;
    case 'exceeded':
      return <XOctagon className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />;
  }
}

function messageFor(
  t: ReturnType<typeof useTranslations>,
  tone: MeaTone,
  delta: number,
  locale: string,
): string {
  switch (tone) {
    case 'matched':
      return t('matched');
    case 'short':
      return t('short', { delta: formatNumber(Math.abs(delta), locale) });
    case 'exceeded':
      return t('exceeded', { delta: formatNumber(Math.abs(delta), locale) });
  }
}

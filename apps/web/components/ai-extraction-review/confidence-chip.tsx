'use client';

import { useTranslations } from 'next-intl';
import { tierForField, type ConfidenceTier } from '@/lib/confidence-tier';
import { cn } from '@/lib/utils';

const TIER_STYLES: Record<ConfidenceTier, string> = {
  high: 'bg-success/10 text-success ring-success/30',
  medium: 'bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-400',
  low: 'bg-destructive/10 text-destructive ring-destructive/30',
  unverified: 'bg-muted text-muted-foreground ring-border',
};

interface ConfidenceChipProps {
  score: number | undefined;
  verified: boolean;
  className?: string;
}

export function ConfidenceChip({ score, verified, className }: ConfidenceChipProps) {
  const t = useTranslations('extraction.chip');
  const tier = tierForField(score, verified);
  const label = labelForTier(t, tier);
  const numeric = score !== undefined && Number.isFinite(score) ? Math.round(score * 100) : null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
        TIER_STYLES[tier],
        className,
      )}
      aria-label={
        numeric !== null && tier !== 'unverified'
          ? t('aria', { tier: label, score: numeric })
          : label
      }
    >
      {label}
      {numeric !== null && tier !== 'unverified' ? (
        <span className="font-semibold tabular-nums">{numeric}</span>
      ) : null}
    </span>
  );
}

function labelForTier(t: ReturnType<typeof useTranslations>, tier: ConfidenceTier): string {
  switch (tier) {
    case 'high':
      return t('high');
    case 'medium':
      return t('medium');
    case 'low':
      return t('low');
    case 'unverified':
      return t('unverified');
  }
}

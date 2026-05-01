'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface LastSavedIndicatorProps {
  lastSavedAt: number | null;
  className?: string;
}

/**
 * Footer status pill that surfaces the auto-save timestamp from the
 * wizard's localStorage persistence (T-410). Renders nothing until the
 * first save has happened, then ticks every 15 s so the relative
 * label stays fresh ("Just saved" → "Saved a minute ago" → …).
 */
export function LastSavedIndicator({ lastSavedAt, className }: LastSavedIndicatorProps) {
  const t = useTranslations('wizard.autoSave');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lastSavedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  if (lastSavedAt === null) return null;

  return (
    <p
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] text-muted-foreground',
        className,
      )}
      aria-live="polite"
    >
      <Save className="h-3 w-3" aria-hidden="true" />
      <span>{relativeLabel(t, now - lastSavedAt)}</span>
    </p>
  );
}

function relativeLabel(t: ReturnType<typeof useTranslations>, deltaMs: number): string {
  if (deltaMs < 5_000) return t('justSaved');
  if (deltaMs < 60_000) {
    const seconds = Math.round(deltaMs / 1_000);
    return t('secondsAgo', { count: seconds });
  }
  if (deltaMs < 60 * 60_000) {
    const minutes = Math.round(deltaMs / 60_000);
    return t('minutesAgo', { count: minutes });
  }
  const hours = Math.round(deltaMs / (60 * 60_000));
  return t('hoursAgo', { count: hours });
}

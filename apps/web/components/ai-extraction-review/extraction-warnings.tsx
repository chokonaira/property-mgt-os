'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Warning } from '@buena/shared';
import { cn } from '@/lib/utils';

interface ExtractionWarningsProps {
  warnings: ReadonlyArray<Warning>;
  className?: string;
}

export function ExtractionWarnings({ warnings, className }: ExtractionWarningsProps) {
  const t = useTranslations('extraction.warnings');
  if (warnings.length === 0) return null;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive',
        className,
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        {t('header', { count: warnings.length })}
      </p>
      <ul className="flex flex-col gap-1.5 pl-6 text-[13px] leading-relaxed">
        {warnings.map((warning, idx) => (
          <li key={`${warning.code}-${idx}`} className="list-disc">
            <span className="font-medium">{labelForCode(t, warning.code)}.</span>{' '}
            <span className="text-destructive/90">{warning.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function labelForCode(t: ReturnType<typeof useTranslations>, code: Warning['code']): string {
  switch (code) {
    case 'MEA_MISMATCH':
      return t('codes.meaMismatch');
    case 'MISSING_FIELD':
      return t('codes.missingField');
    case 'UNRECOGNIZED_TYPE':
      return t('codes.unrecognizedType');
    case 'AMBIGUOUS_VALUE':
      return t('codes.ambiguousValue');
  }
}

'use client';

import { Quote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface SourceSpanPopoverProps {
  span: string | undefined;
  fieldLabel: string;
  className?: string;
}

/**
 * Shows the verbatim PDF span the model cited for a given field.
 * Server-side `verifySpans` already dropped any span that wasn't
 * found in the source text, so reaching this popover means the
 * citation is grounded.
 */
export function SourceSpanPopover({ span, fieldLabel, className }: SourceSpanPopoverProps) {
  const t = useTranslations('extraction.span');
  if (!span) return null;
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-1 rounded text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        aria-label={t('aria', { field: fieldLabel })}
      >
        <Quote className="h-3 w-3" aria-hidden="true" />
        <span>{t('label')}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('header', { field: fieldLabel })}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          “{span}”
        </p>
      </PopoverContent>
    </Popover>
  );
}

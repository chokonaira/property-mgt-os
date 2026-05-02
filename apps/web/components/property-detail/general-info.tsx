'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PropertyDetail } from '@buena/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface GeneralInfoProps {
  property: PropertyDetail;
}

export function GeneralInfo({ property }: GeneralInfoProps) {
  const t = useTranslations('propertyDetail.general');
  const fields: Array<{ label: string; value: string | undefined; copyable?: boolean }> = [
    { label: t('uniqueNumber'), value: property.uniqueNumber, copyable: true },
    { label: t('grundbuchOffice'), value: property.grundbuchOffice },
    { label: t('grundbuchSheet'), value: property.grundbuchSheet },
    { label: t('gemarkung'), value: property.gemarkung },
    { label: t('flur'), value: property.flur },
    { label: t('flurstueck'), value: property.flurstueck },
    { label: t('notarialRollNo'), value: property.notarialRollNo },
  ];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle>{t('title')}</CardTitle>
        <Badge variant={property.managementType === 'WEG' ? 'weg' : 'mv'}>
          {property.managementType}
        </Badge>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(({ label, value, copyable }) => (
            <Field key={label} label={label} value={value} copyable={copyable} />
          ))}
          {property.propertyManager ? (
            <Field label={t('manager')} value={property.propertyManager.name} />
          ) : null}
          {property.accountant ? (
            <Field label={t('accountant')} value={property.accountant.name} />
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string | undefined | null;
  copyable?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
        <span className="break-all">{value || '—'}</span>
        {copyable && value ? <CopyButton value={value} label={label} /> : null}
      </dd>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const tCommon = useTranslations('common');
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can fail in non-secure contexts; fail silently —
      // the user can still select the text by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? `${tCommon('copied')} ${label}` : `${tCommon('copy')} ${label}`}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        copied
          ? 'bg-success text-success-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" aria-hidden="true" />
          <span>{tCommon('copied')}</span>
        </>
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

'use client';

import { useMemo } from 'react';
import { CheckCircle2, Database, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ExtractionRunResponse } from '@buena/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ConfidenceChip } from './confidence-chip';
import { ExtractionWarnings } from './extraction-warnings';
import { SourceSpanPopover } from './source-span-popover';

interface AiReviewPanelProps {
  result: ExtractionRunResponse;
  onAccept: () => void;
  onDiscard: () => void;
  droppedUnits?: number;
}

interface FieldRowProps {
  label: string;
  value: string;
  fieldPath: string;
  confidence?: number;
  span?: string;
}

const TRACKED_GENERAL_FIELDS = [
  { key: 'name', path: 'property.name' },
  { key: 'uniqueNumber', path: 'property.uniqueNumber' },
  { key: 'managementType', path: 'property.managementType' },
  { key: 'totalMea', path: 'property.totalMea' },
] as const;

export function AiReviewPanel({ result, onAccept, onDiscard, droppedUnits = 0 }: AiReviewPanelProps) {
  const t = useTranslations('extraction.panel');
  const tFields = useTranslations('extraction.fields');

  const overallConfidence = useMemo(() => Math.round(result.confidence * 100), [result.confidence]);
  // Pass a Number to next-intl so the locale-aware formatter
  // produces "4.5" (en) / "4,5" (de). The `{seconds, number, ::.0}`
  // skeleton in the message file pins one fractional digit.
  const seconds = useMemo(() => result.durationMs / 1000, [result.durationMs]);

  const verifiedSpans = result.extraction.sourceSpansByField;
  const confidenceMap = result.extraction.confidenceByField;

  const generalRows: FieldRowProps[] = TRACKED_GENERAL_FIELDS.flatMap((field) => {
    const raw = result.extraction.property[field.key as keyof typeof result.extraction.property];
    if (raw === undefined || raw === null || raw === '') return [];
    return [
      {
        label: tFields(`property.${field.key}`),
        value: String(raw),
        fieldPath: field.path,
        confidence: confidenceMap[field.path],
        span: verifiedSpans[field.path],
      },
    ];
  });

  const buildingsCount = result.extraction.buildings.length;
  const unitsCount = result.extraction.units.length;

  return (
    <Card className="border-primary/30 shadow-md">
      <CardHeader className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('header')}
          </p>
          <p className="text-xs text-muted-foreground">{t('subheader')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result.cached ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              aria-label={t('cachedAria')}
            >
              <Database className="h-3 w-3" aria-hidden="true" />
              {t('cached')}
            </span>
          ) : null}
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            aria-label={t('overallAria', { score: overallConfidence })}
          >
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            {t('overall', { score: overallConfidence })}
          </span>
          <span className="text-xs text-muted-foreground" aria-label={t('durationAria', { seconds })}>
            {t('duration', { seconds })}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        <ExtractionWarnings warnings={result.warnings} />

        <section className="flex flex-col gap-3" aria-labelledby="ai-review-property">
          <h3
            id="ai-review-property"
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {t('sections.property')}
          </h3>
          <ul className="flex flex-col gap-2.5">
            {generalRows.map((row) => (
              <FieldRow key={row.fieldPath} {...row} />
            ))}
          </ul>
        </section>

        <section
          className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm"
          aria-label={t('sections.summary')}
        >
          <SummaryStat label={t('stats.buildings')} value={buildingsCount} />
          <SummaryStat label={t('stats.units')} value={unitsCount} />
        </section>

        {droppedUnits > 0 ? (
          <p className="text-xs text-muted-foreground">{t('droppedUnits', { count: droppedUnits })}</p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onDiscard}>
            <X className="h-4 w-4" aria-hidden="true" />
            {t('discard')}
          </Button>
          <Button type="button" onClick={onAccept}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {t('acceptAll')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldRow({ label, value, confidence, span }: FieldRowProps) {
  return (
    <li className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <div className="flex flex-wrap items-center gap-2 sm:w-40 sm:shrink-0">
        <span className="text-xs text-muted-foreground">{label}</span>
        <ConfidenceChip score={confidence} verified={Boolean(span)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
        <span className="min-w-0 break-words font-medium">{value}</span>
        <SourceSpanPopover span={span} fieldLabel={label} />
      </div>
    </li>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-base font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { CheckCircle2, Database, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ExtractionResult, ExtractionRunResponse } from '@buena/shared';
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

const TRACKED_PROPERTY_FIELDS: ReadonlyArray<{ key: keyof ExtractionResult['property']; path: string }> = [
  { key: 'name', path: 'property.name' },
  { key: 'uniqueNumber', path: 'property.uniqueNumber' },
  { key: 'managementType', path: 'property.managementType' },
  { key: 'totalMea', path: 'property.totalMea' },
  { key: 'notarialRollNo', path: 'property.notarialRollNo' },
  { key: 'grundbuchOffice', path: 'property.grundbuchOffice' },
  { key: 'grundbuchSheet', path: 'property.grundbuchSheet' },
  { key: 'gemarkung', path: 'property.gemarkung' },
  { key: 'flur', path: 'property.flur' },
  { key: 'flurstueck', path: 'property.flurstueck' },
];

const TRACKED_BUILDING_FIELDS: ReadonlyArray<{
  key: keyof ExtractionResult['buildings'][number];
  labelKey: string;
}> = [
  { key: 'label', labelKey: 'label' },
  { key: 'street', labelKey: 'street' },
  { key: 'houseNumber', labelKey: 'houseNumber' },
  { key: 'postalCode', labelKey: 'postalCode' },
  { key: 'city', labelKey: 'city' },
  { key: 'yearBuilt', labelKey: 'yearBuilt' },
  { key: 'floorsCount', labelKey: 'floorsCount' },
];

type UnitFieldKey = 'number' | 'buildingLabel' | 'sizeSqm' | 'rooms' | 'meaShare' | 'yearBuilt';

export function AiReviewPanel({ result, onAccept, onDiscard, droppedUnits = 0 }: AiReviewPanelProps) {
  const t = useTranslations('extraction.panel');
  const tFields = useTranslations('extraction.fields');
  const tUnitTypes = useTranslations('wizard.units.types');

  const overallConfidence = useMemo(() => Math.round(result.confidence * 100), [result.confidence]);
  // Pass a Number to next-intl so the locale-aware formatter
  // produces "4.5" (en) / "4,5" (de). The `{seconds, number, ::.0}`
  // skeleton in the message file pins one fractional digit.
  const seconds = useMemo(() => result.durationMs / 1000, [result.durationMs]);

  const verifiedSpans = result.extraction.sourceSpansByField;
  const confidenceMap = result.extraction.confidenceByField;

  const propertyRows: FieldRowProps[] = TRACKED_PROPERTY_FIELDS.flatMap((field) => {
    const raw = result.extraction.property[field.key];
    if (raw === undefined || raw === null || raw === '') return [];
    return [
      {
        label: tFields(`property.${String(field.key)}`),
        value: String(raw),
        fieldPath: field.path,
        confidence: confidenceMap[field.path],
        span: verifiedSpans[field.path],
      },
    ];
  });

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
      <CardContent className="flex flex-col gap-5 pt-4">
        <ExtractionWarnings warnings={result.warnings} />

        <Section title={t('sections.property')} id="ai-review-property">
          <ul className="flex flex-col gap-2.5">
            {propertyRows.map((row) => (
              <FieldRow key={row.fieldPath} {...row} />
            ))}
          </ul>
        </Section>

        <Section title={t('sections.buildings')} id="ai-review-buildings">
          <ul className="flex flex-col gap-3">
            {result.extraction.buildings.map((building, idx) => {
              const cardLabel = building.label || building.nickname || t('buildingFallback', { index: idx + 1 });
              const rows: FieldRowProps[] = TRACKED_BUILDING_FIELDS.flatMap((field) => {
                const raw = building[field.key];
                if (raw === undefined || raw === null || raw === '') return [];
                const path = `buildings[${idx}].${String(field.key)}`;
                return [
                  {
                    label: tFields(`building.${field.labelKey}`),
                    value: String(raw),
                    fieldPath: path,
                    confidence: confidenceMap[path],
                    span: verifiedSpans[path],
                  },
                ];
              });
              return (
                <li
                  key={`building-${idx}`}
                  className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-3"
                >
                  <p className="text-xs font-semibold text-foreground">{cardLabel}</p>
                  <ul className="flex flex-col gap-2">
                    {rows.map((row) => (
                      <FieldRow key={row.fieldPath} {...row} />
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title={t('sections.units', { count: result.extraction.units.length })} id="ai-review-units">
          {result.extraction.units.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noUnits')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/60">
              <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{tFields('unit.type')}</th>
                    <th className="px-3 py-2 font-semibold">{tFields('unit.number')}</th>
                    <th className="px-3 py-2 font-semibold">{tFields('unit.buildingLabel')}</th>
                    <th className="px-3 py-2 font-semibold">{tFields('unit.sizeSqm')}</th>
                    <th className="px-3 py-2 font-semibold">{tFields('unit.rooms')}</th>
                    <th className="px-3 py-2 font-semibold">{tFields('unit.meaShare')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.extraction.units.map((unit, idx) => (
                    <UnitRow
                      key={`unit-${idx}`}
                      idx={idx}
                      unit={unit}
                      typeLabel={unitTypeLabel(tUnitTypes, unit.type)}
                      confidenceMap={confidenceMap}
                      verifiedSpans={verifiedSpans}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

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

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={id}>
      <h3 id={id} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
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

interface UnitRowProps {
  idx: number;
  unit: ExtractionResult['units'][number];
  typeLabel: string;
  confidenceMap: ExtractionResult['confidenceByField'];
  verifiedSpans: ExtractionResult['sourceSpansByField'];
}

function UnitRow({ idx, unit, typeLabel, confidenceMap, verifiedSpans }: UnitRowProps) {
  const cell = (key: UnitFieldKey) => {
    const raw = unit[key as keyof typeof unit];
    if (raw === undefined || raw === null || raw === '') {
      return <span className="text-muted-foreground/60">—</span>;
    }
    const path = `units[${idx}].${key}`;
    const score = confidenceMap[path];
    const span = verifiedSpans[path];
    return (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{String(raw)}</span>
        <div className="flex items-center gap-1.5">
          <ConfidenceChip score={score} verified={Boolean(span)} />
          <SourceSpanPopover span={span} fieldLabel={String(key)} />
        </div>
      </div>
    );
  };
  return (
    <tr className="border-t border-border/60 align-top">
      <td className="px-3 py-2">
        <span className="font-semibold text-foreground">{typeLabel}</span>
      </td>
      <td className="px-3 py-2">{cell('number')}</td>
      <td className="px-3 py-2">{cell('buildingLabel')}</td>
      <td className="px-3 py-2">{cell('sizeSqm')}</td>
      <td className="px-3 py-2">{cell('rooms')}</td>
      <td className="px-3 py-2">{cell('meaShare')}</td>
    </tr>
  );
}

function unitTypeLabel(t: ReturnType<typeof useTranslations>, type: ExtractionResult['units'][number]['type']): string {
  switch (type) {
    case 'APARTMENT':
      return t('APARTMENT');
    case 'OFFICE':
      return t('OFFICE');
    case 'PARKING':
      return t('PARKING');
    case 'GARDEN':
      return t('GARDEN');
  }
}

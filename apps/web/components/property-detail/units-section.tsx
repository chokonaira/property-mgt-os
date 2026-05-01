'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { Building, Unit } from '@buena/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatFloor, formatNumber, formatSqm, sumMea } from '@/lib/format';
import { MeaBar } from './mea-bar';

interface UnitsSectionProps {
  buildings: Array<Building & { units: Unit[] }>;
  totalMea: number | undefined;
}

export function UnitsSection({ buildings, totalMea }: UnitsSectionProps) {
  const t = useTranslations('propertyDetail.units');
  const allUnits = buildings.flatMap((b) => b.units);
  const sum = sumMea(allUnits);

  return (
    <section aria-labelledby="units-heading" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="units-heading" className="text-lg font-semibold text-foreground">
          {t('title')}
        </h2>
        <span className="text-sm text-muted-foreground">
          {t('count', { count: allUnits.length })}
        </span>
      </div>
      <MeaBar sum={sum} total={totalMea} />
      {buildings.map((building) => (
        <BuildingUnits key={building.id} building={building} />
      ))}
    </section>
  );
}

function BuildingUnits({ building }: { building: Building & { units: Unit[] } }) {
  const t = useTranslations('propertyDetail.units');
  const locale = useLocale();
  const heading =
    building.label || building.nickname || `${building.street} ${building.houseNumber}`;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">{heading}</p>
        <p className="text-xs text-muted-foreground">
          {t('rowCount', { count: building.units.length })}
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[100px]">{t('columns.number')}</TableHead>
            <TableHead className="w-[120px]">{t('columns.type')}</TableHead>
            <TableHead className="w-[120px]">{t('columns.floor')}</TableHead>
            <TableHead className="w-[120px]">{t('columns.size')}</TableHead>
            <TableHead className="w-[100px]">{t('columns.rooms')}</TableHead>
            <TableHead className="w-[120px] text-right">{t('columns.mea')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {building.units.map((unit) => (
            <UnitRow key={unit.id} unit={unit} locale={locale} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function UnitRow({ unit, locale }: { unit: Unit; locale: string }) {
  const t = useTranslations('propertyDetail.units');
  const rooms = unit.type === 'APARTMENT' ? unit.rooms : undefined;
  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-foreground">{unit.number}</TableCell>
      <TableCell className="text-sm text-foreground">{t(`types.${unit.type}`)}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{formatFloor(unit.floor)}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatSqm(unit.sizeSqm, locale)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {rooms !== undefined ? rooms : '—'}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-foreground">
        {formatNumber(unit.meaShare, locale)}
      </TableCell>
    </TableRow>
  );
}

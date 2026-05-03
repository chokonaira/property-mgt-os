'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import type { Building, Unit } from '@buena/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { formatFloor, formatNumber, formatSqm, sumMea } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MeaBar } from './mea-bar';

interface UnitsSectionProps {
  buildings: Array<Building & { units: Unit[] }>;
  totalMea: number | undefined;
}

export function UnitsSection({ buildings, totalMea }: UnitsSectionProps) {
  const t = useTranslations('propertyDetail.units');
  const allUnits = buildings.flatMap((b) => b.units);
  const sum = sumMea(allUnits);
  // Single-active-building UI keeps the viewport focused. With 100+
  // units across 3 buildings, rendering them all sequentially makes
  // the user scroll past Haus A to find Haus B. Tab strip swaps the
  // table in place — building stays one click away.
  // Active building lives in the URL (`?building=<id>`) so refresh,
  // back/forward, and link-sharing all preserve the user's view.
  // Falls back to the first building when the param is absent or
  // points at a building that no longer exists.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get('building');
  const active = buildings.find((b) => b.id === requestedId) ?? buildings[0];
  const setActiveId = useCallback(
    (nextId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('building', nextId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <section aria-labelledby="units-heading" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="units-heading" className="text-lg font-semibold text-foreground">
          {t('title')}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {t('count', { count: allUnits.length })}
          </span>
          {/* propertyId comes from any unit row (or the first
              building). Either resolves to the same property; we
              prefer the building-level path since it's defined even
              when the property has zero units. */}
          {buildings[0]?.propertyId ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/properties/${buildings[0].propertyId}/edit/units`}
                onClick={() => {
                  // Persist the user's scroll position so the detail
                  // page can restore it on return — going to the edit
                  // page is a separate route, and Next's default
                  // navigation scrolls to top on the new page AND on
                  // back/programmatic-replace. The detail-view
                  // useEffect reads this key + scrolls to it once
                  // the property data has rendered.
                  if (typeof window !== 'undefined' && buildings[0]?.propertyId) {
                    sessionStorage.setItem(
                      `property-detail-scroll:${buildings[0].propertyId}`,
                      String(window.scrollY),
                    );
                  }
                }}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                {t('editCta')}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <MeaBar sum={sum} total={totalMea} />
      {buildings.length > 1 ? (
        <div role="tablist" className="flex flex-wrap gap-2 border-b border-border pb-2">
          {buildings.map((b) => {
            const isActive = b.id === active?.id;
            const label = b.label || b.nickname || `${b.street} ${b.houseNumber}`;
            return (
              <button
                key={b.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`building-units-${b.id}`}
                onClick={() => setActiveId(b.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                <span>{label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                    isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {b.units.length}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {active ? <BuildingUnits building={active} /> : null}
    </section>
  );
}

function BuildingUnits({ building }: { building: Building & { units: Unit[] } }) {
  const t = useTranslations('propertyDetail.units');
  const locale = useLocale();
  // Disambiguator: identical building.label across two cards is
  // permitted at the schema level. Surface the address so the user
  // can tell two "Haus A"s apart at a glance.
  const heading = building.label || building.nickname || `${building.street} ${building.houseNumber}`;
  const subline = `${building.street} ${building.houseNumber}${building.postalCode ? `, ${building.postalCode}` : ''}${building.city ? ` ${building.city}` : ''}`;
  return (
    <div
      id={`building-units-${building.id}`}
      role="tabpanel"
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex flex-col gap-1 border-b border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-foreground">{heading}</p>
          <p className="text-[11px] text-muted-foreground">{subline}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('rowCount', { count: building.units.length })}
        </p>
      </div>
      <div className="overflow-x-auto">
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

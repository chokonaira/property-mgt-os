import { useTranslations } from 'next-intl';
import type { Building, Unit } from '@buena/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface BuildingsSectionProps {
  buildings: Array<Building & { units: Unit[] }>;
}

export function BuildingsSection({ buildings }: BuildingsSectionProps) {
  const t = useTranslations('propertyDetail.buildings');
  return (
    <section aria-labelledby="buildings-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="buildings-heading" className="text-lg font-semibold text-foreground">
          {t('title')}
        </h2>
        <span className="text-sm text-muted-foreground">
          {t('count', { count: buildings.length })}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {buildings.map((b) => (
          <BuildingCard key={b.id} building={b} unitCount={b.units.length} />
        ))}
      </div>
    </section>
  );
}

function BuildingCard({ building, unitCount }: { building: Building; unitCount: number }) {
  const t = useTranslations('propertyDetail.buildings');
  const address = [
    `${building.street} ${building.houseNumber}`.trim(),
    [building.postalCode, building.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {building.label || building.nickname || `${building.street} ${building.houseNumber}`}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{address}</p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <Stat label={t('units')} value={String(unitCount)} />
        <Stat
          label={t('yearBuilt')}
          value={building.yearBuilt ? String(building.yearBuilt) : '—'}
        />
        <Stat
          label={t('floors')}
          value={building.floorsCount ? String(building.floorsCount) : '—'}
        />
        <Stat
          label={t('elevator')}
          value={
            building.hasElevator === undefined ? '—' : building.hasElevator ? t('yes') : t('no')
          }
        />
        <Stat label={t('heating')} value={building.heating || '—'} />
        <Stat label={t('energy')} value={building.energyStandard || '—'} />
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value}</p>
    </div>
  );
}

import { useTranslations } from 'next-intl';
import type { PropertyDetail } from '@buena/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface GeneralInfoProps {
  property: PropertyDetail;
}

export function GeneralInfo({ property }: GeneralInfoProps) {
  const t = useTranslations('propertyDetail.general');
  const fields: Array<[string, string | undefined]> = [
    [t('uniqueNumber'), property.uniqueNumber],
    [t('grundbuchOffice'), property.grundbuchOffice],
    [t('grundbuchSheet'), property.grundbuchSheet],
    [t('gemarkung'), property.gemarkung],
    [t('flur'), property.flur],
    [t('flurstueck'), property.flurstueck],
    [t('notarialRollNo'), property.notarialRollNo],
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
          {fields.map(([label, value]) => (
            <Field key={label} label={label} value={value} />
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

function Field({ label, value }: { label: string; value: string | undefined | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value || '—'}</dd>
    </div>
  );
}

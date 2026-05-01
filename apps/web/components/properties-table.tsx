'use client';

import { Building2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PropertyListItem } from '@buena/shared';
import { Link } from '@/i18n/navigation';
import { useProperties } from '@/lib/hooks/use-properties';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';

export function PropertiesTable() {
  const t = useTranslations('dashboard');
  const tErr = useTranslations('errors');
  const { data, isPending, isError, refetch, isFetching } = useProperties();

  if (isPending) return <PropertiesTableSkeleton />;

  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-12 text-center"
      >
        <p className="text-sm font-medium text-foreground">{tErr('generic')}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw
            className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
            aria-hidden="true"
          />
          {tErr('tryAgain')}
        </Button>
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title={t('empty')}
        action={
          <Button asChild>
            <Link href="/properties/new">{t('createCta')}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t('columns.name')}</TableHead>
            <TableHead className="w-[120px]">{t('columns.type')}</TableHead>
            <TableHead className="w-[200px]">{t('columns.number')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((property) => (
            <PropertyRow key={property.id} property={property} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PropertyRow({ property }: { property: PropertyListItem }) {
  const t = useTranslations('dashboard');
  return (
    <TableRow className="group relative cursor-pointer focus-within:bg-muted/50">
      <TableCell className="font-medium text-foreground">
        <Link
          href={`/properties/${property.id}`}
          className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('rowAriaLabel', { name: property.name })}
        >
          {property.name}
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant={property.managementType === 'WEG' ? 'weg' : 'mv'}>
          {property.managementType}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {property.uniqueNumber}
      </TableCell>
    </TableRow>
  );
}

function PropertiesTableSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-hidden="true"
      data-testid="properties-skeleton"
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>
              <Skeleton className="h-4 w-16" />
            </TableHead>
            <TableHead className="w-[120px]">
              <Skeleton className="h-4 w-12" />
            </TableHead>
            <TableHead className="w-[200px]">
              <Skeleton className="h-4 w-20" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, idx) => (
            <TableRow key={idx} className="hover:bg-transparent">
              <TableCell>
                <Skeleton className="h-4 w-48" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-12 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

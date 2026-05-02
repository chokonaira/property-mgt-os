'use client';

import { ArrowLeft, FileSearch, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { usePropertyDetail } from '@/lib/hooks/use-property-detail';
import { useDeleteProperty } from '@/lib/hooks/use-delete-property';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog, useConfirm } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Link, useRouter } from '@/i18n/navigation';
import { GeneralInfo } from './general-info';
import { BuildingsSection } from './buildings-section';
import { UnitsSection } from './units-section';

interface DetailViewProps {
  id: string;
}

export function PropertyDetailView({ id }: DetailViewProps) {
  const t = useTranslations('propertyDetail');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const { data, isPending, isError, error, refetch, isFetching } = usePropertyDetail(id);
  const deleteProperty = useDeleteProperty();
  const { confirm, dialogProps } = useConfirm();

  async function handleDelete(propertyName: string) {
    const ok = await confirm({
      title: t('delete.title'),
      description: t('delete.description', { name: propertyName }),
      confirmLabel: t('delete.confirmLabel'),
      variant: 'destructive',
    });
    if (!ok) return;
    deleteProperty.mutate(id, {
      onSuccess: () => {
        toast.success(t('delete.toast'));
        router.replace('/');
      },
      onError: () => {
        toast.error(t('delete.errorToast'));
      },
    });
  }

  if (isPending) return <DetailSkeleton />;

  if (isError) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <EmptyState
          icon={FileSearch}
          title={t('notFound.title')}
          description={t('notFound.description')}
          action={
            <Button asChild variant="outline">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>{tErr('backToDashboard')}</span>
              </Link>
            </Button>
          }
        />
      );
    }
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

  const property = data;
  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-30 -mx-4 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:-mx-6 sm:px-6 sm:py-4 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex flex-col gap-1">
            <Button asChild variant="ghost" size="sm" className="-ml-2 h-7 self-start px-2 text-xs">
              <Link href="/">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tErr('backToDashboard')}</span>
              </Link>
            </Button>
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {property.name}
            </h1>
            <p className="font-mono text-[11px] text-muted-foreground">{property.uniqueNumber}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDelete(property.name)}
            disabled={deleteProperty.isPending}
            className="self-start text-destructive hover:bg-destructive/10 hover:text-destructive sm:self-auto"
            aria-label={t('delete.cta')}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t('delete.cta')}
          </Button>
        </div>
      </header>
      <div className="flex flex-col gap-8 pt-6">
        <GeneralInfo property={property} />
        <BuildingsSection buildings={property.buildings} />
        <UnitsSection buildings={property.buildings} totalMea={property.totalMea} />
      </div>
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

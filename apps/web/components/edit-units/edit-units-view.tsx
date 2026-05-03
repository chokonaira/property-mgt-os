'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileSearch, Loader2, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { type ReplaceUnitWithId } from '@buena/shared';
import { ApiError } from '@/lib/api-client';
import { usePropertyDetail } from '@/lib/hooks/use-property-detail';
import { useReplaceUnits } from '@/lib/hooks/use-replace-units';
import {
  WIZARD_DRAFT_DEFAULTS,
  WizardDraftSchema,
  type WizardDraft,
  type WizardDraftInput,
  type WizardUnitDraft,
} from '@/lib/schemas/wizard-draft';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Link, useRouter } from '@/i18n/navigation';
import { useWizard } from '@/components/wizard/wizard-context';
import { EditUnitsProvider } from './edit-units-context';
import { propertyDetailToWizardDraft, wizardUnitToReplacePayload } from './unit-mapper';

const UnitTable = dynamic(
  () => import('@/components/unit-table/unit-table').then((mod) => mod.UnitTable),
  {
    loading: () => <UnitTableLoading />,
  },
);

interface EditUnitsViewProps {
  id: string;
}

/**
 * Edit-units page. Loads the property detail, pre-fills an RHF form
 * with the same WizardDraft shape the create-wizard uses, and
 * mounts the existing UnitTable so the user gets the entire bulk-
 * entry surface (paste TSV, generate, import, validation summary,
 * MEA bar) for editing already-saved units.
 *
 * Save flow:
 *   1. trigger('units') — runs the same Zod schema the create flow
 *      uses; surfaces inline errors via the validation banner.
 *   2. If valid, map back to ReplaceUnitWithId payload (preserves
 *      `id` for existing rows so the server can UPDATE in place
 *      instead of DELETE + INSERT — the audit trail then reads as
 *      "Demo User edited Unit #07" instead of two churn entries).
 *   3. PUT /properties/:id/units → server diffs + emits audit rows
 *      per touched unit.
 *   4. Toast → router.replace back to detail.
 */
export function EditUnitsView({ id }: EditUnitsViewProps) {
  const t = useTranslations('editUnits');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const detail = usePropertyDetail(id);
  const replaceUnits = useReplaceUnits();

  // Map the saved property into the wizard's draft input shape so
  // the same UnitTable + dialogs render unchanged. Memoised on the
  // detail data reference; React Query keeps that stable until a
  // refetch lands.
  const initialValues = useMemo<WizardDraftInput>(() => {
    if (!detail.data) return WIZARD_DRAFT_DEFAULTS;
    return propertyDetailToWizardDraft(detail.data);
  }, [detail.data]);

  const methods = useForm<WizardDraftInput, unknown, WizardDraft>({
    defaultValues: initialValues,
    values: initialValues,
    resolver: zodResolver(WizardDraftSchema),
    mode: 'onTouched',
  });

  const [errorsFlashed, setErrorsFlashed] = useState(false);

  if (detail.isPending) return <Loading />;

  if (detail.isError) {
    if (detail.error instanceof ApiError && detail.error.status === 404) {
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
      <p role="alert" className="text-sm text-destructive">
        {tErr('generic')}
      </p>
    );
  }

  const property = detail.data;

  async function handleSave() {
    const ok = await methods.trigger('units');

    if (!ok) {
      setErrorsFlashed(true);
      toast.error(t('toastInvalid'));
      return;
    }

    setErrorsFlashed(false);

    const draft = methods.getValues();
    const payload: ReplaceUnitWithId[] = (draft.units as WizardUnitDraft[]).map(
      wizardUnitToReplacePayload,
    );

    replaceUnits.mutate(
      { propertyId: id, body: { units: payload } },
      {
        onSuccess: () => {
          toast.success(t('toastSaved'));
          router.replace(`/properties/${id}`);
        },
        onError: (err: ApiError) => {
          toast.error(err.body?.message ?? t('toastError'));
        },
      },
    );
  }

  return (
    <FormProvider {...methods}>
      {/* EditUnitsProvider mounts a stub WizardContext so UnitTable
          mounts unchanged. errorsFlashed is propagated by toggling
          the provider's inner errorsVisible via the validation
          attempt above (UnitTable reads it through the same
          useWizard hook the create-flow uses). */}
      <EditUnitsProvider>
        <ErrorsFlashBridge flash={errorsFlashed} />
        <div className="flex flex-col gap-6">
          {/* Negative-margin pattern matches the wizard chrome +
              the property-detail header: the parent <main> applies
              the page padding, the header expands back out via -mx
              to span full-bleed so the sticky bar aligns visually
              with the page edge while content stays inset. The
              inner div restores the padding so the title + buttons
              still align with the table below. */}
          <header className="sticky top-0 z-30 -mx-4 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:-mx-6 sm:px-6 sm:py-4 lg:-mx-8 lg:px-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-1">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="-ml-2 h-7 self-start px-2 text-xs"
                >
                  <Link href={`/properties/${id}`}>
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('back')}</span>
                  </Link>
                </Button>
                <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-2xl">
                  {t('title', { name: property.name })}
                </h1>
                <p className="hidden text-xs text-muted-foreground sm:block sm:text-sm">
                  {t('subtitle')}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <Button asChild variant="outline" size="sm" className="sm:size-default">
                  <Link href={`/properties/${id}`}>{t('cancel')}</Link>
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={replaceUnits.isPending}
                  size="sm"
                  className="sm:size-default"
                >
                  {replaceUnits.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{t('save')}</span>
                </Button>
              </div>
            </div>
          </header>

          <UnitTable />
        </div>
      </EditUnitsProvider>
    </FormProvider>
  );
}

/**
 * Bridges the page-local `errorsFlashed` flag into the EditUnitsProvider's
 * `errorsVisible` state so UnitTable's red borders + the validation
 * summary banner light up after the first failed Save attempt. Lives
 * INSIDE the provider so it can call `useWizard().setErrorsVisible`.
 */
function ErrorsFlashBridge({ flash }: { flash: boolean }) {
  const { setErrorsVisible } = useWizard();

  useEffect(() => {
    if (flash) {
      setErrorsVisible(true);
    }
  }, [flash, setErrorsVisible]);

  return null;
}

function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function UnitTableLoading() {
  return <Skeleton className="h-72 w-full" />;
}
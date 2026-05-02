'use client';

import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { AlertCircle, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ContactCombobox } from '@/components/contact-combobox';
import dynamic from 'next/dynamic';
import { PdfUploader } from '@/components/pdf-uploader';
// Import the always-present components from their direct files, NOT
// the barrel — pulling through the index would defeat the lazy-load
// below because webpack treats the barrel as a single module and
// includes every re-export in step 1's initial chunk.
import {
  ExtractionErrorBanner,
  ExtractionLoading,
} from '@/components/ai-extraction-review/extraction-status';
import { FieldChip } from '@/components/ai-extraction-review/field-chip';

// AiReviewPanel only renders after extraction succeeds — defer the
// chunk (confidence chips, source-span popovers, accept/discard
// affordances, extraction-warnings rollup) until the user actually
// clicks "Use AI to extract". Step 1's first-load JS drops because
// the panel + its tree (Radix Popover, ConfidenceChip,
// SourceSpanPopover, ExtractionWarnings) is no longer in the initial
// route bundle. ssr: false because the panel is purely interactive and
// post-mutation; nothing to pre-render.
const AiReviewPanel = dynamic(
  () =>
    import('@/components/ai-extraction-review/ai-review-panel').then(
      (mod) => mod.AiReviewPanel,
    ),
  { ssr: false },
);
import { useUploadDocument } from '@/lib/hooks/use-upload-document';
import { useExtractDocument } from '@/lib/hooks/use-extract-document';
import { useUniqueNumberCheck } from '@/lib/hooks/use-unique-number-check';
import { extractionToWizardDraft } from '@/lib/extraction-to-wizard-draft';
import { extractionErrorKey } from '@/lib/extraction-error-key';
import { logExtractionFailure } from '@/lib/extraction-logger';
import { useStepValidator, useWizard } from './wizard-context';
import { SegmentedControl } from './segmented-control';
import type { WizardDraftInput } from '@/lib/schemas/wizard-draft';
import { cn } from '@/lib/utils';

const MANAGEMENT_OPTIONS = [
  { value: 'WEG', label: 'WEG' },
  { value: 'MV', label: 'MV' },
] as const;

export function GeneralInfoForm() {
  const t = useTranslations('wizard.general');
  const tErrors = useTranslations('wizard.general.errors');
  const ids = {
    managementType: useId(),
    name: useId(),
    uniqueNumber: useId(),
    totalMea: useId(),
    manager: useId(),
    accountant: useId(),
  };

  const {
    control,
    register,
    formState: { errors, touchedFields },
    watch,
    trigger,
    reset: resetForm,
    getValues,
  } = useFormContext<WizardDraftInput>();
  const {
    setStepValid,
    declarationFile,
    setDeclarationFile,
    setExtractionMeta,
    markFieldEdited,
    errorsVisible,
  } = useWizard();
  const tExtraction = useTranslations('extraction');
  const upload = useUploadDocument();
  const extract = useExtractDocument();
  const isUploading = upload.isPending;
  const isExtracting = extract.isPending;
  const extractionResult = extract.data;
  const extractionError = upload.error ?? extract.error;

  const managementType = watch('general.managementType');
  const uniqueNumber = watch('general.uniqueNumber') ?? '';
  const status = useUniqueNumberCheck(uniqueNumber.trim());
  const isUnavailable = status.kind === 'taken';
  const isProbeError = status.kind === 'error';

  // Treat 'pending' AND 'error' as not-yet-passed: a transient
  // /properties?uniqueNumber=… failure must not advance the user past
  // an unchecked number.
  const probeOk = status.kind === 'available' || status.kind === 'idle';

  // The wizard chrome's Next calls validateStep('general'). Registered
  // validator runs both schema + uniqueness; only `available` (or
  // 'idle' for empty input, which schema then rejects on min(1))
  // counts as passed.
  const validator = useCallback(async () => {
    const schemaOk = await trigger([
      'general.managementType',
      'general.name',
      'general.uniqueNumber',
    ]);
    return schemaOk && probeOk;
  }, [trigger, probeOk]);
  useStepValidator('general', validator);

  // Live-sync validity so the indicator + Next button reflect state on
  // every keystroke without waiting for a click.
  useEffect(() => {
    let cancelled = false;
    const fields = ['general.managementType', 'general.name', 'general.uniqueNumber'] as const;
    void (async () => {
      const ok = await trigger(fields);
      if (!cancelled) setStepValid('general', ok && probeOk);
    })();
    return () => {
      cancelled = true;
    };
  }, [managementType, uniqueNumber, probeOk, trigger, setStepValid]);

  const generalErrors = errors.general;
  // Only surface schema errors after the user has interacted with
  // the field (or hit Save). The wizard runs `trigger()` continuously
  // to feed the validity gate, so error.message is populated from
  // first render — without this gate the user sees red flags on a
  // blank form they haven't touched.
  const generalTouched = touchedFields.general;
  const fieldErrorVisible = (touched: boolean | undefined): boolean =>
    Boolean(touched) || errorsVisible;
  const nameError = fieldErrorVisible(generalTouched?.name)
    ? generalErrors?.name?.message
    : undefined;
  const uniqueError = fieldErrorVisible(generalTouched?.uniqueNumber)
    ? generalErrors?.uniqueNumber?.message
    : undefined;
  const managerError = fieldErrorVisible(generalTouched?.propertyManagerId)
    ? generalErrors?.propertyManagerId?.message
    : undefined;
  const accountantError = fieldErrorVisible(generalTouched?.accountantId)
    ? generalErrors?.accountantId?.message
    : undefined;
  const probeErrorMessage = isUnavailable
    ? tErrors('uniqueTaken')
    : isProbeError
      ? tErrors('uniqueProbeFailed')
      : undefined;
  const handleSkipExtraction = () => {
    setDeclarationFile(undefined);
    upload.reset();
    extract.reset();
  };

  const runExtraction = useCallback(
    async (file: File, force = false) => {
      try {
        const uploaded = await upload.mutateAsync(file);
        await extract.mutateAsync({ documentId: uploaded.id, force });
      } catch {
        // Errors are surfaced via the ExtractionErrorBanner; no toast
        // needed here so the user only sees one signal.
      }
    },
    [upload, extract],
  );

  const handleUseExtraction = () => {
    if (!declarationFile) return;
    void runExtraction(declarationFile);
  };

  const handleRetryExtraction = () => {
    if (!declarationFile) return;
    upload.reset();
    extract.reset();
    void runExtraction(declarationFile, true);
  };

  const handleDismissError = useCallback(() => {
    setDeclarationFile(undefined);
    upload.reset();
    extract.reset();
  }, [setDeclarationFile, upload, extract]);

  // Log every extraction-pipeline failure exactly once with the
  // documentId we attempted (so prompt-iteration triage can correlate
  // an ExtractionRun row with the user-facing error). The effect
  // guards against re-firing for the same error reference; React
  // Query keeps it stable until the mutation runs again.
  const lastLoggedError = useRef<unknown>(null);
  useEffect(() => {
    if (!extractionError) {
      lastLoggedError.current = null;
      return;
    }
    if (lastLoggedError.current === extractionError) return;
    lastLoggedError.current = extractionError;
    // Document id, not run id. The ExtractionRunResponse's `runId`
    // is the run's primary key (only present on success); on the
    // failure path the documentId is the most we know — what we
    // tried to extract.
    logExtractionFailure(upload.data?.id, extractionError);
  }, [extractionError, upload.data]);

  // Memoised so the panel and the accept handler share one
  // translation pass; cheap, but obvious correctness vs. recomputing
  // the same draft + droppedUnits twice per render.
  const translation = useMemo(
    () => (extractionResult ? extractionToWizardDraft(extractionResult.extraction) : null),
    [extractionResult],
  );

  const handleAcceptExtraction = useCallback(() => {
    if (!extractionResult || !translation) return;
    const { draft, droppedUnits } = translation;
    // Preserve any contact ids the user had already picked — extraction
    // never proposes contacts (we never claim to disambiguate names
    // against the local contact directory), so prior picks survive.
    const current = getValues();
    resetForm(
      {
        ...draft,
        general: {
          ...draft.general,
          ...(current.general.propertyManagerId
            ? { propertyManagerId: current.general.propertyManagerId }
            : {}),
          ...(current.general.accountantId
            ? { accountantId: current.general.accountantId }
            : {}),
        },
      },
      { keepDirty: false, keepTouched: false },
    );
    // Persist the per-field provenance maps so post-accept inputs can
    // render inline confidence chips + source popovers next to each
    // AI-populated value (T-505 AC: chips stay until the user edits).
    setExtractionMeta({
      confidenceByField: extractionResult.extraction.confidenceByField,
      sourceSpansByField: extractionResult.extraction.sourceSpansByField,
    });
    extract.reset();
    upload.reset();
    setDeclarationFile(undefined);
    toast.success(
      droppedUnits > 0
        ? tExtraction('toasts.acceptedWithDropped', { count: droppedUnits })
        : tExtraction('toasts.accepted'),
    );
  }, [
    extractionResult,
    translation,
    getValues,
    resetForm,
    extract,
    upload,
    setDeclarationFile,
    setExtractionMeta,
    tExtraction,
  ]);

  const handleDiscardExtraction = useCallback(() => {
    extract.reset();
    upload.reset();
  }, [extract, upload]);

  const droppedUnits = translation?.droppedUnits ?? 0;

  const showLoading = (isUploading || isExtracting) && !extractionResult;
  const showError = !showLoading && extractionError && !extractionResult;
  const showPanel = !showLoading && !showError && extractionResult;

  // Anchor the loading / error / panel block + scroll it into view
  // whenever its visibility flips. The PDF uploader sits at the bottom
  // of the form, so without this the user clicks "Use AI to extract"
  // and the result lands two screens above their viewport — invisible
  // until they scroll up. Plus a toast on error so the failure surface
  // never depends on the user's scroll position.
  const feedbackAnchorRef = useRef<HTMLDivElement | null>(null);
  const lastToastedError = useRef<unknown>(null);
  useEffect(() => {
    if (!(showLoading || showError || showPanel)) return;
    feedbackAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [showLoading, showError, showPanel]);
  useEffect(() => {
    if (!showError || !extractionError) {
      lastToastedError.current = null;
      return;
    }
    if (lastToastedError.current === extractionError) return;
    lastToastedError.current = extractionError;
    const key = extractionErrorKey(extractionError);
    toast.error(tExtraction(`status.errors.${key}`));
  }, [showError, extractionError, tExtraction]);

  return (
    <form className="flex flex-col gap-6" noValidate>
      <div ref={feedbackAnchorRef} aria-hidden="true" className="-mb-6 scroll-mt-32" />

      {/* Upload-to-prefill card. Pinned to the top of step 1 because
          the Teilungserklärung is the source of truth for ALL three
          wizard steps (general + buildings + units), not just step 1.
          Modern resume-parser pattern: dropping the doc here means the
          user reviews instead of typing — the wedge of the whole flow.
          Gated to WEG only because MV-managed properties don't have a
          Teilungserklärung. */}
      {managementType === 'WEG' && !showLoading && !showPanel ? (
        <section
          aria-labelledby="prefill-heading"
          className="rounded-lg border border-primary/30 bg-primary/5 p-4 shadow-sm sm:p-5"
        >
          <header className="flex items-start gap-3">
            <Sparkles
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="flex flex-col gap-0.5">
              <h2
                id="prefill-heading"
                className="text-sm font-semibold text-foreground"
              >
                {t('upload.prefillTitle')}
              </h2>
              <p className="text-xs text-muted-foreground">{t('upload.prefillHelp')}</p>
            </div>
          </header>
          <div className="mt-4 flex flex-col gap-3">
            <PdfUploader value={declarationFile} onChange={setDeclarationFile} />
            {declarationFile ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  onClick={handleUseExtraction}
                  className="sm:flex-1"
                  disabled={showLoading || Boolean(extractionResult)}
                >
                  {showLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  )}
                  {t('upload.useAi')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSkipExtraction}
                  className="sm:flex-1"
                  disabled={showLoading}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  {t('upload.skipManual')}
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {showLoading ? (
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300">
          <ExtractionLoading stage={isUploading ? 'uploading' : 'extracting'} />
        </div>
      ) : null}
      {showError ? (
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300">
          <ExtractionErrorBanner
            error={extractionError}
            onRetry={handleRetryExtraction}
            onDismiss={handleDismissError}
          />
        </div>
      ) : null}
      {showPanel ? (
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300">
          <AiReviewPanel
            result={extractionResult}
            onAccept={handleAcceptExtraction}
            onDiscard={handleDiscardExtraction}
            droppedUnits={droppedUnits}
          />
        </div>
      ) : null}

      {managementType === 'WEG' && !showLoading && !showPanel ? (
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>{t('upload.orManual')}</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      ) : null}

      <Field
        label={t('managementType.label')}
        htmlFor={ids.managementType}
        description={t('managementType.help')}
        required
        adornment={<FieldChip path="property.managementType" fieldLabel={t('managementType.label')} />}
      >
        <Controller
          control={control}
          name="general.managementType"
          render={({ field }) => (
            <SegmentedControl
              name="management-type"
              ariaLabel={t('managementType.label')}
              value={field.value}
              onChange={(v) => {
                markFieldEdited('property.managementType');
                field.onChange(v);
              }}
              options={MANAGEMENT_OPTIONS}
            />
          )}
        />
      </Field>

      <Field
        label={t('name.label')}
        htmlFor={ids.name}
        error={nameError}
        required
        adornment={<FieldChip path="property.name" fieldLabel={t('name.label')} />}
      >
        <Input
          id={ids.name}
          type="text"
          autoComplete="organization"
          maxLength={200}
          aria-invalid={Boolean(nameError) || undefined}
          aria-describedby={nameError ? `${ids.name}-error` : undefined}
          {...register('general.name', {
            onChange: () => markFieldEdited('property.name'),
          })}
        />
      </Field>

      <Field
        label={t('uniqueNumber.label')}
        htmlFor={ids.uniqueNumber}
        description={t('uniqueNumber.help')}
        required
        adornment={<FieldChip path="property.uniqueNumber" fieldLabel={t('uniqueNumber.label')} />}
        error={uniqueError ?? probeErrorMessage}
        hint={
          status.kind === 'pending' ? (
            <Hint
              icon={<Loader2 className="h-3 w-3 animate-spin" />}
              text={t('uniqueNumber.checking')}
            />
          ) : status.kind === 'available' ? (
            <Hint
              icon={<CheckCircle2 className="h-3 w-3 text-success" />}
              text={t('uniqueNumber.available')}
            />
          ) : null
        }
      >
        <Input
          id={ids.uniqueNumber}
          type="text"
          autoComplete="off"
          maxLength={64}
          aria-invalid={Boolean(uniqueError) || isUnavailable || isProbeError || undefined}
          aria-describedby={
            uniqueError || probeErrorMessage
              ? `${ids.uniqueNumber}-error`
              : `${ids.uniqueNumber}-hint`
          }
          {...register('general.uniqueNumber', {
            onChange: () => markFieldEdited('property.uniqueNumber'),
          })}
        />
      </Field>

      {managementType === 'WEG' ? (
        <Field
          label={t('totalMea.label')}
          htmlFor={ids.totalMea}
          description={t('totalMea.help')}
          adornment={<FieldChip path="property.totalMea" fieldLabel={t('totalMea.label')} />}
        >
          <Input
            id={ids.totalMea}
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            max={10000}
            {...register('general.totalMea', {
              setValueAs: (raw: unknown) => {
                if (raw === '' || raw === null || raw === undefined) return undefined;
                const n = typeof raw === 'number' ? raw : Number(raw);
                return Number.isFinite(n) ? n : undefined;
              },
              onChange: () => markFieldEdited('property.totalMea'),
            })}
          />
        </Field>
      ) : null}

      <Field
        label={t('manager.label')}
        htmlFor={ids.manager}
        description={t('manager.help')}
        error={managerError}
      >
        <Controller
          control={control}
          name="general.propertyManagerId"
          render={({ field }) => (
            <ContactCombobox
              id={ids.manager}
              role="PROPERTY_MANAGER"
              value={field.value ?? undefined}
              onChange={(v) => field.onChange(v ?? null)}
              ariaInvalid={Boolean(managerError) || undefined}
              ariaDescribedBy={managerError ? `${ids.manager}-error` : undefined}
            />
          )}
        />
      </Field>

      <Field
        label={t('accountant.label')}
        htmlFor={ids.accountant}
        description={t('accountant.help')}
        error={accountantError}
      >
        <Controller
          control={control}
          name="general.accountantId"
          render={({ field }) => (
            <ContactCombobox
              id={ids.accountant}
              role="ACCOUNTANT"
              value={field.value ?? undefined}
              onChange={(v) => field.onChange(v ?? null)}
              ariaInvalid={Boolean(accountantError) || undefined}
              ariaDescribedBy={accountantError ? `${ids.accountant}-error` : undefined}
            />
          )}
        />
      </Field>

    </form>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  description?: string;
  error?: string;
  hint?: React.ReactNode;
  /** Optional inline affordance rendered next to the label (e.g. an AI provenance chip). */
  adornment?: React.ReactNode;
  /** Marks the field with an asterisk for sighted users + the standard `required` semantic. */
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, htmlFor, description, error, hint, adornment, required, children }: FieldProps) {
  const errorId = error ? `${htmlFor}-error` : undefined;
  const hintId = !error && hint ? `${htmlFor}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-destructive">*</span> : null}
        </Label>
        {adornment}
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {children}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className={cn('flex items-center gap-1 text-xs text-destructive')}
        >
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Hint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {icon}
      <span>{text}</span>
    </span>
  );
}

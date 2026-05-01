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
import { PdfUploader } from '@/components/pdf-uploader';
import {
  AiReviewPanel,
  ExtractionErrorBanner,
  ExtractionLoading,
  FieldChip,
} from '@/components/ai-extraction-review';
import { useUploadDocument } from '@/lib/hooks/use-upload-document';
import { useExtractDocument } from '@/lib/hooks/use-extract-document';
import { useUniqueNumberCheck } from '@/lib/hooks/use-unique-number-check';
import { extractionToWizardDraft } from '@/lib/extraction-to-wizard-draft';
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
    manager: useId(),
    accountant: useId(),
  };

  const {
    control,
    register,
    formState: { errors },
    watch,
    trigger,
    reset: resetForm,
    getValues,
  } = useFormContext<WizardDraftInput>();
  const { setStepValid, declarationFile, setDeclarationFile, setExtractionMeta, markFieldEdited } =
    useWizard();
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
  const nameError = generalErrors?.name?.message;
  const uniqueError = generalErrors?.uniqueNumber?.message;
  const managerError = generalErrors?.propertyManagerId?.message;
  const accountantError = generalErrors?.accountantId?.message;
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
    const documentId = extract.data?.runId ?? upload.data?.id;
    logExtractionFailure(documentId, extractionError);
  }, [extractionError, extract.data, upload.data]);

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

  return (
    <form className="flex flex-col gap-6" noValidate>
      {showLoading ? (
        <ExtractionLoading stage={isUploading ? 'uploading' : 'extracting'} />
      ) : null}
      {showError ? (
        <ExtractionErrorBanner
          error={extractionError}
          onRetry={handleRetryExtraction}
          onDismiss={handleDismissError}
        />
      ) : null}
      {showPanel ? (
        <AiReviewPanel
          result={extractionResult}
          onAccept={handleAcceptExtraction}
          onDiscard={handleDiscardExtraction}
          droppedUnits={droppedUnits}
        />
      ) : null}

      <Field
        label={t('managementType.label')}
        htmlFor={ids.managementType}
        description={t('managementType.help')}
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

      {managementType === 'WEG' ? (
        <Field label={t('upload.label')} htmlFor="declaration-pdf" description={t('upload.help')}>
          <div className="flex flex-col gap-3">
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
        </Field>
      ) : null}
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
  children: React.ReactNode;
}

function Field({ label, htmlFor, description, error, hint, adornment, children }: FieldProps) {
  const errorId = error ? `${htmlFor}-error` : undefined;
  const hintId = !error && hint ? `${htmlFor}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
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

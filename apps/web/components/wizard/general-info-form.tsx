'use client';

import { useCallback, useEffect, useId } from 'react';
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
} from '@/components/ai-extraction-review';
import { useUploadDocument } from '@/lib/hooks/use-upload-document';
import { useExtractDocument } from '@/lib/hooks/use-extract-document';
import { useUniqueNumberCheck } from '@/lib/hooks/use-unique-number-check';
import { extractionToWizardDraft } from '@/lib/extraction-to-wizard-draft';
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
  const { setStepValid, declarationFile, setDeclarationFile } = useWizard();
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

  const handleAcceptExtraction = useCallback(() => {
    if (!extractionResult) return;
    const { draft, droppedUnits } = extractionToWizardDraft(extractionResult.extraction);
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
    extract.reset();
    upload.reset();
    setDeclarationFile(undefined);
    toast.success(
      droppedUnits > 0
        ? tExtraction('toasts.acceptedWithDropped', { count: droppedUnits })
        : tExtraction('toasts.accepted'),
    );
  }, [extractionResult, getValues, resetForm, extract, upload, setDeclarationFile, tExtraction]);

  const handleDiscardExtraction = useCallback(() => {
    extract.reset();
    upload.reset();
  }, [extract, upload]);

  const droppedUnits = extractionResult
    ? extractionToWizardDraft(extractionResult.extraction).droppedUnits
    : 0;

  const showLoading = (isUploading || isExtracting) && !extractionResult;
  const showError = !showLoading && extractionError && !extractionResult;
  const showPanel = !showLoading && !showError && extractionResult;

  return (
    <form className="flex flex-col gap-6" noValidate>
      {showLoading ? (
        <ExtractionLoading stage={isUploading ? 'uploading' : 'extracting'} />
      ) : null}
      {showError ? (
        <ExtractionErrorBanner error={extractionError} onRetry={handleRetryExtraction} />
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
      >
        <Controller
          control={control}
          name="general.managementType"
          render={({ field }) => (
            <SegmentedControl
              name="management-type"
              ariaLabel={t('managementType.label')}
              value={field.value}
              onChange={(v) => field.onChange(v)}
              options={MANAGEMENT_OPTIONS}
            />
          )}
        />
      </Field>

      <Field label={t('name.label')} htmlFor={ids.name} error={nameError}>
        <Input
          id={ids.name}
          type="text"
          autoComplete="organization"
          maxLength={200}
          aria-invalid={Boolean(nameError) || undefined}
          aria-describedby={nameError ? `${ids.name}-error` : undefined}
          {...register('general.name')}
        />
      </Field>

      <Field
        label={t('uniqueNumber.label')}
        htmlFor={ids.uniqueNumber}
        description={t('uniqueNumber.help')}
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
          {...register('general.uniqueNumber')}
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
  children: React.ReactNode;
}

function Field({ label, htmlFor, description, error, hint, children }: FieldProps) {
  const errorId = error ? `${htmlFor}-error` : undefined;
  const hintId = !error && hint ? `${htmlFor}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
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

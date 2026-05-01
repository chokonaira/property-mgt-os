'use client';

import { useEffect, useId, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ContactCombobox } from '@/components/contact-combobox';
import { PdfUploader } from '@/components/pdf-uploader';
import { useUniqueNumberCheck } from '@/lib/hooks/use-unique-number-check';
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
  } = useFormContext<WizardDraftInput>();
  const { setStepValid } = useWizard();

  const [declarationFile, setDeclarationFile] = useState<File | undefined>(undefined);

  const managementType = watch('general.managementType');
  const uniqueNumber = watch('general.uniqueNumber') ?? '';
  const status = useUniqueNumberCheck(uniqueNumber.trim());
  const isUnavailable = status.kind === 'taken';

  // Step validator: schema fields + uniqueness check. The wizard chrome's
  // Next button calls validateStep('general') → falls back to RHF trigger
  // when no validator registered. We register here to also gate on the
  // uniqueness probe.
  useStepValidator('general', async () => {
    const schemaOk = await trigger([
      'general.managementType',
      'general.name',
      'general.uniqueNumber',
    ]);
    return schemaOk && !isUnavailable && status.kind !== 'pending';
  });

  // Keep validity in sync as the user types — so the indicator + Next
  // button reflect the live state without waiting for a click.
  useEffect(() => {
    let cancelled = false;
    const fields = ['general.managementType', 'general.name', 'general.uniqueNumber'] as const;
    void (async () => {
      const ok = await trigger(fields);
      if (!cancelled) setStepValid('general', ok && !isUnavailable && status.kind !== 'pending');
    })();
    return () => {
      cancelled = true;
    };
  }, [managementType, uniqueNumber, isUnavailable, status.kind, trigger, setStepValid]);

  const generalErrors = errors.general;
  const nameError = generalErrors?.name?.message;
  const uniqueError = generalErrors?.uniqueNumber?.message;

  return (
    <form className="flex flex-col gap-6" noValidate>
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
        error={uniqueError ?? (isUnavailable ? tErrors('uniqueTaken') : undefined)}
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
          aria-invalid={Boolean(uniqueError) || isUnavailable || undefined}
          aria-describedby={
            uniqueError || isUnavailable ? `${ids.uniqueNumber}-error` : `${ids.uniqueNumber}-hint`
          }
          {...register('general.uniqueNumber')}
        />
      </Field>

      <Field label={t('manager.label')} htmlFor={ids.manager} description={t('manager.help')}>
        <Controller
          control={control}
          name="general.propertyManagerId"
          render={({ field }) => (
            <ContactCombobox
              id={ids.manager}
              role="PROPERTY_MANAGER"
              value={field.value ?? undefined}
              onChange={(v) => field.onChange(v ?? null)}
            />
          )}
        />
      </Field>

      <Field
        label={t('accountant.label')}
        htmlFor={ids.accountant}
        description={t('accountant.help')}
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
            />
          )}
        />
      </Field>

      {managementType === 'WEG' ? (
        <Field label={t('upload.label')} htmlFor="declaration-pdf" description={t('upload.help')}>
          <PdfUploader value={declarationFile} onChange={setDeclarationFile} />
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

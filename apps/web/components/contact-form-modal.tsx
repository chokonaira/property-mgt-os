'use client';

import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  ContactSchema,
  CreateContactRequestSchema,
  type Contact,
  type ContactRole,
  type CreateContactRequest,
} from '@buena/shared';
import { ApiError, apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { zodI18nResolver } from '@/lib/zod-i18n';
import { cn } from '@/lib/utils';

interface ContactFormModalProps {
  role: ContactRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (contact: Contact) => void;
}

type FormValues = Omit<CreateContactRequest, 'role'>;

export function ContactFormModal({ role, open, onOpenChange, onCreated }: ContactFormModalProps) {
  const t = useTranslations('wizard.general.contactForm');
  const tErr = useTranslations('errors');
  const queryClient = useQueryClient();
  const ids = {
    name: useId(),
    street: useId(),
    houseNumber: useId(),
    postalCode: useId(),
    city: useId(),
    email: useId(),
    phone: useId(),
  };
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(CreateContactRequestSchema.omit({ role: true }), {
      errorMap: zodI18nResolver(tErr),
    }),
    mode: 'onTouched',
  });

  useEffect(() => {
    if (!open) {
      reset();
      setSubmitError(null);
    }
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      apiFetch('/contacts', ContactSchema, {
        method: 'POST',
        body: { role, ...values },
      }),
    onSuccess: (contact) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts', 'list', role] });
      onCreated(contact);
      onOpenChange(false);
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.body.message : tErr('generic');
      setSubmitError(message);
    },
  });

  function onSubmit(values: FormValues) {
    setSubmitError(null);
    // Trim every string + drop fields that collapse to empty so a
    // user typing only whitespace into an optional field doesn't
    // persist a blank row. The shared schema enforces the same trim,
    // but trimming client-side keeps the wire payload tidy.
    const compact: FormValues = Object.fromEntries(
      Object.entries(values)
        .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v] as const)
        .filter(([, v]) => v !== '' && v !== undefined),
    ) as FormValues;
    mutation.mutate(compact);
  }

  // Block dismissal — overlay click, Escape, or X — while the request is
  // in flight, otherwise the dialog can vanish before a 422 / 500 has a
  // chance to render its inline error.
  const handleOpenChange = (next: boolean) => {
    if (!next && mutation.isPending) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideClose={mutation.isPending}
        onPointerDownOutside={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {role === 'PROPERTY_MANAGER' ? t('titleManager') : t('titleAccountant')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <FieldRow label={t('name')} htmlFor={ids.name} error={errors.name?.message} required>
            <Input
              id={ids.name}
              autoComplete="organization"
              maxLength={200}
              aria-invalid={Boolean(errors.name) || undefined}
              {...register('name')}
            />
          </FieldRow>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <FieldRow label={t('street')} htmlFor={ids.street} error={errors.street?.message}>
                <Input
                  id={ids.street}
                  autoComplete="address-line1"
                  maxLength={200}
                  {...register('street')}
                />
              </FieldRow>
            </div>
            <FieldRow
              label={t('houseNumber')}
              htmlFor={ids.houseNumber}
              error={errors.houseNumber?.message}
            >
              <Input
                id={ids.houseNumber}
                autoComplete="address-line2"
                maxLength={20}
                {...register('houseNumber')}
              />
            </FieldRow>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FieldRow
              label={t('postalCode')}
              htmlFor={ids.postalCode}
              error={errors.postalCode?.message}
            >
              <Input
                id={ids.postalCode}
                autoComplete="postal-code"
                inputMode="numeric"
                maxLength={5}
                {...register('postalCode')}
              />
            </FieldRow>
            <div className="sm:col-span-2">
              <FieldRow label={t('city')} htmlFor={ids.city} error={errors.city?.message}>
                <Input
                  id={ids.city}
                  autoComplete="address-level2"
                  maxLength={120}
                  {...register('city')}
                />
              </FieldRow>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldRow label={t('email')} htmlFor={ids.email} error={errors.email?.message}>
              <Input id={ids.email} type="email" autoComplete="email" {...register('email')} />
            </FieldRow>
            <FieldRow label={t('phone')} htmlFor={ids.phone} error={errors.phone?.message}>
              <Input
                id={ids.phone}
                type="tel"
                autoComplete="tel"
                maxLength={40}
                {...register('phone')}
              />
            </FieldRow>
          </div>
          {submitError ? (
            <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              {submitError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface FieldRowProps {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function FieldRow({ label, htmlFor, error, required, children }: FieldRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p role="alert" className={cn('flex items-center gap-1 text-xs text-destructive')}>
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

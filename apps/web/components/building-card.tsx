'use client';

import { useId, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WizardDraftInput } from '@/lib/schemas/wizard-draft';
import { cn } from '@/lib/utils';

interface BuildingCardProps {
  index: number;
  isOnly: boolean;
  onRemove: () => void;
}

export function BuildingCard({ index, isOnly, onRemove }: BuildingCardProps) {
  const t = useTranslations('wizard.buildings');
  const {
    register,
    formState: { errors },
    watch,
  } = useFormContext<WizardDraftInput>();

  const [collapsed, setCollapsed] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const ids = {
    street: useId(),
    houseNumber: useId(),
    postalCode: useId(),
    city: useId(),
    label: useId(),
    nickname: useId(),
    yearBuilt: useId(),
    floorsCount: useId(),
    hasElevator: useId(),
    energyStandard: useId(),
    heating: useId(),
    buildingType: useId(),
  };

  const buildingErrors = errors.buildings?.[index] as
    | Partial<Record<keyof WizardDraftInput['buildings'][number], { message?: string }>>
    | undefined;
  const street = watch(`buildings.${index}.street`);
  const houseNumber = watch(`buildings.${index}.houseNumber`);
  const summary = [street, houseNumber].filter(Boolean).join(' ').trim() || t('newBuilding');

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex flex-1 items-center gap-2 text-left text-sm font-semibold text-foreground"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          )}
          <span>
            {t('cardTitle', { index: index + 1 })} ·{' '}
            <span className="text-muted-foreground">{summary}</span>
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={isOnly}
          aria-label={t('remove', { index: index + 1 })}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      {collapsed ? null : (
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <FieldRow
                label={t('street')}
                htmlFor={ids.street}
                error={buildingErrors?.street?.message}
                required
              >
                <Input
                  id={ids.street}
                  autoComplete="address-line1"
                  maxLength={200}
                  aria-invalid={Boolean(buildingErrors?.street) || undefined}
                  {...register(`buildings.${index}.street`)}
                />
              </FieldRow>
            </div>
            <FieldRow
              label={t('houseNumber')}
              htmlFor={ids.houseNumber}
              error={buildingErrors?.houseNumber?.message}
              required
            >
              <Input
                id={ids.houseNumber}
                autoComplete="address-line2"
                maxLength={20}
                aria-invalid={Boolean(buildingErrors?.houseNumber) || undefined}
                {...register(`buildings.${index}.houseNumber`)}
              />
            </FieldRow>
          </div>
          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            className="self-start text-xs font-medium text-primary underline-offset-4 hover:underline"
            aria-expanded={showMore}
          >
            {showMore ? t('showLess') : t('showMore')}
          </button>
          {showMore ? (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FieldRow
                  label={t('postalCode')}
                  htmlFor={ids.postalCode}
                  error={buildingErrors?.postalCode?.message}
                >
                  <Input
                    id={ids.postalCode}
                    autoComplete="postal-code"
                    inputMode="numeric"
                    maxLength={5}
                    {...register(`buildings.${index}.postalCode`)}
                  />
                </FieldRow>
                <div className="sm:col-span-2">
                  <FieldRow
                    label={t('city')}
                    htmlFor={ids.city}
                    error={buildingErrors?.city?.message}
                  >
                    <Input
                      id={ids.city}
                      autoComplete="address-level2"
                      maxLength={120}
                      {...register(`buildings.${index}.city`)}
                    />
                  </FieldRow>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldRow
                  label={t('label')}
                  htmlFor={ids.label}
                  error={buildingErrors?.label?.message}
                  description={t('labelHelp')}
                >
                  <Input id={ids.label} maxLength={64} {...register(`buildings.${index}.label`)} />
                </FieldRow>
                <FieldRow
                  label={t('nickname')}
                  htmlFor={ids.nickname}
                  error={buildingErrors?.nickname?.message}
                  description={t('nicknameHelp')}
                >
                  <Input
                    id={ids.nickname}
                    maxLength={64}
                    {...register(`buildings.${index}.nickname`)}
                  />
                </FieldRow>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FieldRow
                  label={t('yearBuilt')}
                  htmlFor={ids.yearBuilt}
                  error={buildingErrors?.yearBuilt?.message}
                >
                  <Input
                    id={ids.yearBuilt}
                    type="number"
                    inputMode="numeric"
                    min={1800}
                    max={new Date().getFullYear() + 1}
                    {...register(`buildings.${index}.yearBuilt`, {
                      setValueAs: emptyToUndefinedNumber,
                    })}
                  />
                </FieldRow>
                <FieldRow
                  label={t('floorsCount')}
                  htmlFor={ids.floorsCount}
                  error={buildingErrors?.floorsCount?.message}
                >
                  <Input
                    id={ids.floorsCount}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={50}
                    {...register(`buildings.${index}.floorsCount`, {
                      setValueAs: emptyToUndefinedNumber,
                    })}
                  />
                </FieldRow>
                <div className="flex items-end">
                  <label
                    htmlFor={ids.hasElevator}
                    className="inline-flex h-10 cursor-pointer select-none items-center gap-2 text-sm font-medium text-foreground"
                  >
                    <input
                      id={ids.hasElevator}
                      type="checkbox"
                      className="h-4 w-4 rounded border border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                      {...register(`buildings.${index}.hasElevator`)}
                    />
                    {t('hasElevator')}
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FieldRow
                  label={t('energyStandard')}
                  htmlFor={ids.energyStandard}
                  error={buildingErrors?.energyStandard?.message}
                >
                  <Input
                    id={ids.energyStandard}
                    maxLength={40}
                    {...register(`buildings.${index}.energyStandard`)}
                  />
                </FieldRow>
                <FieldRow
                  label={t('heating')}
                  htmlFor={ids.heating}
                  error={buildingErrors?.heating?.message}
                >
                  <Input
                    id={ids.heating}
                    maxLength={60}
                    {...register(`buildings.${index}.heating`)}
                  />
                </FieldRow>
                <FieldRow
                  label={t('buildingType')}
                  htmlFor={ids.buildingType}
                  error={buildingErrors?.buildingType?.message}
                >
                  <Input
                    id={ids.buildingType}
                    maxLength={60}
                    {...register(`buildings.${index}.buildingType`)}
                  />
                </FieldRow>
              </div>
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}

function emptyToUndefinedNumber(raw: unknown): number | undefined {
  if (raw === '' || raw === null || raw === undefined) return undefined;
  const num = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

interface FieldRowProps {
  label: string;
  htmlFor: string;
  error?: string;
  description?: string;
  required?: boolean;
  children: React.ReactNode;
}

function FieldRow({ label, htmlFor, error, description, required, children }: FieldRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {children}
      {error ? (
        <p role="alert" className={cn('text-xs text-destructive')}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

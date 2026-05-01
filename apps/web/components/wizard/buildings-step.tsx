'use client';

import { useCallback, useEffect } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { BuildingCard } from '@/components/building-card';
import { EMPTY_BUILDING, type WizardDraftInput } from '@/lib/schemas/wizard-draft';
import { useStepValidator, useWizard } from './wizard-context';

export function BuildingsStep() {
  const t = useTranslations('wizard.buildings');
  const { control, trigger, watch } = useFormContext<WizardDraftInput>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'buildings',
  });
  const { setStepValid } = useWizard();
  const buildings = watch('buildings');

  const validator = useCallback(async () => {
    return trigger('buildings');
  }, [trigger]);
  useStepValidator('buildings', validator);

  // Deep-equality dependency: any keystroke in any building card mutates
  // the tree, which serialises here so the live-validity sync re-runs.
  const buildingsKey = JSON.stringify(buildings);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await trigger('buildings');
      if (!cancelled) setStepValid('buildings', ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [buildingsKey, trigger, setStepValid]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <BuildingCard
            key={field.id}
            index={index}
            isOnly={fields.length === 1}
            onRemove={() => remove(index)}
          />
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => append(EMPTY_BUILDING)}
        className="self-start"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t('addBuilding')}
      </Button>
    </div>
  );
}

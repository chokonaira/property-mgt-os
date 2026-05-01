'use client';

import { useCallback, useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { UnitTable } from '@/components/unit-table/unit-table';
import { WizardMeaBar } from '@/components/unit-table/mea-bar';
import { useStepValidator, useWizard } from './wizard-context';
import type { WizardDraftInput } from '@/lib/schemas/wizard-draft';

export function UnitsStep() {
  const t = useTranslations('wizard.units');
  const { control, trigger } = useFormContext<WizardDraftInput>();
  const units = useWatch({ control, name: 'units' });
  const { setStepValid } = useWizard();

  const validator = useCallback(async () => trigger('units'), [trigger]);
  useStepValidator('units', validator);

  const unitsKey = JSON.stringify(units);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await trigger('units');
      if (!cancelled) setStepValid('units', ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [unitsKey, trigger, setStepValid]);

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <UnitTable />
      <WizardMeaBar />
    </div>
  );
}

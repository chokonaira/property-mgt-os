'use client';

import { useId, useMemo, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_PREFIX_BY_TYPE,
  GENERATE_MAX_COUNT,
  generateUnits,
} from '@/lib/generate-units';
import {
  WIZARD_UNIT_TYPES,
  type WizardDraftInput,
  type WizardUnitDraft,
  type WizardUnitType,
} from '@/lib/schemas/wizard-draft';
import { cn } from '@/lib/utils';

interface GenerateUnitsDialogProps {
  onGenerate: (rows: WizardUnitDraft[]) => void;
}

/**
 * "Generate N units" quick action. Solves the brief's parking-block
 * case (`5 parking spots described as a range`) in one click and
 * scales up to GENERATE_MAX_COUNT for big ranges.
 *
 * Empty optional template fields stay absent on the draft so the
 * wizard's strict schema surfaces the missing-value error inline if
 * the user forgot to set them. Pre-filled fields skip that nag.
 */
export function GenerateUnitsDialog({ onGenerate }: GenerateUnitsDialogProps) {
  const t = useTranslations('wizard.units.generate');
  const tBuildings = useTranslations('wizard.buildings');
  const { control } = useFormContext<WizardDraftInput>();
  const buildingsWatch = useWatch({ control, name: 'buildings' });
  const buildings = useMemo(() => buildingsWatch ?? [], [buildingsWatch]);

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<WizardUnitType>('APARTMENT');
  const [buildingIndex, setBuildingIndex] = useState(0);
  const [count, setCount] = useState(5);
  const [startAt, setStartAt] = useState(1);
  const [prefixOverride, setPrefixOverride] = useState<string | null>(null);
  const [sizeSqm, setSizeSqm] = useState<string>('');
  const [meaShare, setMeaShare] = useState<string>('');
  const [rooms, setRooms] = useState<string>('');

  const ids = {
    type: useId(),
    building: useId(),
    count: useId(),
    startAt: useId(),
    prefix: useId(),
    size: useId(),
    mea: useId(),
    rooms: useId(),
  };

  const effectivePrefix = prefixOverride ?? DEFAULT_PREFIX_BY_TYPE[type];
  const previewLast =
    count > 0 ? `${effectivePrefix}${String(startAt + count - 1).padStart(2, '0')}` : '';
  const previewFirst =
    count > 0 ? `${effectivePrefix}${String(startAt).padStart(2, '0')}` : '';

  const reset = () => {
    setType('APARTMENT');
    setBuildingIndex(0);
    setCount(5);
    setStartAt(1);
    setPrefixOverride(null);
    setSizeSqm('');
    setMeaShare('');
    setRooms('');
  };

  const handleSubmit = () => {
    const template: { sizeSqm?: number; meaShare?: number; rooms?: number } = {};
    const sizeNum = sizeSqm.trim() === '' ? undefined : Number(sizeSqm);
    const meaNum = meaShare.trim() === '' ? undefined : Number(meaShare);
    const roomsNum = rooms.trim() === '' ? undefined : Number(rooms);
    if (sizeNum !== undefined && Number.isFinite(sizeNum)) template.sizeSqm = sizeNum;
    if (meaNum !== undefined && Number.isFinite(meaNum)) template.meaShare = meaNum;
    if (type === 'APARTMENT' && roomsNum !== undefined && Number.isFinite(roomsNum)) {
      template.rooms = roomsNum;
    }
    const rows = generateUnits({
      type,
      buildingIndex,
      startAt,
      count,
      ...(prefixOverride !== null ? { prefix: prefixOverride } : {}),
      ...(Object.keys(template).length > 0 ? { template } : {}),
    });
    onGenerate(rows);
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {t('cta')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field htmlFor={ids.type} label={t('type')}>
            <select
              id={ids.type}
              value={type}
              onChange={(e) => {
                setType(e.target.value as WizardUnitType);
                setPrefixOverride(null);
              }}
              className={SELECT_CLASS}
            >
              {WIZARD_UNIT_TYPES.map((u) => (
                <option key={u} value={u}>
                  {t(`types.${u}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field htmlFor={ids.building} label={t('building')}>
            <select
              id={ids.building}
              value={buildingIndex}
              onChange={(e) => setBuildingIndex(Number(e.target.value))}
              className={SELECT_CLASS}
            >
              {buildings.map((b, idx) => {
                const summary =
                  b.label || b.nickname || `${b.street ?? ''} ${b.houseNumber ?? ''}`.trim();
                return (
                  <option key={idx} value={idx}>
                    {summary || tBuildings('cardTitle', { index: idx + 1 })}
                  </option>
                );
              })}
            </select>
          </Field>
          <Field htmlFor={ids.count} label={t('count')}>
            <Input
              id={ids.count}
              type="number"
              inputMode="numeric"
              min={1}
              max={GENERATE_MAX_COUNT}
              value={count}
              onChange={(e) => {
                const raw = Number(e.target.value) || 0;
                // Clamp on input — `max` on the <input> only fires
                // on form submission, which we don't use here.
                setCount(Math.min(GENERATE_MAX_COUNT, Math.max(0, raw)));
              }}
            />
          </Field>
          <Field htmlFor={ids.startAt} label={t('startAt')}>
            <Input
              id={ids.startAt}
              type="number"
              inputMode="numeric"
              min={1}
              value={startAt}
              onChange={(e) => setStartAt(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
          <Field
            htmlFor={ids.prefix}
            label={t('prefix')}
            description={t('prefixHelp', { defaultPrefix: DEFAULT_PREFIX_BY_TYPE[type] || '—' })}
            className="sm:col-span-2"
          >
            <Input
              id={ids.prefix}
              value={effectivePrefix}
              onChange={(e) => setPrefixOverride(e.target.value)}
              maxLength={20}
            />
          </Field>
          <Field htmlFor={ids.size} label={t('sizeSqm')}>
            <Input
              id={ids.size}
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={sizeSqm}
              onChange={(e) => setSizeSqm(e.target.value)}
            />
          </Field>
          <Field htmlFor={ids.mea} label={t('meaShare')}>
            <Input
              id={ids.mea}
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              value={meaShare}
              onChange={(e) => setMeaShare(e.target.value)}
            />
          </Field>
          {type === 'APARTMENT' ? (
            <Field htmlFor={ids.rooms} label={t('rooms')}>
              <Input
                id={ids.rooms}
                type="number"
                inputMode="numeric"
                min={0}
                max={50}
                value={rooms}
                onChange={(e) => setRooms(e.target.value)}
              />
            </Field>
          ) : null}
        </div>
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {count > 0
            ? t('preview', { first: previewFirst, last: previewLast, count })
            : t('previewEmpty')}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={count <= 0}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SELECT_CLASS = cn(
  'flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

function Field({
  htmlFor,
  label,
  description,
  children,
  className,
}: {
  htmlFor: string;
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {description ? <p className="text-[11px] text-muted-foreground">{description}</p> : null}
    </div>
  );
}

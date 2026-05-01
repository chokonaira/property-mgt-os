'use client';

import { useRef, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Floor } from '@buena/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatFloor } from '@/lib/format';
import type { WizardDraftInput } from '@/lib/schemas/wizard-draft';
import { cn } from '@/lib/utils';

const KIND_OPTIONS = ['EG', 'OG', 'UG', 'DG', 'STAFFEL'] as const;
type FloorKind = (typeof KIND_OPTIONS)[number];

interface FloorCellProps {
  rowIndex: number;
}

export function FloorCell({ rowIndex }: FloorCellProps) {
  const t = useTranslations('wizard.units.floor');
  const { control } = useFormContext<WizardDraftInput>();
  return (
    <Controller
      control={control}
      name={`units.${rowIndex}.floor`}
      render={({ field, fieldState }) => (
        <FloorEditor
          rowIndex={rowIndex}
          value={field.value as Floor | undefined}
          onChange={(next) => field.onChange(next)}
          invalid={Boolean(fieldState.error)}
          t={t}
        />
      )}
    />
  );
}

function FloorEditor({
  rowIndex,
  value,
  onChange,
  invalid,
  t,
}: {
  rowIndex: number;
  value: Floor | undefined;
  onChange: (value: Floor | undefined) => void;
  invalid: boolean;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  // Snapshot the floor value at the moment the popover opens so an
  // Escape inside the popover can revert any pending edits — the
  // outer container-level cell-navigation handler can't see this
  // because Radix portals popover content outside the table tree.
  const snapshotOnOpen = useRef<Floor | undefined>(undefined);
  function handleOpenChange(next: boolean) {
    if (next) snapshotOnOpen.current = value;
    setOpen(next);
  }
  function handleEscape() {
    // Only revert when the user actually changed something. Don't
    // preventDefault — Radix should still close the popover on Esc.
    if (snapshotOnOpen.current !== value) onChange(snapshotOnOpen.current);
  }
  const kind = value?.kind ?? '';
  const level = value && (value.kind === 'OG' || value.kind === 'UG') ? value.level : undefined;
  const qualifier = value?.kind === 'STAFFEL' ? value.qualifier : undefined;

  function setKind(nextKind: FloorKind | '') {
    if (!nextKind) {
      onChange(undefined);
      return;
    }
    if (nextKind === 'EG' || nextKind === 'DG') onChange({ kind: nextKind });
    else if (nextKind === 'OG') onChange({ kind: 'OG', level: level ?? 1 });
    else if (nextKind === 'UG') onChange({ kind: 'UG', level: level ?? 1 });
    else onChange({ kind: 'STAFFEL', qualifier });
  }

  function setLevel(next: number | undefined) {
    if (!value || (value.kind !== 'OG' && value.kind !== 'UG')) return;
    if (next == null || Number.isNaN(next)) onChange({ kind: value.kind, level: 1 });
    else onChange({ kind: value.kind, level: next });
  }

  function setQualifier(next: string) {
    onChange({ kind: 'STAFFEL', qualifier: next.trim() || undefined });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        data-cell-row={rowIndex}
        data-cell-col="floor"
        className={cn(
          'flex h-9 w-full items-center justify-between gap-1 rounded-md border border-input bg-background px-2 text-left text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          invalid && 'border-destructive focus-visible:ring-destructive',
          !value && 'text-muted-foreground',
        )}
      >
        <span className="truncate">{value ? formatFloor(value) : t('empty')}</span>
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent onEscapeKeyDown={handleEscape} className="flex w-56 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t('kind')}</label>
          <select
            value={kind}
            onChange={(e) => setKind((e.target.value as FloorKind) || '')}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{t('empty')}</option>
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        {(kind === 'OG' || kind === 'UG') && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('level')}</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={kind === 'OG' ? 99 : 9}
              value={level ?? ''}
              onChange={(e) => setLevel(e.target.value === '' ? undefined : Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}
        {kind === 'STAFFEL' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('qualifier')}</label>
            <input
              type="text"
              maxLength={40}
              value={qualifier ?? ''}
              onChange={(e) => setQualifier(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

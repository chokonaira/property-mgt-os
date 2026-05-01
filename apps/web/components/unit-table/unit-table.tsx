'use client';

import { useMemo, useRef } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Trash2 } from 'lucide-react';
import { useFormContext, useFieldArray, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FloorCell } from '@/components/unit-table/floor-cell';
import { useCellNavigation } from '@/components/unit-table/use-cell-navigation';
import {
  EMPTY_UNIT,
  WIZARD_UNIT_TYPES,
  type WizardDraftInput,
  type WizardUnitDraft,
  type WizardUnitType,
} from '@/lib/schemas/wizard-draft';
import { cn } from '@/lib/utils';

const AREA_METRIC_BY_TYPE: Record<WizardUnitType, 'WOHN' | 'NUTZ' | 'NUTZ' | 'GROUND'> = {
  APARTMENT: 'WOHN',
  OFFICE: 'NUTZ',
  PARKING: 'NUTZ',
  GARDEN: 'GROUND',
};

interface RowMeta {
  rowIndex: number;
}

export function UnitTable() {
  const t = useTranslations('wizard.units');
  const { control, register } = useFormContext<WizardDraftInput>();
  const { fields, append, remove } = useFieldArray({ control, name: 'units' });
  const buildingsWatch = useWatch({ control, name: 'buildings' });
  const buildings = useMemo(() => buildingsWatch ?? [], [buildingsWatch]);
  const { containerRef, onKeyDown, onFocus } = useCellNavigation();

  const columns = useMemo<Array<ColumnDef<WizardUnitDraft & { _id: string }, RowMeta>>>(
    () => [
      {
        id: 'rowIndex',
        header: '',
        size: 32,
        cell: ({ row }) => (
          <span className="font-mono text-[10px] text-muted-foreground">{row.index + 1}</span>
        ),
      },
      {
        id: 'number',
        header: '#',
        size: 96,
        cell: ({ row }) => <NumberCell rowIndex={row.index} />,
      },
      {
        id: 'type',
        header: t('columns.type'),
        size: 130,
        cell: ({ row }) => <TypeCell rowIndex={row.index} />,
      },
      {
        id: 'building',
        header: t('columns.building'),
        size: 160,
        cell: ({ row }) => (
          <select
            data-cell-row={row.index}
            data-cell-col="building"
            {...register(`units.${row.index}.buildingIndex`, { valueAsNumber: true })}
            className={cellInputClass}
          >
            {buildings.map((b, idx) => {
              const summary =
                b.label || b.nickname || `${b.street ?? ''} ${b.houseNumber ?? ''}`.trim();
              return (
                <option key={idx} value={idx}>
                  {summary || t('buildingFallback', { index: idx + 1 })}
                </option>
              );
            })}
          </select>
        ),
      },
      {
        id: 'floor',
        header: t('columns.floor'),
        size: 110,
        cell: ({ row }) => <FloorCell rowIndex={row.index} />,
      },
      {
        id: 'entranceLabel',
        header: t('columns.entrance'),
        size: 110,
        cell: ({ row }) => (
          <input
            type="text"
            maxLength={40}
            data-cell-row={row.index}
            data-cell-col="entranceLabel"
            {...register(`units.${row.index}.entranceLabel`, {
              setValueAs: emptyToUndefined,
            })}
            className={cellInputClass}
          />
        ),
      },
      {
        id: 'sizeSqm',
        header: t('columns.size'),
        size: 100,
        cell: ({ row }) => (
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            data-cell-row={row.index}
            data-cell-col="sizeSqm"
            {...register(`units.${row.index}.sizeSqm`, {
              setValueAs: emptyToUndefinedNumber,
            })}
            className={cellInputClass}
          />
        ),
      },
      {
        id: 'metric',
        header: t('columns.metric'),
        size: 90,
        cell: ({ row }) => <MetricBadge index={row.index} />,
      },
      {
        id: 'rooms',
        header: t('columns.rooms'),
        size: 90,
        cell: ({ row }) => <RoomsCell rowIndex={row.index} />,
      },
      {
        id: 'meaShare',
        header: t('columns.mea'),
        size: 110,
        cell: ({ row }) => <MeaCell rowIndex={row.index} />,
      },
      {
        id: 'yearBuilt',
        header: t('columns.year'),
        size: 90,
        cell: ({ row }) => (
          <input
            type="number"
            inputMode="numeric"
            min={1800}
            max={new Date().getFullYear() + 1}
            data-cell-row={row.index}
            data-cell-col="yearBuilt"
            {...register(`units.${row.index}.yearBuilt`, {
              setValueAs: emptyToUndefinedNumber,
            })}
            className={cellInputClass}
          />
        ),
      },
      {
        id: 'description',
        header: t('columns.description'),
        size: 200,
        cell: ({ row }) => (
          <input
            type="text"
            maxLength={500}
            data-cell-row={row.index}
            data-cell-col="description"
            {...register(`units.${row.index}.description`, {
              setValueAs: emptyToUndefined,
            })}
            className={cellInputClass}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        size: 48,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => remove(row.index)}
            disabled={fields.length === 1}
            aria-label={t('removeRow', { index: row.index + 1 })}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        ),
      },
    ],
    [t, register, buildings, fields.length, remove],
  );

  const data = useMemo(
    () => fields.map((f) => f as unknown as WizardUnitDraft & { _id: string }),
    [fields],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div ref={containerRef} onKeyDown={onKeyDown} onFocus={onFocus} className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[1000px] caption-bottom text-sm">
          <thead className="border-b border-border bg-muted/30">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.column.getSize() }}
                    className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-start">
        <Button type="button" variant="outline" onClick={() => append(EMPTY_UNIT)}>
          + {t('addRow')}
        </Button>
      </div>
    </div>
  );
}

const cellInputClass = cn(
  'flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
  'disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground',
);

function emptyToUndefined(raw: unknown): string | undefined {
  if (raw === '' || raw === undefined || raw === null) return undefined;
  return typeof raw === 'string' ? raw : String(raw);
}
function emptyToUndefinedNumber(raw: unknown): number | undefined {
  if (raw === '' || raw === null || raw === undefined) return undefined;
  const num = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

// Type is a side-effectful editor: changing the discriminator clears
// variant-specific siblings (rooms / subCategory / layoutNote /
// parkingCode). The container-level Esc revert can only restore the
// select's own value, which would leave the row in a half-reverted
// state. TypeCell snapshots the variant siblings on focus and
// restores them along with the type on Esc, then stops propagation
// so the container handler doesn't double-revert.
function TypeCell({ rowIndex }: { rowIndex: number }) {
  const { register, setValue, getValues } = useFormContext<WizardDraftInput>();
  const t = useTranslations('wizard.units');
  type Snapshot = {
    type: WizardUnitType;
    rooms: number | undefined;
    subCategory: string | undefined;
    layoutNote: string | undefined;
    parkingCode: string | undefined;
  };
  const snapshotRef = useRef<Snapshot | null>(null);

  function captureSnapshot() {
    snapshotRef.current = {
      type: getValues(`units.${rowIndex}.type`),
      rooms: getValues(`units.${rowIndex}.rooms` as `units.${number}.rooms`),
      subCategory: getValues(`units.${rowIndex}.subCategory` as `units.${number}.subCategory`),
      layoutNote: getValues(`units.${rowIndex}.layoutNote` as `units.${number}.layoutNote`),
      parkingCode: getValues(`units.${rowIndex}.parkingCode` as `units.${number}.parkingCode`),
    };
  }

  function restoreSnapshot(snap: Snapshot) {
    setValue(`units.${rowIndex}.type`, snap.type);
    setValue(`units.${rowIndex}.rooms` as `units.${number}.rooms`, snap.rooms);
    setValue(`units.${rowIndex}.subCategory` as `units.${number}.subCategory`, snap.subCategory);
    setValue(`units.${rowIndex}.layoutNote` as `units.${number}.layoutNote`, snap.layoutNote);
    setValue(`units.${rowIndex}.parkingCode` as `units.${number}.parkingCode`, snap.parkingCode);
  }

  return (
    <select
      data-cell-row={rowIndex}
      data-cell-col="type"
      onFocus={captureSnapshot}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.metaKey || e.ctrlKey || e.altKey) return;
        const snap = snapshotRef.current;
        if (snap) restoreSnapshot(snap);
        e.currentTarget.blur();
        e.preventDefault();
        // Stop the container-level handler from running its generic
        // select-revert, which would only restore the <select>'s own
        // value and would race against our row-level restore above.
        e.stopPropagation();
      }}
      {...register(`units.${rowIndex}.type`, {
        onChange: (e) => {
          const next = e.target.value as WizardUnitType;
          if (next !== 'APARTMENT') {
            setValue(`units.${rowIndex}.rooms` as `units.${number}.rooms`, undefined as never);
            setValue(
              `units.${rowIndex}.subCategory` as `units.${number}.subCategory`,
              undefined as never,
            );
          }
          if (next !== 'OFFICE') {
            setValue(
              `units.${rowIndex}.layoutNote` as `units.${number}.layoutNote`,
              undefined as never,
            );
          }
          if (next !== 'PARKING') {
            setValue(
              `units.${rowIndex}.parkingCode` as `units.${number}.parkingCode`,
              undefined as never,
            );
          }
        },
      })}
      className={cellInputClass}
    >
      {WIZARD_UNIT_TYPES.map((u) => (
        <option key={u} value={u}>
          {t(`types.${u}`)}
        </option>
      ))}
    </select>
  );
}

function MetricBadge({ index }: { index: number }) {
  const { control } = useFormContext<WizardDraftInput>();
  const type = useWatch({ control, name: `units.${index}.type` }) as WizardUnitType;
  const metric = AREA_METRIC_BY_TYPE[type];
  return (
    <Badge variant="outline" className="font-mono text-[10px]">
      {metric}
    </Badge>
  );
}

function RoomsCell({ rowIndex }: { rowIndex: number }) {
  const { control, register } = useFormContext<WizardDraftInput>();
  const type = useWatch({ control, name: `units.${rowIndex}.type` }) as WizardUnitType;
  const isApartment = type === 'APARTMENT';
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={50}
      disabled={!isApartment}
      aria-disabled={!isApartment}
      data-cell-row={rowIndex}
      data-cell-col="rooms"
      {...register(`units.${rowIndex}.rooms`, {
        setValueAs: emptyToUndefinedNumber,
      })}
      className={cellInputClass}
    />
  );
}

function NumberCell({ rowIndex }: { rowIndex: number }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<WizardDraftInput>();
  const error = (errors.units?.[rowIndex] as { number?: { message?: string } } | undefined)?.number
    ?.message;
  return (
    <input
      type="text"
      maxLength={20}
      data-cell-row={rowIndex}
      data-cell-col="number"
      aria-invalid={Boolean(error) || undefined}
      title={error}
      {...register(`units.${rowIndex}.number`)}
      className={cn(cellInputClass, error && 'border-destructive')}
    />
  );
}

function MeaCell({ rowIndex }: { rowIndex: number }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<WizardDraftInput>();
  const error = (errors.units?.[rowIndex] as { meaShare?: { message?: string } } | undefined)
    ?.meaShare?.message;
  return (
    <input
      type="number"
      inputMode="decimal"
      step="0.1"
      min={0}
      max={10000}
      data-cell-row={rowIndex}
      data-cell-col="meaShare"
      aria-invalid={Boolean(error) || undefined}
      title={error}
      {...register(`units.${rowIndex}.meaShare`, {
        // Empty input must surface as a schema error, not silently
        // become 0. Returning undefined for empty makes z.number()
        // fail invalid_type, which lights up aria-invalid + the
        // tooltip — matching the AC's "MEA is required".
        setValueAs: (raw) => {
          if (raw === '' || raw === null || raw === undefined) {
            return undefined as unknown as number;
          }
          const n = typeof raw === 'number' ? raw : Number(raw);
          return Number.isFinite(n) ? n : (undefined as unknown as number);
        },
      })}
      className={cn(cellInputClass, error && 'border-destructive')}
    />
  );
}

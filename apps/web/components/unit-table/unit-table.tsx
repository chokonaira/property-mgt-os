'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Copy, Trash2 } from 'lucide-react';
import { useFormContext, useFieldArray, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FieldChip } from '@/components/ai-extraction-review';
import { useWizard } from '@/components/wizard/wizard-context';
import { FloorCell } from '@/components/unit-table/floor-cell';
import { GenerateUnitsDialog } from '@/components/unit-table/generate-units-dialog';
import { useCellNavigation } from '@/components/unit-table/use-cell-navigation';
import { parsePastedRows } from '@/lib/parse-tsv';
import { nextNumber } from '@/lib/duplicate-unit-number';
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
  const { control, register, getValues } = useFormContext<WizardDraftInput>();
  const { fields, append, remove, insert } = useFieldArray({ control, name: 'units' });
  const buildingsWatch = useWatch({ control, name: 'buildings' });
  const buildings = useMemo(() => buildingsWatch ?? [], [buildingsWatch]);
  const { containerRef, onKeyDown, onFocus } = useCellNavigation();
  const { markFieldEdited } = useWizard();
  const onEdit = useCallback(
    (rowIndex: number, key: string) => () => markFieldEdited(`units[${rowIndex}].${key}`),
    [markFieldEdited],
  );

  // Selection state keyed on the field array's stable RHF id (not
  // the row index — index shifts when rows are removed).
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const allSelected = fields.length > 0 && selectedIds.size === fields.length;
  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === fields.length ? new Set() : new Set(fields.map((f) => f.id)),
    );
  }, [fields]);

  const duplicateRow = useCallback(
    (rowIndex: number) => {
      const current = (getValues(`units.${rowIndex}`) ?? {}) as WizardUnitDraft;
      const copy = { ...current, number: nextNumber(current.number) } as WizardUnitDraft;
      insert(rowIndex + 1, copy, { shouldFocus: false });
    },
    [getValues, insert],
  );

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const indices: number[] = [];
    fields.forEach((f, idx) => {
      if (selectedIds.has(f.id)) indices.push(idx);
    });
    // Remove from highest index first so earlier indices stay valid.
    indices.reverse().forEach((idx) => remove(idx));
    setSelectedIds(new Set());
    toast.success(t('bulkDelete.toast', { count: indices.length }));
  }, [fields, remove, selectedIds, t]);

  const columns = useMemo<Array<ColumnDef<WizardUnitDraft & { _id: string }, RowMeta>>>(
    () => [
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            aria-label={t('bulkDelete.selectAll')}
            checked={allSelected}
            onChange={toggleAll}
            className="h-4 w-4 rounded border border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
          />
        ),
        size: 32,
        cell: ({ row }) => {
          const id = (row.original as { id?: string }).id;
          if (!id) return null;
          return (
            <input
              type="checkbox"
              aria-label={t('bulkDelete.selectRow', { index: row.index + 1 })}
              checked={selectedIds.has(id)}
              onChange={() => toggleRow(id)}
              className="h-4 w-4 rounded border border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
          );
        },
      },
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
        cell: ({ row }) => (
          <CellWithChip path={`units[${row.index}].number`} label="#">
            <NumberCell rowIndex={row.index} onEdit={onEdit(row.index, 'number')} />
          </CellWithChip>
        ),
      },
      {
        id: 'type',
        header: t('columns.type'),
        size: 130,
        cell: ({ row }) => (
          <CellWithChip path={`units[${row.index}].type`} label={t('columns.type')}>
            <TypeCell rowIndex={row.index} onEdit={onEdit(row.index, 'type')} />
          </CellWithChip>
        ),
      },
      {
        id: 'building',
        header: t('columns.building'),
        size: 160,
        cell: ({ row }) => (
          <CellWithChip path={`units[${row.index}].buildingLabel`} label={t('columns.building')}>
            <select
              data-cell-row={row.index}
              data-cell-col="building"
              {...register(`units.${row.index}.buildingIndex`, {
                valueAsNumber: true,
                onChange: onEdit(row.index, 'buildingLabel'),
              })}
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
          </CellWithChip>
        ),
      },
      {
        id: 'floor',
        header: t('columns.floor'),
        size: 110,
        cell: ({ row }) => (
          <CellWithChip path={`units[${row.index}].floor`} label={t('columns.floor')}>
            <FloorCell rowIndex={row.index} />
          </CellWithChip>
        ),
      },
      {
        id: 'entranceLabel',
        header: t('columns.entrance'),
        size: 110,
        cell: ({ row }) => (
          <CellWithChip path={`units[${row.index}].entranceLabel`} label={t('columns.entrance')}>
            <input
              type="text"
              maxLength={40}
              data-cell-row={row.index}
              data-cell-col="entranceLabel"
              {...register(`units.${row.index}.entranceLabel`, {
                setValueAs: emptyToUndefined,
                onChange: onEdit(row.index, 'entranceLabel'),
              })}
              className={cellInputClass}
            />
          </CellWithChip>
        ),
      },
      {
        id: 'sizeSqm',
        header: t('columns.size'),
        size: 100,
        cell: ({ row }) => (
          <CellWithChip path={`units[${row.index}].sizeSqm`} label={t('columns.size')}>
            <SizeCell rowIndex={row.index} onEdit={onEdit(row.index, 'sizeSqm')} />
          </CellWithChip>
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
        cell: ({ row }) => (
          <CellWithChip path={`units[${row.index}].rooms`} label={t('columns.rooms')}>
            <RoomsCell rowIndex={row.index} onEdit={onEdit(row.index, 'rooms')} />
          </CellWithChip>
        ),
      },
      {
        id: 'meaShare',
        header: t('columns.mea'),
        size: 110,
        cell: ({ row }) => (
          <CellWithChip path={`units[${row.index}].meaShare`} label={t('columns.mea')}>
            <MeaCell rowIndex={row.index} onEdit={onEdit(row.index, 'meaShare')} />
          </CellWithChip>
        ),
      },
      {
        id: 'yearBuilt',
        header: t('columns.year'),
        size: 90,
        cell: ({ row }) => (
          <CellWithChip path={`units[${row.index}].yearBuilt`} label={t('columns.year')}>
            <input
              type="number"
              inputMode="numeric"
              min={1800}
              max={new Date().getFullYear() + 1}
              data-cell-row={row.index}
              data-cell-col="yearBuilt"
              {...register(`units.${row.index}.yearBuilt`, {
                setValueAs: emptyToUndefinedNumber,
                onChange: onEdit(row.index, 'yearBuilt'),
              })}
              className={cellInputClass}
            />
          </CellWithChip>
        ),
      },
      {
        id: 'description',
        header: t('columns.description'),
        size: 200,
        cell: ({ row }) => (
          <CellWithChip path={`units[${row.index}].description`} label={t('columns.description')}>
            <input
              type="text"
              maxLength={500}
              data-cell-row={row.index}
              data-cell-col="description"
              {...register(`units.${row.index}.description`, {
                setValueAs: emptyToUndefined,
                onChange: onEdit(row.index, 'description'),
              })}
              className={cellInputClass}
            />
          </CellWithChip>
        ),
      },
      {
        id: 'actions',
        header: '',
        size: 84,
        cell: ({ row }) => (
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => duplicateRow(row.index)}
              aria-label={t('duplicateRow', { index: row.index + 1 })}
              className="text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </Button>
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
          </div>
        ),
      },
    ],
    [t, register, buildings, fields.length, remove, onEdit, allSelected, toggleAll, selectedIds, toggleRow, duplicateRow],
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

  // Container-level paste handler. Single-cell paste falls through to
  // the focused input's native paste; multi-row TSV / CSV pastes
  // trigger row creation. Detection: split candidate text by line
  // breaks; if more than one row OR the first row has a delimiter,
  // we treat it as a bulk paste.
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const raw = event.clipboardData.getData('text/plain');
      if (!raw) return;
      const candidate = raw.replace(/\r\n?/g, '\n');
      const looksMultiRow = candidate.includes('\n');
      const looksMultiCol = candidate.includes('\t') || candidate.includes(',');
      if (!looksMultiRow && !looksMultiCol) return; // single-cell — let native paste win
      event.preventDefault();
      const parsed = parsePastedRows(candidate, { buildingsCount: buildings.length });
      if (parsed.rows.length === 0) return;
      // Replace the seeded empty unit when the user pastes into a
      // pristine table; otherwise append. Keeps "click Add unit, paste"
      // and "paste straight into a fresh table" both intuitive.
      const isPristineSeed =
        fields.length === 1 &&
        (fields[0] as unknown as WizardUnitDraft).number === '' &&
        (fields[0] as unknown as WizardUnitDraft).type === 'APARTMENT';
      if (isPristineSeed) {
        remove(0);
      }
      for (const row of parsed.rows) {
        append(row, { shouldFocus: false });
      }
      const errorCount = parsed.errors.length;
      const okCount = parsed.rows.length - new Set(parsed.errors.map((e) => e.rowIndex)).size;
      toast.success(
        errorCount === 0
          ? t('paste.successAll', { count: parsed.rows.length })
          : t('paste.successPartial', { count: okCount, errors: errorCount }),
      );
    },
    [append, remove, fields, buildings.length, t],
  );

  return (
    <div
      ref={containerRef}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onPaste={handlePaste}
      className="flex flex-col gap-3"
    >
      {selectedIds.size > 0 ? (
        <div className="flex flex-col-reverse items-stretch gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground">
            {t('bulkDelete.selectedCount', { count: selectedIds.size })}
          </p>
          <div className="flex items-center gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              {t('bulkDelete.clearSelection')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={deleteSelected}
              disabled={selectedIds.size >= fields.length}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t('bulkDelete.deleteSelected')}
            </Button>
          </div>
        </div>
      ) : null}
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
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => append(EMPTY_UNIT)}>
          + {t('addRow')}
        </Button>
        <GenerateUnitsDialog
          onGenerate={(rows) => {
            // Pristine seed → replace; otherwise append.
            const pristine =
              fields.length === 1 &&
              (fields[0] as unknown as WizardUnitDraft).number === '' &&
              (fields[0] as unknown as WizardUnitDraft).type === 'APARTMENT';
            if (pristine) remove(0);
            for (const row of rows) append(row, { shouldFocus: false });
            toast.success(t('generate.toast', { count: rows.length }));
          }}
        />
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

/**
 * Wraps an editable cell so a tiny `<FieldChip />` renders below the
 * input when extraction provenance exists for the path. The chip
 * disappears as soon as the user edits the value (markFieldEdited
 * lives next to the register() onChange in each cell).
 */
function CellWithChip({
  path,
  label,
  children,
}: {
  path: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      {children}
      <FieldChip path={path} fieldLabel={label} className="text-[10px]" />
    </div>
  );
}

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
function TypeCell({ rowIndex, onEdit }: { rowIndex: number; onEdit: () => void }) {
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
    // Restoring to undefined (when the snapshot row was non-APARTMENT,
    // for instance) is intentional — we want the row to reflect its
    // pre-edit shape. The wire schema expects rooms to be a number for
    // APARTMENT, but RHF's setValue is permissive at runtime; the
    // schema's later trigger() will surface any missing-value error
    // inline.
    setValue(`units.${rowIndex}.rooms` as `units.${number}.rooms`, snap.rooms as never);
    setValue(
      `units.${rowIndex}.subCategory` as `units.${number}.subCategory`,
      snap.subCategory as never,
    );
    setValue(
      `units.${rowIndex}.layoutNote` as `units.${number}.layoutNote`,
      snap.layoutNote as never,
    );
    setValue(
      `units.${rowIndex}.parkingCode` as `units.${number}.parkingCode`,
      snap.parkingCode as never,
    );
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
          onEdit();
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

function RoomsCell({ rowIndex, onEdit }: { rowIndex: number; onEdit: () => void }) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<WizardDraftInput>();
  const type = useWatch({ control, name: `units.${rowIndex}.type` }) as WizardUnitType;
  const isApartment = type === 'APARTMENT';
  const error = (errors.units?.[rowIndex] as { rooms?: { message?: string } } | undefined)?.rooms
    ?.message;
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={50}
      disabled={!isApartment}
      aria-disabled={!isApartment}
      aria-invalid={Boolean(error) || undefined}
      title={error}
      data-cell-row={rowIndex}
      data-cell-col="rooms"
      {...register(`units.${rowIndex}.rooms`, {
        setValueAs: emptyToUndefinedNumber,
        onChange: onEdit,
      })}
      className={cn(cellInputClass, error && 'border-destructive')}
    />
  );
}

function SizeCell({ rowIndex, onEdit }: { rowIndex: number; onEdit: () => void }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<WizardDraftInput>();
  const error = (errors.units?.[rowIndex] as { sizeSqm?: { message?: string } } | undefined)
    ?.sizeSqm?.message;
  return (
    <input
      type="number"
      inputMode="decimal"
      step="0.01"
      min={0}
      data-cell-row={rowIndex}
      data-cell-col="sizeSqm"
      aria-invalid={Boolean(error) || undefined}
      title={error}
      {...register(`units.${rowIndex}.sizeSqm`, {
        setValueAs: emptyToUndefinedNumber,
        onChange: onEdit,
      })}
      className={cn(cellInputClass, error && 'border-destructive')}
    />
  );
}

function NumberCell({ rowIndex, onEdit }: { rowIndex: number; onEdit: () => void }) {
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
      {...register(`units.${rowIndex}.number`, { onChange: onEdit })}
      className={cn(cellInputClass, error && 'border-destructive')}
    />
  );
}

function MeaCell({ rowIndex, onEdit }: { rowIndex: number; onEdit: () => void }) {
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
        onChange: onEdit,
      })}
      className={cn(cellInputClass, error && 'border-destructive')}
    />
  );
}

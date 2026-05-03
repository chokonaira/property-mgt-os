'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CopyPlus, GripVertical, Trash2 } from 'lucide-react';
import { useFormContext, useFieldArray, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FieldChip } from '@/components/ai-extraction-review';
import { useStepValidator, useWizard } from '@/components/wizard/wizard-context';
import { FloorCell } from '@/components/unit-table/floor-cell';
import { GenerateUnitsDialog } from '@/components/unit-table/generate-units-dialog';
import { useCellNavigation } from '@/components/unit-table/use-cell-navigation';
import { parsePastedRows, shouldHandleAsBulkPaste } from '@/lib/parse-tsv';
import { findNextAvailableNumber } from '@/lib/duplicate-unit-number';
import { findAllDuplicateUnitRows, type DuplicateRowInfo } from '@/lib/duplicate-units';
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

// Schema field-name → translation key under `wizard.units.columns.*`,
// so the validation summary can name the offending field with the
// same label the user sees on the table header. Fields whose i18n
// key isn't a column header (e.g. `number` shown as "#") fall back
// to the raw field name in the summary; that's intentional — the
// header is a special case in the markup, not a translatable label.
const FIELD_LABELS: Record<string, string> = {
  buildingIndex: 'building',
  floor: 'floor',
  entranceLabel: 'entrance',
  sizeSqm: 'size',
  rooms: 'rooms',
  meaShare: 'mea',
  yearBuilt: 'year',
  description: 'description',
};

// Caps the inline summary at a readable height. Past this we collapse
// the rest into a "+N more" hint — the user has already been
// nudged to fix the visible rows; piling another 50 entries on the
// banner just buries them.
const ERROR_SUMMARY_MAX = 8;

interface RowMeta {
  rowIndex: number;
}

/**
 * Selection state lives outside the columns memo so toggling a
 * checkbox doesn't rebuild every column definition (~13 cols × N
 * rows of cell renderers). Cell components consume from this
 * context; the columns array stays referentially stable across
 * selection changes.
 */
interface SelectionContextValue {
  selectedIds: ReadonlySet<string>;
  allSelected: boolean;
  toggleRow: (id: string) => void;
  toggleAll: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('SelectionContext provider missing');
  return ctx;
}

/**
 * Per-row duplicate-unit-number context. Lives separately from
 * SelectionContext so a typing keystroke doesn't have to invalidate
 * the selection memo. NumberCell consumes via useDuplicateRowInfo
 * to apply red border + tooltip without the column definitions
 * needing to know about duplicate state at memo time.
 */
const DuplicateRowsContext = createContext<ReadonlyMap<number, DuplicateRowInfo>>(
  new Map<number, DuplicateRowInfo>(),
);

function useDuplicateRowInfo(rowIndex: number): DuplicateRowInfo | undefined {
  return useContext(DuplicateRowsContext).get(rowIndex);
}

function SelectAllCheckbox({ ariaLabel }: { ariaLabel: string }) {
  const { allSelected, toggleAll } = useSelection();
  return (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      checked={allSelected}
      onChange={toggleAll}
      className="h-4 w-4 rounded border border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

function RowSelectCheckbox({ rowId, ariaLabel }: { rowId: string; ariaLabel: string }) {
  const { selectedIds, toggleRow } = useSelection();
  return (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      checked={selectedIds.has(rowId)}
      onChange={() => toggleRow(rowId)}
      className="h-4 w-4 rounded border border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

export function UnitTable() {
  const t = useTranslations('wizard.units');
  const {
    control,
    register,
    getValues,
    trigger,
    formState: { errors },
  } = useFormContext<WizardDraftInput>();
  const { fields, append, remove, insert, move } = useFieldArray({ control, name: 'units' });
  const buildingsWatch = useWatch({ control, name: 'buildings' });
  const buildings = useMemo(() => buildingsWatch ?? [], [buildingsWatch]);
  const unitsWatch = useWatch({ control, name: 'units' });
  // Live duplicate-unit-number detection. The DB enforces
  // @@unique([buildingId, number]) on Unit; surfacing the violation
  // client-side as the user types means red borders + tooltips
  // appear immediately instead of silently failing on Save with a
  // 409. Recomputed on every keystroke (cheap — single linear pass
  // over the units array, scales fine into the hundreds).
  const duplicateRows = useMemo(
    () => findAllDuplicateUnitRows(unitsWatch, buildingsWatch),
    [unitsWatch, buildingsWatch],
  );
  const { containerRef, onKeyDown, onFocus } = useCellNavigation();
  const { markFieldEdited, errorsVisible } = useWizard();
  const onEdit = useCallback(
    (rowIndex: number, key: string) => () => markFieldEdited(`units[${rowIndex}].${key}`),
    [markFieldEdited],
  );

  // Selection state keyed on the field array's stable RHF id (not
  // the row index — index shifts when rows are removed).
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  // Soft-highlight a range of newly inserted rows so the user can
  // spot where their generated rows landed in a long table. Cleared
  // after 1500 ms via setTimeout; range stored as { from, count } so
  // the comparison stays cheap inside the per-row render loop.
  const [highlightedRange, setHighlightedRange] = useState<{ from: number; count: number } | null>(
    null,
  );
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashRange = useCallback((from: number, count: number) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedRange({ from, count });
    highlightTimerRef.current = setTimeout(() => setHighlightedRange(null), 1500);
  }, []);
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);
  const isHighlighted = useCallback(
    (rowIndex: number): boolean => {
      if (!highlightedRange) return false;
      return rowIndex >= highlightedRange.from && rowIndex < highlightedRange.from + highlightedRange.count;
    },
    [highlightedRange],
  );

  // Drag-to-reorder. PointerSensor.activationConstraint.distance keeps a
  // stray click on the handle from being interpreted as a drag — a small
  // movement threshold (5 px) lets users still focus the row without
  // accidentally rearranging the list. KeyboardSensor + sortableKeyboard
  // coordinates makes the same gesture available to keyboard-only users
  // (Tab to handle, Space to lift, arrows to move, Space to drop).
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );


  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIndex = fields.findIndex((f) => f.id === active.id);
      const toIndex = fields.findIndex((f) => f.id === over.id);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      move(fromIndex, toIndex);
      flashRange(toIndex, 1);
    },
    [fields, move, flashRange],
  );
  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  // Live count: only ids that still exist in the field array. Per-row
  // Trash deletes don't prune selectedIds (state lives outside RHF),
  // so a stale id can survive in the Set. Filtering here keeps the
  // bulk-delete bar's count honest.
  const liveSelectedCount = useMemo(
    () => fields.reduce((acc, f) => (selectedIds.has(f.id) ? acc + 1 : acc), 0),
    [fields, selectedIds],
  );
  const allSelected = fields.length > 0 && liveSelectedCount === fields.length;
  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === fields.length ? new Set() : new Set(fields.map((f) => f.id)),
    );
  }, [fields]);

  const duplicateRow = useCallback(
    (rowIndex: number) => {
      const current = (getValues(`units.${rowIndex}`) ?? {}) as WizardUnitDraft;
      // Build the per-building set of in-use numbers so the next-
      // available helper can advance past existing rows. Without
      // this, duplicating "01" against existing 01..03 produced
      // "02" — a fresh duplicate that immediately collides.
      const taken = new Set<string>();
      for (const u of (getValues('units') ?? []) as WizardUnitDraft[]) {
        if (u.buildingIndex !== current.buildingIndex) continue;
        const n = (u.number ?? '').trim();
        if (n) taken.add(n);
      }
      const copy = {
        ...current,
        number: findNextAvailableNumber(current.number, taken),
      } as WizardUnitDraft;
      insert(rowIndex + 1, copy, { shouldFocus: false });
      // The new row sits directly below the source with the same data
      // and a bumped number. Without a toast users couldn't tell the
      // click did anything because the rows look near-identical.
      flashRange(rowIndex + 1, 1);
      toast.success(t('duplicateToast', { index: rowIndex + 1 }));
    },
    [getValues, insert, flashRange, t],
  );

  const deleteSelected = useCallback(() => {
    if (liveSelectedCount === 0) return;
    const indices: number[] = [];
    fields.forEach((f, idx) => {
      if (selectedIds.has(f.id)) indices.push(idx);
    });
    // Remove from highest index first so earlier indices stay valid.
    indices.reverse().forEach((idx) => remove(idx));
    setSelectedIds(new Set());
    toast.error(t('bulkDelete.toast', { count: indices.length }));
  }, [fields, remove, selectedIds, liveSelectedCount, t]);

  // Step-3 validator. Combines the schema check (every row passes
  // WizardUnitDraftSchema) with the cross-row uniqueness invariant.
  // RHF's default schema trigger walks each row in isolation and
  // can't see "this row's number duplicates that row's number"
  // because that's a graph-level property. Registering a custom
  // validator on step 'units' is the documented hook in
  // wizard-context — it takes precedence over the default trigger.
  const stepValidator = useCallback(async () => {
    const schemaOk = await trigger('units');
    return schemaOk && duplicateRows.size === 0;
  }, [trigger, duplicateRows]);
  useStepValidator('units', stepValidator);

  // Re-trigger schema validation on every edit ONCE the user has hit
  // Save and surfaced errors. Without this, the user fixes the
  // missing field but the inline banner keeps shouting "Size is
  // required" because RHF (default mode) only re-validates on the
  // next submit. Live re-trigger keeps the summary in lock-step
  // with what the user is typing — schema-pass rows drop off the
  // list immediately, schema-fail rows light up as soon as a value
  // becomes invalid. Gated on errorsVisible so a freshly opened
  // table doesn't burn cycles validating a blank state.
  useEffect(() => {
    if (!errorsVisible) return;
    void trigger('units');
  }, [errorsVisible, unitsWatch, trigger]);

  // Aggregated, click-to-jump error summary. Combines schema issues
  // (missing #, size, MEA, rooms etc.) with the cross-row duplicate
  // detector so the user gets one unified "fix these N things"
  // panel instead of scanning the table for red borders. Schema
  // entries are gated on `errorsVisible` (flips after the first
  // failed Save attempt) so a freshly opened blank table doesn't
  // shout at the user before they've had a chance to type.
  // Duplicates show unconditionally — they're a pure cross-row
  // statement that the user can act on with no prior submission.
  type SummaryItem = { rowIndex: number; message: string };
  const errorSummary = useMemo<SummaryItem[]>(() => {
    const items: SummaryItem[] = [];
    if (errorsVisible) {
      const unitsErrors = errors.units as Record<string, Record<string, { message?: string }>> | undefined;
      if (unitsErrors && typeof unitsErrors === 'object') {
        for (const [key, fieldErrs] of Object.entries(unitsErrors)) {
          const rowIndex = Number(key);
          if (!Number.isFinite(rowIndex) || !fieldErrs) continue;
          for (const [field, err] of Object.entries(fieldErrs)) {
            if (field === 'type' || field === 'root') continue;
            const message = err?.message;
            if (!message) continue;
            const label = FIELD_LABELS[field] ? t(`columns.${FIELD_LABELS[field]}`) : field;
            items.push({
              rowIndex,
              message: t('errors.summaryFieldInvalid', { label, message }),
            });
          }
        }
      }
    }
    for (const [rowIndex, info] of duplicateRows) {
      items.push({
        rowIndex,
        message: t('errors.summaryFieldDuplicate', {
          row: info.duplicateOf + 1,
          building: info.buildingLabel,
        }),
      });
    }
    items.sort((a, b) => a.rowIndex - b.rowIndex);
    return items;
  }, [errorsVisible, errors, duplicateRows, t]);

  const scrollToRow = useCallback(
    (rowIndex: number) => {
      const root = containerRef.current;
      if (!root) return;
      const target =
        root.querySelector<HTMLElement>(`tr[data-index="${rowIndex}"]`) ??
        root.querySelectorAll<HTMLElement>('tbody tr')[rowIndex] ??
        null;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Flip focus into the # cell of the target row so a keyboard
      // user can start typing the fix immediately.
      target?.querySelector<HTMLInputElement>('input[data-cell-col="number"]')?.focus();
    },
    [containerRef],
  );

  const duplicateSelected = useCallback(() => {
    if (liveSelectedCount === 0) return;
    // Build copies in the user's visual order so the duplicates land at
    // the end as a coherent block, not scrambled. Inserting at each
    // source index would shift later indices mid-loop and tangle which
    // copies belong to which sources — appending at the bottom keeps
    // the operation predictable, and drag-to-reorder is the recovery.
    //
    // Per-building "taken" sets seed from the current rows AND grow as
    // we mint copies, so duplicating five rows that all read "01"
    // produces "02"…"06" instead of five colliding "02"s. Each new
    // copy reserves its number against the next iteration.
    const allUnits = (getValues('units') ?? []) as WizardUnitDraft[];
    const takenByBuilding = new Map<number, Set<string>>();
    for (const u of allUnits) {
      const set = takenByBuilding.get(u.buildingIndex) ?? new Set<string>();
      const n = (u.number ?? '').trim();
      if (n) set.add(n);
      takenByBuilding.set(u.buildingIndex, set);
    }
    const copies: WizardUnitDraft[] = [];
    fields.forEach((f, idx) => {
      if (!selectedIds.has(f.id)) return;
      const current = (getValues(`units.${idx}`) ?? {}) as WizardUnitDraft;
      const taken = takenByBuilding.get(current.buildingIndex) ?? new Set<string>();
      const number = findNextAvailableNumber(current.number, taken);
      taken.add(number);
      takenByBuilding.set(current.buildingIndex, taken);
      copies.push({ ...current, number });
    });
    const startIndex = fields.length;
    for (const copy of copies) append(copy, { shouldFocus: false });
    setSelectedIds(new Set());
    flashRange(startIndex, copies.length);
    toast.success(t('bulkDuplicate.toast', { count: copies.length }));
  }, [append, fields, flashRange, getValues, liveSelectedCount, selectedIds, t]);

  const columns = useMemo<Array<ColumnDef<WizardUnitDraft & { _id: string }, RowMeta>>>(
    () => [
      {
        id: 'dragHandle',
        header: '',
        size: 32,
        // Cell content lives on the SortableRow itself so the listener
        // sits on the actual <tr> child. Render an empty placeholder
        // here just to reserve column width.
        cell: () => null,
      },
      {
        id: 'select',
        header: () => <SelectAllCheckbox ariaLabel={t('bulkDelete.selectAll')} />,
        size: 40,
        cell: ({ row }) => {
          const id = (row.original as { id?: string }).id;
          if (!id) return null;
          return (
            <RowSelectCheckbox
              rowId={id}
              ariaLabel={t('bulkDelete.selectRow', { index: row.index + 1 })}
            />
          );
        },
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
        size: 180,
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
        size: 140,
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
        size: 140,
        cell: ({ row }) => (
          <CellWithChip path={`units[${row.index}].meaShare`} label={t('columns.mea')}>
            <MeaCell rowIndex={row.index} onEdit={onEdit(row.index, 'meaShare')} />
          </CellWithChip>
        ),
      },
      {
        id: 'yearBuilt',
        header: t('columns.year'),
        size: 130,
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
        size: 360,
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
              title={t('duplicateTooltip')}
              className="text-muted-foreground hover:bg-success/10 hover:text-success"
            >
              <CopyPlus className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                remove(row.index);
                toast.error(t('removeToast', { index: row.index + 1 }));
              }}
              disabled={fields.length === 1}
              aria-label={t('removeRow', { index: row.index + 1 })}
              title={t('removeTooltip')}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    // Selection state (selectedIds / toggleRow / allSelected /
    // toggleAll) lives in SelectionContext now — the cells consume
    // it via useContext, so toggling a checkbox no longer rebuilds
    // every column definition.
    [t, register, buildings, fields.length, remove, onEdit, duplicateRow],
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

  // Container-level paste handler. Bulk paste triggers row creation;
  // anything else falls through to the focused input's native paste.
  //
  // Bulk-paste signals (must be unambiguous — false positives swallow
  // the user's text):
  //   - multi-line content (\n)         — Excel rows always have \n
  //   - single-line with a tab          — TSV is unambiguous
  //
  // Single-line content with a comma is NOT a bulk-paste signal: a
  // user pasting "1.234,56" (German number) into a sizeSqm cell or
  // "Berlin, 10115" into a description cell would otherwise lose
  // their text to the parser. Plain CSV requires multiple lines to
  // qualify, which matches how Excel's "copy as CSV" actually works.
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const raw = event.clipboardData.getData('text/plain');
      if (!shouldHandleAsBulkPaste(raw)) return;
      event.preventDefault();
      const parsed = parsePastedRows(raw, { buildingsCount: buildings.length });
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
      const startIndex = isPristineSeed ? 0 : fields.length;
      for (const row of parsed.rows) {
        append(row, { shouldFocus: false });
      }
      flashRange(startIndex, parsed.rows.length);
      // Scroll the first newly-pasted row into view so a paste that
      // lands below the fold isn't invisible to the user.
      requestAnimationFrame(() => {
        const target = containerRef.current?.querySelector<HTMLElement>(
          `tr[data-index="${startIndex}"], tbody tr:nth-child(${startIndex + 1})`,
        );
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      const errorCount = parsed.errors.length;
      const okCount = parsed.rows.length - new Set(parsed.errors.map((e) => e.rowIndex)).size;
      toast.success(
        errorCount === 0
          ? t('paste.successAll', { count: parsed.rows.length })
          : t('paste.successPartial', { count: okCount, errors: errorCount }),
      );
    },
    [append, remove, fields, buildings.length, flashRange, containerRef, t],
  );

  const selectionContextValue = useMemo<SelectionContextValue>(
    () => ({ selectedIds, allSelected, toggleRow, toggleAll }),
    [selectedIds, allSelected, toggleRow, toggleAll],
  );

  // Virtualization kicks in past 50 rows (T-409). Below the
  // threshold the native table renders every row, which keeps
  // small lists simple to test + screenshot. Above, TanStack
  // Virtual measures a scrollable container and renders only
  // the visible window; we wrap the visible rows in <tr>
  // padding spacers so the table layout stays valid.
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const rowModel = table.getRowModel();
  const isVirtualized = rowModel.rows.length > 50;
  const virtualizer = useVirtualizer({
    count: isVirtualized ? rowModel.rows.length : 0,
    getScrollElement: () => tableScrollRef.current,
    // CellWithChip stacks input + chip vertically (gap-1, ~14 px
    // chip line) so a real row is closer to ~70 px than the
    // 56 px input height. TanStack Virtual measures + corrects,
    // but a closer estimate avoids a brief jumpy first scroll
    // on a 200-row paste.
    estimateSize: () => 70,
    overscan: 8,
  });
  const virtualRows = isVirtualized ? virtualizer.getVirtualItems() : [];
  const totalSize = isVirtualized ? virtualizer.getTotalSize() : 0;
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0) : 0;

  return (
    <SelectionContext.Provider value={selectionContextValue}>
    <DuplicateRowsContext.Provider value={duplicateRows}>
    <div
      ref={containerRef}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onPaste={handlePaste}
      className="flex flex-col gap-3"
    >
      {errorSummary.length > 0 ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p className="font-medium text-destructive">
            {t('errors.summaryTitle', { count: errorSummary.length })}
          </p>
          <p className="mt-0.5 text-xs text-destructive/80">{t('errors.summaryHint')}</p>
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {errorSummary.slice(0, ERROR_SUMMARY_MAX).map((item, i) => (
              <li key={`${item.rowIndex}-${i}`} className="leading-tight">
                <button
                  type="button"
                  onClick={() => scrollToRow(item.rowIndex)}
                  className="text-left text-destructive underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 rounded px-1 -mx-1"
                >
                  <span className="font-medium">
                    {t('errors.summaryRowLabel', { row: item.rowIndex + 1 })}
                  </span>
                  <span className="text-destructive/85"> — {item.message}</span>
                </button>
              </li>
            ))}
          </ul>
          {errorSummary.length > ERROR_SUMMARY_MAX ? (
            <p className="mt-2 text-xs text-destructive/70">
              {t('errors.summaryMore', { count: errorSummary.length - ERROR_SUMMARY_MAX })}
            </p>
          ) : null}
        </div>
      ) : null}
      {liveSelectedCount > 0 ? (
        <div className="sticky top-2 z-30 flex flex-col-reverse items-stretch gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground">
            {t('bulkDelete.selectedCount', { count: liveSelectedCount })}
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
              variant="outline"
              size="sm"
              onClick={duplicateSelected}
              className="hover:bg-success/10 hover:text-success"
            >
              <CopyPlus className="h-4 w-4" aria-hidden="true" />
              {t('bulkDuplicate.duplicateSelected')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={deleteSelected}
              disabled={liveSelectedCount >= fields.length}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t('bulkDelete.deleteSelected')}
            </Button>
          </div>
        </div>
      ) : null}
      {(() => {
        // The table itself is identical in both branches; only the
        // body content differs. Extracting it keeps the conditional
        // wrapper (DndContext when not virtualized) from forcing two
        // copies of <table> + <thead>, which was easy to drift.
        const tableEl = (
          <div
            ref={tableScrollRef}
            className={cn(
              'overflow-x-auto rounded-lg border border-border bg-card',
              // Vertical virtualization needs a scrollable container.
              // Engage only past the AC threshold so small lists render
              // as a native table with no virtualization overhead.
              isVirtualized && 'overflow-y-auto max-h-[640px]',
            )}
          >
            <table className="w-full min-w-[1200px] table-fixed caption-bottom text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted/30">
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
                {isVirtualized ? (
                  <>
                    {/* Inline `style={{ height }}` is unavoidable here:
                        the spacer height is dynamic per scroll position,
                        so a Tailwind utility class can't express it. */}
                    {paddingTop > 0 ? (
                      <tr aria-hidden="true">
                        <td colSpan={columns.length} style={{ height: paddingTop, padding: 0 }} />
                      </tr>
                    ) : null}
                    {virtualRows.map((virtualRow) => {
                      const row = rowModel.rows[virtualRow.index];
                      if (!row) return null;
                      return (
                        <tr
                          key={row.id}
                          data-index={virtualRow.index}
                          className="border-b border-border last:border-0"
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td
                              key={cell.id}
                              style={{ width: cell.column.getSize() }}
                              className="px-3 py-2 align-middle"
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {paddingBottom > 0 ? (
                      <tr aria-hidden="true">
                        <td colSpan={columns.length} style={{ height: paddingBottom, padding: 0 }} />
                      </tr>
                    ) : null}
                  </>
                ) : (
                  rowModel.rows.map((row) => (
                    <SortableRow
                      key={row.id}
                      rowId={(row.original as { id?: string }).id ?? row.id}
                      highlighted={isHighlighted(row.index)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                          className="px-3 py-2 align-middle"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </SortableRow>
                  ))
                )}
              </tbody>
            </table>
          </div>
        );
        // DndContext renders accessibility helpers as sibling <div>s
        // alongside its children. Mounting it inside <tbody> made
        // those <div>s direct children of a <tbody> — invalid HTML
        // and a hydration mismatch. Hoisting the provider outside
        // the table fixes the structure without affecting the
        // sortable rows themselves (each <SortableRow> still uses
        // useSortable from the same DndContext via React context).
        //
        // The explicit `id` prop pins dnd-kit's
        // aria-describedby/-roledescription IDs to a stable string
        // instead of letting the library's module-level counter
        // hand out different numbers on the SSR vs. CSR pass.
        // Without it, the sortable handle hydrates with mismatched
        // aria-describedby="DndDescribedBy-N" values.
        return isVirtualized ? (
          tableEl
        ) : (
          <DndContext
            id="unit-table-dnd"
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={fields.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              {tableEl}
            </SortableContext>
          </DndContext>
        );
      })()}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => append(EMPTY_UNIT)}>
          + {t('addRow')}
        </Button>
        <GenerateUnitsDialog
          onGenerate={({ rows, skipped }) => {
            // Pristine seed → replace; otherwise append.
            const pristine =
              fields.length === 1 &&
              (fields[0] as unknown as WizardUnitDraft).number === '' &&
              (fields[0] as unknown as WizardUnitDraft).type === 'APARTMENT';
            if (pristine) remove(0);
            const startIndex = pristine ? 0 : fields.length;
            for (const row of rows) append(row, { shouldFocus: false });
            flashRange(startIndex, rows.length);
            // Generator skipped existing numbers in the same building so
            // we never produce a row that would 409 on save. Mention it
            // in the toast so the user knows why their range advanced.
            toast.success(
              skipped > 0
                ? t('generate.toastSkipped', { count: rows.length, skipped })
                : t('generate.toast', { count: rows.length }),
            );
          }}
        />
      </div>
    </div>
    </DuplicateRowsContext.Provider>
    </SelectionContext.Provider>
  );
}

const cellInputClass = cn(
  'flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
  'disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground',
);

/**
 * Sortable wrapper around a single body row. Renders the GripVertical
 * drag handle in the first cell of the row (the dragHandle column
 * reserves the width but emits no content), wires the dnd-kit
 * `setNodeRef` + `attributes` + `listeners` so a pointer drag on the
 * handle (or keyboard Space-to-lift) reorders the field array. The
 * handle uses `cursor-grab` / `cursor-grabbing` for affordance and
 * `touch-none` so mobile drags don't accidentally scroll the page.
 * `isDragging` lifts the row above siblings + dims it so the user
 * can see what they're moving.
 */
function SortableRow({
  rowId,
  highlighted,
  children,
}: {
  rowId: string;
  highlighted: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations('wizard.units');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rowId,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  // The dragHandle column reserves a <td> as the row's first cell
  // (its column def renders null content). We REPLACE that empty cell
  // with the actual handle so the column count stays in sync with the
  // header. Subsequent cells render as-is.
  const childArray = Array.isArray(children) ? children : [children];
  const [, ...rest] = childArray as React.ReactElement[];
  return (
    <tr
      ref={setNodeRef}
      style={style}
      data-recently-added={highlighted ? 'true' : undefined}
      className={cn(
        'border-b border-border last:border-0 transition-colors duration-1000',
        highlighted && 'bg-success/10',
        isDragging && 'relative z-10 opacity-80 shadow-md',
      )}
    >
      <td
        style={{ width: 32 }}
        className="px-1 py-2 align-middle"
        {...attributes}
        {...listeners}
      >
        <button
          type="button"
          aria-label={t('dragRow')}
          title={t('dragTooltip')}
          className="flex h-7 w-full cursor-grab items-center justify-center rounded text-muted-foreground touch-none hover:bg-accent hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </td>
      {rest}
    </tr>
  );
}

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

// Per-cell red border + tooltip is gated on (cell is dirty || the
// wizard has flipped the global errorsVisible flag) so a freshly
// rendered table doesn't paint the seeded empty row in red. RHF's
// dirtyFields is keyed by row index, which shifts on remove/insert —
// that's fine here because the array stays in sync with `errors`.
function useUnitCellErrorGate(rowIndex: number, key: string): boolean {
  const {
    formState: { dirtyFields },
  } = useFormContext<WizardDraftInput>();
  const { errorsVisible } = useWizard();
  const dirty = Boolean(
    (dirtyFields.units?.[rowIndex] as Record<string, unknown> | undefined)?.[key],
  );
  return dirty || errorsVisible;
}

function RoomsCell({ rowIndex, onEdit }: { rowIndex: number; onEdit: () => void }) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<WizardDraftInput>();
  const type = useWatch({ control, name: `units.${rowIndex}.type` }) as WizardUnitType;
  const isApartment = type === 'APARTMENT';
  const rawError = (errors.units?.[rowIndex] as { rooms?: { message?: string } } | undefined)?.rooms
    ?.message;
  const showError = useUnitCellErrorGate(rowIndex, 'rooms');
  const error = showError ? rawError : undefined;
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
  const rawError = (errors.units?.[rowIndex] as { sizeSqm?: { message?: string } } | undefined)
    ?.sizeSqm?.message;
  const showError = useUnitCellErrorGate(rowIndex, 'sizeSqm');
  const error = showError ? rawError : undefined;
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
  const t = useTranslations('wizard.units');
  const {
    register,
    formState: { errors },
  } = useFormContext<WizardDraftInput>();
  const rawError = (errors.units?.[rowIndex] as { number?: { message?: string } } | undefined)?.number
    ?.message;
  const showError = useUnitCellErrorGate(rowIndex, 'number');
  const schemaError = showError ? rawError : undefined;
  // Cross-row uniqueness — paint red border + tooltip immediately,
  // gated on errorsVisible OR a dirty row (same gate as schema
  // errors) so a freshly-pasted block doesn't flash red before the
  // user has a chance to read what they pasted.
  const dup = useDuplicateRowInfo(rowIndex);
  const dupMessage =
    dup && showError
      ? t('errors.duplicateNumber', {
          row: dup.duplicateOf + 1,
          building: dup.buildingLabel,
        })
      : undefined;
  const errorMessage = schemaError ?? dupMessage;
  return (
    <input
      type="text"
      maxLength={20}
      data-cell-row={rowIndex}
      data-cell-col="number"
      aria-invalid={Boolean(errorMessage) || undefined}
      title={errorMessage}
      {...register(`units.${rowIndex}.number`, { onChange: onEdit })}
      className={cn(cellInputClass, errorMessage && 'border-destructive')}
    />
  );
}

function MeaCell({ rowIndex, onEdit }: { rowIndex: number; onEdit: () => void }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<WizardDraftInput>();
  const rawError = (errors.units?.[rowIndex] as { meaShare?: { message?: string } } | undefined)
    ?.meaShare?.message;
  const showError = useUnitCellErrorGate(rowIndex, 'meaShare');
  const error = showError ? rawError : undefined;
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

'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, RefreshCw, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormContext, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
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
import { useUploadDocument } from '@/lib/hooks/use-upload-document';
import { useExtractDocument } from '@/lib/hooks/use-extract-document';
import {
  buildImportPlan,
  mergeKeepExisting,
  replaceAll,
  type ImportPlan,
} from '@/lib/import-units-from-extraction';
import type {
  WizardDraftInput,
  WizardUnitDraft,
} from '@/lib/schemas/wizard-draft';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'application/pdf';

interface ImportUnitsFromFileDialogProps {
  /**
   * Called when the user commits an import (Replace or Merge). Parent
   * is responsible for swapping the field-array contents — keeping
   * the RHF mutation owned by the parent table preserves a single
   * write site and avoids the dialog reaching into useFieldArray.
   */
  onApply: (next: WizardUnitDraft[], summary: ApplySummary) => void;
}

export interface ApplySummary {
  mode: 'replace' | 'merge';
  added: number;
  kept: number;
  conflicts: number;
  dropped: number;
}

/**
 * Sleek units-only import path that complements (without touching)
 * the step-1 whole-document extraction. The user lands on the units
 * step, clicks Import → picks a PDF → server runs the same
 * extraction pipeline → we filter to units only and present a
 * dry-run preview.
 *
 * Three commit modes, picked in the preview footer:
 *   - Replace All: drop every existing unit row, install the
 *     extracted set. Destructive — labelled red and gated on a
 *     visible conflict count so a misclick can't quietly nuke
 *     hand-typed work.
 *   - Merge: append the extracted units that don't collide with
 *     existing (buildingIndex, number). Existing rows are never
 *     touched — the safest default.
 *   - Discard: closes the dialog, no mutation.
 *
 * What this dialog deliberately does NOT do:
 *   - Touch step 1 (general info) or step 2 (buildings). The
 *     extraction response carries property + buildings too, but
 *     we ignore them so the wizard's first two steps are never
 *     overwritten by a units-import action.
 *   - Persist anything to the server. The dialog mutates wizard
 *     RHF state only; saving is still the wizard's Save Property
 *     button at the end of step 3.
 */
export function ImportUnitsFromFileDialog({ onApply }: ImportUnitsFromFileDialogProps) {
  const t = useTranslations('wizard.units.import');
  const upload = useUploadDocument();
  const extract = useExtractDocument();
  const { control } = useFormContext<WizardDraftInput>();
  const buildingsWatch = useWatch({ control, name: 'buildings' });
  const unitsWatch = useWatch({ control, name: 'units' });
  // Memoising the empty-array fallback keeps the downstream useMemo /
  // useCallback dependency lists stable when the form state is
  // briefly undefined (initial mount, post-reset). Without this each
  // render produces a new `[]` reference and the plan recomputes.
  const buildings = useMemo(() => buildingsWatch ?? [], [buildingsWatch]);
  const units = useMemo(() => unitsWatch ?? [], [unitsWatch]);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isExtracting = upload.isPending || extract.isPending;
  const extraction = extract.data?.extraction;
  const hasError = upload.isError || extract.isError;

  const plan: ImportPlan | null = useMemo(() => {
    if (!extraction) return null;
    return buildImportPlan(
      extraction,
      buildings,
      units.map((u) => ({
        buildingIndex: u.buildingIndex,
        number: u.number ?? '',
      })),
    );
  }, [extraction, buildings, units]);

  const reset = useCallback(() => {
    setFile(null);
    upload.reset();
    extract.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [upload, extract]);

  const close = useCallback(() => {
    setOpen(false);
    // Defer reset so the closing animation doesn't flash an empty
    // state mid-fade.
    requestAnimationFrame(() => reset());
  }, [reset]);

  const runExtraction = useCallback(
    async (picked: File) => {
      try {
        const uploaded = await upload.mutateAsync(picked);
        await extract.mutateAsync({ documentId: uploaded.id });
      } catch {
        // Error surfaces via the upload / extract mutation state below;
        // no toast so the user only sees one signal.
      }
    },
    [upload, extract],
  );

  const handlePickFile = useCallback(
    (picked: File | null) => {
      if (!picked) return;
      if (picked.size > MAX_BYTES) {
        toast.error(t('errorTooLarge'));
        return;
      }
      if (picked.type && picked.type !== ACCEPT) {
        toast.error(t('errorWrongType'));
        return;
      }
      setFile(picked);
      void runExtraction(picked);
    },
    [runExtraction, t],
  );

  const handleReplace = useCallback(() => {
    if (!plan) return;
    onApply(replaceAll(plan), {
      mode: 'replace',
      added: plan.matched.length,
      kept: 0,
      conflicts: plan.conflicts.length,
      dropped: plan.droppedCount,
    });
    toast.success(
      t('toastApplied.replace', { count: plan.matched.length }),
    );
    close();
  }, [plan, onApply, close, t]);

  const handleMerge = useCallback(() => {
    if (!plan) return;
    const next = mergeKeepExisting(units as WizardUnitDraft[], plan);
    const added = plan.matched.length - plan.conflicts.length;
    onApply(next, {
      mode: 'merge',
      added,
      kept: units.length,
      conflicts: plan.conflicts.length,
      dropped: plan.droppedCount,
    });
    toast.success(
      plan.conflicts.length > 0
        ? t('toastApplied.mergeWithConflicts', { added, conflicts: plan.conflicts.length })
        : t('toastApplied.merge', { count: added }),
    );
    close();
  }, [plan, units, onApply, close, t]);

  const buildingsCount = buildings.length;
  const buildingsMissing = buildingsCount === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={buildingsMissing}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          {t('cta')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {!file ? (
          <FilePickerCard
            onPick={handlePickFile}
            label={t('pickLabel')}
            hint={t('pickHint')}
            inputRef={fileInputRef}
          />
        ) : isExtracting ? (
          <ExtractionProgress filename={file.name} label={t('extractingLabel')} />
        ) : hasError ? (
          <ExtractionError
            message={t('errorExtraction')}
            onRetry={() => {
              upload.reset();
              extract.reset();
              if (file) void runExtraction(file);
            }}
            onClear={reset}
            retryLabel={t('retry')}
            clearLabel={t('clear')}
          />
        ) : plan ? (
          <PlanPreview plan={plan} t={t} buildingsCount={buildingsCount} />
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={close}>
            {t('discard')}
          </Button>
          {plan ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={handleMerge}
                disabled={plan.matched.length === 0}
              >
                {t('merge')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleReplace}
                disabled={plan.matched.length === 0}
              >
                {t('replace')}
              </Button>
            </div>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilePickerCard({
  onPick,
  label,
  hint,
  inputRef,
}: {
  onPick: (file: File | null) => void;
  label: string;
  hint: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-center hover:border-primary/40 hover:bg-primary/5">
      <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function ExtractionProgress({ filename, label }: { filename: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{filename}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ExtractionError({
  message,
  onRetry,
  onClear,
  retryLabel,
  clearLabel,
}: {
  message: string;
  onRetry: () => void;
  onClear: () => void;
  retryLabel: string;
  clearLabel: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-medium text-destructive">{message}</p>
        <div className="mt-2 flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {retryLabel}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {clearLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlanPreview({
  plan,
  t,
  buildingsCount,
}: {
  plan: ImportPlan;
  t: ReturnType<typeof useTranslations<'wizard.units.import'>>;
  buildingsCount: number;
}) {
  const sample = plan.conflicts.slice(0, 5).map((c) => c.number);
  const newCount = plan.matched.length - plan.conflicts.length;
  return (
    <div className="space-y-3 text-sm">
      <ul className="grid grid-cols-2 gap-2 text-xs">
        <Stat label={t('previewIncoming')} value={plan.incomingCount} />
        <Stat label={t('previewMatched')} value={plan.matched.length} />
        <Stat label={t('previewNew')} value={newCount} tone="success" />
        <Stat label={t('previewConflicts')} value={plan.conflicts.length} tone={plan.conflicts.length > 0 ? 'warning' : undefined} />
      </ul>
      {plan.droppedCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('droppedNote', { count: plan.droppedCount, buildings: buildingsCount })}
        </p>
      ) : null}
      {plan.conflicts.length > 0 ? (
        <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-foreground">
          <span className="font-medium">{t('conflictHeading', { count: plan.conflicts.length })}</span>{' '}
          {sample.join(', ')}
          {plan.conflicts.length > sample.length
            ? t('conflictMore', { remaining: plan.conflicts.length - sample.length })
            : null}
        </p>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'warning';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : 'text-foreground';
  return (
    <li className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono text-sm font-semibold ${valueClass}`}>{value}</span>
    </li>
  );
}

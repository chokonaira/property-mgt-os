'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, FilePlus2, FileX2, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AuditAction, AuditEntity, AuditLogEntry } from '@buena/shared';
import { usePropertyHistory } from '@/lib/hooks/use-property-history';
import { cn } from '@/lib/utils';

interface PropertyHistoryDialogProps {
  propertyId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

const PAGE_SIZE = 50;

/**
 * Full audit timeline for a property + every building + every unit
 * under it. Sleek vertical timeline (think GitHub issue history),
 * mobile-responsive (full-height bottom-sheet on small screens, fixed
 * dialog on desktop), and scrollable when the list runs long.
 *
 * Each row carries:
 *   - Action icon (created / updated / deleted) + colour
 *   - Entity badge + entity id (last 6 chars for compactness)
 *   - Actor name + relative timestamp
 *   - Field-level diff for updates (precomputed server-side via
 *     `changedFields` so we don't re-walk JSON snapshots client-side).
 *     "Show full snapshot" toggle expands the raw before / after.
 */
export function PropertyHistoryDialog({ propertyId, open, onOpenChange }: PropertyHistoryDialogProps) {
  const t = useTranslations('history');
  const [page, setPage] = useState(0);
  const { data, isPending, isError } = usePropertyHistory(propertyId, {
    take: PAGE_SIZE,
    skip: page * PAGE_SIZE,
    enabled: open,
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const hasMore = total > (page + 1) * PAGE_SIZE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Mobile: full-screen sheet style. Desktop: bounded dialog.
          'flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 p-0',
          'sm:max-h-[80vh]',
        )}
      >
        <DialogHeader className="flex-shrink-0 border-b border-border px-5 py-4">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { total })}</DialogDescription>
        </DialogHeader>

        {/* Scrollable timeline body. flex-1 so it fills remaining
            dialog height; min-h-0 unblocks flexbox scroll on Safari. */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isPending ? (
            <Skeleton />
          ) : isError ? (
            <p className="text-sm text-destructive">{t('error')}</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <ol className="relative ml-3 space-y-6 border-l border-border pl-6">
              {items.map((entry) => (
                <TimelineEntry key={entry.id} entry={entry} />
              ))}
            </ol>
          )}
        </div>

        {/* Footer pagination. Single "Load more" button — feels
            lighter than full pagination on a timeline + matches the
            GitHub history pattern. */}
        {hasMore ? (
          <div className="flex-shrink-0 border-t border-border px-5 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              className="w-full"
            >
              {t('loadMore', { remaining: total - (page + 1) * PAGE_SIZE })}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Skeleton() {
  return (
    <ol className="relative ml-3 space-y-6 border-l border-border pl-6">
      {[0, 1, 2].map((i) => (
        <li key={i} className="space-y-2">
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          <div className="h-3 w-48 animate-pulse rounded bg-muted" />
          <div className="h-3 w-64 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ol>
  );
}

const ACTION_ICON: Record<AuditAction, typeof Pencil> = {
  create: FilePlus2,
  update: Pencil,
  delete: FileX2,
  upsert: Pencil,
};

const ACTION_TONE: Record<AuditAction, string> = {
  create: 'bg-success/10 text-success ring-success/30',
  update: 'bg-accent/10 text-accent ring-accent/30',
  delete: 'bg-destructive/10 text-destructive ring-destructive/30',
  upsert: 'bg-accent/10 text-accent ring-accent/30',
};

function TimelineEntry({ entry }: { entry: AuditLogEntry }) {
  const t = useTranslations('history');
  const [showSnapshot, setShowSnapshot] = useState(false);
  const Icon = ACTION_ICON[entry.action];
  const tone = ACTION_TONE[entry.action];
  const initials = entry.actor.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  const entityIdShort = entry.entityId.slice(-6);
  const isDiff = entry.action === 'update' && entry.changedFields.length > 0;

  return (
    <li className="relative">
      {/* Marker dot on the timeline rail */}
      <span
        className={cn(
          'absolute -left-9 top-0 inline-flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-inset',
          tone,
        )}
        aria-hidden="true"
      >
        <Icon className="h-3 w-3" />
      </span>

      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        {/* Header row: actor + entity + timestamp. Wraps on narrow screens. */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
            {initials || '?'}
          </span>
          <span className="font-medium text-foreground">{entry.actor.name}</span>
          <span className="text-muted-foreground">{t(`actions.${entry.action}`) as string}</span>
          <Badge variant="outline" className="font-normal">
            {t(`entities.${entry.entity as AuditEntity}`) as string}
          </Badge>
          <span className="font-mono text-[10px] text-muted-foreground/70">#{entityIdShort}</span>
          <span className="ml-auto whitespace-nowrap text-muted-foreground">
            {formatTimestamp(t, entry.createdAt)}
          </span>
        </div>

        {isDiff ? <DiffList changes={entry.changedFields} /> : null}

        {/* Snapshot toggle — power-user view of the full before / after JSON.
            Hidden by default to keep the timeline scannable. */}
        {(entry.before !== null || entry.after !== null) && (
          <button
            type="button"
            onClick={() => setShowSnapshot((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {showSnapshot ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {showSnapshot ? t('hideSnapshot') : t('showSnapshot')}
          </button>
        )}

        {showSnapshot ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <SnapshotBlock title={t('before')} value={entry.before} />
            <SnapshotBlock title={t('after')} value={entry.after} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function DiffList({ changes }: { changes: ReadonlyArray<{ field: string; before?: unknown; after?: unknown }> }): React.ReactElement {
  return (
    <ul className="space-y-1 text-sm">
      {changes.map((change) => (
        <li
          key={change.field}
          className="grid grid-cols-[max-content,1fr] items-baseline gap-x-3 gap-y-0.5 sm:grid-cols-[max-content,1fr,auto,1fr]"
        >
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {change.field}
          </span>
          <span className="truncate font-mono text-xs text-destructive line-through">
            {formatValue(change.before)}
          </span>
          <span className="hidden text-muted-foreground sm:inline">→</span>
          <span className="truncate font-mono text-xs text-success">
            {formatValue(change.after)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SnapshotBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-foreground">
        {value === null ? '∅' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v.length > 60 ? `${v.slice(0, 60)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
  return String(v);
}

function formatTimestamp(t: ReturnType<typeof useTranslations>, iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return t('justNow');
  if (ms < 60 * 60_000) return t('minutesAgo', { count: Math.round(ms / 60_000) });
  if (ms < 24 * 60 * 60_000) return t('hoursAgo', { count: Math.round(ms / (60 * 60_000)) });
  return new Date(iso).toLocaleString();
}

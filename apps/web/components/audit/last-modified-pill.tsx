'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AuditAction, AuditEntity } from '@buena/shared';
import { HISTORY_PILL_SIZE, usePropertyHistory } from '@/lib/hooks/use-property-history';
import { PropertyHistoryDialog } from './property-history-dialog';
import { cn } from '@/lib/utils';

interface LastModifiedPillProps {
  propertyId: string;
  className?: string;
}

const PREVIEW_COUNT = HISTORY_PILL_SIZE;

/**
 * Compact "Last modified by X · 5 min ago" pill for the property
 * detail header. Two surfaces, one trigger:
 *
 *   - HOVER (desktop) / TAP (mobile): non-blocking Popover with the
 *     last few entries — quick glance without leaving the page.
 *   - "View all changes" button INSIDE the Popover opens the full
 *     timeline dialog (paginated, scrollable, mobile-responsive).
 *
 * The Popover preview reads PREVIEW_COUNT entries; the full dialog
 * reads its own page. They share the same React Query key prefix so
 * the dialog opens instantly with the preview's data already cached.
 */
export function LastModifiedPill({ propertyId, className }: LastModifiedPillProps) {
  const t = useTranslations('history');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data, isPending } = usePropertyHistory(propertyId, { take: PREVIEW_COUNT });
  const latest = data?.items[0];
  const previewItems = data?.items ?? [];
  const total = data?.total ?? 0;

  // Hover handoff between the pill and the popover used to flicker:
  // a mouse-leave from the pill fired BEFORE mouse-enter on the
  // popover content (the two elements have a 1-2px DOM gap even with
  // sideOffset=0), so the popover briefly closed before reopening.
  // Buffering the close in a 120ms timer that any subsequent enter
  // cancels gives the cursor a comfortable bridge — fast enough that
  // a real "I'm done" leave still closes promptly, slow enough to
  // absorb the cross-element gap.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);
  const openNow = useCallback(() => {
    cancelClose();
    setPopoverOpen(true);
  }, [cancelClose]);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setPopoverOpen(false), 120);
  }, [cancelClose]);
  useEffect(() => () => cancelClose(), [cancelClose]);

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onMouseEnter={openNow}
            onMouseLeave={scheduleClose}
            onFocus={openNow}
            onBlur={scheduleClose}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition-colors',
              'hover:border-accent/40 hover:bg-accent/10 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              className,
            )}
            aria-label={t('viewHistory')}
          >
            <Clock className="h-3 w-3" aria-hidden="true" />
            {isPending ? (
              // Slim shimmer instead of a "Loading history…" word so
              // the pill doesn't read as a status update on every
              // mount. The bar is the same width the typical
              // "Last modified by …" string occupies, so the pill
              // doesn't reflow when the data lands.
              <span
                aria-label={t('loading')}
                className="inline-block h-3 w-32 animate-pulse rounded bg-muted-foreground/20"
              />
            ) : latest ? (
              <>
                {/* Mobile: compact "Demo User · 48 min ago" — drops
                    the redundant "Last modified by" prefix that
                    would push the pill out of the header strip on
                    sub-380 px screens. Desktop keeps the full
                    sentence for clarity. */}
                <span className="truncate sm:hidden">
                  {t('lastModifiedShort', {
                    actor: latest.actor.name,
                    when: relativeTime(t, latest.createdAt),
                  })}
                </span>
                <span className="hidden truncate sm:inline">
                  {t('lastModified', {
                    actor: latest.actor.name,
                    when: relativeTime(t, latest.createdAt),
                  })}
                </span>
              </>
            ) : (
              <span>{t('noHistory')}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          // sideOffset=2 keeps a faint visual separation between
          // pill + popover but is small enough that the cursor
          // can cross it within the close-timer's grace window.
          sideOffset={2}
          // Don't auto-focus the first focusable child on open —
          // a focus shift while the user is hovering ricochets
          // through onFocus/onBlur of the pill and re-triggers the
          // open/close cycle.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          className="w-96 max-w-[calc(100vw-2rem)] p-0"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('title')}
            </p>
          </div>
          <ol className="max-h-72 overflow-y-auto py-1">
            {isPending ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">{t('loading')}</li>
            ) : previewItems.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">{t('empty')}</li>
            ) : (
              previewItems.map((entry) => (
                <li key={entry.id} className="border-b border-border last:border-0">
                  {/* Each row is a button so hover/focus communicates
                      'this is interactive' AND clicking anywhere in
                      the row opens the full timeline (matches the
                      explicit View-all CTA below). Keeps the
                      affordance discoverable without forcing the
                      user to aim at the small footer button. */}
                  <button
                    type="button"
                    onClick={() => {
                      setPopoverOpen(false);
                      setDialogOpen(true);
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent/10 focus-visible:bg-accent/10 focus-visible:outline-none"
                    aria-label={t('viewAll', { total })}
                  >
                    <ActionDot action={entry.action} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-foreground">
                        <span className="font-medium">{entry.actor.name}</span>{' '}
                        <span className="text-muted-foreground">
                          {t(`actions.${entry.action}`) as string}
                        </span>{' '}
                        <Badge variant="outline" className="ml-1 font-normal">
                          {t(`entities.${entry.entity as AuditEntity}`) as string}
                        </Badge>
                      </p>
                      {entry.changedFields.length > 0 ? (
                        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                          {entry.changedFields
                            .slice(0, 3)
                            .map((c) => c.field)
                            .join(', ')}
                          {entry.changedFields.length > 3
                            ? ` +${entry.changedFields.length - 3}`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                    <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                      {relativeTime(t, entry.createdAt)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ol>
          {total > 0 ? (
            <div className="border-t border-border px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => {
                  setPopoverOpen(false);
                  setDialogOpen(true);
                }}
              >
                <History className="h-3 w-3" aria-hidden="true" />
                {t('viewAll', { total })}
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      {dialogOpen ? (
        <PropertyHistoryDialog
          propertyId={propertyId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}
    </>
  );
}

function ActionDot({ action }: { action: AuditAction }) {
  const tone =
    action === 'create'
      ? 'bg-success'
      : action === 'delete'
        ? 'bg-destructive'
        : 'bg-accent';
  return (
    <span className={cn('mt-1 inline-block h-2 w-2 shrink-0 rounded-full', tone)} aria-hidden="true" />
  );
}

function relativeTime(t: ReturnType<typeof useTranslations>, iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 5_000) return t('justNow');
  if (ms < 60_000) return t('secondsAgo', { count: Math.round(ms / 1_000) });
  if (ms < 60 * 60_000) return t('minutesAgo', { count: Math.round(ms / 60_000) });
  if (ms < 24 * 60 * 60_000) return t('hoursAgo', { count: Math.round(ms / (60 * 60_000)) });
  return t('daysAgo', { count: Math.round(ms / (24 * 60 * 60_000)) });
}

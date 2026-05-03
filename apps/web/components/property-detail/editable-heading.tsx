'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { z, type ZodSchema } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { useUpdateProperty } from '@/lib/hooks/use-update-property';
import type { UpdateProperty } from '@buena/shared';
import { cn } from '@/lib/utils';

interface EditableHeadingProps {
  propertyId: string;
  field: 'name' | 'uniqueNumber';
  value: string;
  // Caller decides the visual treatment so the heading still reads as
  // an h1 / mono-pill when not editing — the component is structure +
  // wiring, not opinionated typography.
  display: React.ReactNode;
  // Schema is supplied externally so the validation matches the wire
  // contract (CreateProperty.shape.name etc.) without this component
  // having to import @buena/shared and re-derive it inline.
  schema: ZodSchema<string>;
  ariaLabel: string;
  inputClassName?: string;
}

/**
 * Click-to-edit wrapper for the property header's name + uniqueNumber.
 * Renders the read-only `display` node with a small pencil button
 * adjacent; clicking flips into an input + save / cancel pair. Save
 * fires the update mutation; on success the parent re-renders with
 * the fresh detail (React Query invalidate).
 *
 * Keyboard:
 *   - Enter saves
 *   - Escape cancels (no patch sent)
 *
 * Validation:
 *   - The supplied schema runs on every keystroke; a failed parse
 *     disables Save and surfaces the message under the input.
 *   - Server-side conflicts (P2002 / 409 on uniqueNumber) flow back
 *     as a toast — the inline detector only catches client-side
 *     length / regex issues, never collisions.
 *
 * Read-only mode is the default; the pencil is only visible on
 * hover / focus to keep the header clean. The button still has an
 * aria-label so screen-reader users can find it without hover.
 */
export function EditableHeading({
  propertyId,
  field,
  value,
  display,
  schema,
  ariaLabel,
  inputClassName,
}: EditableHeadingProps) {
  const t = useTranslations('propertyDetail.edit');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const update = useUpdateProperty();

  // Reset draft when the underlying value changes (e.g. another
  // tab updated the property and React Query refetched). Avoids
  // showing a stale draft if the user opens the editor afterwards.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Auto-focus + select-all when entering edit mode so the user can
  // immediately retype or extend without an extra triple-click.
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const parse = schema.safeParse(draft.trim());
  const validationError = parse.success ? null : parse.error.issues[0]?.message ?? t('invalid');
  const dirty = draft.trim() !== value;
  const canSave = parse.success && dirty && !update.isPending;

  function commit() {
    if (!canSave || !parse.success) return;
    const patch: UpdateProperty = { [field]: parse.data } as UpdateProperty;
    update.mutate(
      { id: propertyId, patch },
      {
        onSuccess: () => {
          toast.success(t('saved'));
          setEditing(false);
        },
        onError: (err: ApiError) => {
          // Surface the server message verbatim — for the
          // uniqueNumber-collision case the API returns "already
          // in use", which is exactly what the user needs to see.
          toast.error(err.body?.message ?? t('errorToast'));
        },
      },
    );
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="group/edit flex items-center gap-1.5">
        {display}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          aria-label={ariaLabel}
          className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover/edit:opacity-100 focus-visible:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          aria-invalid={validationError ? true : undefined}
          aria-label={ariaLabel}
          disabled={update.isPending}
          className={cn('h-8 max-w-[24rem]', inputClassName)}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={commit}
          disabled={!canSave}
          aria-label={t('save')}
          className="h-8 w-8 p-0 text-success hover:bg-success/10"
        >
          {update.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={cancel}
          disabled={update.isPending}
          aria-label={t('cancel')}
          className="h-8 w-8 p-0 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {validationError && dirty ? (
        <p role="alert" className="text-xs text-destructive">
          {validationError}
        </p>
      ) : null}
    </div>
  );
}

// Local schema export so the detail view can pass a stable reference
// per field without rebuilding it on every render. Mirrors the wire
// constraints in @buena/shared's PropertySchema.
export const NAME_SCHEMA = z.string().trim().min(1).max(200);
export const UNIQUE_NUMBER_SCHEMA = z.string().trim().min(1).max(64);

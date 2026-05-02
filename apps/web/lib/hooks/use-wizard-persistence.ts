'use client';

import { useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import {
  WIZARD_DRAFT_STORAGE_KEY,
  parseStoredDraft,
  serializeDraft,
} from '@/lib/wizard-persistence';
import type { WizardDraft, WizardDraftInput } from '@/lib/schemas/wizard-draft';

// Thin client-only hook: restores the draft from localStorage on first mount
// (silently no-ops on miss/parse failure), then writes the form state back
// on every change with a 500 ms throttle so we don't flood storage on
// rapid keystrokes. Server-side render is a no-op (typeof window check).
//
// Returns a `hydrated` flag callers can read to gate behaviour that depends
// on the restored draft being in form state — most importantly the wizard
// chrome's redirect guard, which would otherwise fire on the very first
// render of /properties/new/buildings (or /units) before the draft has
// been pulled out of storage.
const PERSIST_THROTTLE_MS = 500;

export interface WizardPersistenceState {
  /** True after the first restore pass has run (or no-op'd). */
  hydrated: boolean;
  /**
   * Epoch ms of the last successful localStorage write, or null when
   * nothing has been persisted in this session. Surfaces the
   * "Last saved …" indicator in the wizard footer (T-410 AC).
   */
  lastSavedAt: number | null;
}

export function useWizardPersistence(
  methods: UseFormReturn<WizardDraftInput, unknown, WizardDraft>,
): WizardPersistenceState {
  const restoredOnce = useRef(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // Restore once. Mark hydrated even if there's nothing to restore so the
  // gate doesn't sit closed forever on a brand-new visit.
  useEffect(() => {
    if (typeof window === 'undefined' || restoredOnce.current) return;
    restoredOnce.current = true;
    const stored = parseStoredDraft(window.localStorage.getItem(WIZARD_DRAFT_STORAGE_KEY));
    if (stored) {
      methods.reset(stored.draft, { keepDefaultValues: true });
    }
    setHydrated(true);
  }, [methods]);

  // Persist on change. Skip the initial value emission and any reset()
  // pass — only user edits are worth saving. RHF marks the form dirty
  // when a registered field's value diverges from its default; we use
  // that as the gate so an empty form mounting doesn't claim "Draft
  // saved" before the user has typed anything.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const subscription = methods.watch((value, info) => {
      // RHF emits a watch tick on every state change, including its
      // own methods.reset() pass during hydration. Restrict persistence
      // (and the "Draft saved" indicator) to actual user edits by
      // checking info.type — RHF emits 'change' only for register'd
      // onChange events. Restore/reset passes carry no type, so a
      // freshly hydrated form doesn't claim "Draft saved just now".
      if (info?.type !== 'change') {
        // Form is back to a clean baseline (Discard, hydration restore).
        // Drop the timestamp so the indicator doesn't reference a draft
        // that no longer matches what the user is looking at.
        if (!methods.formState.isDirty) setLastSavedAt(null);
        return;
      }
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        try {
          window.localStorage.setItem(
            WIZARD_DRAFT_STORAGE_KEY,
            serializeDraft(value as WizardDraftInput),
          );
          setLastSavedAt(Date.now());
        } catch {
          // Storage quota / privacy mode — ignore; in-memory state still works.
        }
      }, PERSIST_THROTTLE_MS);
    });
    return () => {
      subscription.unsubscribe();
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [methods]);

  return { hydrated, lastSavedAt };
}

export function clearPersistedWizardDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(WIZARD_DRAFT_STORAGE_KEY);
  } catch {
    // Same logic as the write path — best effort.
  }
}

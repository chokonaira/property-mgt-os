'use client';

import { useEffect, useRef } from 'react';
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
const PERSIST_THROTTLE_MS = 500;

export function useWizardPersistence(
  methods: UseFormReturn<WizardDraftInput, unknown, WizardDraft>,
) {
  const hydrated = useRef(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore once.
  useEffect(() => {
    if (typeof window === 'undefined' || hydrated.current) return;
    hydrated.current = true;
    const stored = parseStoredDraft(window.localStorage.getItem(WIZARD_DRAFT_STORAGE_KEY));
    if (stored) {
      methods.reset(stored.draft, { keepDefaultValues: true });
    }
  }, [methods]);

  // Persist on change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const subscription = methods.watch((value) => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        try {
          window.localStorage.setItem(
            WIZARD_DRAFT_STORAGE_KEY,
            serializeDraft(value as WizardDraftInput),
          );
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
}

export function clearPersistedWizardDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(WIZARD_DRAFT_STORAGE_KEY);
  } catch {
    // Same logic as the write path — best effort.
  }
}

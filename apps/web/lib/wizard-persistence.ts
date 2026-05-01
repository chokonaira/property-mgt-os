import { WizardDraftSchema, type WizardDraftInput } from '@/lib/schemas/wizard-draft';
import { z } from 'zod';

// Versioned localStorage envelope for the wizard draft. Bump WIZARD_DRAFT_VERSION
// whenever WizardDraftSchema changes shape — older drafts will be silently
// dropped on read so nobody booting the wizard ends up in a half-valid state.
export const WIZARD_DRAFT_STORAGE_KEY = 'buena.wizard.draft';
export const WIZARD_DRAFT_VERSION = 1;

const StoredDraftEnvelopeSchema = z.object({
  version: z.literal(WIZARD_DRAFT_VERSION),
  savedAt: z.string(),
  draft: z.unknown(),
});

export interface PersistedDraft {
  draft: WizardDraftInput;
  savedAt: string;
}

export function serializeDraft(draft: WizardDraftInput): string {
  return JSON.stringify({
    version: WIZARD_DRAFT_VERSION,
    savedAt: new Date().toISOString(),
    draft,
  });
}

// Returns null on missing key, malformed JSON, version mismatch, or
// schema-shape mismatch. Never throws — callers can boot the form
// from defaults and ignore the failure path.
export function parseStoredDraft(raw: string | null): PersistedDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const envelope = StoredDraftEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) return null;
  // The inner draft is checked against WizardDraftSchema's *input* shape
  // (so booleans / numbers / undefineds match the form-controlled values).
  // Files are excluded by design — declarationFile lives in memory only.
  const draft = WizardDraftSchema.safeParse(envelope.data.draft);
  if (!draft.success) return null;
  return { draft: envelope.data.draft as WizardDraftInput, savedAt: envelope.data.savedAt };
}

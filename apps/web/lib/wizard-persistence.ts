import type { WizardDraftInput } from '@/lib/schemas/wizard-draft';
import { z } from 'zod';

// Versioned localStorage envelope for the wizard draft. Bump WIZARD_DRAFT_VERSION
// whenever the persisted shape changes incompatibly — older drafts are
// silently dropped on read so nobody boots into a wizard that doesn't
// match the current code.
export const WIZARD_DRAFT_STORAGE_KEY = 'buena.wizard.draft';
export const WIZARD_DRAFT_VERSION = 1;

const StoredDraftEnvelopeSchema = z.object({
  version: z.literal(WIZARD_DRAFT_VERSION),
  savedAt: z.string(),
  draft: z.unknown(),
});

// Restore-time shape check — intentionally LOOSER than WizardDraftSchema.
// The strict schema is "is this draft submittable"; restore needs "is this
// JSON the right shape to slot into RHF." A user who's typed half a name
// has a draft with empty meaShare / uniqueNumber that fails strict parse —
// we still want to restore it on reload so they don't lose work. RHF +
// the wizard's own validators surface field-level errors once the form
// is mounted; this gate only protects against version-skew + corruption.
const WizardDraftStoredShape = z.object({
  general: z.object({}).passthrough(),
  buildings: z.array(z.unknown()).min(1),
  units: z.array(z.unknown()).min(1),
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
// shape-skew (missing top-level slots). Never throws — callers can
// boot the form from defaults and ignore the failure path.
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
  // Loose structural check: the three top-level slots must exist and be
  // the right kind. We trust the inner field values came from our own
  // serializer; field-level invariants are RHF's job once the form is
  // mounted. This way a partial in-flight draft restores instead of
  // silently reverting to defaults on reload.
  const shape = WizardDraftStoredShape.safeParse(envelope.data.draft);
  if (!shape.success) return null;
  return { draft: envelope.data.draft as WizardDraftInput, savedAt: envelope.data.savedAt };
}

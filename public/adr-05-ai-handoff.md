# ADR-05 · AI Handoff

**Status:** Accepted · 2026-05-01

## Context

The brief lists AI extraction as optional, but the realistic stakes are higher than "transcribe a PDF." A property manager signs the resulting record into the system; that record drives MEA calculations, owner notifications, and downstream legal artefacts. **Wrong AI data with confident UI = audit risk, lost trust, lost time.**

Constraints:

- AI outputs must always be editable by the user.
- Confidence has to be visible on a per-field level — not a single global score.
- Citations must be grounded; hallucinated source spans cannot reach the UI.
- The system must always offer a clean fallback to manual entry.
- The same principle ("AI proposes, the user disposes") must hold across every AI surface.

## Decision

**One product principle.** Every AI surface follows: _AI assists; the user decides._

- Every AI-generated value is editable.
- Every AI suggestion is dismissible.
- Every AI action is reviewable before commit.
- Every AI response cites the data it used.
- The user can always say "fill manually" and the AI yields.

**Concrete enforcement points:**

1. **Schema-validated output.** Every AI response validates against the same Zod schema the form uses. Drift is impossible by construction.
2. **Per-field confidence chips.** Green ≥ 0.85 / amber 0.6–0.85 / red < 0.6. Missing or ungrounded → grey "Unverified". The user knows where to look hard.
3. **Server-side span verification.** `verifySpans` runs `indexOf(span, sourceText)` against the original PDF text after the model returns. Spans that don't appear verbatim are dropped before the response leaves the API. **Hallucinated citations cannot reach the UI.**
4. **AI Review Panel.** A clearly-bounded surface that renders extracted values with confidence + popover-source per field, prominent warnings (e.g. MEA mismatch), Accept-all, and Discard. Form fields stay editable after accept; the chips persist next to each AI-populated input and clear when the user edits the value.
5. **Graceful fallback.** Every error mode (timeout, parse-failed, oversized, rate-limited, schema-rejected) lands the user back on a usable manual form with a localised banner + Retry + Fill manually. Structured `console.error('extraction.failed', payload)` correlates with `ExtractionRun` rows server-side.
6. **No silent persistence.** Every extraction writes an `ExtractionRun` row regardless of outcome — success, failure, or partial. The user's accept commits the data; the run record persists either way for cost tracking + prompt-iteration triage.

## Consequences

**Positive.** A reviewer can demonstrate every AI output is editable, every citation grounded, every error mode recoverable. The schema-first approach means an AI that hallucinates a field type fails at the boundary, not three layers in. The 0.6 / 0.85 thresholds make confidence a visible product cue, not an internal log line.

**Negative.** The Review Panel adds inline JS (~60 kB) on the wizard's step 1; lazy-loading via `next/dynamic` is queued for v1.1. Per-field provenance state lives on the wizard context — tying it to a real long-lived telemetry sink (Sentry + a chip-engagement event) is also v1.1.

**Neutral.** The principle scales to other AI surfaces: "every response cites" becomes "every response includes the row IDs it read"; "every action reviewable" becomes "every mutation tool-call asks for confirmation." Same enforcement points, different surface.

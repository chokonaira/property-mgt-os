# ADR-02 · AI Extraction

**Status:** Accepted · 2026-05-01

## Context

The brief lists AI document extraction as **optional**. The realistic scenario: a property manager uploads a 30-page Teilungserklärung; the system extracts property + buildings + units + contacts into structured data the wizard can pre-fill. Manual entry remains the default; AI is an assist, not a gate.

Hard requirements:

- Output must validate against the same Zod schema the form uses — no transformation layer.
- Per-field confidence so the user knows where to look hard.
- **Source citations** that point back to the PDF text — not invented; verified.
- Graceful failure path: every error mode (timeout, parse-failed, oversized, upstream rate-limited) lands the user back on a usable manual form with a localised banner.
- Zero hallucinated data persists silently.

## Decision

**Pipeline:** PDF → text-extract → token-budget guard → OpenAI structured-output call → Zod parse → server-side span verification → MEA invariant injection → persist `ExtractionRun` → return wire shape.

**Model + transport.** `gpt-4o-mini` with `response_format = { type: 'json_schema', strict: true, schema: zodToJsonSchema(ExtractionResultSchema) }`. 15 s timeout enforced via AbortController on top of the SDK timeout. Single retry on parse failure with an error addendum on the user message.

**PDF parsing.** `unpdf` (modern, maintained) primary, `pdfjs-dist` legacy build as fallback. Rejected `pdf-parse` (unmaintained since 2018, ships a sample PDF in `dist/`, wraps an old pdfjs).

**Source-span verification (post-call).** Every value in `sourceSpansByField` is checked with `indexOf(span)` against the original PDF text. Spans that don't appear verbatim are dropped; the corresponding field's chip flips to "Unverified" (grey) on the UI. Whitespace + soft-hyphens normalised; comparison is case-insensitive.

**Token-budget guard (pre-call).** PDFs over 25 K tokens (BPE-counted via `gpt-tokenizer`) short-circuit with `EXTRACTION_TOO_LARGE` before the OpenAI call. The user sees the banner; we don't pay for the request.

**Idempotency cache.** Before calling OpenAI, the orchestrator looks up the most recent successful `ExtractionRun` for the same `documentId`. Cache hit returns instantly with `cached: true` and `durationMs: 0` unless `?force=true`. Always-on, survives independent of the rate-limit ticket.

**MEA invariant.** Server-side `ensureMeaWarning` recomputes the sum-of-shares vs declared total (0.01 tolerance). If the model didn't already emit a `MEA_MISMATCH` warning, the orchestrator injects one before returning. Same tolerance the wizard's MEA bar uses, so client and server agree.

**Per-field confidence chips.** ≥ 0.85 green ("High"), 0.6–0.85 amber ("Medium"), < 0.6 red ("Low"). Missing or unverified-span field → grey ("Unverified").

**Persistence.** Every run writes an `ExtractionRun` row regardless of outcome (`status: 'ok' | 'failed'`) — used for cost tracking, prompt iteration, and the idempotency lookup.

## Consequences

**Positive.** Hallucinated citations cannot reach the UI — `verifySpans` runs server-side and drops them before the response is sent. Schema validation across the same Zod shape means the AI output drops cleanly into the wizard with no transformation layer. Idempotency cache prevents accidental double-spend on identical re-uploads. Failure modes are localised (`EXTRACTION_TIMEOUT`, `EXTRACTION_PARSE_FAILED`, `EXTRACTION_TOO_LARGE`, `SERVICE_UNAVAILABLE`, `RATE_LIMITED`) with friendly banners.

**Negative.** No OCR for scanned-only PDFs (unpdf only reads embedded text). `tesseract.js` server-side as a 3rd fallback is queued for v1.1. The 25 K-token cap is conservative; documents past that hit the manual-entry banner.

**Neutral.** Per-document Prompt versioning lives in `promptVersion: 'extract.v1'` — when the prompt iterates, the eval harness (T-507, deferred) runs against ground-truth pairs to gate regressions.

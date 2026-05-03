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

**Pipeline:** PDF → text-extract → token-budget guard → AI structured-output call → Zod parse → server-side span verification → MEA invariant injection → persist `ExtractionRun` → return wire shape.

**Provider abstraction.** `ExtractionService` depends on an `AiExtractionClient` interface (`extract(text) → ExtractionCallResult`). Two implementations ship: `AnthropicService` (default — `claude-haiku-4-5-20251001` via Messages API + forced tool_use for structured output) and `OpenAIService` (legacy fallback — `gpt-4o-mini` via chat.completions + JSON Schema mode). Both share the same prompt fixtures, retry budget (one), and 15 s AbortController timeout. `AI_PROVIDER` env pins the choice; with no override, the runtime prefers Anthropic when `ANTHROPIC_API_KEY` is set.

**PDF parsing.** `unpdf` (modern, maintained) primary, `pdfjs-dist` legacy build as fallback. Rejected `pdf-parse` (unmaintained since 2018, ships a sample PDF in `dist/`, wraps an old pdfjs).

**Source-span verification (post-call).** Every value in `sourceSpansByField` is checked with `indexOf(span)` against the original PDF text. Spans that don't appear verbatim are dropped; the corresponding field's chip flips to "Unverified" (grey) on the UI. Whitespace + soft-hyphens normalised; comparison is case-insensitive.

**Token-budget guard (pre-call).** PDFs over 25 K tokens (BPE-counted via `gpt-tokenizer` — Anthropic and OpenAI tokenisers are close enough at extraction-doc scale that the same heuristic works for either provider) short-circuit with `EXTRACTION_TOO_LARGE` before the LLM call. The user sees the banner; we don't pay for the request.

**Doc-type guard (pre-LLM).** After PDF text extraction, before any model call, the service runs `checkDocumentType()` — a heuristic regex pass that requires at least one strong Teilungserklärung signal (literal term, OR `WEG` + `Miteigentumsanteil` legal frame, OR §-numbered sections + `Aufteilungsplan`). Non-matching documents (rental contracts, invoices, OCR-empty PDFs) are rejected as `EXTRACTION_NOT_TEILUNGSERKLARUNG` (422) with a clear banner pointing the user at the right input — no LLM cost, no junk schema-fit output.

**Idempotency cache.** Before calling the active provider, the orchestrator looks up the most recent successful `ExtractionRun` for the same `documentId`. Cache hit returns instantly with `cached: true` and `durationMs: 0` unless `?force=true`. Always-on, survives independent of the rate-limit ticket.

**MEA invariant.** Server-side `ensureMeaWarning` recomputes the sum-of-shares vs declared total (0.01 tolerance). If the model didn't already emit a `MEA_MISMATCH` warning, the orchestrator injects one before returning. Same tolerance the wizard's MEA bar uses, so client and server agree.

**Per-field confidence chips.** ≥ 0.85 green ("High"), 0.6–0.85 amber ("Medium"), < 0.6 red ("Low"). Missing or unverified-span field → grey ("Unverified").

**Persistence.** Every run writes an `ExtractionRun` row regardless of outcome (`status: 'ok' | 'failed'`) — used for cost tracking, prompt iteration, and the idempotency lookup.

## Consequences

**Positive.** Hallucinated citations cannot reach the UI — `verifySpans` runs server-side and drops them before the response is sent. Schema validation across the same Zod shape means the AI output drops cleanly into the wizard with no transformation layer. Idempotency cache prevents accidental double-spend on identical re-uploads. The pre-LLM doc-type guard catches wrong-document uploads before any model spend. Failure modes are localised (`EXTRACTION_NOT_TEILUNGSERKLARUNG`, `EXTRACTION_TIMEOUT`, `EXTRACTION_PARSE_FAILED`, `EXTRACTION_TOO_LARGE`, `SERVICE_UNAVAILABLE`, `RATE_LIMITED`) with friendly banners.

**Negative.** No OCR for scanned-only PDFs (unpdf only reads embedded text). `tesseract.js` server-side as a 3rd fallback is queued for v1.1. The 25 K-token cap is conservative; documents past that hit the manual-entry banner.

**Neutral.** Per-document prompt versioning lives in `promptVersion: 'extract.v1'`; a future eval harness with ground-truth `{pdfText, expected}` pairs would gate prompt regressions when the prompt iterates.

# Edge Cases & Failure Modes

How the system behaves when things go sideways. Each entry: trigger → handling → enforcement layer.

---

## File upload & PDF processing

| Trigger                                           | Handling                                                                                                                           | Layer                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| File > 10 MB                                      | Reject; suggest splitting.                                                                                                         | API multer limit + frontend pre-check. |
| Wrong MIME type                                   | Reject 415; banner: "Only PDF files supported."                                                                                    | API MIME validator.                    |
| Password-protected PDF                            | Detect via parse error; banner: "This PDF is password-protected. Remove the password and re-upload."                               | API try/catch.                         |
| Image-only / scanned PDF                          | Detect via empty text result; fallback message: "We couldn't read the text from this PDF. The form is yours to fill manually."     | API text-length check.                 |
| Corrupt PDF                                       | Catch parse exception; same fallback.                                                                                              | API.                                   |
| Empty PDF (0 pages)                               | Same fallback.                                                                                                                     | API.                                   |
| Multi-language / non-German PDF                   | AI attempts; if no useful fields, fallback message.                                                                                | Extraction layer.                      |
| Document not a Teilungserklärung                  | Schema validation rejects; user sees "We couldn't recognize this as a declaration of division. Did you upload the right document?" | Extraction → Zod parse.                |
| Filename with special characters / path traversal | Sanitized; stored under `{cuid}.pdf`. Original kept in DB for display.                                                             | API document service.                  |
| Network drops mid-upload                          | Frontend abort; UI lets user retry; no orphan rows because document is created only on completion.                                 | Frontend fetch abort.                  |

---

## AI extraction

| Trigger                                  | Handling                                                                                                                                                                                                      | Layer                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| OpenAI timeout (>15s)                    | Throw `ExtractionError('timeout')`; UI shows fallback and retry.                                                                                                                                              | Service + UI.         |
| Rate limit (429)                         | Backoff once with jitter; if still failing, surface "Service is busy, please retry."                                                                                                                          | Service.              |
| API key missing or invalid               | Boot-time check fails fast with a clear log; UI shows "AI features are disabled in this deployment."                                                                                                          | Boot check + UI flag. |
| 401 from OpenAI                          | Same UX as missing key for the user; engineer sees error in logs.                                                                                                                                             | Service.              |
| Malformed JSON despite structured output | Retry once with the previous error appended to the prompt; if still fails, surface "AI extraction failed; please fill the form manually."                                                                     | Service.              |
| Valid JSON, fails Zod                    | Same retry + fallback; the mismatch is logged for prompt iteration.                                                                                                                                           | Service.              |
| Extraction returns 0 fields              | UI shows "We couldn't find recognizable property data in this document."                                                                                                                                      | UI.                   |
| Hallucinated values not in PDF           | Per-field source spans cited; user reviews and rejects. AI output is treated as a draft, not authoritative.                                                                                                   | UI review panel.      |
| Extracted MEA shares sum > total         | Warning: "Sum exceeds declared total — please review." Save still allowed.                                                                                                                                    | Form + UI.            |
| Extracted unit count looks wrong         | Hard cap at 500 units per extraction; outliers logged.                                                                                                                                                        | Schema + service.     |
| Repeated extractions of same document    | Per-document idempotency: a second extraction returns the cached run unless `?force=true`. Per-IP rate limit 5 / minute.                                                                                      | API + cache.          |
| Token limit exceeded for a long PDF      | Pre-call guard: if estimated tokens > 25K, fail fast with `ExtractionError('document_too_large')`; banner: "This document exceeds the v1 size limit. Please fill the form manually." Never silently truncate. | Service.              |
| Hallucinated source span                 | Server runs `indexOf(span)` against original PDF text post-call; mismatches are dropped and the chip flips to "Unverified" (grey). The model cannot fabricate citations.                                      | Service.              |
| Cached extraction served                 | Re-uploading the same document returns the cached `ExtractionRun` with `cached: true` and `durationMs: 0`. Bypass with `?force=true`.                                                                         | Service + UI chip.    |

---

## Form validation

| Trigger                                        | Handling                                                                      | Layer                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------- |
| Property name with emojis / unicode            | Allowed; stored as UTF-8.                                                     | Schema.                    |
| Property name with HTML/SQL injection attempt  | Stored as plain text; React's default escaping; Prisma parameterized queries. | Default platform behavior. |
| Empty required fields                          | Inline error per field; Next button disabled.                                 | RHF + Zod.                 |
| Unique number collision                        | Server returns 409; UI maps to inline error.                                  | API + UI.                  |
| Special characters in unique number            | Allowed: alphanumeric, dash, dot, slash. Rejected: angle brackets, quotes.    | Schema regex.              |
| Building with no street / houseNumber          | Schema rejects on Next; cell highlighted.                                     | Zod.                       |
| Unit MEA = 0 or negative                       | Schema rejects with message "MEA must be greater than 0."                     | Schema.                    |
| Unit MEA exceeds total                         | Form-level warning, not a hard block.                                         | UI bar.                    |
| Unit floor level out of plausible range        | Schema constrains: OG 0–99, UG 1–9.                                           | Schema.                    |
| Unit year < 1800 or > current+1                | Schema rejects with hint.                                                     | Schema.                    |
| Unit size unreasonable (≤ 0, > 10000 m²)       | Schema rejects.                                                               | Schema.                    |
| Description > 500 chars                        | Truncated / soft-warned.                                                      | Schema.                    |
| Apartment without rooms                        | Schema requires rooms for type APARTMENT (discriminated union).               | Schema.                    |
| Office / Parking / Garden with rooms           | Allowed but warned in copy.                                                   | UI hint.                   |
| Two units with same number in same building    | API returns 409 with field pointer; UI marks both rows red.                   | DB unique constraint.      |
| Unit assigned to building not in this property | Schema rejects on Next; building dropdown prevents this in UI.                | Form + service.            |

---

## Bulk entry / paste / generate

| Trigger                                                            | Handling                                                                                                    | Layer                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------- |
| Pasting 1000+ rows                                                 | Cap at 500 per paste; banner notes ignored remainder.                                                       | Paste handler.         |
| Paste with values containing commas inside quotes                  | Parser supports quoted strings.                                                                             | TSV/CSV parser.        |
| Paste with mixed delimiters                                        | TSV detected first; falls back to CSV.                                                                      | Parser.                |
| Paste from Word (rich text)                                        | HTML stripped; only plain-text representation used.                                                         | Paste handler.         |
| Paste single value into focused cell                               | Single-value paste; doesn't create rows.                                                                    | Paste handler.         |
| Paste binary or non-text content                                   | Ignored with toast: "Couldn't read pasted content."                                                         | Paste handler.         |
| Generate units with starting number conflicting with existing rows | Auto-increment past the conflict; warn in toast.                                                            | Generate handler.      |
| Generate 100 units (perf)                                          | Virtualized rendering kicks in.                                                                             | Table.                 |
| Edit cell while paste/generate is processing                       | Pending operations queued; no race.                                                                         | State management.      |
| Browser refresh / tab close mid-edit                               | Auto-save to localStorage; restored on remount.                                                             | Wizard state.          |
| Multiple tabs editing same draft                                   | Each tab has its own draft key; on save, last-write-wins. UI does not attempt cross-tab sync.               | Documented limitation. |
| Browser back button mid-wizard                                     | Step navigation is internal state; back button navigates to dashboard with confirm-discard prompt if dirty. | `beforeunload`.        |

---

## Save / atomic create

| Trigger                                             | Handling                                                                                   | Layer          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------- |
| Two simultaneous "Save" clicks                      | Save button disabled while in flight; second click no-op.                                  | UI.            |
| Save during DB connection drop                      | API returns 503; UI shows error; wizard state preserved.                                   | API + UI.      |
| Save with FK constraint violation                   | Should not happen — atomic transaction prevents it. If it does, structured error envelope. | DB + API.      |
| Save with very large payload (60+ units)            | Tested. Body limit 5 MB.                                                                   | API config.    |
| Transaction timeout                                 | Default Prisma timeout extended to 15 s for atomic create.                                 | Prisma config. |
| Concurrent property creation with same uniqueNumber | DB unique constraint prevents both; second returns 409.                                    | DB.            |

---

## API & contract

| Trigger                                  | Handling                                                                                       | Layer           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------- |
| Malformed JSON request                   | NestJS returns 400 with structured error envelope.                                             | Pipe.           |
| Extra unknown fields                     | Zod `.strip()` (default). Unknown fields silently dropped.                                     | Zod.            |
| Missing required fields                  | Zod 422 with field-pointed errors.                                                             | Pipe.           |
| Server returns 5xx                       | Frontend Query retries once with exponential backoff; user sees error toast on second failure. | TanStack Query. |
| Stale data — user editing older snapshot | Last-write-wins for v1; not versioned.                                                         | Documented.     |
| API responds with extra fields           | Frontend Zod parse uses `.passthrough()` for tolerance.                                        | Frontend.       |

---

## UX & device

| Trigger                      | Handling                                                                                                                                                                    | Layer                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Browser zoom 200%            | Layout still works; tested.                                                                                                                                                 | CSS.                  |
| Mobile portrait (375px)      | Wizard re-flows; unit table opens fullscreen modal.                                                                                                                         | Tailwind responsive.  |
| Tablet landscape             | Hybrid layout.                                                                                                                                                              | Tailwind.             |
| Touch vs mouse               | All interactions support both; touch targets ≥ 44px.                                                                                                                        | Standards.            |
| Keyboard-only navigation     | Every screen reachable; focus ring always visible.                                                                                                                          | Accessibility.        |
| Screen reader                | ARIA labels on icon-only controls; live regions for AI extraction.                                                                                                          | Accessibility.        |
| `prefers-reduced-motion`     | All translations replaced with fades.                                                                                                                                       | Motion utility.       |
| `prefers-color-scheme: dark` | Dark mode auto-applied if user hasn't toggled.                                                                                                                              | Theme.                |
| localStorage disabled        | Auto-save silently skipped; in-session state still works.                                                                                                                   | Try/catch on storage. |
| localStorage quota exceeded  | Drop oldest draft; show non-blocking toast.                                                                                                                                 | Storage utility.      |
| Slow network (3G)            | Skeleton loaders; optimistic updates where possible; toasts on success.                                                                                                     | Standard.             |
| Offline                      | Out of scope for v1. localStorage draft (auto-save) covers crash-recovery; failed submits surface a retry toast via TanStack Query. Documented in README "What I deferred." | Documented.           |

---

## AI Assistant (chatbot)

| Trigger                                            | Handling                                                                             | Layer          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------- |
| Question outside the data scope                    | Polite refusal: "I can only help with your property data."                           | System prompt. |
| Question requiring multiple tool calls             | Native tool-calling loop, max 5 iterations.                                          | Chat service.  |
| Tool returns error                                 | Assistant reports the issue and asks user to rephrase.                               | Chat service.  |
| Tool returns very large dataset                    | Truncated to first 50 items; assistant summarizes.                                   | Tool.          |
| Streaming connection drops                         | UI shows "Connection lost. Retry?"                                                   | UI.            |
| Rapid messages                                     | Rate limit 30/min per session; soft-throttle with polite message.                    | Rate limit.    |
| Prompt injection ("Ignore previous instructions…") | System prompt has anti-injection guidance; tools never run untrusted input verbatim. | Prompt design. |
| Empty message                                      | UI prevents send.                                                                    | UI.            |
| Very long message (>5000 chars)                    | UI truncates with warning.                                                           | UI.            |
| Question about a property that doesn't exist       | Tool returns empty; assistant says so.                                               | Tool.          |

---

## Domain quirks

| Trigger                                                       | Handling                                                                           | Layer             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------- |
| MEA total in a real document is 10,000 not 1,000              | `Property.totalMea` is configurable.                                               | Schema.           |
| Decimal MEA (110,5)                                           | Schema accepts `Decimal(10,2)` precision.                                          | DB + schema.      |
| Building belongs to multiple properties (rare; shared garage) | v1: one building per property. Documented.                                         | Documented.       |
| Sondernutzungsrechte that change MEA totals                   | v1 doesn't model SNR. Documented.                                                  | Documented.       |
| Property in non-German country (Austrian, Swiss)              | Postal code regex relaxed to 4-5 digits; country defaults to DE but is editable.   | Schema.           |
| German number format on input ("110,0")                       | Cell parser accepts both `,` and `.` decimals; stores canonical.                   | Form helper.      |
| Date format `15.03.2024` vs `15. März 2024` vs ISO            | All accepted on input; stored as ISO.                                              | Form helper.      |
| Year of construction for off-plan sale (future year)          | Schema allows `currentYear + 1`.                                                   | Schema.           |
| Sample document MEA sums to 900 / 1000                        | Non-blocking warning: "Unit shares sum to 900 / 1000. 100 shares unaccounted for." | UI invariant bar. |

---

## Security baseline

| Trigger                                          | Handling                                                                                                                                                                | Layer                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| XSS via description fields                       | React escapes by default; no `dangerouslySetInnerHTML`.                                                                                                                 | Standard.                  |
| SQL injection                                    | Prisma parameterizes queries.                                                                                                                                           | Standard.                  |
| File-upload exploits (zip bombs, billion laughs) | PDFs only; size capped 10 MB; no XML parsing. MIME header **and** magic-byte sniff on the buffer.                                                                       | API config.                |
| Massive payload DoS                              | Body limit 5 MB on create endpoint.                                                                                                                                     | API config.                |
| Path traversal in document storage               | Filenames sanitized to `{cuid}.pdf`; `0600` permissions on `./uploads/`.                                                                                                | API.                       |
| Secrets in repo                                  | `.env.example` committed without real keys; `.env` gitignored. Boot fails fast if any required env var (DATABASE_URL, OPENAI_API_KEY) is missing.                       | Repo hygiene + boot check. |
| Logs include sensitive data                      | `pino` redaction list strips `authorization`, `cookie`, `OPENAI_API_KEY`, and `POST /documents` bodies. Logs carry requestIds and lifecycle events, not request bodies. | Pino config.               |
| HTTP headers                                     | `helmet` configures CSP, HSTS (prod), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`.                                                    | Middleware.                |
| CORS                                             | Explicit origin allowlist via `CORS_ORIGINS` env; credentials disabled.                                                                                                 | Middleware.                |
| Rate-limit abuse on AI endpoints                 | `POST /extraction/runs`: 5/min/IP. `POST /chat/messages`: 30/min/session. 429 with `Retry-After` header.                                                                | Throttler.                 |
| Repeated extraction of same PDF                  | Per-document idempotency cache (always-on, independent of rate limit) returns cached run. `?force=true` bypasses. Prevents accidental re-spend.                         | Cache.                     |
| Cross-tenant data leak                           | Service layer scopes every Prisma query by `tenantId` from the request scope. `TenantGuard` resolves tenant per request.                                                | Guard + service.           |

---

## Eval and monitoring

- AI extraction eval set: the sample plus synthetic variants with expected JSON. `pnpm eval:extraction` reports per-field precision/recall.
- Chatbot eval set: question/expected-tool pairs in `tests/chat/eval.json`. `pnpm eval:chat` reports tool-selection accuracy.
- E2E happy path: Playwright run; passes before any merge to main.
- Manual smoke: keyboard-only, mobile-only, dark-mode-only walkthroughs of every screen before submission.

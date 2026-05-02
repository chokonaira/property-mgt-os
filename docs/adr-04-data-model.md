# ADR-04 · Data Model

**Status:** Accepted · 2026-04-30

## Context

A property in the German market is a graph: one **Property** owns one or more **Buildings**; each building holds one or more **Units**; the property tracks **MEA** (Miteigentumsanteile) shares that sum to a declared total. **Contacts** (property manager, accountant) sit alongside as tenant-scoped entities. **Documents** (Teilungserklärung PDFs) attach to a property; **ExtractionRun** records every AI run regardless of outcome.

Constraints:

- Schema must be the same shape on the form, the wire, and the AI output. No translation layer.
- Discriminated unit types (Apartment / Office / Parking / Garden) drive type-specific siblings (`rooms`, `layoutNote`, `parkingCode`).
- Floor kinds — `EG` / `OG-N` / `UG-N` / `DG` / `STAFFEL` — must round-trip from the AI's German source ("2. OG links") into the form input and back.
- Tenant-scoping is a v1.1 concern, but `tenantId` columns must exist now so the migration to multi-tenant is a service-layer flip, not a schema rewrite.

## Decision

**Zod-first.** Every domain object lives in `packages/shared/src/` as a Zod schema. Both apps import the same schemas; the API generates OpenAPI from them via `@asteasolutions/zod-to-openapi`; the AI extraction validates its output against `ExtractionResultSchema`.

**Discriminated unit types.** `UnitSchema` is `z.discriminatedUnion('type', [APARTMENT, OFFICE, PARKING, GARDEN])`. Each variant carries the common base fields (`number`, `buildingIndex`, `meaShare`, `sizeSqm`, `floor`, `entranceLabel`, `yearBuilt`, `description`) plus its own siblings:

- `APARTMENT` — `rooms`, `subCategory`
- `OFFICE` — `layoutNote`
- `PARKING` — `parkingCode`
- `GARDEN` — (none)

The wizard's TypeCell snapshots variant siblings on focus and restores them on Escape so a cancelled type-change doesn't clobber sibling data.

**Floor as a discriminated union too.** `FloorSchema` carries `kind: 'EG' | 'OG' | 'UG' | 'DG' | 'STAFFEL'` plus a `level` on OG/UG and an optional `qualifier` on OG ("links" / "rechts") and STAFFEL. Single shared `formatFloor()` helper drives both the table cell trigger and the AI Review Panel preview, so a value previewed pre-accept renders identically post-accept.

**Wizard draft vs wire schemas split.** The wizard's RHF uses **draft** schemas (`WizardDraftSchema`, `WizardUnitDraftSchema`) that are looser at the edges (allow empty strings, optional MEA). The atomic save endpoint validates against the **strict create** schemas (`CreatePropertyRequestSchema`). A pure mapper `buildCreatePropertyRequest()` translates draft → wire without coercion; missing required fields surface as 422 errors with field-pointed paths, which the form maps back via RHF's `setError`.

**Tenant scoping.** Every Prisma model has a `tenantId` column. The default tenant id is `'demo'` for the take-home; multi-tenant enforcement (auth → tenant resolver → service-layer filter) is a v1.1 ticket. Schema is ready.

**ExtractionRun shape.** Every AI extraction (success or failure) writes a row: `{ id, documentId, model, promptVersion, rawResponse, parsedResult, confidence, durationMs, status, error? }`. Used for cost tracking, prompt iteration, and the per-document idempotency cache.

**Atomic saves.** `POST /properties` runs a single Prisma `$transaction(async tx => …)` that creates property + N buildings + M units. Each unit's `buildingIndex` resolves to the just-created `buildingId` inside the transaction. P2002 (unique constraint on `uniqueNumber`) maps to a 409 with `details: [{ path: 'uniqueNumber', code: 'unique' }]` so the wizard can pin the input.

## Consequences

**Positive.** Three-way schema unity (form ↔ wire ↔ AI) kills entire categories of integration bugs. Discriminated unions make type-specific fields impossible to misalign at compile time. Atomic transactions mean a partial save is impossible — the user either gets a complete property or nothing.

**Negative.** OG.qualifier had to be added retroactively when extraction returned `{ kind: 'OG', level: 2, qualifier: 'links' }` — the wizard schema initially rejected the qualifier and the value was silently lost on accept. Now wizard schema, extraction schema, and the formatter all agree.

**Neutral.** `AuditLog` + `User` tables shipped. Prisma middleware snapshots before/after on every Property / Building / Unit / Contact write; the property-detail header surfaces a "Last modified by X · n min ago" pill with hover-preview + full timeline. Per-tenant retention cap (default 5,000) with probabilistic prune keeps the table bounded. Pre-auth shim wires `actorId` to a seeded `demo-user`; the swap to NextAuth/Clerk is one diff in `ActorContextMiddleware`.

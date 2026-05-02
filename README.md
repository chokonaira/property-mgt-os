# A Buena Case Study

[![CI](https://github.com/chokonaira/property-mgt-os/actions/workflows/ci.yml/badge.svg)](https://github.com/chokonaira/property-mgt-os/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-421_passing-brightgreen)](#testing)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](./tsconfig.base.json)
[![OpenAPI 3.1](https://img.shields.io/badge/OpenAPI-3.1-6BA539?logo=openapiinitiative&logoColor=white)](https://api-henry-buena.chuka.io/openapi.json)
[![First Load JS](https://img.shields.io/badge/first_load_JS-≤230_kB-blue)](#performance)

> Property dashboard with a guided creation flow + AI-powered Teilungserklärung extraction.
> Senior product engineer take-home for Buena Tech.

**Live:** [henry-buena.chuka.io](https://henry-buena.chuka.io) · API: [`api-henry-buena.chuka.io`](https://api-henry-buena.chuka.io/healthz)
**Loom:** _placeholder — replace before submission._

---

## Problem

Onboarding a property in Buena's dashboard means typing the contents of a **Teilungserklärung** — a 30-page notarised declaration of division — into a form. For a typical building that's 60+ unit rows, plus addresses, contacts, MEA shares per unit, and the **MEA** total. It's tedious, easy to mis-key, and the math (every unit's share has to sum to the declared total, usually 1.000) only gets caught at the end.

The build attacks this two ways. First, the manual path is fast on its own — a 3-step wizard, a unit table with keyboard nav, paste-from-Excel, range-generate for parking blocks, and virtualisation past 50 rows. Second, an AI extraction step on the General Info screen reads the Teilungserklärung and pre-fills the form with per-field confidence chips, source-grounded citations, and a review surface where every value is editable before it's saved. Either path works on its own; the AI is an accelerator, not a dependency.

The MEA invariant runs everywhere it can fail: live in the wizard footer as the user types or pastes, server-side at save time as a warning when the unit shares don't reconcile against the declared total.

---

## What's in the box

- **Dashboard + property detail.** WEG / MV listing with type badges; create CTA with optimistic insertion + rollback. Detail view groups units by building with the MEA bar pinned at the top.
- **3-step wizard** (General Info → Buildings → Units). One RHF `FormProvider`, auto-saves draft to `localStorage` every 500 ms, "Saved 30 s ago" footer indicator.
- **Bulk unit table.** TanStack Table headless, inline editing, full keyboard navigation, paste TSV/CSV, "Generate N units" (parking-block case), duplicate row, multi-select bulk delete, sticky MEA invariant bar (green / amber / red), virtualised past 50 rows.
- **AI Review Panel.** Per-field confidence chips (≥ 0.85 green, 0.6–0.85 amber, < 0.6 red) + source-span popovers + prominent warnings. Server-side `verifySpans` drops hallucinated citations before the response leaves the API. Inline chips persist on the form post-accept and clear when the user edits a field.
- **OpenAPI 3.1** at `/openapi.json` generated from the same Zod schemas the form uses.
- **Error boundaries** at `app/[locale]/error.tsx`, `not-found.tsx`, `global-error.tsx` — localised copy + Retry / Back-to-dashboard.
- **i18n** via `next-intl`; default `de` (unprefixed URL), opt-in `/en`. Domain terms stay German.
- **Dark mode**, **421 tests** across three packages.

---

## Quick start

**Prerequisites:** Docker Desktop running · Node 20+ · pnpm 9+ · an AI provider key — Anthropic (default, `ANTHROPIC_API_KEY`) or OpenAI (legacy, `OPENAI_API_KEY`). Only the extraction surface needs it; the rest of the app boots either way.

**Reviewer path — one command boots everything:**

```bash
git clone git@github.com:chokonaira/property-mgt-os.git
cd property-mgt-os
cp .env.example .env             # paste your ANTHROPIC_API_KEY (or OPENAI_API_KEY)
docker compose up                # builds web + api images, runs Postgres, applies migrations, seeds the demo property
```

Open **http://localhost:3000**. You should see the **Parkview Residences Berlin** row on the dashboard (1 property · 2 buildings · 14 units). Click it for the read-only detail view; click **Create new property** for the wizard.

**Hot-reload path** (faster iteration):

```bash
pnpm install
cp .env.example .env
pnpm dev                         # Postgres up → wait → migrate:deploy → seed → web + api in parallel
```

`pnpm dev` is end-to-end and fails fast if Docker isn't running.

**Test the AI extraction:** Create new property → step 1 → upload a Teilungserklärung PDF → click "Use AI to extract" → review the panel → Accept all. Steps 2 + 3 pre-fill from the model's output.

**Locale:** German default (URL stays unprefixed); switch to English at `/en` or via the locale toggle. Choice persists in a `BUENA_LOCALE` cookie. Domain terms (`WEG`, `MV`, `MEA`, `Teilungserklärung`, `Tiefgaragenstellplatz`) stay German in both.

**Common gotchas:**

- **Port 3000 / 3001 already in use** — `lsof -ti:3000,3001 | xargs kill -9`.
- **Port 5432 already in use** — host Postgres clash. Dev container maps to **55432** on the host (per `.env`); don't change unless your local Postgres is also off-port.
- **`P1010: User 'buena' was denied access`** — `DATABASE_URL` is pointing at a different Postgres. `lsof -nP -iTCP:55432` confirms the dev container is the one listening.
- **Prisma Client out of date after pull** — `pnpm db:generate`.
- **Wipe + reseed** — `pnpm db:reset` (destructive).

Every workspace script + env var documented in [`public/runbook.md`](./public/runbook.md). Vercel + Railway deploy walkthrough in [`public/deploy.md`](./public/deploy.md).

---

## Repo layout

```
apps/{web,api}    packages/shared    prisma/    public/    docker-compose.yml    .env.example
```

`apps/web` (Next.js 15) + `apps/api` (NestJS) + `packages/shared` (Zod schemas — single source of truth for client, server, AI). Reviewer docs + ADRs in [`public/`](./public/).

---

## Testing

```bash
pnpm test              # all unit + integration tests (Vitest)
pnpm typecheck         # strict TS across shared, api, web
pnpm lint              # ESLint
pnpm build             # Next + Nest production builds
```

Workspace runs **421 tests** across three packages (72 shared schemas, 141 API services, 208 web utilities + components). RTL + jsdom power the panel render tests; the rest run in node for speed. Coverage is intentional rather than complete: discriminated unions, MEA invariant, TSV / CSV parser, AI pipeline (verify-spans, token budget, idempotency cache, response-schema shape per provider, SDK error wrapping for both Anthropic and OpenAI, controller error mapping), and the wizard's accept-translation logic each have dedicated suites.

## Performance

First-load JS from `pnpm build`: shared chunks **102 kB** · dashboard **165 kB** · property detail **174 kB** · wizard step 2 **187 kB** · wizard step 1 **211 kB** · wizard step 3 **223 kB** (carries TanStack Virtual, engages past 50 rows). The AI Review Panel is loaded via `next/dynamic` so its body only ships when extraction succeeds; deps it shares with always-present components (Radix Popover, ConfidenceChip) stay in step 1. Badge cap **230 kB** with reviewer-visible headroom; lazy-loading TanStack Virtual on step 3 is queued as a v1.1 cut.

## OpenAPI

Live: [`https://api-henry-buena.chuka.io/openapi.json`](https://api-henry-buena.chuka.io/openapi.json). Locally:

```bash
pnpm dev:apps          # api boots on :3001
curl http://localhost:3001/openapi.json | jq . | head
```

Generated from the same Zod schemas in `packages/shared` via `@asteasolutions/zod-to-openapi`. Drives the wire contract for `/properties`, `/contacts`, `/documents`, `/extraction/runs`. Cross-language clients can codegen straight from this spec.

---

## Tech stack

**Next.js 15** (App Router) · **NestJS** · **Prisma** · **Postgres 16** · **Tailwind + shadcn/ui + Radix** · **React Hook Form + Zod resolver** · **TanStack Table + Virtual + Query** · **Anthropic Claude (default) or OpenAI**, swappable via `AI_PROVIDER` behind a provider-agnostic `AiExtractionClient` interface · **unpdf** primary + `pdfjs-dist` fallback · **`@asteasolutions/zod-to-openapi`** · **Vitest + RTL + jsdom** · **GitHub Actions**.

ADRs cover the consequential calls: [`stack`](./public/adr-01-stack.md), [`AI extraction`](./public/adr-02-ai-extraction.md), [`bulk entry`](./public/adr-03-bulk-entry.md), [`data model`](./public/adr-04-data-model.md), [`AI handoff`](./public/adr-05-ai-handoff.md). Architecture diagram + data flow in [`public/architecture.md`](./public/architecture.md). German real-estate primer in [`public/domain.md`](./public/domain.md).

---

## What's deferred

- **Auth / multi-tenant** — schema has `tenantId` columns; enforcement is a service-layer flip.
- **OCR for scanned PDFs** — `tesseract.js` server-side would slot in as a 3rd extraction fallback.
- **Real S3 storage** — local disk under `./uploads/{tenantId}/`; one swap away from `@aws-sdk/client-s3`.
- **Versioning / change history** — last-write-wins; an `Audit` table is its own ticket.
- **AI Assistant chatbot** — tool-calling (`list_properties`, `compute_mea_total`, `find_unit`) + SSE streaming.
- **Lazy-load TanStack Virtual on units step** — step 3 at 223 kB (engages past 50 rows). Deferring via `next/dynamic` would drop step 3 below ~190 kB; not blocking because we're under the 230 kB cap. (AI Review Panel is already lazy as of this push.)

Edge-case matrix in [`public/edge-cases.md`](./public/edge-cases.md). Design tokens in [`public/design-system.md`](./public/design-system.md).

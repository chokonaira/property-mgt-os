# ADR-01 · Stack

**Status:** Accepted · 2026-04-30

## Context

The brief targets a senior product engineer at Buena Tech, a German property-management startup whose stack is **Next.js + NestJS + Prisma + Postgres**. The reviewer expects to clone, run, and evaluate in under 30 minutes. The submission also needs to run **AI extraction on a Teilungserklärung PDF** with a structured output the form can consume directly.

Constraints:

- Two-day build window.
- Reviewer path must be a single command (`docker compose up`) — no infrastructure to provision.
- Schema needs to be **the same artefact** on the form, the wire, and the AI output, otherwise the three drift.
- Zero-trust on the AI: every value editable, every citation grounded.

## Decision

Match Buena's stack as closely as possible:

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 15 (App Router) + TypeScript strict |
| API | NestJS + TypeScript strict |
| ORM | Prisma |
| Database | PostgreSQL 16 |
| UI | Tailwind + shadcn/ui (slate) + Radix primitives |
| Forms | React Hook Form + `@hookform/resolvers/zod` |
| Tables | TanStack Table (headless) + TanStack Virtual |
| State / cache | TanStack Query |
| Schemas | Zod, hosted in `packages/shared`, consumed by web + api + extraction |
| OpenAPI | `@asteasolutions/zod-to-openapi` from the same Zod schemas |
| AI | Anthropic `claude-haiku-4-5` (default) or OpenAI `gpt-4o-mini` (fallback), behind a provider-agnostic `AiExtractionClient` interface |
| PDF parsing | `unpdf` primary + `pdfjs-dist` fallback |
| Tests | Vitest + RTL + jsdom (per-file `// @vitest-environment jsdom`) |
| CI | GitHub Actions: lint / typecheck / test / build on every push |
| Bundle | Docker Compose; one-command spin-up |

Hosted demo and managed Postgres are deliberately **out** — the reviewer runs the actual code, not a pinned screenshot.

## Consequences

**Positive.** Reviewer can clone and `docker compose up` in <5 min. The shared Zod schema kills three drift surfaces in one (form ↔ wire ↔ AI output). Strict TypeScript across all three packages catches the bulk of integration regressions before tests run. Matching Buena's stack means the take-home reads as a junior pull request, not a foreign-language sample.

**Negative.** No auth, no multi-tenant enforcement, no S3, no audit log. Documented in the README's "What's deferred" section. The bundle on the wizard's units step (TanStack Table + Virtual + AI Review Panel) sits at 222 kB first-load; lazy-loading the panel + virtualizer via `next/dynamic` is queued as v1.1.

**Neutral.** No state-management library beyond TanStack Query — wizard state lives in RHF + a small WizardContext, persisted to localStorage.

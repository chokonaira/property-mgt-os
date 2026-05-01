# Buena Case Study

[![CI](https://github.com/chokonaira/property-mgt-os/actions/workflows/ci.yml/badge.svg)](https://github.com/chokonaira/property-mgt-os/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-331_passing-brightgreen)](#testing)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](./tsconfig.base.json)
[![OpenAPI 3.1](https://img.shields.io/badge/OpenAPI-3.1-6BA539?logo=openapiinitiative&logoColor=white)](http://localhost:3001/openapi.json)
[![First Load JS](https://img.shields.io/badge/first_load_JS-≤220_kB-blue)](#performance)

> Property dashboard with a guided creation flow + AI-powered Teilungserklärung extraction.
> Senior product engineer take-home for Buena Tech.

**Loom:** _placeholder — replace before submission (T-605)._

---

## Quick start

### Prerequisites

- **Node 20+** and **pnpm 9+** (`packageManager` pin in root `package.json`).
- **Docker Desktop** running. Postgres 16 is launched via `docker-compose.dev.yml` — required for `pnpm dev` and for migrations / seeding.
- **OpenAI API key** with ~$5 of credit (only for the AI extraction + chatbot tickets; the rest of the app boots without it).

### Reviewer path (one command)

```bash
cp .env.example .env       # paste OPENAI_API_KEY
docker compose up
```

Open `http://localhost:3000`. The dashboard is pre-seeded with one demo property so you see a working product, not an empty state.

### Local development (hot reload)

```bash
pnpm install
cp .env.example .env       # edit if a port conflicts; default Postgres host port is 55432 to avoid clashing with a host-installed Postgres on 5432
pnpm dev                   # boots Postgres in Docker, waits, generates Prisma client, applies migrations, then runs api + web in parallel
```

`pnpm dev` is end-to-end: it brings the database up, syncs the schema, and starts both apps. If Docker isn't running it will fail fast — start Docker Desktop and re-run.

To seed the demo data once the DB is up:

```bash
pnpm db:seed
```

### Useful scripts

| Script                        | What it does                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `pnpm dev`                    | Postgres up → wait → generate → migrate:deploy → web + api in parallel           |
| `pnpm dev:apps`               | Skip the DB orchestration; just run web + api (use when DB is already healthy)   |
| `pnpm db:up` / `pnpm db:down` | Start / stop the dev Postgres container                                          |
| `pnpm db:wait`                | Block until Postgres is accepting connections                                    |
| `pnpm db:generate`            | Regenerate Prisma Client after schema changes                                    |
| `pnpm db:migrate`             | Create and apply a new migration (interactive, picks the name)                   |
| `pnpm db:migrate:deploy`      | Apply pending migrations non-interactively (CI / reviewer flow)                  |
| `pnpm db:seed`                | Seed the Parkview Residences demo property (1 property · 2 buildings · 14 units) |
| `pnpm db:reset`               | Drop + reapply migrations + reseed (destructive)                                 |
| `pnpm db:studio`              | Open Prisma Studio for ad-hoc inspection                                         |

### Locale (de / en)

The web app defaults to **German**. Switch from the top-right control on the home page, or directly:

- `http://localhost:3000/` — German (`de`, default; the URL stays unprefixed)
- `http://localhost:3000/en` — English

The choice is persisted in a `BUENA_LOCALE` cookie (1-year max-age) so subsequent visits stick. To force a locale via cookie from a script:

```bash
curl -i -b 'BUENA_LOCALE=en' http://localhost:3000/
```

Domain terms — `WEG`, `MV`, `MEA`, `Teilungserklärung`, `Wohnfläche`, `Nutzfläche`, `Miteigentumsanteile`, `Tiefgaragenstellplatz` — stay in German in both catalogs by design.

### Common gotchas

- **Port 5432 already in use**: a host Postgres is binding it. The dev Postgres container maps to **55432** on the host (`DATABASE_URL=postgres://buena:buena@localhost:55432/buena`) to avoid the clash. If you change the port, update `.env`.
- **`P1010: User 'buena' was denied access`**: usually means `DATABASE_URL` is pointing at a different Postgres (e.g. host-installed) that doesn't have the `buena` user. Confirm with `lsof -nP -iTCP:55432`.
- **Prisma Client out of date**: re-run `pnpm db:generate` after pulling schema changes.

---

## Repo layout

```
property-mgt-os/
├── apps/
│   ├── web/           Next.js 15, App Router, locale-aware [locale] segment
│   └── api/           NestJS, Prisma, OpenAI extraction + chat
├── packages/
│   └── shared/        Zod schemas — single source of truth for client, server, AI
├── prisma/            schema.prisma + migrations + seed
├── public/            Architecture, design system, domain notes, edge cases (reviewer docs)
├── docker-compose.yml         Reviewer path
├── docker-compose.dev.yml     Postgres-only for hot reload
└── .env.example       Every required env var, documented
```

Full architecture in `public/architecture.md`. Domain primer in `public/domain.md`. Edge-case matrix in `public/edge-cases.md`. Design system in `public/design-system.md`.

---

## Testing

```bash
pnpm test              # all unit + integration tests (Vitest)
pnpm typecheck         # strict TS across shared, api, web
pnpm lint              # ESLint
pnpm build             # Next + Nest production builds
```

Workspace currently runs **331 tests** across three packages (72 shared schemas, 123 API services, 136 web utilities + components). RTL + jsdom power the panel render tests; the rest run in node for speed. Coverage is intentional rather than complete: discriminated unions, the MEA invariant, the TSV / CSV parser, the AI extraction pipeline (verify-spans, token budget, idempotency cache, controller error mapping), and the wizard's accept-translation logic each have dedicated suites.

## Performance

| Surface             | First Load JS |
| ------------------- | ------------- |
| Shared chunks       | **101 kB**    |
| Wizard step 1       | **212 kB**    |
| Wizard step 2       | **186 kB**    |
| Wizard step 3       | **200 kB**    |
| Property detail     | **163 kB**    |
| Middleware (locale) | **52 kB**     |

Numbers from `pnpm build`. Wizard step 1 carries the AI Review Panel + extraction hooks inline; lazy-loading the panel via `next/dynamic` is queued as a v1.1 perf cut. Cap on the badge above is set to **220 kB** to keep current numbers honest with reviewer-visible headroom.

## OpenAPI

```bash
pnpm dev:apps          # api boots on :3001
curl http://localhost:3001/openapi.json | jq . | head
```

Generated from the same Zod schemas in `packages/shared` via `@asteasolutions/zod-to-openapi`. Drives the wire contract for `/properties`, `/contacts`, `/documents`, `/extraction/runs`. Cross-language clients can codegen straight from this spec.

---

## Status

This README will be expanded by T-601 from the case-study planning template. Current scaffold:

- T-000 — CI (lint / typecheck / test / build on push + PR)
- T-001 — pnpm workspace, ESLint, Prettier, Husky
- T-002 — NestJS skeleton, `/healthz`, global Zod pipe, error envelope, pino + request-id
- T-003 — Next.js 15 skeleton, shadcn/ui (slate), TanStack Query, typed API client
- T-004 — Postgres (Docker) + Prisma schema + initial migration + seeded Parkview Residences
- T-005 — Shared Zod schemas in `packages/shared` (Property, Building, Unit discriminated, Contact, Document, Floor, ExtractionResult)
- T-006 — Helmet, CORS allowlist, Zod-validated env loader, PrismaExceptionFilter, pino redaction
- T-007 — Rate-limit primitive (token bucket + guard + decorator) ready to attach to T-504 / T-802
- T-008 — `next-intl` wired on the App Router (`[locale]` segment, middleware, switcher), de + en catalogs, Zod error localization
- `.env.example` — all required env vars

# Runbook

Reference for everything you might need to operate the project locally — every script, every env var, every gotcha. The README's Quick start covers the 95 % path; this doc backs it.

---

## Prerequisites

- **Docker Desktop** running (Postgres 16 ships in a container).
- **Node 20+** and **pnpm 9+** (`packageManager` pin in root `package.json`).
- **OpenAI API key** with ~$5 of credit. The dashboard, wizard, and atomic save all run without it; only the AI extraction surface needs a key.

---

## Boot paths

### Reviewer path — `docker compose up`

Builds web + api images, brings up Postgres, applies migrations, seeds the demo property, starts both apps. Single command:

```bash
git clone git@github.com:chokonaira/property-mgt-os.git
cd property-mgt-os
cp .env.example .env             # paste OPENAI_API_KEY
docker compose up
```

Open `http://localhost:3000`. Dashboard shows **Parkview Residences Berlin** (1 property · 2 buildings · 14 units).

### Hot-reload path — `pnpm dev`

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` orchestrates: Postgres up → wait → Prisma generate → migrate:deploy → web + api in parallel. Falls back fast if Docker isn't running.

To skip the DB orchestration when Postgres is already healthy: `pnpm dev:apps`.

---

## All workspace scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Postgres up → wait → generate → migrate:deploy → web + api in parallel |
| `pnpm dev:apps` | Skip the DB orchestration; just run web + api |
| `pnpm db:up` / `pnpm db:down` | Start / stop the dev Postgres container |
| `pnpm db:wait` | Block until Postgres accepts connections |
| `pnpm db:generate` | Regenerate Prisma Client after a schema change |
| `pnpm db:migrate` | Create + apply a new migration (interactive) |
| `pnpm db:migrate:deploy` | Apply pending migrations non-interactively (CI / reviewer flow) |
| `pnpm db:seed` | Seed the Parkview Residences demo property |
| `pnpm db:reset` | Drop + reapply migrations + reseed (**destructive**) |
| `pnpm db:studio` | Prisma Studio UI on `localhost:5555` |
| `pnpm test` | Vitest across shared / api / web (workspace) |
| `pnpm test:e2e` | Playwright happy path (requires the apps running) |
| `pnpm typecheck` | TS strict across all packages |
| `pnpm lint` | ESLint |
| `pnpm build` | Next + Nest production builds + shared package compile |

---

## Environment variables

`.env.example` is the canonical list. Highlights:

| Var | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://buena:buena@localhost:55432/buena` | Postgres connection. Host port `55432` to avoid clash with a host-installed Postgres on `5432`. |
| `OPENAI_API_KEY` | — | Required only for `/extraction/runs`. Other endpoints work without it. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Override to bench against `gpt-4o` etc. |
| `OPENAI_TIMEOUT_MS` | `15000` | Per-call timeout; AbortController-enforced inside the orchestrator. |
| `EXTRACTION_MAX_TOKENS` | `25000` | Pre-call token-budget guard; oversized PDFs short-circuit before billing. |
| `UPLOAD_DIR` | `./uploads` | Tenant-scoped subdirs under here. |
| `UPLOAD_MAX_BYTES` | `10485760` | 10 MB cap on `/documents` uploads. |
| `RATE_LIMIT_EXTRACTION_PER_MIN` | `5` | Token bucket for `/extraction/runs`, keyed by IP. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Web → API base URL. |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `de` | URL stays unprefixed for German. |
| `BUENA_LOCALE` cookie | (set on switcher click) | Persists locale choice for 1 year. |

---

## Locale

Default `de` at `/` (URL stays unprefixed). Opt-in `/en`. Persisted via `BUENA_LOCALE` cookie. Force from a script:

```bash
curl -i -b 'BUENA_LOCALE=en' http://localhost:3000/
```

Domain terms stay German in both catalogs: `WEG`, `MV`, `MEA`, `Teilungserklärung`, `Wohnfläche`, `Nutzfläche`, `Miteigentumsanteile`, `Tiefgaragenstellplatz`.

---

## Common gotchas

- **Port 3000 / 3001 already in use** — `lsof -ti:3000,3001 | xargs kill -9`.
- **Port 5432 already in use** — a host Postgres is binding it. Dev container maps to `55432` on the host. Don't change unless your local Postgres is also off-port.
- **`P1010: User 'buena' was denied access`** — `DATABASE_URL` is pointing at a different Postgres. `lsof -nP -iTCP:55432` to confirm the dev container is the one listening.
- **Prisma Client out of date after pull** — `pnpm db:generate`.
- **Extraction returns 502 EXTRACTION_PARSE_FAILED** — usually OpenAI rate-limit or quota. The orchestrator retries once with an error addendum; persistent failure surfaces the structured banner. Check `OPENAI_API_KEY`.
- **Want to wipe everything** — `pnpm db:reset` rebuilds the schema + reseeds.

---

## Pre-submit verifications

These are manual / reviewer-time checks; commands documented for repeatability.

### T-705 Responsive breakpoints

Open Chrome DevTools → Toggle device toolbar → run through each route at:

- **375 px** (iPhone SE)
- **768 px** (iPad portrait)
- **1024 px** (iPad landscape / small laptop)
- **1440 px** (desktop)

Routes to walk: `/`, `/properties/:id`, `/properties/new`, `/properties/new/buildings`, `/properties/new/units`. The MEA bar stays sticky at the bottom on all four sizes; the unit table's `min-w-[1000px]` engages horizontal scroll on the two narrow viewports.

### T-706 axe-core (automated)

```bash
pnpm dev                                        # in one shell
pnpm --filter @buena/web test:e2e e2e/a11y.spec.ts   # in another
```

Asserts zero `serious` / `critical` WCAG 2.1 AA violations on the dashboard + wizard step 1. Steps 2 + 3 covered by component-level tests (`__tests__/wizard-mea-bar.test.tsx`, `field-chip.test.tsx`, `ai-review-panel.test.tsx`).

### T-707 Lighthouse

```bash
pnpm dev                                        # in one shell
pnpm dlx lighthouse http://localhost:3000/en --view --preset=desktop
pnpm dlx lighthouse http://localhost:3000/en/properties/new --view --preset=desktop
pnpm dlx lighthouse http://localhost:3000/en/properties/new/units --view --preset=desktop
```

Targets: Performance ≥ 85, Accessibility ≥ 95, Best practices ≥ 95, SEO ≥ 90. The first run downloads the chrome binary; subsequent runs are seconds.

### T-607 Sanity clone

```bash
cd /tmp
git clone git@github.com:chokonaira/property-mgt-os.git sanity
cd sanity
cp .env.example .env             # paste OPENAI_API_KEY
docker compose up                # builds web + api images, applies migrations, seeds
```

Open `http://localhost:3000`; verify Parkview Residences row + the wizard launches. Anything that breaks here, breaks for the reviewer.

---

## Where to read next

- [`./architecture.md`](./architecture.md) — module-level data flow, request lifecycle, deployment shape.
- [`./domain.md`](./domain.md) — German real-estate primer (WEG, MV, MEA, Teilungserklärung, floor kinds, unit types).
- [`./edge-cases.md`](./edge-cases.md) — edge-case matrix per surface.
- [`./design-system.md`](./design-system.md) — Tailwind tokens, component palette.
- [`./adr-01-stack.md`](./adr-01-stack.md), [`./adr-02-ai-extraction.md`](./adr-02-ai-extraction.md), [`./adr-03-bulk-entry.md`](./adr-03-bulk-entry.md), [`./adr-04-data-model.md`](./adr-04-data-model.md), [`./adr-05-ai-handoff.md`](./adr-05-ai-handoff.md) — five ADRs.

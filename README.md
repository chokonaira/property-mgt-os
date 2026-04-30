# Buena Case Study

[![CI](https://github.com/chokonaira/buena-case-study/actions/workflows/ci.yml/badge.svg)](https://github.com/chokonaira/buena-case-study/actions/workflows/ci.yml)

> Property dashboard with a guided creation flow + AI-powered Teilungserklärung extraction.
> Senior product engineer take-home for Buena Tech.

**Loom:** _placeholder — replace before submission (T-605)._

---

## Quick start

```bash
cp .env.example .env       # paste OPENAI_API_KEY
docker compose up
```

Open `http://localhost:3000`. The dashboard is pre-seeded with one demo property so you see a working product, not an empty state.

For local development with hot reload:

```bash
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

---

## Repo layout

```
buena-case-study/
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

## Status

This README will be expanded by T-601 from the case-study planning template. The current scaffold corresponds to T-001 (workspace), T-000 (CI), T-008 i18n message catalogs (placeholders), and `.env.example` (all required vars).

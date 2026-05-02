# Deploy

Two cloud paths. Both work for v1; pick whichever you prefer.

---

## Vercel (web) + Railway (api + Postgres)

The cleanest split: Vercel runs Next.js as it was designed; Railway runs the NestJS service + a managed Postgres + a volume for uploads.

### 1. Railway — api + Postgres

Create a new Railway project. Add two plugins:

- **PostgreSQL** (16). Railway provisions `DATABASE_URL` automatically.
- **Volume** mounted at `/data/uploads`. (Storage tab → New Volume → mount path `/data/uploads`.)

Add a service from this repo:

- **Source:** GitHub → `chokonaira/property-mgt-os`.
- **Root directory:** repo root (`/`).
- **Build command:** Railway autodetects pnpm. Override if needed:
  ```bash
  pnpm install --frozen-lockfile && \
  pnpm --filter @buena/shared build && \
  pnpm --filter @buena/api exec prisma generate --schema=../../prisma/schema.prisma && \
  pnpm --filter @buena/api build
  ```
- **Pre-deploy:** `pnpm --filter @buena/api exec prisma migrate deploy --schema=../../prisma/schema.prisma`
- **Start command:** `pnpm --filter @buena/api start`
- **Environment variables:**

  | Var | Value |
  | --- | --- |
  | `DATABASE_URL` | reference the Postgres plugin |
  | `OPENAI_API_KEY` | your key |
  | `OPENAI_MODEL` | `gpt-4o-mini` |
  | `OPENAI_TIMEOUT_MS` | `15000` |
  | `EXTRACTION_MAX_TOKENS` | `25000` |
  | `UPLOAD_DIR` | `/data/uploads` |
  | `UPLOAD_MAX_BYTES` | `10485760` |
  | `RATE_LIMIT_EXTRACTION_PER_MIN` | `5` |
  | `CORS_ORIGINS` | the Vercel URL once it exists, e.g. `https://property-mgt-os.vercel.app` |
  | `TENANT_DEFAULT_ID` | `demo` |
  | `LOG_LEVEL` | `info` |
  | `NODE_ENV` | `production` |

Once the service is healthy, copy the Railway-generated public URL (e.g. `https://buena-api-production.up.railway.app`) — Vercel needs it.

### 2. Vercel — web

Create a project pointing at the same GitHub repo.

- **Framework preset:** Next.js (auto).
- **Root directory:** `apps/web`.
- **Build command:** `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @buena/shared build && pnpm --filter @buena/web build`
- **Install command:** leave blank — the build command handles install.
- **Output directory:** `.next` (default).
- **Environment variables:**

  | Var | Value |
  | --- | --- |
  | `NEXT_PUBLIC_API_URL` | the Railway api URL from step 1 |
  | `NEXT_PUBLIC_DEFAULT_LOCALE` | `de` |
  | `NEXT_PUBLIC_ENABLE_AI` | `true` |

Deploy. Once Vercel returns a URL, **come back to Railway and set `CORS_ORIGINS`** to that domain — the api needs it before the browser can talk to it.

### 3. Seed the demo property

Connect to the Railway Postgres via `psql` or the Railway dashboard's data tab and run the seed once. Locally, with `DATABASE_URL` pointed at the Railway Postgres:

```bash
pnpm db:seed
```

You'll see the **Parkview Residences Berlin** row on the Vercel dashboard.

---

## All-in-one Railway

Same as above but skip Vercel — Railway runs the Next.js service too. Less optimal (Vercel is faster for static + edge), but only one platform to log into. Mirror the api service config for `apps/web` with the same root-directory + build-command pattern, plus `NEXT_PUBLIC_API_URL` pointing at the api service's internal URL (`http://${api-service-name}.railway.internal:3001`).

---

## Production checklist

- [ ] `OPENAI_API_KEY` set on the api service (only).
- [ ] `CORS_ORIGINS` on the api includes the Vercel domain.
- [ ] `NEXT_PUBLIC_API_URL` on Vercel points at the public Railway api URL.
- [ ] Railway volume mounted at `UPLOAD_DIR` (else `/uploads` writes to ephemeral disk).
- [ ] `prisma migrate deploy` runs as a pre-deploy hook (Railway re-runs on every deploy; safe).
- [ ] The seed has been run **once** (re-running creates a duplicate Parkview).

## Smoke test

```bash
curl -fsS https://<vercel-url> > /dev/null            # web responds
curl -fsS https://<railway-api>/healthz | jq .         # api responds
curl -fsS "https://<railway-api>/properties" | jq '.items | length'   # data layer responds; should print "1"
```

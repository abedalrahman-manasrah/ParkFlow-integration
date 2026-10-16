# Deploying the ParkFlow public demo

This guide puts ParkFlow online on free tiers:

| Part | Service | Config in repo |
| --- | --- | --- |
| Web app (Expo Web) | Vercel | `vercel.json` |
| API + background worker (one container) | Render Free Web Service, Docker | `render.yaml`, `server/Dockerfile`, `server/src/start.ts` |
| PostgreSQL | Neon Free | `server/prisma/schema.prisma` (unchanged) |
| Redis (OTP codes, rate limits, BullMQ, Socket.IO) | Render Key Value Free | `render.yaml` |
| File uploads (S3 API) | Supabase Storage | `server/src/providers/storage.ts` (unchanged) |
| OTP email | Brevo SMTP on port 2525 | `server/src/providers/email.ts` (unchanged) |

> **This is demo hosting, not production hosting.** Free tiers sleep, lose Redis data on restart,
> and give no uptime guarantee. Payments are **simulated**: no gateway is called and no card is charged.
> See [Free-tier limitations](#free-tier-limitations) and [Moving to real production](#moving-to-real-production).

Nothing in this guide is automated by the repo. Every account, project, key and deployment below is a
manual step. Never commit the values you create. They go only in the Render and Vercel dashboards
(or in your shell for one-off commands).

---

## 0. Before you start

- The repo is on GitHub and `main` holds the code to deploy.
- Pick **one region** for everything to keep latency low. This guide uses **Frankfurt / AWS eu-central-1**
  (`render.yaml` sets `region: frankfurt`). If you change it, change it for both Render services; the
  Key Value internal URL only works inside the same Render region.
- Generate three random secrets (each ≥ 32 characters) and keep them in a password manager:

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```

  One each for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `PAYMENT_WEBHOOK_SECRET`. The server
  refuses to start in production if any of them still starts with `replace-`.

## 1. Neon PostgreSQL

1. Create a Neon project in **AWS Europe Central 1 (Frankfurt)**. Keep Postgres 16 or newer.
2. In **Connect**, select the database and role, and **turn connection pooling off**. You need the
   **direct** string, whose host does *not* contain `-pooler`. `prisma migrate deploy` needs a direct
   session, and the app relies on Serializable transactions and advisory locks.
3. Build `DATABASE_URL` from it, keeping `sslmode=require` and adding a timeout and a small pool:

   ```text
   postgresql://USER:PASSWORD@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require&connect_timeout=15&connection_limit=5
   ```

   `connect_timeout=15` covers Neon's cold start after its compute auto-suspends.
   `connection_limit=5` applies per process, and the API and worker are two processes.
   If Prisma rejects a `channel_binding=require` parameter copied from Neon, remove that parameter.

No schema changes are needed. Migrations run automatically on every Render start (step 6).

## 2. Render Key Value (Redis)

The Blueprint in `render.yaml` creates `parkflow-redis` (plan `free`, `maxmemoryPolicy: noeviction`,
`ipAllowList: []` = private network only). It also passes its internal URL to the API as `REDIS_URL`.

If you create it by hand instead: **New → Key Value**, plan **Free**, same region as the API,
**Maxmemory policy = `noeviction`**. Then copy the **Internal Key Value URL** (`redis://red-xxxx:6379`)
into the API's `REDIS_URL`.

Compatibility notes (verified against the code):

- `server/src/database/redis.ts` parses `redis://` and `rediss://` URLs, including username, password,
  DB number and TLS. The internal URL needs no TLS.
- BullMQ needs `noeviction`. Under an evicting policy, Redis can silently delete queued jobs, and BullMQ
  logs a warning at worker start.
- Render Key Value is Valkey, which is Redis-protocol compatible with BullMQ, ioredis,
  `rate-limit-redis` and the Socket.IO Redis adapter.

**Free Key Value is in-memory only, with no persistence.** Any restart, upgrade or maintenance wipes it:

| Lost on restart | Effect on users |
| --- | --- |
| Pending OTP codes (5-minute TTL) | A code sent just before the restart stops working. The user taps "resend". |
| OTP cooldowns and rate-limit counters | Limits reset early. This is harmless for a demo. |
| Queued BullMQ jobs (push deliveries in flight) | Some push notifications may never arrive. The notifications themselves are stored in Postgres and still show in the app. |
| BullMQ job schedulers | Re-created by the worker at startup (`upsertJobScheduler`), so maintenance resumes on its own. |

Durable data (users, sessions, wallets, the outbox) lives in Postgres and is not affected.
Undelivered outbox events are re-sent by the worker after a restart.

## 3. Supabase Storage (S3 API)

The backend talks to S3 with `forcePathStyle: true` and signed URLs (15 minutes). Supabase's S3 endpoint
works with that as-is, so no code changes are needed.

1. Create a Supabase project in **Central EU (Frankfurt)**.
2. **Storage → New bucket**, name `parkflow` (or any name), and leave it **private** (not public).
   **The bucket must exist before the API starts.** In production the API only checks it with
   `HeadBucket` and stops at startup if it is missing. It never creates the bucket on its own.
3. **Project Settings → Storage → S3 Connection**: enable the S3 connection, then copy:
   - **Endpoint** → `S3_ENDPOINT`, for example `https://PROJECT_REF.storage.supabase.co/storage/v1/s3`.
     Copy it exactly, including `/storage/v1/s3`.
   - **Region** → `S3_REGION`, for example `eu-central-1`.
4. On the same page, **New access key** → `S3_ACCESS_KEY` (Access key ID) and `S3_SECRET_KEY`
   (Secret access key). The secret is shown once. These keys bypass Row Level Security and have full
   bucket access, so they belong **only** in the Render dashboard.
5. Set `S3_BUCKET` to the bucket name. **Do not set `S3_PUBLIC_ENDPOINT`** on Render. It exists only
   for the local Docker/MinIO setup, and signed URLs must use the Supabase endpoint.

Uploads are validated server-side (JPEG/PNG/PDF, ≤ 5 MB), well under Supabase's free per-file limit.

## 4. Brevo SMTP (OTP email)

Real email OTP stays on for the public demo. `DEV_SKIP_EMAIL_OTP` is forced to `false`: the server
refuses to start in production otherwise. Development login is also disabled outside development.

1. Create a Brevo account, and complete any account activation Brevo asks for before transactional email works.
2. **Verify the sender**: **Senders, Domains & Dedicated IPs → Senders → Add a sender**, then click the
   link Brevo emails you. For reliable delivery, also **authenticate your own domain** (DKIM + DMARC
   records) and send from it. Free-mail From addresses (gmail.com, outlook.com, …) are often rejected
   or sent to spam because of DMARC.
3. **SMTP & API → SMTP**: copy the **SMTP login** (looks like `xxxx@smtp-brevo.com`) and
   **generate an SMTP key**. This is the SMTP key, not the API key.
4. Values for Render:

   | Key | Value |
   | --- | --- |
   | `SMTP_HOST` | `smtp-relay.brevo.com` (preset in `render.yaml`) |
   | `SMTP_PORT` | `2525` (preset) |
   | `SMTP_SECURE` | `false` (preset). The connection is upgraded with STARTTLS, which the code requires (`requireTLS: true`). |
   | `SMTP_USER` | the Brevo SMTP login |
   | `SMTP_PASSWORD` | the Brevo SMTP key |
   | `EMAIL_FROM` | the verified sender address |

Why 2525: Render Free web services block outbound SMTP on ports 25, 465 and 587.
Brevo's free plan has a daily sending cap (check Brevo's current limits).

## 5. Render backend (API + worker)

### How it runs

`render.yaml` builds the **existing** `server/Dockerfile` (`rootDir: server`) and overrides only the start
command with `node dist/src/start.js`. `server/src/start.ts`:

1. runs `prisma migrate deploy`, and exits with an error if it fails, so a broken schema is never served;
2. starts the API (`dist/src/server.js`) and the worker (`dist/src/jobs/worker.js`) as two child processes;
3. forwards `SIGTERM`/`SIGINT` to both and waits up to 25 s for a clean shutdown (Render allows 30 s);
4. stops the container with exit code 1 if either process crashes, so Render restarts it.

The worker's maintenance (session expiry, overstay checks, auto top-up, permit/violation status, token
cleanup) is unchanged. It runs from the existing BullMQ job scheduler about every 30 s, starting right after
boot, so no extra startup run was added. One worker with `concurrency: 1` means no duplicate maintenance runs.

The API listens on Render's `PORT` (`env.PORT`, bound to `0.0.0.0`). Local `docker-compose.yml` is unchanged
and still runs the backend and worker as separate services.

### Create it

1. Render Dashboard → **New → Blueprint** → connect the GitHub repo → branch `main`.
   Render reads `render.yaml` and proposes `parkflow-api` (free web service) and `parkflow-redis`.
2. Fill in every `sync: false` value:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon direct string from step 1 |
   | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | two generated secrets (≥ 32 chars) |
   | `PAYMENT_WEBHOOK_SECRET` | third generated secret (≥ 32 chars) |
   | `CORS_ORIGINS` | your Vercel production URL, e.g. `https://parkflow.vercel.app`. Use a best guess now and fix it in step 8. |
   | `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | from step 4 |
   | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | from step 3 |

   Preset in `render.yaml`: `NODE_ENV=production`, `DEV_SKIP_EMAIL_OTP=false`, `TRUST_PROXY=1`,
   `PAYMENT_PROVIDER=development`, `ALLOW_SIMULATED_PAYMENTS=true`, the Brevo host/port/secure values, and
   `REDIS_URL` (from `parkflow-redis`). Do not set `PORT`.
3. **Apply**. Watch the deploy logs for `ParkFlow API ready` and `Worker ready`. The API also logs a
   warning that simulated payments are enabled. That is expected for the demo.
4. Note the service URL, e.g. `https://parkflow-api.onrender.com`. The API base for the app is that URL
   plus `/api/v1`.

Optional variables (add in the dashboard only if you use them): `GEMINI_API_KEY` (dashboard warning
check), `GOOGLE_ROUTES_API_KEY`, `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY`,
`EXPO_PUSH_ACCESS_TOKEN`, `EMERGENCY_CALL_NUMBER`, and the `ROAD_REPORT_*` tuning values. All have safe defaults.

**Without a Blueprint** (manual web service): Runtime **Docker**, Root Directory **`server`**, Branch **`main`**,
Instance **Free**, **Docker Command `node dist/src/start.js`**, Health Check Path **`/health`**, and the same
environment variables as above.

### Production security that stays on

- JWT secrets: ≥ 32 characters, and no `replace-` example values (webhook secret too).
- Email OTP is always required. `DEV_SKIP_EMAIL_OTP=true` makes production refuse to start, and
  `/auth/dev-login` only works in development.
- Payment webhooks still require a valid HMAC signature made with `PAYMENT_WEBHOOK_SECRET`.
- Swagger (`/api/docs`, `/api/openapi.json`) is not mounted in production.
- Storage: the bucket must exist, and upload type and size are validated.
- `ALLOW_SIMULATED_PAYMENTS` (default `false`) only lets `PAYMENT_PROVIDER=development` run in production.
  In that mode the provider code never calls `PAYMENT_API_URL` and never charges a card.
  With `PAYMENT_PROVIDER=http`, the HTTPS URL and API key checks still apply.
- `TRUST_PROXY=1` makes Express use the client IP from Render's proxy. Without it, every user would share one
  IP and the OTP rate limit (10 per 10 minutes) would apply to everyone together.

## 6. Migrations and reference data (Neon)

**Migrations** run automatically each time the Render service starts (`prisma migrate deploy`). To apply them
before the first Render deploy instead, use the shell setup below and run `npx prisma migrate deploy`.

**Reference data** is loaded from the JSON datasets already in the repo. Only the commands below exist; nothing
else is imported. User accounts, sessions, wallets, payments and road reports are **not** migrated, and
`pg_dump` is not used. Every command is an idempotent upsert, so re-running it is safe.

| Data | Command | Source file |
| --- | --- | --- |
| Parking facilities, operators, zones, tariffs, operating hours, road checkpoints | `prisma/seed.ts` | `server/prisma/data/catalog.json` |
| Car services | `prisma/importCarServices.ts` | `ramallah_car_services.json` |
| EV charging stations | `prisma/importEvStations.ts` | `ramallah_ev_charging_stations.json` |
| Tourism places | `prisma/importTourismPlaces.ts` | `ramallah_tourism_places.json` |

`ramallah_parking_locations.json` and `parkflow_feature9_*.json` in the repo root have no importer, so they are
not part of this step.

Run these from your own machine, inside `server/`, after `npm ci`. The Neon URL goes **only into the current
shell**. Shell variables take precedence over `server/.env`, so your local file is neither read for the
database nor changed.

**`NODE_ENV=production` is required for the seed.** Without it, `seed.ts` also creates local demo users,
demo road reports, rides, spots, a demo admin, and a demo gate camera with a publicly known key.

PowerShell:

```powershell
cd server
$env:DATABASE_URL = "<Neon direct connection string>"
# Only if Render has not deployed yet (it runs migrations on start):
npx prisma migrate deploy
$env:NODE_ENV = "production"; npx tsx prisma/seed.ts; Remove-Item Env:NODE_ENV
npx tsx prisma/importCarServices.ts ..\ramallah_car_services.json
npx tsx prisma/importEvStations.ts ..\ramallah_ev_charging_stations.json
npx tsx prisma/importTourismPlaces.ts ..\ramallah_tourism_places.json
Remove-Item Env:DATABASE_URL
```

bash:

```bash
cd server
export DATABASE_URL='<Neon direct connection string>'
npx prisma migrate deploy   # only if Render has not deployed yet
NODE_ENV=production npx tsx prisma/seed.ts
npx tsx prisma/importCarServices.ts ../ramallah_car_services.json
npx tsx prisma/importEvStations.ts ../ramallah_ev_charging_stations.json
npx tsx prisma/importTourismPlaces.ts ../ramallah_tourism_places.json
unset DATABASE_URL
```

Before running these, check that `$env:DATABASE_URL` / `$DATABASE_URL` points at the Neon host.

## 7. Vercel frontend (Expo Web)

`vercel.json` (repo root):

- install `npm ci`, build `npx expo export --platform web`, output `dist`;
- rewrites every path to `/index.html`, so deep links such as `/wallet` or `/parking/start` load the
  Expo Router SPA. Vercel serves real files (`/_expo/static/...`, `/assets/...`, `favicon.ico`) before
  rewrites, so assets are unaffected;
- caches the hashed bundles under `/_expo/static/` as immutable.

Steps:

1. Vercel → **Add New → Project** → import the GitHub repo. Leave **Root Directory** as the repo root.
   Framework preset: **Other**. `vercel.json` sets the commands.
2. **Settings → General → Node.js Version**: 22.x.
3. **Settings → Environment Variables** (Production, and Preview if you use previews):

   | Key | Value |
   | --- | --- |
   | `EXPO_PUBLIC_API_BASE_URL` | `https://<your-render-service>.onrender.com/api/v1` |
   | `EXPO_PUBLIC_SIMULATED_PAYMENTS` | `true`. Shows the "Demo payment" notice in Wallet, Top up and Add card. |

   Leave `EXPO_PUBLIC_DEV_SKIP_EMAIL_OTP`, `EXPO_PUBLIC_START_FROM_BEGINNING` and
   `EXPO_PUBLIC_SHOW_TEST_LOCATION` unset. They only work in `__DEV__` anyway, and an export is never `__DEV__`.
   `EXPO_PUBLIC_*` values are compiled into the bundle and visible to anyone, so never put a secret in one.
4. **Deploy**. Note the production URL, e.g. `https://parkflow.vercel.app`.

`EXPO_PUBLIC_*` values are read at **build** time. After changing one, **redeploy** on Vercel.

Android/iOS builds are not affected by `vercel.json`. To point a native build at the deployed API, set the
same `EXPO_PUBLIC_API_BASE_URL` when building it. With `EXPO_PUBLIC_SIMULATED_PAYMENTS` unset, the Wallet UI is
exactly as before. Native apps send no `Origin` header, so CORS does not block them.

## 8. Connect API URL and CORS

The two URLs depend on each other, so finish in this order:

1. Render is deployed → copy `https://<service>.onrender.com`.
2. Vercel: `EXPO_PUBLIC_API_BASE_URL=https://<service>.onrender.com/api/v1` → (re)deploy.
3. Render: set `CORS_ORIGINS` to the **exact** Vercel origin, with no trailing slash and no path, e.g.
   `https://parkflow.vercel.app`. Separate several origins (custom domain, a fixed preview URL) with commas.
   Wildcards are not supported. Saving the variable redeploys the service.

CORS applies to both HTTP and Socket.IO. A wrong value shows up in the browser console as `CORS_FORBIDDEN`,
and the app reports a network error.

## 9. Health checks and verification

```bash
API=https://<service>.onrender.com
curl -s $API/health              # {"status":"ok"}     liveness (Render health check)
curl -s $API/ready               # {"status":"ready"}  checks Postgres + Redis
curl -s -o /dev/null -w "%{http_code}\n" $API/api/docs   # 404: Swagger is off in production
curl -si -H "Origin: https://<your-app>.vercel.app" $API/health | grep -i access-control-allow-origin
```

The first request after the service has slept can take about a minute (see below). Retry before assuming failure.

In the browser at the Vercel URL:

1. Sign in with a real email address → the OTP arrives from your Brevo sender → verification succeeds.
2. The map shows parking zones, car services, EV stations and tourism places (reference data).
3. Wallet shows the **Demo payment** notice. Add a card (a number whose last four digits are `0000`
   simulates a decline, and any other valid number succeeds), then top up. The balance changes and no real money moves.
4. Start and stop a parking session. A session that ends on its own needs the worker, which runs inside the same service.
5. Reload a deep link such as `https://<your-app>.vercel.app/wallet`. It loads instead of returning a 404.
6. Upload a file (e.g. a violation appeal photo) and open it again. This checks Supabase storage and signed URLs.

Render logs should show `ParkFlow API ready`, `Worker ready`, and no `Job failed` loops.

## 10. Automatic deployment from `main`

- **Render**: `autoDeployTrigger: commit` redeploys `parkflow-api` on every push to `main` that changes the
  service. With `rootDir: server`, only changes under `server/` trigger a deploy. Each deploy runs migrations at start.
- **Vercel**: every push to `main` builds a Production deployment, and other branches and PRs get Preview
  deployments. A preview URL is not in `CORS_ORIGINS`, so its API calls fail unless you add that exact origin.
- Merge schema changes together with their Prisma migration. A failed `migrate deploy` stops the new deploy,
  and Render keeps the previous one live.

## Free-tier limitations

These affect everyone using the public demo:

- **Render Free sleeps.** After about 15 minutes with no incoming requests, the container stops. The next
  request wakes it, which takes roughly 30-60 s or more (plus Neon's own cold start). While asleep, **the
  worker is paused too**: parking sessions are not auto-expired, overstays aren't checked, auto top-ups don't
  run, push notifications aren't delivered, and real-time Socket.IO updates stop. The pending work runs once
  the service wakes, because maintenance queries compare against the current time, but it does not happen on
  schedule.
- **Free instance hours** are limited per workspace each month. One service running all the time uses most of them.
- **Redis is not persistent** (see step 2): OTP codes and queued jobs can be lost on any restart.
- **Neon Free** suspends compute when idle and has storage and compute limits. **Supabase Free** limits storage
  and pauses projects after a period of inactivity, which makes uploads unavailable until you resume the project.
  **Brevo Free** caps daily emails. Check each provider's current limits.
- **Payments are simulated.** Balances are not real money.
- There is no SLA, no backups beyond what each provider includes by default, and a single instance.

### Optional uptime monitoring

An external monitor (e.g. UptimeRobot, Better Stack) can request `GET /health` every 5-10 minutes. That
alerts you to outages and *usually* keeps the instance awake, which also keeps the worker running. It is
**not a guarantee**: Render can still restart or stop free instances, the pings use up free instance hours,
and Render's free-tier terms apply. Use `/health`, not `/ready`, so the pings don't keep Neon awake for no reason.

## Moving to real production

The demo setup is deliberately cheap. For a real launch you need at least:

- a paid Render instance that doesn't sleep, ideally with the worker as a separate **Background Worker**
  service (same image, command `node dist/src/jobs/worker.js`), as in `docker-compose.yml`;
- a persistent, paid Key Value/Redis instance with `noeviction`;
- a real payment provider: `PAYMENT_PROVIDER=http`, `PAYMENT_API_URL` (HTTPS), `PAYMENT_API_KEY`,
  **`ALLOW_SIMULATED_PAYMENTS=false`**, and `EXPO_PUBLIC_SIMULATED_PAYMENTS` unset;
- a paid database plan with backups and point-in-time recovery, and a Supabase plan that does not pause;
- an authenticated sending domain on Brevo (or another provider), custom domains, monitoring and alerting.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Deploy fails with `Production requires configured payment provider` | `ALLOW_SIMULATED_PAYMENTS` is not `true` while `PAYMENT_PROVIDER=development`. |
| `Replace example secrets` / zod error on `JWT_*` | A secret is missing, shorter than 32 characters, or starts with `replace-`. |
| `[start] prisma migrate deploy failed` | Wrong `DATABASE_URL`, or a pooled (`-pooler`) Neon URL. Use the direct string. |
| `Startup failed` mentioning `NotFound` / `HeadBucket` | The Supabase bucket does not exist, or the bucket, endpoint, region or keys are wrong. |
| OTP request returns 500 or times out | Brevo login/key wrong, sender not verified, or port not 2525. Check Render logs. |
| Build fails with `failed to read dockerfile` / `Dockerfile not found` | Render resolves the Dockerfile from the root directory (`server/`). In the service's **Settings → Build & Deploy**, Dockerfile Path should read `./Dockerfile` and Docker Build Context `.`, both under root directory `server`. |
| Everyone hits `RATE_LIMITED` quickly | `TRUST_PROXY` is not set. Render's own example uses `1`. If different users still share one limit, try `2` or `3` (the number of proxy hops). |
| A variable added to `render.yaml` later never shows up | Render ignores new `sync: false` keys when it updates an existing Blueprint. Add the value in the dashboard. |
| Browser shows `CORS_FORBIDDEN` | `CORS_ORIGINS` doesn't exactly match the Vercel origin. |
| App says "Set EXPO_PUBLIC_API_BASE_URL…" | The variable was missing at Vercel build time. Set it and redeploy. |

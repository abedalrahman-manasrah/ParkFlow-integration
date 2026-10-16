# Deploying the ParkFlow public demo

This guide describes a manual public demo setup. The service plans below can use free tiers. Default Vercel domains can use the same-origin HTTP proxy described below; a custom domain is optional. These files prepare deployment and do not mean any cloud service has been deployed.

| Part | Service | Config in repo |
| --- | --- | --- |
| Customer web app (`apps/customer`) | Vercel project 1 | `vercel.json`, `PARKFLOW_WEB_APPLICATION=customer` |
| Management web app (`apps/management`) | Vercel project 2 | `vercel.json`, `PARKFLOW_WEB_APPLICATION=management` |
| API + background worker (one container) | Render Free Web Service, Docker | `render.yaml`, `server/Dockerfile`, `server/src/start.ts` |
| PostgreSQL | Neon Free | `server/prisma/schema.prisma` (unchanged) |
| Redis (OTP codes, rate limits, BullMQ, Socket.IO) | Render Key Value Free | `render.yaml` |
| File uploads (S3 API) | Supabase Storage | `server/src/providers/storage.ts` (unchanged) |
| OTP email | Brevo SMTP on port 2525 | `server/src/providers/email.ts` (unchanged) |

> **This is demo hosting, not production hosting.** Free tiers sleep, lose Redis data on restart,
> and give no uptime guarantee. Payments are **simulated**: no gateway is called and no card is charged.
> See [Free-tier limitations](#free-tier-limitations) and [Moving to real production](#moving-to-real-production).

Provider accounts, optional custom domains, project creation, secrets and the initial deployments below are
setup steps that require access to the hosting accounts. After setup, the configured hosts run builds and migrations as described below. Never commit the values you create. They go only in the Render and Vercel dashboards
(or in your shell for one-off commands).

---

## 0. Before you start

- The repo is on GitHub and `main` holds the code to deploy.
- For direct browser-to-API requests, use a domain you control and reserve three HTTPS hostnames under the same registrable domain:
  customer `https://app.example.com`, management `https://management.example.com`, and
  API `https://api.example.com`. Attach the first two to their separate Vercel projects and the API
  hostname to Render; complete each provider's DNS and TLS verification before testing sign-in.
  The API uses host-only, `Secure`, `HttpOnly`, `SameSite=Strict` cookies with separate customer and
  management sessions. Sibling HTTPS subdomains keep these requests same-site. The default
  `*.vercel.app` frontend and `*.onrender.com` API addresses are cross-site and cannot support this
  browser login flow merely by adding CORS origins. Use the same-origin proxy below when you have no domain. Keep the cookie and CSRF protections enabled.
- Pick **one region** for everything to keep latency low. This guide uses **Frankfurt / AWS eu-central-1**
  (`render.yaml` sets `region: frankfurt`). If you change it, change it for both Render services; the
  Key Value internal URL only works inside the same Render region.
- For a new installation only, generate three random secrets (each ≥ 32 characters) and keep them in a password manager. For the existing cloud database, preserve its current keys:

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```

  Use a different value for each of `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and
  `PAYMENT_WEBHOOK_SECRET`. The server rejects reused signing keys and `replace-` example values.
- For a new database only, generate a separate `PROFILE_ENCRYPTION_KEY` as exactly 64 hexadecimal characters. Never replace the key of an existing database:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

  Store this key securely and retain it across redeployments so existing encrypted profile data remains readable.
  Keep all four keys in Render only; never add them to a Vercel public variable.

## Default provider domains: existing team deployment

The team customer project currently uses https://parkflow-web-gamma.vercel.app and the shared API
uses https://parkflow-api-m19q.onrender.com. These are existing public endpoints, not evidence that
this release has been deployed. Create a **separate** management Vercel project and use its actual
production URL in the settings below; do not copy the customer project into it.

Both projects use repository root, Node.js 22.x and the root vercel.json. Its API and Socket.IO HTTP
rewrites target the existing team Render API before the SPA fallback, preserve the requested path
and query, and mark private responses no-store. The frontend document sets
Referrer-Policy: strict-origin-when-cross-origin. Do not add CDN caching for either proxy route.

Set these Production build variables separately:

| Variable | Customer project | Management project |
| --- | --- | --- |
| PARKFLOW_WEB_APPLICATION | customer | management |
| EXPO_PUBLIC_API_BASE_URL | https://parkflow-web-gamma.vercel.app/api/v1 | The management project's own absolute HTTPS origin followed by /api/v1 |
| EXPO_PUBLIC_WEB_SOCKET_POLLING | true | true |
| EXPO_PUBLIC_SIMULATED_PAYMENTS | true for the simulated demo only | Same demo setting |

The API base must use the **same production origin as that frontend**. Never use the Render URL
as a browser API base in this mode. Use an absolute URL; a bare /api/v1 is not supported by the
Socket.IO URL calculation. Vercel public variables are compiled during export, so rebuild after
changing them. Configure Production explicitly; arbitrary preview origins are not trusted.

In Render, set WEB_CUSTOMER_ORIGINS to https://parkflow-web-gamma.vercel.app,
WEB_MANAGEMENT_ORIGINS to the newly created management project's exact production origin,
and CORS_ORIGINS to those two comma-separated origins. No path or trailing slash is allowed.
Set AUTH_LOGIN_METHOD=email and keep both DEV_SKIP_EMAIL_OTP and DEV_SKIP_PHONE_OTP=false.
Keep the lists disjoint and retain TRUST_PROXY=1 until the actual forwarding chain is verified.
Do not increase the trusted hop count to fix a shared rate limit: direct Render access must not
be able to spoof the client IP. Verify rate-limit identity through both direct and proxied paths.

The browser stores the unchanged Secure, HttpOnly, host-only, SameSite=Strict cookies on its own
frontend host. Browser GET/HEAD requests without Origin require Sec-Fetch-Site: same-origin,
Sec-Fetch-Mode: cors and a Referer whose parsed origin exactly matches the requested application.
An explicitly supplied Origin always takes precedence, and writes still require a real trusted
Origin plus existing session/login/CSRF proof. No forwarded host header establishes browser trust.
Socket.IO uses the same guarded polling handshake and the same authenticated namespace proof.
Polling delivers the existing realtime events over HTTP; default direct-domain browser builds
and native applications retain WebSockets when this web-only opt-in is unset.

Before calling this path deployed, verify multiple Set-Cookie headers reach the browser, Cookie,
Referer and Fetch Metadata reach Render, private responses are uncached, authenticated polling
receives events/reconnects, and customer/management login and logout remain isolated. An HTTP
health200 alone does not verify any of these properties. Vercel external proxy requests have a
120-second timeout; normal Socket.IO polling is shorter. Render cold starts can still delay access.

References: [Vercel external rewrites](https://vercel.com/docs/routing/rewrites),
[Vercel proxy limits](https://vercel.com/docs/limits),
[Socket.IO transports](https://socket.io/docs/v4/how-it-works).

## Updating the existing cloud database safely

Keep the existing cloud DATABASE_URL, profile encryption key, both JWT keys, storage credentials,
SMTP provider and account IDs unless a separate migration explicitly requires changing them.
Deploying local source does not copy local accounts or wallet balances into the cloud database.
Never replace an existing profile encryption key: encrypted identity fields bind to both that key
and the existing user UUID. Do not run development seeds or replace team reference edits.

1. Obtain a fresh private cloud PostgreSQL backup and validate that it can be restored; retain the
   storage backup and encryption/signing keys separately. Do not commit or attach those artifacts.
2. Compare the cloud migration history, checksums and unfinished migrations with all 25 repository
   migrations. Check email normalization conflicts and rehearse pending migrations on an isolated
   restored copy before updating the authoritative database.
3. Preserve role memberships, email-verification state, account UUIDs, wallet/transaction records,
   vehicles, reservations, parking sessions and storage objects. The latest session migrations add
   metadata without deleting existing records; old push registrations wait for refresh/re-registration.
4. Set every newly required production variable on the existing Render service before deployment.
   Adding sync:false to the Blueprint does not populate existing service settings automatically.
5. Coordinate frontend promotion before merging: Vercel and Render watch main independently, so a
   fast frontend build must not become live against the old API. Hold frontend production promotion
   until the new API is ready, or agree an explicit maintenance window with the project owner.
   Deploy the API using node dist/src/start.js, which runs migrate deploy before API and worker.
   Confirm both readiness messages and /ready. The worker resumes pending jobs immediately; verify
   intended payment/email/push provider mode and pending work before starting it.
6. Deploy both frontends from the verified integrated release, then verify the deployed revision,
   browser session protections and data baseline. Keep the previous release available for rollback;
   do not reset the database to undo an application deployment.

The team added `.github/workflows/sync-vercel-repository.yml`: a push to the team main branch
fast-forwards `halaawwad/parkflow-web:main` only when its history is already an ancestor. Preserve
this workflow and any independent target history. The sync runs independently of CI, so prepare
hosting variables and promotion controls before an approved merge; verify required checks on
the exact release first. Confirm the actual Vercel Git connection in the owning account rather
than assuming this mirror proves a deployment. A missing sync secret or divergent mirror must
be resolved by its owner without force-pushing.

The available GitHub identity can update integration PR4 but cannot merge the team repository.
A repository owner must merge approved source, or hosting must explicitly deploy the reviewed
integration branch using an account that has access. Do not silently switch the production source
repository, bypass review rules, overwrite main, or create replacement databases/services.

---

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

The repository currently contains 25 migrations. Deploy the complete migration history; `prisma migrate deploy` runs automatically on every Render start (step 6). Do not replace migrations with `prisma db push`.

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
   | `PROFILE_ENCRYPTION_KEY` | separate generated 64-character hex key |
   | `WEB_CUSTOMER_ORIGINS` | `https://app.example.com` — exact customer origin |
   | `WEB_MANAGEMENT_ORIGINS` | `https://management.example.com` — exact management origin |
   | `CORS_ORIGINS` | `https://app.example.com,https://management.example.com` |
   | `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | from step 4 |
   | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | from step 3 |

   Preset in `render.yaml`: `NODE_ENV=production`, `AUTH_LOGIN_METHOD=email`, both `DEV_SKIP_*_OTP=false`, `TRUST_PROXY=1`,
   `PAYMENT_PROVIDER=development`, `ALLOW_SIMULATED_PAYMENTS=true`, the Brevo host/port/secure values, and
   `REDIS_URL` (from `parkflow-redis`). Do not set `PORT`.
3. **Apply**. Watch the deploy logs for `ParkFlow API ready` and `Worker ready`. The API also logs a
   warning that simulated payments are enabled. That is expected for the demo.
4. Note the default service URL for health diagnostics. In Render's custom domain settings, attach
   `api.example.com` and finish DNS/TLS verification. Both web projects must use
   `https://api.example.com/api/v1` as their API base.

Optional variables (add in the dashboard only if you use them): `GEMINI_API_KEY` (dashboard warning
check), `GOOGLE_ROUTES_API_KEY`, `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY`,
`EXPO_PUSH_ACCESS_TOKEN`, `EMERGENCY_CALL_NUMBER`, and the `ROAD_REPORT_*` tuning values. All have safe defaults.

**Without a Blueprint** (manual web service): Runtime **Docker**, Root Directory **`server`**, Branch **`main`**,
Instance **Free**, **Docker Command `node dist/src/start.js`**, Health Check Path **`/health`**, and the same
environment variables as above.

### Production security that stays on

- JWT secrets: ≥ 32 characters, all signing keys distinct, and no `replace-` example values (webhook secret too).
- Profile encryption: a separate `PROFILE_ENCRYPTION_KEY` is required in production.
- Customer and management origin lists are exact, disjoint HTTPS origins. Browser cookie, CSRF and
  per-organization permission checks remain enabled. All production CORS entries must also use HTTPS.
- Database and storage credentials must replace local examples. Storage/routing/payment endpoints use
  HTTPS without embedded credentials.
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

## 6. Migrations and reference data (new empty installations only)

**Migrations** run automatically each time the Render service starts (`prisma migrate deploy`). To apply them
before the first Render deploy instead, use the shell setup below and run `npx prisma migrate deploy`.

**Existing team cloud rollout: skip every seed/import command in this section.** Seeds and importers upsert existing zone, tariff and operating-hour rows and can overwrite the team's current edits. They are not a backup or an upgrade migration. Existing deployments use migrate deploy only after the backup/rehearsal checks above.

**New empty installations only:** Reference data is loaded from the JSON datasets already in the repo. Only the commands below exist; nothing
else is imported. User accounts, sessions, wallets, payments and road reports are **not** migrated, and
`pg_dump` is not used. These commands are idempotent upserts for initial catalogue loading; re-running them can overwrite existing reference edits.

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

## 7. Two Vercel frontends (Expo Web)

Create **two Vercel projects from the same repository**, both with **Root Directory = repository root**,
Framework preset **Other**, and Node.js **22.x**. Keep the repository root available: both applications
share `packages/`, the root lockfile and the checked-in security vendor archives.

The root `vercel.json` uses `npm ci`. The root `postinstall` verifies the security vendor packages;
do not use `--ignore-scripts` or install separately inside an application. Its build command validates
`PARKFLOW_WEB_APPLICATION`, runs the corresponding root web export script, and copies that application's
export into the deployment's `dist` output. The root web export prehooks also run the security verifier. The selected workspace command uses
`expo export --platform web --max-workers 1 --output-dir dist`, so native bundles are not published.
Existing all-platform/native export commands remain available for their original uses.
No API or worker is hosted by these Vercel projects.

| Setting | Customer project | Management project |
| --- | --- | --- |
| `PARKFLOW_WEB_APPLICATION` | `customer` | `management` |
| Export selected by config | `npm run export:customer:web` | `npm run export:management:web` |
| Export source | `apps/customer/dist` | `apps/management/dist` |
| Vercel output directory | `dist` | `dist` |
| Custom production domain | `app.example.com` | `management.example.com` |
| `EXPO_PUBLIC_API_BASE_URL` | `https://api.example.com/api/v1` | `https://api.example.com/api/v1` |
| `EXPO_PUBLIC_SIMULATED_PAYMENTS` for this demo | `true` | `true` |

Set the corresponding environment variables in **each project's Production environment before building**. For default provider domains, use the per-project proxy settings above instead of the direct-domain API base.
An unset or unknown application selector fails the build instead of publishing the wrong application.
The selector is a build setting, so it has no `EXPO_PUBLIC_` prefix. It selects the application bundle;
server authorization still determines access to management features.

`ALLOW_SIMULATED_PAYMENTS=true` on Render explicitly enables the demo backend payment provider.
`EXPO_PUBLIC_SIMULATED_PAYMENTS=true` in the web builds displays the demo payment notice; the UI flag
does not enable or authorize simulated payments on the server. Set both sides for this demo, and never
supply real card details while testing it. No gateway is called and no card is charged by the development provider.

Leave `EXPO_PUBLIC_DEV_SKIP_EMAIL_OTP`, `EXPO_PUBLIC_START_FROM_BEGINNING` and
`EXPO_PUBLIC_SHOW_TEST_LOCATION` unset in cloud builds. Public variables are compiled into the bundle
and visible to visitors; put server credentials only in Render. Redeploy both affected Vercel projects
after changing a public variable.

API and Socket.IO proxy rewrites run first. The SPA fallback keeps deep links within the selected frontend: customer `/wallet` and management
`/operator` or `/admin`. Hashed bundles retain the team's immutable cache header. The build and output
configuration is defined in `vercel.json`, which overrides corresponding dashboard build settings
([Vercel configuration reference](https://vercel.com/docs/project-configuration/vercel-json)).

Android/iOS builds are unaffected by `vercel.json`. Set their API base at build time separately.
Native requests do not use this browser cookie authentication flow.

## 8. Connect API URL, cookie origins and CORS

After all three custom domains have working HTTPS, set these values in **Render** (replace every
`example.com` hostname with your own):

```dotenv
WEB_CUSTOMER_ORIGINS=https://app.example.com
WEB_MANAGEMENT_ORIGINS=https://management.example.com
CORS_ORIGINS=https://app.example.com,https://management.example.com
```

Set this API base in **both Vercel projects**, then rebuild them:

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://api.example.com/api/v1
```

The direct-domain values above are an alternative to the provider-domain proxy setup, not an additional requirement. Every origin is an exact scheme and host with an optional port, **no path or trailing slash**.
Comma-separated lists support multiple explicitly configured origins. Customer and management lists
must never overlap: the server uses them to select separate cookie sessions and rejects overlap at startup.
The web origin lists are also included in the effective HTTP and Socket.IO CORS allowlist. CORS alone
does not register an origin for a browser application or make a cross-site cookie usable.

Preserve `credentials: include`, application/session/login/CSRF headers, and `SameSite=Strict` cookies.
Do not add wildcard origins or switch to insecure cookies to make the default provider domains work.
A fixed preview can use a same-site custom hostname such as `preview-app.example.com`; add it only to
the matching application's `WEB_*_ORIGINS` list and the CORS list. Arbitrary Vercel preview URLs remain
unsuitable for this cookie login topology even if added to CORS.

Saving Render environment variables restarts the service. When updating an existing Blueprint,
add new `sync: false` values in the dashboard as well; Render only prompts for them when initially
creating the Blueprint ([Render Blueprint reference](https://render.com/docs/blueprint-spec)).

## 9. Health checks and verification

GitHub runs separate frontend dependency-security and backend release-validation workflows. The backend
workflow creates empty loopback-only PostgreSQL, Redis and private S3 test stores, generates masked
ephemeral test credentials, applies all migrations, builds/types the server, runs its complete tests
and audits dependencies. It uses no production secrets or application data. Passing CI validates
source; it does not deploy the hosts or verify real proxy forwarding, SMTP delivery or cloud backups.


```bash
API=https://<service>.onrender.com
curl -s $API/health              # {"status":"ok"}     liveness (Render health check)
curl -s $API/ready               # {"status":"ready"}  checks Postgres + Redis
curl -s -o /dev/null -w "%{http_code}\n" $API/api/docs   # 404: Swagger is off in production
curl -si -H "Origin: https://app.example.com" $API/health | grep -i access-control-allow-origin
```

The first request after the service has slept can take about a minute (see below). Retry before assuming failure.

In the browser at `https://app.example.com`:

1. Sign in with a real email address → the OTP arrives from your Brevo sender → verification succeeds.
2. The map shows parking zones, car services, EV stations and tourism places (reference data).
3. Wallet shows the **Demo payment** notice. Use only test card details: a test number whose last four
   digits are `0000` simulates a decline; another accepted test number succeeds. Then top up and confirm
   the simulated balance changes. No real money moves.
4. Start and stop a parking session. A session that ends on its own needs the worker, which runs inside the same service.
5. Reload a deep link such as `https://app.example.com/wallet`. It loads instead of returning a 404.
6. Upload a file (e.g. a violation appeal photo) and open it again. This checks Supabase storage and signed URLs.
7. In a separate tab at `https://management.example.com`, sign in with an intentionally provisioned
   active admin or operator account. An ordinary customer must receive access denied. Confirm that
   customer and management sessions remain separate when either tab signs out; operators see only
   their assigned organizations. Production demo seeds do not provision public admin credentials.

Render logs should show `ParkFlow API ready`, `Worker ready`, and no `Job failed` loops.

## 10. Automatic deployment from `main`

- **Render**: `autoDeployTrigger: commit` redeploys `parkflow-api` on every push to `main` that changes the
  service. With `rootDir: server`, only changes under `server/` trigger a deploy. Each deploy runs migrations at start.
- **Vercel**: both projects build from `main` with their own application selector and domain. Preview
  builds need their own explicitly configured, same-site custom origin to use browser sign-in (step 8).
  Do not copy a customer selector into the management project's environment.
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
| Everyone hits `RATE_LIMITED` quickly | `TRUST_PROXY` is not set. Render's own example uses `1`. If different users still share one limit, verify the actual proxy chain before changing the hop count; do not guess a larger value. |
| A variable added to `render.yaml` later never shows up | Render ignores new `sync: false` keys when it updates an existing Blueprint. Add the value in the dashboard. |
| Browser shows `CORS_FORBIDDEN` | An exact frontend origin is missing from the effective CORS allowlist. Check the matching `WEB_*_ORIGINS` list and `CORS_ORIGINS`. |
| Production rejects web origins | Replace localhost defaults with exact, disjoint HTTPS customer and management origins. |
| Login succeeds but browser session is missing | Check all three HTTPS custom domains share the same site. Default `vercel.app` to `onrender.com` is cross-site and `SameSite=Strict` intentionally blocks it. |
| Vercel builds the wrong app or asks for `PARKFLOW_WEB_APPLICATION` | Set `customer` or `management` on the corresponding project, with repository root as Root Directory, then rebuild. |
| Production asks for `PROFILE_ENCRYPTION_KEY` | Set the separate 64-character hexadecimal key in Render and keep it stable across redeployments. |
| App says "Set EXPO_PUBLIC_API_BASE_URL…" | The variable was missing at Vercel build time. Set it and redeploy. |

# ParkFlow — Smart Parking for Palestine

ParkFlow has two independently runnable Expo and TypeScript frontends backed by
one Express service, Prisma, PostgreSQL and Redis: the customer application and
the administrator/parking-owner web portal. It supports finding parking, reservations, parking sessions,
wallet payments, community road reports, and workspaces for administrators and
parking operators. The interface supports English and Arabic with RTL layouts.

This is a development and pilot implementation. Payment delivery, email delivery,
verified vehicle associations, and trustworthy occupancy data require configured
providers or operator processes before public use.

## What is included

- Email registration and passwordless sign-in with emailed six-digit codes,
  five-minute challenges, resend/send limits and address locks. New accounts
  are created only after successful verification. Legacy phone provider code
  remains inactive when the normal email method is selected.
- Optional development email sign-in without a password or code. Existing
  accounts retain their roles; registration creates ordinary users. These
  sessions are rejected when the mode is disabled, and production refuses to
  start with development authentication enabled.
- Administrative user and company management, vehicle verification review,
  parking review and publication, and audited role and status changes.
- Operator membership and access controls, parking prices, location, entrances,
  capacity, weekly hours, closures, availability, check-in and analytics.
- Application appearance configuration with preview, publication, version
  history and rollback for supported content, colours and branding.
- Explicit demo and live inventory, reservation quotes calculated by the server,
  availability freshness checks, cancellation and recovery flows, tariff
  snapshots, and idempotent wallet operations.
- Shared rides, hosted private parking, QR gate passes, gate operations, patrol
  checks and permit-aware overstay handling with organization-scoped permissions.
- Traffic-aware route comparisons, destination parking, trip needs, tourism, car
  services, accessible parking, dashboard warning checks, rewards, voice alerts
  and opt-in crash detection. External integrations require their own settings.
- Current location, parking layouts and forecasts, navigation, offline queues
  for road reports and feedback, and Arabic and English translations.

## Local setup

Requirements: Node.js, npm, and Docker Desktop with its Linux engine running.

1. Install the frontend dependencies with `npm ci`. The checked-in private
   security distributions already contain reviewed corrections. Postinstall and
   `npm run security:verify` validate their source, immutable archives and every
   installed instance. A scripts-disabled install contains the same corrections;
   run verification before starting Expo. See the
   [distribution and maintenance guide](security/vendor/README.md).
2. Copy `apps/customer/.env.example` to `apps/customer/.env`,
   `apps/management/.env.example` to `apps/management/.env`, and
   `server/.env.example` to `server/.env`.
   For a browser on this computer, set each frontend's
   `EXPO_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`. For a physical device,
   use the computer's LAN IP instead of `localhost`. Device testing also requires
   setting `BACKEND_BIND_ADDRESS` in `server/.env` to that LAN address and
   recreating the backend; keep the default `127.0.0.1` for local browser testing.
3. In `server/.env`, generate private values for the JWT secrets and payment
   webhook secret. Set `PROFILE_ENCRYPTION_KEY` to a private 32-byte key encoded
   as 64 hexadecimal characters for national ID encryption. Keep this key and
   database backups secure. Example local database and storage credentials are
   intended for development only.
   Configure SMTP delivery using [EMAIL_OTP.md](EMAIL_OTP.md). Keep
   `AUTH_LOGIN_METHOD=email` and both `DEV_SKIP_*_OTP` flags false for normal
   email verification. Sender credentials belong only in the private server file.
4. Start the backend services from `server`:

   ```powershell
   docker compose up -d --build
   docker compose exec backend npm run db:seed
   ```

   On a fresh development database, set `SEED_ADMIN_EMAIL` to a real receiving address
   before seeding if an administrator is needed. The seed does not promote an
   existing user. Owners and staff are assigned through the administrator's
   management workspace.
5. Start the frontends in separate terminals from the project root:

   ```powershell
   npm run dev:customer
   npm run dev:management
   ```

   Open `http://localhost:8081` for customers and `http://localhost:8082` for
   administrators/parking owners. Native customer development uses `npm start`,
   `npm run android` or `npm run ios` from the root. To pass Expo arguments, use
   the customer workspace directly, for example
   `npm run start --workspace @parkflow/customer -- --clear`.

   Each frontend has its own router, query cache and login session. Management
   never reads the legacy customer session, even on the same browser origin.
   All parking/financial records and permissions remain in the common backend.

See the [frontend team ownership guide](docs/operations/frontend-team-guide.md)
for working independently and coordinating shared API/design changes.

## Team feature data and native modules

Existing databases require `prisma migrate deploy`, never a reset or a database
backup import. The optional public car-service catalogue can be imported from
`server` with `npx tsx prisma/importCarServices.ts ../ramallah_car_services.json`.
The tourism client retains the supplied source datasets. Run imports only when
you intend to add/update that catalogue; do not rerun the general seed to update
an existing deployment.

Sharing demo fixtures are disabled by default. An isolated development database
may explicitly select `SEED_SHARING_DEMO=true`; demo camera provisioning additionally
requires a private `SEED_GATE_DEVICE_KEY` of at least 32 characters. Never use
shared demo credentials in a deployment. Previously seeded public camera keys
need separate operator revocation.

The customer workspace discovers the Android module in `modules/crash-detection`
through its `expo.autolinking.nativeModulesDir` setting. Background crash detection
requires an Android development/production build and device permissions; Expo Go
and a JavaScript bundle export do not verify the native background service.
See [crash detection](docs/crash-detection.md).

## Registration and sign-in

Customer registration starts with a name and email, sends a six-digit code by
email, and opens profile details only after verification. Existing customers and
staff enter their email and the received code. Completed customer accounts land
on the map; management opens `/admin` or `/operator` according to the assigned
role. Ordinary accounts cannot enter staff workspaces.

Normal configuration uses `AUTH_LOGIN_METHOD=email`, `DEV_SKIP_EMAIL_OTP=false`
and `DEV_SKIP_PHONE_OTP=false`. Phone authentication endpoints are disabled in
email mode, even for direct requests. See [EMAIL_OTP.md](EMAIL_OTP.md) for delivery
settings, security limits, existing account ownership and administrator setup.

## Optional trusted-team development shortcut

The committed example configuration keeps authentication shortcuts disabled.
To use email while developing in a trusted environment, explicitly set these
values in the private `server/.env`:

```dotenv
NODE_ENV=development
AUTH_LOGIN_METHOD=email
DEV_SKIP_EMAIL_OTP=true
DEV_SKIP_PHONE_OTP=false
```

Then run `docker compose up -d --force-recreate backend worker` from `server`.
Choose sign-in on either frontend's welcome screen or open its `/email`, and
enter an existing account's email. Customer sign-in opens the map, including for
administrator accounts. The management portal opens `/admin` for an administrator
and `/operator` for a parking operator; ordinary accounts cannot enter its workspaces.
New customer users enter their name and email before completing their
profile. This mode grants access based on knowing an email address, so limit the
development instance to the trusted team. It does not mark new emails as verified.

Set both shortcut flags to `false` and recreate the backend and worker to restore
email verification. Development email sessions stop working after restoration;
pending development accounts must verify their email to sign in normally.

Legacy phone authentication is available only by explicitly selecting
`AUTH_LOGIN_METHOD=phone` and configuring its provider. See [PHONE_AUTH.md](PHONE_AUTH.md).

## Local ports

| Service | Host port | Container port |
| --- | --- | --- |
| Customer Expo web | 8081 | — |
| Management Expo web | 8082 | — |
| Backend API | 4000 | 4000 |
| PostgreSQL | 5434 | 5432 |
| Redis | 6381 | 6379 |
| Object storage API | 9002 | 9000 |
| Object storage console | 9003 | 9001 |

The worker does not expose a port. The backend, PostgreSQL, Redis and object storage
are bound to the host loopback address by default. The API is under `/api/v1`; `/ready` checks service
readiness. On the management origin, administrative pages include `/admin`, `/admin/manage`,
`/admin/vehicles` and `/admin/appearance`; the operator workspace is `/operator`.
Access is enforced by the backend, not only by hiding pages.

## Verification

Frontend checks, from the project root:

```powershell
npm run typecheck
npm test
npm run test:contracts
npm run export:customer
npm run export:management
```

The customer export checks web, Android and iOS JavaScript bundles; management
exports web. This is bundle verification, not a physical-device installation test.
Backend dependencies remain standalone. Backend checks, from `server`:

```powershell
npm ci
npm run typecheck
node scripts/migrate-test.cjs
npm test
```

Start PostgreSQL and Redis before running backend tests. `TEST_DATABASE_URL` must
point to a dedicated database whose name ends in `_test`. Create it once if
needed, for example with
`docker compose exec postgres createdb -U parkflow parkflow_test`.
The suite uses Redis database 15, disables SMS delivery, and disables development
authentication by default; authentication tests enable their modes explicitly.
Do not use the application database as the test database.

## Architecture

```text
apps/customer/app/      Customer-only Expo Router screens
apps/customer/src/      Map, parking/domain and navigation components
apps/management/app/    Administrator/operator screens and staff sign-in
apps/management/src/    Management components and responsive portal shell
packages/contracts/    Shared domain types and request/response definitions
packages/design/       Design tokens and shared brand assets
packages/client/       Shared UI, HTTP adapters, stores, localization and utilities
server/src/modules/     Authentication and parking business rules
server/src/jobs/        Background workers
server/prisma/          Schema, migrations and seed
server/tests/           Backend and integration checks
tests/                  Frontend regression checks
docs/operations/        Setup and operating guidance
docs/reviews/           Implementation and verification records
```

Screens use hooks and typed services. `packages/client/src/services/index.ts` selects the HTTP
implementations for application data; legacy prototype helpers remain in the
source. PostgreSQL owns account, parking and financial records. Redis supports
verification limits, jobs and coordination. Signed evidence URLs use object storage.

## Parking and payment rules

- A vehicle can have only one active session, while an account can park multiple
  vehicles. Session cost comes from server timestamps and the tariff captured
  when parking starts.
- Insufficient wallet funds do not erase a finished parking session. Its payment
  failure can be settled later. Top-up and payment requests use idempotency keys;
  an uncertain result retains its key for recovery.
- Unlinking a vehicle preserves its parking history. Adding a plate alone does
  not establish a verified association or expose protected violations, evidence
  or permits.
- Seeded zones use demo inventory and make no live availability guarantee. Live
  manual inventory requires positive capacity and a fresh operator snapshot.
  A live hold lasts up to 15 minutes; confirmed reservation records remain
  authoritative until cancellation or completion.
- Reservations and payment mutations require a connection. Road reports and
  parking feedback can queue offline with stable idempotency keys.

## Platform notes

Native maps use `react-native-maps`; the web implementation projects the same
coordinates onto a styled surface. Android Google Maps tiles require a configured
Maps SDK key and an appropriate development build. `apps/customer/app.config.js` reads
`GOOGLE_MAPS_API_KEY` from `apps/customer/.env` or the build environment. iOS uses Apple Maps.

Native authentication tokens use SecureStore. Web access/refresh tokens use
application-specific HttpOnly cookies and are absent from JSON and browser
storage. Browser requests bind Origin, application, expected login/session and
CSRF proof; reload restores identity from the server. Production requires
same-site HTTPS and disjoint `WEB_CUSTOMER_ORIGINS` / `WEB_MANAGEMENT_ORIGINS`.
Use one consistent local hostname across the applications and API. The
[web security audit](docs/security/2026-10-15-web-session-security-audit.md)
records lifecycle details, verification results and remaining deployment limits.
The [production hardening report](docs/operations/2026-10-16-production-hardening-verification.md)
documents the corrected dependency distributions, durable jobs, route safety and
current verification evidence.
Arabic layout direction is driven by React state, so language changes do not
require an application restart.

Private `.env` files, database backups, runtime artifacts, assistant sessions and
provider support diagnostics are excluded from Git. Copy the example environment
files and supply private values locally instead of committing credentials.

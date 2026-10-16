# Email OTP setup

Authentication now uses email -> request OTP -> verify OTP -> login/register. Access tokens, refresh rotation, token families, and logout retain their existing implementation. No demo login, fixed code, code display, or development email provider exists in the app/server. Automated tests intercept delivery only inside the test process.

## Gmail setup

1. Enable 2-Step Verification for `awwadh311@gmail.com` and create an App Password: https://support.google.com/accounts/answer/185833
2. Put the App Password only in `server/.env`, as `SMTP_PASSWORD`. Never use an `EXPO_PUBLIC_` variable for credentials. The local file is ignored by Git; the example file contains no password.
3. These non-secret settings are already in `server/.env.example` and the local `server/.env`:

```dotenv
EMAIL_PROVIDER=smtp
EMAIL_FROM=awwadh311@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=awwadh311@gmail.com
SMTP_PASSWORD=
```

Paste the App Password after `SMTP_PASSWORD=` without its display spaces. Never commit the populated file. For another SMTP service, change these settings. `EmailProvider` in `server/src/providers/email.ts` is the interface for future providers. SMTP uses TLS, bounded timeouts, and does not log message content. Transport reference: https://nodemailer.com/smtp

## Run locally (PowerShell)

From `D:\ParkFlow\server`:

```powershell
npm install
docker compose up -d postgres redis minio
npm run db:generate
npm run db:migrate
npm run dev
```

Stop existing ParkFlow backend/worker processes before `db:generate` if Windows reports the Prisma DLL is locked, then restart them. Do not overwrite an existing `.env` with the example; retain database URLs and token secrets. On a fresh checkout, copy the example to `.env` first and configure it.

From `D:\ParkFlow`, set `EXPO_PUBLIC_API_BASE_URL` in the root `.env` to `http://localhost:4000/api/v1` for web, or your computer's LAN IP for a physical phone. Then:

```powershell
npm install
npm start -- --clear
```

Enter a real recipient email, request a code, check the inbox/spam folder, and enter the six digits. A new account continues to profile setup; a returning account opens the map. Codes expire after five minutes, allow five failed attempts, and are consumed once. Resend is available after 60 seconds. Only OTP hashes are stored in Redis. Failed SMTP delivery returns an error and clears the challenge/cooldown; it never silently signs in or reveals the code. Gmail acceptance does not guarantee inbox placement.

API request: `POST /api/v1/auth/request-otp` with `{"email":"recipient@example.com"}`. Response: `challengeId`, `email`, `resendAfterSeconds`, `expiresAt`. Verify through `POST /api/v1/auth/verify-otp` with `{"challengeId":"<id>","code":"<received code>"}`. The token response has its existing shape.

## Existing accounts

The migration preserves users, phone numbers, balances, and sessions. Phone/country code become optional; normalized email becomes nullable and unique, with a separate verification timestamp. Duplicate normalized legacy emails intentionally prevent migration until ownership is resolved. No accounts are merged or deleted.

Previously stored profile emails were editable without verification, so they cannot safely become login identities automatically. Existing users need a support-assisted ownership check to bind a unique email to their existing user ID and set `emailVerifiedAt`. A matching unverified legacy email returns `EMAIL_MIGRATION_REQUIRED`. Accounts without an email also require this explicit linking step to preserve their old account. Profile editing cannot change login email. Verified email receives the same trust points previously granted to verified phone, without double counting.

For a deliberately provisioned local admin, use `SEED_ADMIN_EMAIL` in `server/.env` before `npm run db:seed`; OTP is still delivered through SMTP.

## Verification

Run `npm run typecheck` in both root and `server`. In `server`, set `TEST_DATABASE_URL` to a dedicated database ending in `_test`, then run `npm test`. The suite truncates only that test database and uses Redis database 15. Delivery is intercepted with a test spy so automated tests send no emails. Actual Gmail delivery must be tested after supplying the App Password; no credential was supplied during implementation.

## Changed files

- `.env.example`
- `EMAIL_OTP.md`
- `README.md`
- `app/(onboarding)/_layout.tsx`
- `app/(onboarding)/email.tsx`
- `app/(onboarding)/otp.tsx`
- `app/(onboarding)/phone.tsx`
- `app/(onboarding)/welcome.tsx`
- `app/(tabs)/profile.tsx`
- `app/profile/personal.tsx`
- `server/.env.example`
- `server/package-lock.json`
- `server/package.json`
- `server/prisma/migrations/20260924000000_email_otp/migration.sql`
- `server/prisma/schema.prisma`
- `server/prisma/seed.ts`
- `server/src/apiRegistry.ts`
- `server/src/config/env.ts`
- `server/src/modules/auth/routes.ts`
- `server/src/modules/auth/service.ts`
- `server/src/modules/trust/service.ts`
- `server/src/modules/users/service.ts`
- `server/src/providers/email.ts`
- `server/src/providers/sms.ts`
- `server/tests/core.test.ts`
- `server/vitest.config.ts`
- `src/components/ui/OtpInput.tsx`
- `src/i18n/ar.ts`
- `src/i18n/en.ts`
- `src/services/authService.ts`
- `src/services/mock/db.ts`
- `src/services/profileService.ts`
- `src/services/types.ts`
- `src/store/preferencesStore.ts`
- `src/types/road.ts`
- `src/types/user.ts`

Local ignored `.env` and `server/.env` were updated too, without adding a password. Removed files include the phone screen, SMS provider, and mock authentication service. The `apiRegistry.ts` change adds a missing type import needed for the backend typecheck.

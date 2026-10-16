# ParkFlow cloud rollout implementation plan

> For agentic workers: execute the checkboxes in order; delegate independent frontend and backend work, then review and verify together.

**Goal:** Publish the integrated customer app, separate management portal and shared API while retaining team code, cloud data and browser security.

**Architecture:** Keep the existing Vercel customer project and Render API. Add a separate Vercel management project. Because the project has no custom domain, route HTTP API and Socket.IO polling requests through each frontend's own origin to Render. Direct same-site custom-domain and native WebSocket deployments remain supported.

**Tech Stack:** Expo web, Vercel external HTTP rewrites, Express, Socket.IO, Render Docker, PostgreSQL/Prisma, Redis.

**Spec:** User cloud rollout request; existing security constraints in DEPLOYMENT.md and docs/superpowers/specs/2026-10-15-web-security-design.md.

## Global constraints

- Preserve the integrated history from 8226b04, including team commit 28f4383 and the new deployment-sync commit 276a836. Never force-push or overwrite main.
- Retain Secure, HttpOnly, host-only, SameSite=Strict cookies, per-application browser binding, CSRF, OTP limits and organization scopes.
- No cloud secrets in Git, frontend bundles, URLs or chat. Preserve the existing profile encryption key, signing keys, database IDs and storage objects.
- No reset, db push, general seed, local-account import, paid upgrade, domain purchase or actual payment.
- Existing cloud accounts and data are authoritative. A provider connection or logged-in account with project access is required before external mutation.
- A working health endpoint alone does not prove deployment, migrations, worker readiness or login.

## Review focus

- Missing, null or spoofed browser Origin must not downgrade a browser request to native authentication.
- The same-origin read fallback must require GET/HEAD, exact Referer origin and browser Fetch Metadata; unsafe requests retain actual Origin and CSRF requirements.
- Socket namespace authentication must retain browser/session/login/CSRF proof over polling and preserve native token authentication.
- API and socket rewrites must precede the SPA fallback and must not cache private responses.
- Proxy IP forwarding must be verified; do not increase TRUST_PROXY speculatively or bypass team repository review/access.

## Task 1: Browser origin handling through the HTTP proxy

Files: server/src/modules/auth/webSession.ts; server/src/utils/browserOrigin.ts; server/src/realtime/socket.ts; server/tests/web-proxy.integration.test.ts.

- [x] Add failing integration cases for same-origin GET bootstrap/read and real authenticated polling events.
- [x] Assert rejection of absent/invalid Referer, missing/wrong Fetch Metadata, untrusted/explicit null Origin, wrong application, native-token downgrade and incorrect CSRF.
- [x] Implement a shared strict read-origin resolver; reuse it when authenticating a socket namespace as an unsafe operation.
- [x] Run the ten affected backend integration tests serially.
- [ ] Verify generated Prisma server types and the full backend suite in Linux CI.

## Task 2: Vercel HTTP compatibility configuration

Files: vercel.json; packages/client/src/services/http/browserSession.ts; both sync hooks; .env.example and app env examples; DEPLOYMENT.md; frontend/deployment tests.

- [x] Add failing tests for browser-only opt-in polling and native/direct WebSocket defaults.
- [x] Configure /api/v1 and /socket.io external rewrites to the existing team Render API before the SPA fallback. Add private no-store and Referer policy headers.
- [x] Add EXPO_PUBLIC_WEB_SOCKET_POLLING=true as an explicit cloud compatibility flag; keep the default WebSocket transport and native behavior.
- [x] Document separate projects with own absolute API bases, exact disjoint origin lists, retained cloud secrets, backup-first migrations and rollback checks.
- [x] Run root tests, five workspace typechecks and both web exports serially; independently review the complete change.
- [x] Recheck proxy, transport and CI-store tests (26 passed) and scan source/private settings (zero matches).
- [ ] Confirm both frontend security and full backend workflows at the exact pushed release.

## Task 3: Provider access and actual rollout

Files/artifacts: provider configuration, private runtime rollout evidence, existing pull request description.

- [x] Confirm current source and repository access: PR4 open, head8226b04; available account cannot push/merge the team repository.
- [x] Confirm current public deployments: frontend older bundle; Render health200, current public auth config404.
- [x] Confirm no existing Vercel/Render login or local CLI credentials; request provider login/connection without asking for secrets.
- [ ] Connect to the account(s) owning the team projects and record exact project/service IDs and deployed revisions.
- [ ] Capture/validate a fresh cloud DB backup and migration/data baseline; verify existing signing/profile keys and provider mode privately.
- [ ] Rehearse pending migrations on an isolated restored copy, then deploy the API supervisor with retained environment and exact web origins.
- [ ] Deploy the customer project and separate management project from the same verified release; use each production origin as its own /api/v1 base and enable web polling only there.
- [ ] Verify actual deployed revision, /health, /ready, public auth config, worker logs, headers, proxy IP chain, deep links, browser sessions, role separation and retained data. Use controlled test identities; no real messages/payments without appropriate recipient/action authorization.
- [ ] Update the same PR with verified configuration changes and report actual URLs and any remaining blockers. Never label preparation as a completed deployment.

Provider access is still pending. Nothing in this plan constitutes an executed cloud deployment.

## Validation environment update

The local full backend run was interrupted by the Docker/WSL VM exiting with unexpected EOF; it produced no complete pass result. An earlier frontend attempt also hit host native-memory exhaustion. Ten focused backend proxy cases passed before that interruption. Complete release validation now also runs in .github/workflows/backend-release-validation.yml against newly created loopback-only PostgreSQL, Redis and S3 test stores. scripts/ci-backend-stores.cjs guards those stores and generates masked ephemeral test credentials; it never imports local production settings. This is validation, not a cloud deployment.

## New team update

Team main advanced to 276a836 during preparation. Preserve its automatic fast-forward sync to halaawwad/parkflow-web and merge it into the integration branch. This workflow is independent of validation and can trigger Vercel when an approved main merge occurs; configure hosting and deployment order before that merge. The currently visible Vercel account has no existing projects, so access to the team-owned hosting is still pending.

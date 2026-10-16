# Backend correction implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Correct the seven reproduced backend defects and publish a verified update to PR #4.

**Architecture:** Preserve module APIs and introduce transaction-local helpers where atomicity requires them. Use consistent advisory-lock ordering for financial and authentication transitions. Bind push devices to refresh families through an additive migration and validate delivery eligibility server-side.

**Tech Stack:** TypeScript, Fastify, Prisma/PostgreSQL, Redis, Vitest, Expo workspaces, Docker Compose.

**Spec:** docs/superpowers/specs/2026-10-16-backend-fixes.md

## Global constraints
The specification's constraints apply to every task. Implementers own disjoint source files; only root runs resource-heavy commands, deploys migrations, commits and publishes. Original checkout stays unchanged. Existing PR: https://github.com/yazeedbesher12/ParkFlow/pull/4.

## Review focus
- Concurrent admin refund and booking settlement must not duplicate money or pay a refunded booking.
- Failed gate billing must preserve retryability and not leave an active paid session behind a closed visit.
- Session start/extension racing patrol must use the same lock discipline as patrol decisions.
- Refresh rotation must retain eligible push registration without surviving logout or crossing accounts.
- Single-device logout must preserve another device; browser slots and admin absolute lifetime remain enforced.

### Task 1: Booking escrow and expired acceptance (fix_booking_escrow)
**Files:** admin/service.ts, hostSpots/service.ts, focused shared helper if necessary; server/tests/booking-escrow-regressions.test.ts.
**Interfaces:** Keep existing refund/respond/cancel/completion APIs. Any new escrow helper consumes Prisma Tx and locks booking and ledger state in one transaction.
- [x] Promote the first two cases from the audited money fixture before changing source; their RED result is recorded in .runtime/backend-audit-20261016-regressions.log.
- [x] Coordinate admin and automatic refunds with settlement state; expire unanswered elapsed bookings before acceptance, committing refunds on rejection.
- [x] Add regressions for refunded completion and relevant concurrency/duplicate operations without mocking ledger writes.
- [x] Root runs the focused tracked tests and existing host booking/admin money tests; review resulting balance and state assertions.

### Task 2: Gate billing and patrol serialization (fix_gate_atomicity)
**Files:** gates/service.ts, sessions/service.ts; server/tests/gate-regressions.test.ts.
**Interfaces:** Extract stopInTransaction(tx,...) if needed, retaining the public sessions.stop API. Share existing zone/vehicle/session lock keys consistently with starts and patrol.
- [x] Promote the last three audited money cases before source edits; existing RED evidence covers failed settlement, stale patrol and future camera timestamps.
- [x] Make visit exit and session settlement one atomic transition; recheck patrol paid coverage under serialization; use authoritative/scoped time for overstay assessment.
- [x] Add successful exit/retry and paid-coverage boundary regressions.
- [x] Root runs focused gate/session/patrol tests and verifies no prior dedup, debt or camera behavior is removed.

### Task 3: Logout and device push lifecycle (fix_auth_push_lifecycle)
**Files:** auth service, browser session adapter if needed, device registration routes/service, push provider, Prisma schema and additive migration, minimal client lifecycle changes if required; auth-logout-race and push-session-lifecycle tests.
**Interfaces:** Native registration receives authenticated session id and stores its refresh family; delivery requires an eligible active family for that user/device. Family binding survives token rotation. Unbound legacy registrations remain dormant until authenticated registration.
- [x] Promote the audited logout race and post-logout private push fixtures before source edits; both already fail at current HEAD.
- [x] Serialize issue/refresh/logout with consistent user/family locks, preserving browser/session policies; add additive device family binding and logout-safe delivery checks.
- [x] Cover independent devices, account reassignment, refresh, expiry/suspension, already queued notifications and all-session versus one-family logout.
- [x] Root applies migrations only to test database first and runs focused auth, browser and push tests with external delivery mocked.

### Task 4: Integrated verification and publication (root)
- [x] Independently review diffs and address findings; retain the existing protected-operation access matrix in tracked tests when useful.
- [x] Run full server tests, TypeScript/contracts, dependency audit, migration replay/drift and appropriate client checks serially. Do not send real provider traffic.
- [x] Save a fresh validated live database backup before any schema migration, rebuild backend/worker, deploy additive migration and run runtime smoke checks; rebuild affected frontends if required.
- [ ] Commit with both merge ancestors preserved; non-force push integrationfork/codex/integrate-team-updates and PATCH existing PR #4 with results and limits.
- [ ] Verify remote commit and application health after push; report concise Arabic outcome and PR link.

Final implementation/verification evidence: docs/operations/2026-10-16-backend-corrections-verification.md. Publication gates are completed and recorded in PR #4 when the branch is pushed.

# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Address documented production security and resilience gaps without losing combined team features, and update PR #4 with verified evidence.

**Architecture:** Three independently owned implementation areas use regression-first changes: reproducible patched frontend dependencies, safe route traffic enrichment, and isolated durable worker queues. Root owns production configuration, serial verification, live preservation and publication.

**Tech Stack:** npm11 workspaces, Expo57/React Native, TypeScript, Fastify, Prisma/PostgreSQL, BullMQ/Redis, Docker.

**Spec:** docs/superpowers/specs/2026-10-16-production-hardening.md

## Global Constraints
- Preserve combined history and all customer/staff features; existing PR #4 and integration branch only.
- No live reset, seed, real messages, paid actions, secret output, audit suppression or force push.
- Correct source must be distributed reproducibly with upstream provenance; npm audit alone cannot certify forks.
- Heavy commands run serially; preserve local service volumes and account roles.

## Review Focus
- Nested fork instances or ignore-scripts installation must not retain uncorrected executable copies.
- Cached Google geometry after checkpoint changes and same-road backtracking must not replace the approved path.
- Provider timeouts or more than100 pending/500 healthy wallets must not starve unrelated work.
- Configuration changes during queued topups must not create duplicate charges or charge disabled wallets.
- Push redrive must preserve refresh eligibility while excluding newer login families.

### Task1: Reproducible dependency fixes
**Files:** security/vendor/**, package.json, package-lock.json, scripts/apply-frontend-security-patches.cjs, security/dependency-patches/**, frontend security regression tests.
**Interfaces:** Existing dependency verifier entry points remain compatible and become validation-only. Local tarball overrides preserve original require slots.
- [x] Verify official upstream archive SHA512 and prototype npm11 tarball overrides in ignored scratch.
- [ ] Add failing source/archive/installed/nested-instance integrity regressions, run RED.
- [ ] Package only corrected sources with honest scoped metadata, licenses and full provenance; retain executable vulnerability and normal behavior tests.
- [ ] Install root graph serially; verify clean ignore-scripts installation, all instance hashes, raw audits and compatible caller APIs.
- [ ] Run frontend tests/types and all four platform exports; review source changes and dependency licenses.

### Task2: Safe traffic enrichment
**Files:** server/src/modules/routing/{service.ts,traffic.ts,trafficGeometry.ts}, server/tests/routing-traffic.test.ts, server/vitest.routing-traffic.config.mjs.
**Interfaces:** routingService.getRoute retains public result fields; Google full geometry stays internal, emitted colored coordinates are approved OSRM sublines.
- [ ] Run eight real-logic mocked-transport regression cases and record RED.
- [ ] Validate geometry, forward progress and fresh closure exposures, project contiguous traffic intervals onto the chosen route.
- [ ] Run targeted GREEN plus full server/types, covering fastest, caches, backtracking and incomplete coverage.

### Task3: Fair durable independent jobs
**Files:** server/src/jobs/{worker.ts,queues.ts,tasks.ts,runtime.ts}, server/src/modules/wallet/service.ts, server/src/providers/push.ts, server/tests/worker-resilience.integration.test.ts, server/tests/fixtures/worker-process.ts, server/tests/push-session-lifecycle.test.ts.
**Interfaces:** createWorkers(publish) retains socket entry lifecycle; tasks export bounded dispatch, maintenance, outbox and reconciliation. Shared wallet helpers preserve idempotency-before-wallet lock ordering and public topup contract.
- [ ] Run six isolated child-worker/SQL/Redis tests and recipient-age cases RED.
- [ ] Split queue consumers, add cyclic cursors/stable provider jobs, reserve one eligible auto payment under wallet lock then execute provider outside SQL locks.
- [ ] Add delayed exhausted push recovery with original event IDs, seven-day retention and original-family age eligibility.
- [ ] Run targeted and full integration tests, confirm shutdown/schedulers and no live provider traffic.

### Task4: Production environment and local storage
**Files:** server/src/config/env.ts, server/src/providers/email.ts if required, server/tests/web-production-config.test.ts or dedicated config tests; ignored local env/backups only for credentials.
**Interfaces:** env parse remains compatible for valid development; invalid known-default production credentials and insecure transports fail startup.
- [ ] Add subprocess RED tests for current production holes, preserve valid HTTPS and development controls.
- [ ] Implement precise production guards and update safe test fixtures without weakening checks.
- [ ] Back up/fingerprint live state, rotate local S3 example credentials consistently, restart affected services and verify objects unchanged.

### Task5: Verify, review and publish
**Files:** docs/operations/2026-10-16-production-hardening-verification.md, relevant operational docs, ignored PR payload/receipt.
- [ ] Independently review each implementation and resolve substantiated findings.
- [ ] Run full server/contracts/frontend tests and typechecks, audits, provenance checks, four exports and secret scans serially.
- [ ] Build/restart backend and worker, verify database migrations, Docker images, unchanged protected data and20 read-only runtime checks.
- [ ] Update public verification report with exact evidence and external limits, commit, non-force push existing integration branch and update PR #4.
- [ ] Verify remote PR head and post-push runtime, leave original checkout unchanged.

Local implementation and verification are complete at this source snapshot. Publication receipts and hosted CI results are recorded on PR #4 after pushing this commit.

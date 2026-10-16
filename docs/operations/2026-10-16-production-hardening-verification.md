# Production hardening and verification — 2026-10-16

## Scope and preservation

This change continues existing PR #4 on codex/integrate-team-updates, based on 844c7f4. The full integration merge 34cc492 and both original histories 6c4c75e (our work) and b0be9e9 (team) remain ancestors. The latest origin/main was fetched and still points to b0be9e90e43e528106ec611755299f66ec2363b8. Customer and management applications remain separate workspaces sharing one API/database. No feature rollback, SDK major migration, database reset, live seed, real provider message, paid transaction or public deployment was performed for verification.

## Corrected behavior

### Frontend dependencies and integrity

The complete upstream frontend audit previously reported 22 findings (19 high, 3 moderate), propagated from three root packages. Compatible published fixes still do not exist for braces/Forge, while the official decoder fix changes its CommonJS contract. Three genuine private source distributions now contain the reviewed corrections, licenses and complete provenance in immutable local tarballs. The lockfile changes only these three package entries; all other locked versions remain unchanged.

Installation with scripts disabled already installs corrected executable sources. Normal postinstall/start/Metro/test/export commands verify source, archive, package identity, lock integrity and installed bytes; they do not mutate node_modules. The verifier also discovers physical protected package slots independently of the lockfile, including workspace/deep importer paths, and rejects unlisted, shadowing or unsafe linked slots. Regression tests demonstrate actual parent-module resolution of an unchecked nested package before this additional guard.

Forge's full CommonJS lib API remains. Obsolete prebuilt browser bundles/maps containing duplicate uncorrected RSA code and the Flash SWF are intentionally excluded; current application/Expo consumers do not import them. Explicit scoped names and honest ParkFlow prerelease versions distinguish these forks from upstream releases. No advisory allowlist, severity exemption or development-dependency omission is used.

**Audit limitation:** npm does not analyze custom fork source. A zero package-based audit after replacing the original distributions is not proof that the forks or all application code are defect-free. Exact known-vulnerability regressions, normal API/Expo certificate controls, provenance review, immutable hashes and continued upstream monitoring are required. See [distribution policy](../../security/vendor/README.md) and [source correction report](../security/2026-10-16-frontend-security-distributions.md).

A focused GitHub Actions workflow is configured with pinned official action commits, a scripts-disabled clean install, immutable verification, the complete frontend suite, workspace types and an unfiltered audit. Hosted execution is verified separately after publication. An npm11 old-lock migration issue was reproduced in a small three-parent fixture: relative tarball overrides resolved from installed parent directories. Only three genuine npm-generated fork lock entries were transplanted from a successful fresh graph, retaining portable root-relative artifact paths. Root clean npm ci then succeeded.

### Route safety and availability (S1)

Google's full line is internal and must match the selected OSRM line using endpoints, bidirectional 25 m samples within 50 m, forward progress and current checkpoint exposure. Cached traffic and fastest-mode enrichment recheck current checkpoint states. Emitted colors are projected onto exact approved OSRM sublines, preserving route distance, ETA, alternatives and closure ranking. Incomplete/malformed intervals fall back to the approved base line. Optional checkpoint failure in fastest mode omits traffic while preserving routing; checkpoint-aware behavior remains explicit.

Provider parsing rejects invalid shapes, missing interval ends, nonfinite durations and oversized inputs (2,000 Google points/512 intervals). A linear preflight declines enrichment exceeding 2,000,000 segment checks before pairwise work. The dense-route negative control previously performed 4,500,000 distance calculations; it now declines in the linear preflight budget.

The existing Google API-key switch remains off locally. Enabled colored enrichment requests TRAFFIC_ON_POLYLINE, which Google requires and bills at its traffic-aware polyline tier. No live Google request was used in tests. [Official Google documentation](https://developers.google.com/maps/documentation/routes/traffic_on_polylines).

### Independent, fair and durable jobs (S2–S4)

Outbox, core maintenance, dispatch, financial-provider jobs and push consumers have independent queues. Provider I/O cannot block local outbox/maintenance consumers. Financial work uses stable per-item job IDs and 100-item cyclic keyset pages with Redis cursors; eligible wallets are filtered before pagination. The tests exercise a low-balance wallet behind 500 healthy wallets and recovery beyond the first 100 pending payments. Webhook job IDs hash external identifiers, so accepted colon-containing IDs cannot poison a dispatch page.

Automatic topups reserve at most one pending authorization under existing idempotency/wallet locks. A durable internal dispatch proof distinguishes reserved, started and cancelled attempts. Before first submission, auth:user → payment → wallet locks serialize eligibility with account/payment changes; provider I/O runs afterward. A disabled/suspended account, replaced method or changed wallet configuration cancels an unsubmitted reservation without a charge, ledger credit or false decline notification. Started/ambiguous and legacy authorizations retain the exact existing payment/key for provider recovery. Cancellation advances only an unchanged wallet epoch, allowing reactivation to reserve one fresh payment while old proof remains terminal.

Push reconciliation retains original outbox job IDs, repairs missing/completed/failed deliveries, delays exhausted retries until at least 5 minutes after failure, and retains newly produced failures by age rather than a 1,000-count cap. Direct delivery also enforces the 7-day push cutoff before OAuth and after lifecycle waits; in-app notification content remains. New login families cannot receive earlier private queued notifications; refreshing an existing family remains eligible.

Upgrade note: pre-existing BullMQ jobs retain their original options until replaced/redriven. Drain or inspect old count-retained push jobs when applying this change to another already active deployment. The local stack was checked after rollout: push waiting/active/delayed/failed counts are all 0, with 0 pending payments, 0 eligible automatic wallets and 0 pending private notifications. This is not a claim of exactly-once external push delivery or a load/failure certification.

### Production settings and local storage

Production startup rejects HTTP/credential-bearing payment, storage and OSRM service URLs, non-exact or insecure extra CORS origins, known local database/storage credentials, empty/short storage secrets and shared session/payment signing keys. Customer/management origins remain exact, disjoint and HTTPS. Development HTTP/local infrastructure remains supported. SMTP STARTTLS remains allowed because the transport already requires TLS; normal email OTP is preserved and both development login bypasses remain off.

Private local storage settings and inventory were backed up outside Git. The public-example pair was replaced consistently for storage/API/worker; the new pair authenticates, the old pair returns 403, and the bucket/object inventory fingerprint is unchanged. No credential value is included in this report or committed source.

## Verification evidence

Measured local results after coordinated verification and deployment:

| Check | Result |
| --- | --- |
| Root clean npm ci with scripts disabled | PASS: 663 installed, 669 audited; raw audit 0 |
| Complete unfiltered current npm audits | PASS: frontend 0, server 0; custom-fork limitation above |
| Fork archive/source independent review | PASS: all files/SRI/SHA256/provenance, no hidden RSA bundle |
| Reproducible archive repack | PASS: all 3 archives reproduce identical SHA-256 and SHA-512 |
| Complete frontend tests/workspace types/contracts | PASS: 208 tests, 5 workspace typechecks, 22 contract tests |
| Backend types including tracked tests | PASS |
| Full isolated backend suite | PASS: 45 files / 559 tests, 504.37 s |
| Four Expo exports | PASS: customer web / Android / iOS and management web |
| Docker backend/worker build and live images | PASS: both builds; live container IDs match built images; API healthy, worker running with readiness logged and no error events |
| Database and storage preservation | PASS: protected data unchanged, main/test 25 migration checksums match, storage inventory unchanged and old credentials rejected |
| Source/export private-setting scans | PASS: 778 source/artifact files and 165 export files; no exact private-setting matches; no remaining configured example secret |
| Read-only local runtime | PASS: 20/20 checks at 2026-10-16T02:53:11Z; email OTP with both development bypasses off |
| Remote publication and hosted CI | Recorded after publication in the existing PR #4 body/checks |

Regression-first evidence includes routing 8 RED → 10 GREEN, review 14 RED → 25 GREEN; production configuration 12 RED → 14 GREEN plus 2 OSRM negatives → 16 GREEN; initial worker failures plus deterministic wallet starvation RED → 6 GREEN; worker review 5 RED / 2 compatibility GREEN → 13 GREEN; direct expired FCM RED; suspension/reactivation epoch RED. The 559-test complete run was followed by a final compatibility correction allowing an empty optional extra CORS list while retaining the exact application origins. All 17 production-configuration cases, 2 HTTP CORS controls and the complete backend typecheck passed afterward; the final source was then built and live-checked. The corrected suspension/reactivation case passed inside the complete suite. Independent reviews covered dependency integrity, route/settings boundaries and worker financial/privacy behavior; substantiated findings were fixed rather than waived.

Before deployment a validated PostgreSQL custom-format backup and account/role/contact-verification plus wallet/vehicle fingerprints were recorded. Baseline protected counts: 10 users, 4 vehicle links, 25 zones, 9 parking organizations, 75 refresh records, 0 parking sessions/wallet transactions/bookings. Storage baseline: 1 bucket, 0 objects. No schema migration is added by this change; the existing 25 migrations remain required.

## External production prerequisites

This is verified local application hardening, not certification of an externally deployed production service. Before external launch, rotate the SMTP app password previously shared during setup using the account owner's private channel; do not reuse shared credentials. Configure production HTTPS origins, private database/storage credentials, real payment/provider credentials and provider idempotency guarantees, backups/monitoring and deployment access. Current local payments remain development mode; Google traffic and Firebase remain disabled unless explicitly configured. Real SMS/FCM/payment delivery, physical native crash behavior, an installed mobile release and sustained load/outage behavior are not certified by mocked-provider tests or Expo exports.

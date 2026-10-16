# Backend correction verification — 16 October 2026

This correction continues the full-history integration in [PR #4](https://github.com/yazeedbesher12/ParkFlow/pull/4). The merged work from our 6c4c75e and team b0be9e9 remains in the branch. The original checkout is not changed by this correction.

## Corrected invariants

| Audit | Behavior |
| --- | --- |
| B1 | Admin and automatic spot/legacy ride refunds share escrow references and lifecycle locks. A refund cannot also pay the host/driver. Ordinary refunds remain available; already-settled escrow requires an explicit reversal workflow and returns 409. Historical payouts are not rewritten. |
| B2 | Pending spot requests expire at their existing start-time deadline, including direct host responses. Decline and refund commit together. Timely acceptance and normal host payouts remain supported. |
| B3 | Physical gate exit, metered-session settlement and relevant overstay assessment commit in one transaction. Settlement failure rolls back departure for retry; insufficient funds creates one terminal failed session and debt. |
| B4 | Patrol repeats paid, prepaid, permit, grace and gate-presence checks under common locks. Explicit ReadCommitted views observe coverage committed during a lock wait; default transaction isolation and QR entry stay Serializable. Permit mutations share the vehicle lock. |
| B5 | Camera exit assesses only its own open visit, capped at server time for financial decisions. Tolerated event history and delayed historical billing remain supported. Invalid exit cannot trigger unrelated fines. |
| B6 | Session issue, refresh, logout, suspension and operator-role revocation share ordered user/family locks. Single logout revokes the rotating family; logout-all revokes all current families. Independent devices and browser application slots remain separate. |
| B7 | Push registration binds to a proven session family, remains valid through refresh and is rechecked at dispatch. Logout, expiry, suspended accounts and token reassignment suppress stale private delivery. Expo and FCM payload requests are cancellable and bounded before lifecycle transaction locks expire. OAuth preparation contains no notification payload and is followed by a fresh eligibility check. |

## Compatibility and deployment

The HTTP device-registration body is unchanged and the existing native hook registers on session changes. Cookie/CSRF-authenticated browser registrations also remain supported. No frontend source or client contract is changed in this correction.

Additive schema changes preserve existing users, wallets, vehicles, bookings and sessions. Existing device registrations have no family proof and remain dormant until authenticated registration. Session mode metadata must be verified before push eligibility; legacy access and refresh login remain valid, and refresh creates a verified successor. This avoids trusting default metadata on pre-migration development sessions.

Database verification is restricted to dedicated databases ending in _test and Redis database 15. The live database is backed up before additive migration; no live reset, general seed, team dump restore or historical financial rewrite is used.

## Verification record

| Check | Result |
| --- | --- |
| Full server suite, final source | 42 files, 501 tests passed; exit 0; 440.03 seconds |
| Frontend suite, unchanged frontend source | 193 tests passed; exit 0 |
| Five frontend/shared TypeScript workspaces | Passed |
| Backend TypeScript including tracked tests | Passed with freshly generated Prisma client |
| Client contracts | 22 tests passed |
| Focused financial and gate regressions | 16 escrow and 12 gate tests passed |
| Focused auth and push regressions | 2 refresh/logout races, 20 session/push tests and 7 FCM tests passed |
| API access boundary matrix | Every one of 162 protected operations rejected anonymous and invalid bearer access; 15 public/custom-auth operations explicitly reviewed |
| Fresh migration replay and schema comparison | All 25 migrations applied on a new dedicated test database; no schema difference |
| Live additive migrations | 25 migrations up to date; no schema difference |
| Backend and worker Docker builds | Both passed; running containers match the new image IDs |
| Runtime HTTP/CORS/socket/feature checks | 20 passed at 2026-10-16T02:01:48Z |
| Protected live data comparison | Account identity/role/contact-verification digest, wallet/vehicle digest and core counts unchanged, including 10 users, 75 refresh records and team sharing records |
| Database backup | Fresh custom-format backup validated with pg_restore --list before live migration; 194927 bytes |
| Frontend export compatibility | No frontend source or package changes; existing customer web, management web, Android and iOS exports retained |

Earlier audit evidence established seven failures against 34cc492; this correction adds 60 permanent regression/access tests. Fresh review also caught QR-entry unlink write skew, unverified legacy mode defaults and FCM opt-out initialization; those cases were reproduced and corrected. An isolated source mutation demonstrated that weakening QR entry isolation makes the unlink regression fail, while the final Serializable path passes.

Two additive migrations are included: 20261016000000_device_session_family and 20261016001000_session_metadata_version. Existing history is not rewritten. No original account is deleted, no new role is provisioned and no live session is deliberately revoked by deployment. Legacy push proof recovers through the normal signed refresh path.

Final Git ancestry, private-setting scans and remote-head equality are publication gates recorded in PR #4. Application readiness is checked again after push; the local publication receipt retains the resulting timestamps and image IDs without credentials.

## Operational limits

The current environment is for development: email OTP is enabled, both development-login bypasses are disabled, SMS is disabled and payments use the development provider. This correction does not add payment credentials or promote accounts.

The source/private-setting scan checked 687 files and the retained exports checked 165 files with no configured private-secret matches. The local object store still uses an example development credential, bound to loopback; replace it before any external deployment.

The dependency audit reports zero known server vulnerabilities. The frontend audit still reports 22 metadata findings (19 high, 3 moderate); existing reviewed dependency source patches and mandatory verification guards remain. The raw frontend audit is not clean.

Provider behavior in automated tests is mocked at the external boundary. No real OTP, push notification, payment or emergency call is sent. A provider message accepted before logout cannot be recalled; the fix prevents new dispatch or retry after the lifecycle transition completes. Real FCM credentials, delivery on a physical phone, native crash detection and production load/failure tests remain unverified. Existing web and Hermes exports are from the unchanged frontend source.

Four source-review observations from the earlier audit remain outside the seven reproduced corrections: Google traffic enrichment can replace a closure-avoiding route when enabled; sequential provider work can delay shared maintenance/outbox processing; automatic top-up scans can starve wallets beyond the first 500; and push jobs exhausted after the configured retries have no automatic redrive. Google traffic is disabled in the current configuration. These limits mean this PR is not a claim of complete production certification.

GitHub publication updates the review branch; it does not deploy or host the application. Main is not merged automatically. Local ports remain customer 8081, management 8082, API 4000, PostgreSQL 5434, Redis 6381, object storage 9002 and its console 9003, bound to loopback.

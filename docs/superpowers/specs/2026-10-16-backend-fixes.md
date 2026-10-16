# Backend correction specification — 2026-10-16

The user approved correcting seven reproduced backend defects, preserving our changes and the team's merged features, rerunning verification, starting the application and updating PR #4 for Yazeed.

## Required invariants
1. A host booking debit can be refunded only once across admin refund, cancellation, expiry and completion. A fully refunded booking cannot subsequently pay the host. Existing general refunds and future booking flows remain available.
2. An unanswered pending booking whose end has passed cannot be accepted or paid; expiry and refund must commit even when an acceptance is rejected.
3. Closing a physical gate visit and its paid parking session must be atomic, or safely retryable without unbilled active sessions after a failed settlement.
4. Patrol must assess current paid coverage inside the same serialized transaction that creates a violation.
5. A future camera timestamp or invalid exit cannot trigger premature fines for unrelated lots. Camera timestamps retain their supported tolerance and historical processing.
6. Logout must serialize with refresh: logout-all leaves no active successor from an in-flight refresh, and single logout revokes its family while preserving independent sessions.
7. Private push delivery must be associated with the current device login family. Logout, account switching, suspension or session expiry must prevent delivery to the former login, while refresh and other active devices keep working.

## Constraints
- Preserve both ancestors of merge 34cc492 and all existing features; do not merge main or force push.
- Isolate tests to parkflow_test and Redis database 15; never reset or seed the live database.
- No real email, SMS, push, payment or emergency calls during verification.
- Back up the current database before additive live schema migrations; preserve volumes and user activity.
- Root runs all heavy tests, builds and exports serially due to host memory limits.
- Preserve email OTP, disabled development bypasses, browser cookie bindings, admin absolute session lifetime and existing role assignments.
- Production provider/device certification and the four source-only audit observations remain explicitly outside this correction's completion claim.

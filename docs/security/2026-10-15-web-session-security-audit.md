# Web session and frontend dependency security audit — 2026-10-15

The frontend dependency distribution status below is historical. See the
[2026-10-16 distribution correction](2026-10-16-frontend-security-distributions.md)
for the immutable private forks, source verification and audit interpretation.

The authorized work fixes the three identified frontend dependency code paths and
strengthens web session credentials while retaining email OTP, customer/admin/
operator features, native authentication, account isolation and location privacy.
Baseline: `86a3b66` on `codex/separate-apps-2026-10-14`.

## Browser authentication

Access and refresh JWTs are delivered only through application/family-specific
HttpOnly cookies. Web login and refresh JSON contains session metadata and an
in-memory CSRF proof, with no bearer/refresh JWT. Browser storage retains only
non-credential login identifiers and pending logout fences. Existing browser JWT
storage is removed. Native clients retain bearer DTOs and SecureStore.

Cookies use `SameSite=Strict`, `Path=/`, no Domain attribute, and in production
`Secure` plus the `__Host-parkflow-` prefix. Customer and management have distinct
cookie/browser namespaces; ports alone do not isolate cookies. Production web
origin settings must be exact, disjoint HTTPS origins. Both applications and the
API must share a site for Strict cookies to work. Local HTTP uses non-Secure
cookies for development only.
The supported deployment uses separate application/API origins on that site,
for example `app.example.com`, `staff.example.com` and `api.example.com`.
Browser transport requires the browser's Origin header; a proxy must preserve
Origin, Cookie and the ParkFlow headers. Same-origin GET proxying without Origin
is not supported by this transport.

Every browser private request checks the trusted Origin/application mapping,
expected session and login IDs, cryptographic JWT binding to the application and
browser identifier, current database identity/status/revocation, and the current
server selection. Unsafe requests additionally require the bound CSRF header.
Multipart uploads receive the same checks. Web JWTs cannot be reused through
native bearer or body-refresh routes. A browser cannot obtain native JSON tokens
by omitting the application header.

Redis stores an authoritative selection containing identifiers and expiry
metadata, with no JWT. Mutations of that selection require a lease and atomic
ownership/old-value comparison. Family-specific cookie names prevent an older
Set-Cookie response or conditional logout from replacing or clearing a newer
login. Stale concurrent refresh is rejected without revoking the winning family.
Missing/expired access is recoverable only from an actual valid refresh cookie.
A browser identifier by itself cannot restore an authenticated profile.

The browser identifier cookie has the configured `REFRESH_TOKEN_TTL` max-age,
currently 30 days from initialization, and is not renewed by token rotation.
An ordinary browser must sign in again after that identifier expires. This is a
cookie retention limit, not a server-enforced 30-day absolute family deadline.
Access JWT lifetime remains 15 minutes; refresh JWT expiry rolls for 30 days.
The administrator's existing eight-hour absolute deadline remains enforced by
the server, including after refresh and during bootstrap.

## Lifecycle, realtime and compatibility

Application-specific Web Locks serialize browser session operations, with a local
queue fallback and server-side coordination across origins. Refresh/rotation
recovery accepts only the initiating user/login, uses the server's current role
and profile, and does not replay an old action for another login. Conditional
logout revokes only its proven family. Canceled verification responses are cleaned
before their operation finishes.

Reload uses server proof and matching remembered identifiers. Matching verified
reloads preserve saved-car data; logout/account changes still clear GPS, car
location, offline identity/cache state and reminders. An offline start does not
restore a persisted authenticated profile. Offline logout records a fence and
completes revocation on the next online bootstrap. If browser storage and network
both fail, durable logout across a browser restart cannot be guaranteed until the
server can be contacted or site data is cleared.

WebSocket upgrade Origins are checked explicitly, independently of polling CORS.
Browser namespace authentication and periodic revalidation use the same cookie,
identity and CSRF checks. Both customer and management reconnect after same-login
rotation, including `io server disconnect` while access has not expired; a
different login is never adopted. Native socket bearer authentication remains.
When another tab already produced a newer access session with more than 30
seconds remaining, recovery adopts that proven session instead of rotating
again. Two-tab regressions verify that this does not create alternating token
rotation/disconnect loops. Expired/near-expiry access still rotates normally.
Cookies, Authorization, Set-Cookie, request bodies and CSRF metadata are redacted
using valid Pino paths. HttpOnly reduces credential extraction by scripts; it
does not prevent active XSS from issuing authenticated actions.

## Frontend dependencies

Three reviewed source backports preserve the existing Expo SDK and CommonJS
interfaces: braces nesting/cycle guards, Forge canonical DigestInfo validation,
and linear malformed URL decoding. Automatic postinstall checks every locked
instance, version and reviewed pre/post SHA-256 source. Missing patches and drift
stop tests/typechecking/build startup, including direct Metro/workspace entry.
Positive controls retain Router URL parsing, ordinary globs, certificates, CSR,
RSA signatures, RSA-PSS and native/web application behavior.

Fresh raw npm audit still reports **22 frontend findings (19 high, 3 moderate)**
from these three published roots and their parents. Published versions remain
unchanged, so npm audit cannot recognize local source corrections. No advisory
suppression was added. The fourteen executable dependency regressions pass.
The fresh server audit reports **zero findings**. Maintainers must replace these
temporary backports with compatible upstream releases when available, review
version/hash changes and rerun the checks.

Provenance, licenses, exact hashes and maintenance instructions:
[dependency backports](2026-10-15-frontend-dependency-backports.md),
[patch manifest guide](../../security/dependency-patches/README.md).

## Local settings and evidence

The private settings remain email login, both OTP bypass flags false, SMS
disabled, Gmail sender `vbngvbn14@gmail.com`, SMTP 465 with TLS. Email codes remain
six digits/five minutes, resend cooldown 60 seconds, five sends/hour and ten/day,
five wrong attempts causing a 15-minute lock. Signing/webhook keys remain private,
independent random keys from the preceding authorized rotation. No real-account
role change, real email/SMS test, provider credential change or public push was
performed by this work.

The dedicated test database ends in `_test`; tests use Redis database 15 and
isolated signing/provider fixtures. Test delivery never uses the live SMTP/SMS
credentials. Runtime ports remain customer 8081, management 8082, API 4000,
PostgreSQL 5434, Redis 6381, object storage 9002 and its console 9003; infrastructure
bindings remain loopback.

Completed evidence:

- Full frontend suite: **175/175 passed**, including established-socket disconnect,
  two independent tab bundles and near-expiry controls. Five frontend workspaces
  and the final server source/tests pass TypeScript.
- Full server suite: **384/384 passed across 33 files**. Client contracts:
  **22/22 passed** across the three dedicated configurations.
- Cookie server suite: **16/16 passed**, including signed binding forgeries,
  duplicate cookies, native-mode rejection, missing credential proof, simultaneous
  refresh, lost publication lease, late cookie effects and admin expiry.
- Actual WebSocket upgrade and namespace authentication: **3/3 passed**, covering
  untrusted Origin rejection, correct web cookie proof, invalid CSRF, browser
  native-token rejection and retained native access.
- Production config/cookie checks: **3/3 passed**, including Secure/HttpOnly/
  Strict/host-only prefix and rejected insecure/overlapping application Origins.
- Independent source review found no scoped blockers after corrections.
- Configured-secret scan of proposed tracked files found no private secret values;
  `server/.env` is ignored. The existing local object-store example credential
  remains for local development and must be replaced for deployment.
- All **160 generated export files** were also scanned against the configured
  private signing, encryption, SMTP, SMS and storage values: no matches found.

- Final customer web, management web, customer Android and customer iOS exports:
  **all passed** on the final source, serialized with one Metro worker. The first
  Android attempt could not write Hermes output in the sandbox temporary folder;
  using an ignored workspace temporary folder resolved the permission issue.
  Existing Leaflet CSS asset and Hermes global-variable warnings remain; exports
  exit successfully. These are bundle checks, not physical-device execution.
- Backend and worker Docker builds passed and both were recreated successfully.
  Backend, PostgreSQL, Redis and object storage are healthy; worker is running.
- Live local checks: both frontend index pages and `/ready` return **200**;
  bootstrap returns anonymous metadata and HttpOnly/Strict/host-only cookies;
  an identifier alone is denied **401**; invalid CSRF, wrong app/origin and missing
  application are denied **403**; untrusted actual socket upgrade is denied
  **400** by Engine.IO. No real account or provider message was used.
- Fresh registry confirmation still lists braces 3.0.3 and Forge 1.4.0 as latest;
  Router 57.0.27 remains the latest SDK57 tag. The optional Expo 57.0.29 update
  still uses Metro 56.0.2; published fixed releases for braces/Forge remain absent.
  No broad SDK upgrade or audit-force downgrade was applied.

Before public deployment, use same-site HTTPS, configure production origins and
providers, replace remaining local infrastructure credentials and rotate the
Gmail application password previously shared in the conversation. Live provider
delivery, mobile-device execution and a comprehensive penetration test are not
established by these automated checks.

References: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[MDN cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie),
[Socket.IO Origin handling](https://socket.io/docs/v4/handling-cors/).

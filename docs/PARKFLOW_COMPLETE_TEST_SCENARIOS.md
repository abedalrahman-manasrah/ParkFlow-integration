# ParkFlow Complete Test Scenarios

Execution status: **NOT RUN**. This document was prepared by static review of the repository only. No application code, migrations, tests, or builds were executed.

Scope reviewed: frontend Expo app under `app/` and `src/`, backend Express/Prisma app under `server/src/`, Prisma schema and seed files, README, `EMAIL_OTP.md`, and `docs/ev-charging.md`.

Status legend:

- **IMPLEMENTED**: UI and backend/API flow exist in source code.
- **PARTIALLY IMPLEMENTED**: feature exists but depends on demo data, optional provider configuration, limited flow, or has no complete production lifecycle.
- **BACKEND-ONLY**: API/DB logic exists, but no user-facing app screen was found.
- **PLANNED / NOT IMPLEMENTED**: mentioned in docs/roadmap or UI as coming soon, but not implemented as working backend functionality.
- **MOCK / DEMO**: development-only or synthetic behavior; do not present as production integration.

Important role clarification: ParkFlow does **not** define Student, Supervisor, Workshop Manager, or LabAssist roles. The actual roles in code are `USER`, `ADMIN`, `PARKING_OPERATOR`, and `ENFORCEMENT_OFFICER` in `server/prisma/schema.prisma` and `server/src/apiRegistry.ts`.

## 1. Complete Feature Inventory

| Area | Feature | Status | Source of truth | Notes for evaluation |
|---|---|---:|---|---|
| Authentication | Email OTP request, verify, refresh, logout, logout all | IMPLEMENTED | `app/(onboarding)/email.tsx`, `app/(onboarding)/otp.tsx`, `server/src/modules/auth/*`, `EMAIL_OTP.md` | Real OTP requires SMTP config. Dev skip is gated by `EXPO_PUBLIC_DEV_SKIP_EMAIL_OTP`. |
| Authentication | Secure token storage and refresh retry | IMPLEMENTED | `src/store/authStore.ts`, `src/services/http/apiClient.ts` | Uses SecureStore on device and AsyncStorage on web. |
| Onboarding | Welcome, email, OTP, name, first vehicle, skip vehicle | IMPLEMENTED | `app/(onboarding)/*` | Hardware back is blocked on name/vehicle to preserve flow. |
| App shell | Auth gate, tabs, RTL/LTR, theme preferences | IMPLEMENTED | `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `src/store/preferencesStore.ts` | Arabic/English and light/dark/system themes are user settings. |
| Map | Location permission, test location control, zone discovery | IMPLEMENTED | `app/(tabs)/map.tsx`, `src/hooks/useUserLocation.ts` | Location denial must be tested manually. |
| Map | Parking zones, zone details, route to parking, start parking entry | IMPLEMENTED | `app/(tabs)/map.tsx`, `src/components/domain/ZoneSheet.tsx`, `app/parking/start.tsx` | Depends on backend zone seed/data. |
| Routing | Route API with alternatives, checkpoint-aware penalty, OSRM fallback | PARTIALLY IMPLEMENTED | `server/src/modules/routes/*`, `src/hooks/useRoute.ts`, `app/(tabs)/map.tsx` | Google traffic enrichment is optional via `GOOGLE_ROUTES_API_KEY`; OSRM failure falls back to straight line. |
| Trip Needs | Need-aware route and need-aware parking | IMPLEMENTED | `app/(tabs)/map.tsx`, `src/lib/tripNeeds.ts`, `src/lib/places.ts` | Includes semantic matching, free-text fallback, partial satisfaction, comparison card, warning, shorter-route switch, purple deviation highlighting. |
| Search | Destination and POI search | IMPLEMENTED | `src/lib/places.ts`, `src/components/map/DestinationSearchBox.tsx` | Real search quality depends on configured map/place provider/data path used by `searchPlaces()`. |
| EV charging | EV station map layer, filters, details, route | PARTIALLY IMPLEMENTED | `docs/ev-charging.md`, `src/store/evStationsStore.ts`, `server/src/modules/evStations/*` | Verified static/imported data; no live ports, booking, reviews, payment, or charging session. |
| Car services | Car wash, oil change, maintenance, tire service layer | PARTIALLY IMPLEMENTED | `src/store/carServicesStore.ts`, `server/src/modules/carServices/*` | Read-only service discovery; import/data required. |
| Road reports | Create event report, duplicate handling, vote still there/not there | IMPLEMENTED | `app/(tabs)/map.tsx`, `src/components/map/RoadReportCreationSheet.tsx`, `src/components/map/RoadReportDetailsSheet.tsx`, `server/src/modules/roadReports/*` | Self-vote, duplicate vote, expired/inactive cases should be validated. |
| Checkpoints | Checkpoint list, status, user reports, trust/points reward | IMPLEMENTED | `app/roads.tsx`, `server/src/modules/roads/*`, `server/src/worker.ts` | Worker verifies/revokes pending points after time window. |
| Parking sessions | Start, active timer, prepaid duration, extend, stop, receipt, settle debt | IMPLEMENTED | `app/parking/start.tsx`, `app/parking/active/[id].tsx`, `app/parking/receipt/[id].tsx`, `server/src/modules/parking/*` | One active session per vehicle and wallet balance checks are key committee tests. |
| Parking reservations | Layout, choose/auto-assign space, reserve, QR, cancel, list | PARTIALLY IMPLEMENTED | `app/parking/layout/[zoneId].tsx`, `app/parking/reserve/[zoneId].tsx`, `app/parking/reservation/[id].tsx`, `server/src/modules/reservations/*` | Layout is demo-style but backed by reservation API. No real gate integration. |
| QR scan | Camera permission and zone code scan/simulate | IMPLEMENTED | `app/scan.tsx`, `src/components/domain/ZoneCodeSheet.tsx` | Native camera permission is required; simulator path exists. |
| Wallet | Balance, transactions, top-up, auto top-up settings | IMPLEMENTED | `app/(tabs)/wallet.tsx`, `app/wallet/topup.tsx`, `server/src/modules/wallet/*` | Payment provider may be development/simulated unless configured. |
| Payment methods | Add card, list, default, remove | PARTIALLY IMPLEMENTED | `app/wallet/add-card.tsx`, `app/wallet/methods.tsx`, `server/src/modules/wallet/*` | UI collects card data but backend stores brand/last4/expiry only. Dev provider can decline card ending `0000`. |
| Vehicles | Add vehicle, list, details, default, unlink, permits, history | IMPLEMENTED | `app/vehicles/*`, `src/components/domain/VehicleForm.tsx`, `server/src/modules/vehicles/*` | Plate/region changes are blocked after creation; remove is disabled with active session. |
| Violations | List, detail, evidence, pay, appeal with uploaded attachments | IMPLEMENTED | `app/violations/*`, `src/services/http/violationService.ts`, `server/src/modules/violations/*` | Evidence creation is admin/officer backend-only; evidence UI can show server evidence. |
| Notifications | List, unread count, mark read/all, open href, device token APIs | IMPLEMENTED | `app/notifications.tsx`, `server/src/modules/notifications/*`, `server/src/worker.ts` | Push delivery depends on Firebase/provider config; in-app API exists. |
| Activity | Transaction/activity ledger with filters and detail view | IMPLEMENTED | `app/(tabs)/activity.tsx`, `app/activity/[id].tsx`, `server/src/modules/wallet/*` | Driven by wallet transactions and parking/violation/payment flows. |
| Profile | Personal info, settings, points, help, about, logout | IMPLEMENTED | `app/profile/*`, `app/(tabs)/profile.tsx` | About includes future roadmap items. |
| Admin | User role/status, zones, tariffs, hours, availability, permits, wallet adjustments, refunds, audit, operators, share vehicle | BACKEND-ONLY | `server/src/modules/admin/*` | No Admin UI found. Must test by API client only. |
| Enforcement | Issue violations, add evidence, decide appeals | BACKEND-ONLY | `server/src/modules/admin/routes.ts`, `server/src/modules/violations/*` | Requires `ADMIN` or `ENFORCEMENT_OFFICER` token. |
| Parking operator | Manage assigned parking zones, availability, permits | BACKEND-ONLY | `server/src/modules/admin/service.ts`, `server/src/apiRegistry.ts` | Permission scoped by operator-zone relation. |
| Roadmap | Private garages auto entry/exit, ANPR live enforcement/sensors, resident/disabled permits UI | PLANNED / NOT IMPLEMENTED | `app/profile/about.tsx`, README | Permits exist in backend, but public permit UI and real ANPR/live sensors are not complete app features. |
| Map layers | Parking, EV, Car Services, Road Reports, Business Offers | PARTIALLY IMPLEMENTED | `src/components/map/MapLayersSheet.tsx`, `src/store/mapLayersStore.ts` | Business Offers are marked coming soon/disabled. |

## 2. Test Environment & Prerequisites

Required local setup before manual execution:

1. Backend reachable from Expo using `EXPO_PUBLIC_API_BASE_URL`.
2. Database migrated and seeded/imported with at least:
   - one active parking zone with tariffs and operating hours,
   - one zone with limited/full/restricted conditions,
   - EV stations imported if EV tests will be demonstrated,
   - car services imported if car service tests will be demonstrated,
   - road checkpoints and at least one road report.
3. Email OTP SMTP configured from `EMAIL_OTP.md` if testing real login. Use a real inbox accessible during demo.
4. Optional but recommended: `GOOGLE_ROUTES_API_KEY` for traffic enrichment. Without it, routing still works but traffic details may be absent.
5. Payment provider/dev payment setup. Use a success test card and a decline case, especially a card ending in `0000` for development decline behavior.
6. Device/emulator permissions available for GPS and Camera. For web, verify projected map and clipboard/share fallbacks.
7. At least four test accounts:
   - `USER` normal driver.
   - `ADMIN` seeded by `SEED_ADMIN_EMAIL` in non-production.
   - `PARKING_OPERATOR` assigned to one operator/zone.
   - `ENFORCEMENT_OFFICER`.
8. Test data:
   - vehicle plate not already linked to current user,
   - second vehicle for default/removal tests,
   - unpaid violation for payment/appeal tests,
   - reservation-capable parking zone,
   - destination near real POIs for Trip Needs.

Do not tell the committee a provider is live unless the environment variables and provider accounts are actually configured. Mark missing provider tests as **NOT RUN / BLOCKED BY CONFIG**.

## 3. Full End-to-End User Journey

Use this as one connected committee scenario for a normal `USER`.

1. Open app fresh. Expected: auth gate routes to Welcome.
2. Tap Get Started or Login. Enter a valid email. Expected: OTP request succeeds and no OTP code is displayed in UI.
3. Open email inbox, copy OTP, enter six digits. Expected: session is created and next screen is Name if profile incomplete.
4. Enter full name. Expected: progress advances to Vehicle.
5. Add first vehicle with valid plate/region/type/color. Expected: vehicle is created, optionally default, onboarding completes and Map opens.
6. Open Settings from Profile. Switch Arabic/English and verify RTL/LTR layout, labels, and navigation. Switch back if needed for demo.
7. On Map, grant location permission. Expected: user position and nearby parking zones load. Denial case should show fallback/empty state.
8. Open Layers. Switch between Parking, EV Charging, and Car Services. Expected: available layers show markers; Business Offers stays coming soon/disabled.
9. Search for a destination. Expected: suggestions appear and selecting one enables routing.
10. Enter Trip Needs such as `دواء + محامص + شوكولاتة`. Expected: semantic category search and free-text fallback run. If some needs are found, route is offered with partial satisfaction message.
11. Compare Need-Aware Route vs Shortest Route. Expected: comparison card shows duration, distance, extra time/distance/percentage. Significant detour shows red warning. Purple route segments highlight only the need-aware deviation.
12. Tap Show shorter route. Expected: map geometry changes to shortest route, route panel updates, destination remains visible, need-stop markers hide if irrelevant, and switch-back option remains.
13. Switch back to Need-Aware Route. Expected: POI markers return and purple deviation is primary again.
14. Create a road report on the map, choose type/severity/direction/details, submit. Expected: report appears, confidence/status are visible, and duplicate rules prevent spam.
15. Open Roads page and submit/check checkpoint report. Expected: report accepted and points may be pending until worker verification.
16. Select an EV station and route to it. Expected: EV details and route work; no charging/payment action is offered.
17. Select a car service and route to it. Expected: category filter and detail sheet work.
18. Select a parking zone. Open layout, choose a space, create reservation. Expected: reservation confirmation, QR code, route-to-parking, and cancel if future/confirmed.
19. Use Scan screen. Grant camera permission or use simulate code. Expected: zone code resolves and opens zone/start flow.
20. Open Wallet. Add payment method, set default, top up wallet. Expected: balance and transaction ledger update. Try declined card/top-up as negative test.
21. Start parking session for selected vehicle/zone. Expected: active session created, one-session-per-vehicle enforced, route/session UI opens.
22. In Active Parking, verify timer/prepaid remaining, extend prepaid if applicable, and stop session. Expected: final receipt with duration/cost; failed payment keeps debt and settle action.
23. Open Activity. Expected: parking/top-up/violation transactions appear with correct filters and detail pages.
24. Open Vehicles. Verify vehicle details, active session protection, history, permits, and unlink behavior.
25. Open Violations. View evidence, pay if wallet sufficient, then test appeal on another unpaid/overdue violation with reason/notes/optional attachments.
26. Open Notifications. Mark one notification read, then mark all read. Expected: unread count updates and linked notification navigates correctly.
27. Logout from Profile. Expected: refresh/session cleared and app returns to onboarding.

## 4. Detailed Manual Test Cases

| ID | Role | Feature | Preconditions / Data | Steps | Expected result | Negative / edge validation | Interactions |
|---|---|---|---|---|---|---|---|
| PF-T001 | USER | Welcome/auth gate | No stored session | Launch app | Welcome screen opens | Corrupt/expired token signs out | `app/_layout.tsx`, onboarding |
| PF-T002 | USER | Email OTP request | SMTP configured | Enter valid email and submit | OTP email sent; OTP screen opens | Invalid email disables submit; SMTP failure shows error and clears challenge | Auth API |
| PF-T003 | USER | OTP verify | Valid OTP email | Enter 6 digits | User session created | Wrong/expired OTP, 5 failed attempts, consumed OTP reuse | Auth API, SecureStore |
| PF-T004 | USER | OTP resend | OTP challenge exists | Tap resend after cooldown | New OTP sent | Cooldown blocks early resend | Auth API |
| PF-T005 | USER | Name onboarding | Verified user without full name | Enter 2-60 char name | Profile updated | Too short/empty disabled | Profile API |
| PF-T006 | USER | First vehicle onboarding | Completed name | Add valid vehicle | Vehicle linked and app opens map | Duplicate plate may require ownership verification; invalid plate blocked | Vehicle API |
| PF-T007 | USER | Skip vehicle | Completed name | Skip vehicle | Map opens without vehicle | Starting parking later requires vehicle | Parking flow |
| PF-T008 | USER | Session persistence | Logged-in user | Restart app | Map opens directly | Expired refresh redirects to login | Auth refresh |
| PF-T009 | USER | Language/RTL | Logged-in user | Switch Arabic/English in Settings | Text and layout direction update | Long Arabic labels should not overlap | Whole app |
| PF-T010 | USER | Theme | Logged-in user | Switch light/dark/system | Colors update without breaking contrast | Restart should persist preference | Preferences store |
| PF-T011 | USER | Location permission | Fresh permission state | Allow GPS on map | Nearby zones and user marker appear | Deny permission shows recoverable state | Map, parking zones |
| PF-T012 | USER | Nearby zones | Seeded zones | Open map near zones | Markers and zone sheet load | Empty region shows no-zone state | Parking API |
| PF-T013 | USER | Zone details | Zone marker visible | Tap zone | Availability, tariff, hours, actions visible | Full/restricted/closed zone disables start as appropriate | Parking start |
| PF-T014 | USER | Destination search | Network/search data | Type place name | Suggestions appear | Unknown text returns empty state without crash | Places search |
| PF-T015 | USER | Normal route | Destination selected | Request route | Route polyline, duration, distance display | OSRM failure falls back gracefully | Routes API |
| PF-T016 | USER | Trip Needs semantic inference | Destination selected | Enter `دواء + محامص + شوكولاتة` | Pharmacy/roastery/supermarket style matches are considered | Do not require exact literal business names | Need-aware route |
| PF-T017 | USER | Free-text fallback | Destination selected | Enter `ورد` or `حلويات شرقية` | Uses original phrase through `searchPlaces()` if not mapped | Only reports no match after real search returns no usable POIs | Places search |
| PF-T018 | USER | Partial satisfaction | Mixed easy/hard needs | Need found for 1 or 2 of 3 | Route offered for matched needs with matched/unmatched summary | Zero matched needs is the only no-route case | Need-aware parking/route |
| PF-T019 | USER | Combined places | Multiple grocery items | Enter milk/chips/tissues/chocolate | Supermarket may satisfy multiple needs in one stop | Avoid unnecessary separate stops | Route scoring |
| PF-T020 | USER | Route comparison | Need-aware route longer than shortest | Generate both routes | Shows Need-Aware, Shortest, Difference | Extra time, distance, percentage must be accurate | Route panel |
| PF-T021 | USER | Red warning threshold | Significant detour | Open route panel | Red warning card appears with Show shorter route | Small difference should not show red warning | UX decision |
| PF-T022 | USER | Show shorter route | Warning visible | Tap Show shorter route | Geometry and panel switch to shortest route; destination remains | Needs are not deleted; switch back remains | Map state |
| PF-T023 | USER | Switch back to Need-Aware | Shortest route active | Tap Need-Aware route action | Need markers return and need-aware route primary | No need re-entry required | Map state |
| PF-T024 | USER | Purple deviation | Need-aware and shortest differ | View need-aware route | Shared segments normal color; detour segments purple | Tiny GPS/polyline differences ignored by tolerance | Map rendering |
| PF-T025 | USER | Shortest route visual | Shortest active | View route | Shortest route normal; optional need detour subtle only if not cluttered | No misleading purple on shared route | Map rendering |
| PF-T026 | USER | Road report creation | Map open | Pick location, type, severity, direction, details, submit | Report created and visible | Missing details/duplicate/rate limit handled | Road reports API |
| PF-T027 | USER | Road report voting | Existing report by another user | Tap still there/not there | Confidence/vote updates | Self-vote, repeat vote, expired report fail clearly | Road reports API |
| PF-T028 | USER | Checkpoints | Checkpoints seeded | Open Roads and report status | Checkpoint feed/status updates | Cooldown blocks rapid repeat | Roads API, points |
| PF-T029 | USER | EV layer | EV data imported | Select EV layer and filters | EV markers/details route work | No live booking/payment should be shown | EV API |
| PF-T030 | USER | Car services layer | Service data imported | Select category and marker | Service detail and route work | Empty category handled | Car services API |
| PF-T031 | USER | Business offers layer | Open layer sheet | Try Business Offers | Shows coming soon/disabled | Must not imply implemented offers | Map layers |
| PF-T032 | USER | Parking layout | Reservation zone | Open layout | Space grid with statuses appears | Occupied/reserved/out-of-service spaces disabled | Reservation API |
| PF-T033 | USER | Reserve spot | Available space | Select time/duration/spot and confirm | Reservation detail with QR/code appears | Past time or no spot disables submit | Reservations |
| PF-T034 | USER | Cancel reservation | Future confirmed reservation | Tap cancel | Status changes and list updates | Past/cancelled reservation cannot cancel | Reservations |
| PF-T035 | USER | QR scan | Camera permission | Scan/simulate zone code | Zone opens | Permission denied and invalid code handled | Parking zones |
| PF-T036 | USER | Add card | Wallet open | Add valid card data | Method appears; default if selected | Invalid/expired card disabled | Wallet API |
| PF-T037 | USER | Top up | Default payment method | Top up valid amount | Balance and transaction update | No default method or out-of-range amount blocked | Payment provider |
| PF-T038 | USER | Declined payment | Dev provider | Use decline card/top-up | Failure message; balance unchanged | Transaction status should reflect failure if created | Wallet/payment |
| PF-T039 | USER | Auto top-up | Payment method exists | Enable and configure | Preference saved | No payment method disables toggle | Wallet |
| PF-T040 | USER | Start parking | Vehicle, wallet, available zone | Start session | Active session opens | No vehicle, insufficient wallet, full/restricted zone blocked | Parking API |
| PF-T041 | USER | Active session conflict | Vehicle has active session | Try second start | Blocked with conflict | Another vehicle can start if rules allow | Parking rules |
| PF-T042 | USER | Prepaid extension | Active prepaid session | Extend duration | End time/cost update | Insufficient balance blocks | Parking API |
| PF-T043 | USER | Stop session | Active session | Stop and confirm | Receipt generated | Network/payment failure preserves debt/session data | Wallet/debt |
| PF-T044 | USER | Receipt | Completed session | Open receipt | Duration, tariff snapshot, total, payment status visible | Share fallback works on web | Activity |
| PF-T045 | USER | Activity filters | Transactions exist | Filter all/parking/payments/violations | Correct grouped rows | Empty filters show empty state | Wallet ledger |
| PF-T046 | USER | Vehicle details | Vehicle exists | Open vehicle | History, violations, permits, actions visible | Remove disabled during active session | Vehicles |
| PF-T047 | USER | Remove vehicle | No active session | Confirm remove/unlink | Vehicle unlinked, history preserved | Unpaid violation warning visible if applicable | Vehicles/violations |
| PF-T048 | USER | Violations list/detail | Unpaid violation exists | Open list then detail | Status, amount, plate, evidence/payment/appeal actions visible | Missing evidence shows empty state | Violations |
| PF-T049 | USER | Pay violation | Sufficient wallet | Pay violation | Status paid; wallet/activity update | Insufficient balance opens top-up path | Wallet |
| PF-T050 | USER | Appeal violation | Unpaid/overdue violation | Pick reason, notes, optional attachments, submit | Appeal created and violation status becomes appealed | Notes under 10 chars, invalid upload, paid violation rejected | Uploads/API |
| PF-T051 | USER | Notifications | Notifications exist | Open, tap item, mark all read | Read status/count updates; href navigates | Empty list stable | Notifications |
| PF-T052 | USER | Profile personal | Logged in | Change full name | Name updates | Email remains read-only | Profile API |
| PF-T053 | USER | Help/About | Profile open | Open help/about | FAQ/support/roadmap visible | Roadmap items labeled coming soon | Docs/roadmap |
| PF-T054 | USER | Logout | Logged in | Confirm logout | Session cleared and onboarding opens | Network failure handled | Auth |
| PF-T055 | ADMIN | Admin users | Admin token | GET users, PATCH another user's role/status | Allowed and audit/token revocation occur | Cannot change own permissions; USER gets 403 | Admin API |
| PF-T056 | ADMIN | Admin zones | Admin token | Create/patch zone/tariff/hours/availability | Zone changes visible to app | Invalid geometry/tariff rejected | Parking |
| PF-T057 | PARKING_OPERATOR | Operator scope | Operator assigned to one zone | Patch assigned zone availability | Succeeds for own zone | Other zone returns 403 | Admin API |
| PF-T058 | ENFORCEMENT_OFFICER | Issue violation/evidence | Officer token, vehicle exists | Issue violation, upload evidence | User sees violation/evidence | Non-officer gets 403 | Violations |
| PF-T059 | ADMIN | Appeal decision | Appealed violation | Decide appeal | Status/notifications/activity update as implemented | Invalid status rejected | Admin/violations |
| PF-T060 | ADMIN | Audit/refund/adjustment | Admin token | Create wallet adjustment/refund and inspect audit | Ledger and audit log reflect action | Non-admin forbidden | Wallet/admin |

## 5. Negative Tests & Edge Cases

- Auth: invalid email, expired OTP, reused OTP, too many OTP failures, resend before cooldown, SMTP failure, refresh token revoked, suspended user.
- Permissions: `USER` calls `/admin/*`, operator edits unassigned zone, enforcement officer edits admin users, anonymous call to protected API.
- Routing: no network, OSRM unavailable, Google traffic key missing, destination outside supported region, no alternatives, road closure on route.
- Trip Needs: all needs unmatched, one need matched, multiple needs satisfied by one supermarket, Arabic plural/synonym, typo/free-text term, very long input, duplicated needs.
- Map rendering: route switch does not remove destination, purple detour does not mark shared road, POI markers hide on shortest route and return on need-aware route.
- Parking: full zone, restricted zone, outside operating hours, no vehicle, active session conflict, insufficient wallet, stop payment failure, settle debt after failure.
- Reservation: past start time, no selected space, reserved/occupied/out-of-service space, cancellation after start/end, QR invalid code.
- Wallet: no default method, invalid card number, expired card, declined payment, top-up amount below/above limits, idempotent retry should not double-charge.
- Vehicles: duplicate plate, invalid plate format, remove default vehicle, remove vehicle with active session, non-owner update permissions.
- Violations: insufficient balance, appeal paid violation, appeal notes too short, upload too large, upload belongs to another user, evidence missing.
- Road reports: duplicate report nearby, create rate limit, vote own report, vote same report twice, vote expired/inactive report.
- EV/Car services: imported dataset empty, filters return zero, invalid bounds, large bounds capped/truncated.
- Notifications: mark already-read item, invalid href, push provider missing but in-app notification should still be testable if data exists.

## 6. Backend/API Verification Scenarios

All scenarios below are **NOT RUN** and should be executed with a REST client only after environment setup. Use `Authorization: Bearer <accessToken>` for protected endpoints and `Idempotency-Key` for mutation retries where applicable.

| ID | API area | Endpoint examples | Verify |
|---|---|---|---|
| PF-API-001 | Health | `GET /health`, `GET /ready` | Service and database readiness. |
| PF-API-002 | Auth | `POST /api/v1/auth/request-otp`, `POST /api/v1/auth/verify-otp`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout` | OTP lifecycle, token issuance, refresh revocation. |
| PF-API-003 | Profile | `GET /api/v1/users/me`, `PATCH /api/v1/users/me` | Full name update and auth protection. |
| PF-API-004 | Vehicles | `GET/POST /api/v1/vehicles`, `GET/PATCH/DELETE /api/v1/vehicles/:id` | Link/unlink, default vehicle, duplicate/ownership behavior. |
| PF-API-005 | Parking zones | `GET /api/v1/parking/zones/nearby`, `GET /api/v1/parking/zones/:id`, `GET /api/v1/parking/zones/:id/layout` | Zone data, layout, availability. |
| PF-API-006 | Parking sessions | `POST /api/v1/parking/sessions`, `GET /api/v1/parking/sessions/active`, `POST /api/v1/parking/sessions/:id/stop`, `POST /api/v1/parking/sessions/:id/extend`, `POST /api/v1/parking/sessions/:id/settle` | Idempotency, one active session, tariffs, debts. |
| PF-API-007 | Reservations | `POST/GET /api/v1/parking/reservations`, `POST /api/v1/parking/reservations/qr/validate`, `POST /api/v1/parking/reservations/:id/cancel` | Spot reservation, QR validation, cancellation rules. |
| PF-API-008 | Wallet | `GET /api/v1/wallet`, `POST /api/v1/wallet/topups`, `GET /api/v1/wallet/transactions`, payment method endpoints | Balance integrity, decline/success, method lifecycle. |
| PF-API-009 | Violations | `GET /api/v1/violations`, `GET /api/v1/violations/:id`, `POST /api/v1/violations/:id/pay`, `POST /api/v1/uploads`, `POST /api/v1/violations/:id/appeals` | Payment, evidence, appeal upload validation. |
| PF-API-010 | Roads/reports | `GET /api/v1/roads/checkpoints`, `POST /api/v1/roads/reports`, `GET/POST /api/v1/road-reports` | Checkpoint reports, event report duplicate/vote logic. |
| PF-API-011 | Routes | `POST /api/v1/routes` | Duration/distance/polyline/alternatives, fallback behavior. |
| PF-API-012 | EV | `GET /api/v1/ev-stations` | Bounds/filter validation and truncation. |
| PF-API-013 | Car services | `GET /api/v1/car-services` | Bounds/category filter and empty results. |
| PF-API-014 | Notifications | `GET /api/v1/notifications`, `POST /api/v1/notifications/:id/read`, `POST /api/v1/notifications/read-all`, device token endpoints | Read state, unread count, token registration. |
| PF-API-015 | Admin | `/api/v1/admin/*` | Role-based access, audit logs, zone/operator/enforcement/admin workflows. |

## 7. Complete Hackathon Live Demo Script

Recommended duration: 12-18 minutes. Keep one prepared account and one prepared dataset to avoid waiting on provider delays.

1. **Opening, 45 sec**: Explain ParkFlow as smart parking and route assistance for Palestine/Ramallah. Mention roles: driver app plus backend admin/operator/enforcement APIs.
2. **Secure onboarding, 2 min**: Show email OTP request and verification. Emphasize no hardcoded demo OTP in UI when SMTP is enabled.
3. **Vehicle setup, 1 min**: Add vehicle and show plate/default vehicle.
4. **Map and routing, 3 min**: Search destination, enter Trip Needs, show Need-Aware vs Shortest comparison, red warning when longer, purple detour segments, and user-controlled switch.
5. **Road intelligence, 2 min**: Create road report, show report detail/voting, open Roads/checkpoints.
6. **Service discovery, 1 min**: Toggle EV and Car Services layers, open details and route. State clearly these are read-only discovery features.
7. **Reservation and QR, 2 min**: Open parking layout, choose space, reserve, show QR/code, route to parking, scan/simulate code.
8. **Wallet and parking session, 3 min**: Add payment method, top up, start session, extend/stop, show receipt and activity ledger.
9. **Violations and appeals, 2 min**: Show unpaid violation, evidence, pay or appeal with attachment upload. Explain enforcement evidence creation is backend/admin role.
10. **Profile and trust, 1 min**: Show points/trust, settings, Arabic/English, notifications.
11. **Backend proof, 2 min optional**: Use REST client to show an Admin/Operator/Enforcement endpoint returning 403 for normal user and success for authorized role.

Suggested committee wording: "The driver-facing mobile app is implemented. Admin/operator/enforcement capabilities are backend APIs, not a completed admin dashboard."

## 8. Potential Judge Questions

| Question | Accurate answer |
|---|---|
| Is the app using real authentication? | Yes, OTP auth, refresh tokens, secure local storage, and logout flows exist. Real delivery requires SMTP config. |
| Is there RBAC? | Yes, backend roles are `USER`, `ADMIN`, `PARKING_OPERATOR`, and `ENFORCEMENT_OFFICER`. Admin/operator/enforcement features are API-level; no admin dashboard was found. |
| Is payment production-ready? | The app has wallet/payment-method/top-up/session payment flows. Provider behavior may be development/mock unless real provider config is present. |
| Does Need-Aware routing force the longer route? | No. It keeps the selected Need-Aware route visible, compares against the shortest route, warns for significant detours, and lets the user switch manually. |
| Does EV charging include booking or live port availability? | No. Current EV feature is verified station discovery, filters, details, and routing. |
| Are private garages, ANPR, and live sensors done? | No. They are roadmap/planned or backend-adjacent concepts, not complete production features. |
| Can users report traffic problems? | Yes, road reports and checkpoint reports exist with confidence/vote logic and anti-spam rules. |
| What happens if only some Trip Needs are found? | The app should still build a route for matched needs and show matched/unmatched summary. |
| Are attachments in appeals real? | The HTTP service uploads attachments to `/uploads` and sends returned upload IDs to the appeal endpoint. |
| What could fail in a live demo? | Missing SMTP, empty imported EV/car-service data, no backend seed data, missing map/route keys, camera/GPS permissions, or payment provider config. |

## 9. Feature-to-Test Coverage Matrix

| Feature group | Test IDs |
|---|---|
| Auth/onboarding | PF-T001 to PF-T008, PF-API-002 |
| Preferences, RTL/LTR, profile | PF-T009, PF-T010, PF-T052 to PF-T054 |
| Map/search/routing | PF-T011 to PF-T015, PF-API-011 |
| Trip Needs and route comparison | PF-T016 to PF-T025 |
| Road reports/checkpoints | PF-T026 to PF-T028, PF-API-010 |
| EV charging | PF-T029, PF-API-012 |
| Car services | PF-T030, PF-API-013 |
| Map layers/coming soon | PF-T031 |
| Reservations/layout/QR | PF-T032 to PF-T035, PF-API-007 |
| Wallet/payments | PF-T036 to PF-T039, PF-API-008 |
| Parking sessions | PF-T040 to PF-T044, PF-API-005, PF-API-006 |
| Vehicles | PF-T006, PF-T046, PF-T047, PF-API-004 |
| Violations/appeals/evidence | PF-T048 to PF-T050, PF-T058, PF-T059, PF-API-009 |
| Notifications/activity | PF-T045, PF-T051, PF-API-014 |
| Admin/operator/enforcement RBAC | PF-T055 to PF-T060, PF-API-015 |

## 10. Critical Bugs, Risks & Missing Functionality

1. **Admin UI missing**: RBAC/admin/operator/enforcement functions are backend-only. A committee should not expect an admin dashboard unless one is built later.
2. **Provider configuration risk**: OTP email, push notifications, traffic enrichment, maps, and payments depend on environment/provider configuration.
3. **Imported data risk**: EV stations and car services can appear empty if import scripts/data were not run.
4. **README mock wording risk**: README mentions a mock backend pattern, but current `src/services/index.ts` uses HTTP services. Present the current code as HTTP-backed and treat old mock wording as documentation drift.
5. **Reservations are partly demo-oriented**: parking layout UX is useful for demonstration but no real gate/sensor integration is implemented.
6. **Payment production readiness**: card UI and backend flows exist, but real charging depends on payment provider integration. Do not claim PCI-grade production processing from this repository alone.
7. **Traffic accuracy risk**: without Google Routes key or live traffic inputs, route duration/impact may be approximate or fallback-based.
8. **Push notification risk**: in-app notification APIs exist, but push delivery can fail if Firebase/provider credentials are absent.
9. **Evidence source limitation**: violation evidence can be shown and uploaded through backend flows, but real ANPR/live sensor capture is not implemented as an end-to-end hardware integration.
10. **Road report trust timing**: some points/trust effects depend on the worker and time windows, so they may not update instantly during a short demo.
11. **Native map key risk**: Android/native map behavior may require a Google Maps key/dev build, while web uses projected map rendering.
12. **No automated test execution in this review**: every scenario here remains manual and **NOT RUN** until the team executes it.

## 11. Final Pre-Demo Checklist

- [ ] Backend server running and `GET /health`, `GET /ready` pass.
- [ ] Expo app points to correct `EXPO_PUBLIC_API_BASE_URL`.
- [ ] SMTP OTP tested with the demo inbox.
- [ ] Demo user account can login and has a clean onboarding path or known state.
- [ ] Admin, parking operator, and enforcement officer tokens/accounts prepared for API proof.
- [ ] Database has zones, tariffs, hours, reservations-capable layout, vehicles, violations, notifications, road reports, checkpoints.
- [ ] EV and car-service datasets imported if those map layers will be shown.
- [ ] Route provider/OSRM path works for the chosen demo destination.
- [ ] Trip Needs demo input prepared with at least one semantic match and one partial/unmatched example.
- [ ] Need-Aware vs Shortest comparison tested manually on the chosen route, including red warning and purple deviation.
- [ ] Wallet has default payment method and enough balance, plus a decline case prepared.
- [ ] Camera and location permissions available on the demo device.
- [ ] QR simulate code or real zone code prepared.
- [ ] Unpaid violation prepared for pay/appeal/evidence demonstration.
- [ ] Notification exists for read/open demo.
- [ ] Arabic/English toggle checked for main screens.
- [ ] Do not present coming-soon features as implemented: Business Offers, private garages, real ANPR/live sensors, live EV port booking/payment.

Final recommendation: run the full PF-T001 to PF-T060 checklist once internally, record pass/fail evidence, then choose a shorter live path from Section 7 for the committee.

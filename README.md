# ParkFlow — Smart Parking for Palestine

**ParkFlow** — a production-shaped React Native app for finding, paying for and
managing parking in Palestine. Built with Expo + TypeScript, a real design system, and a typed
service layer sitting in front of a mock backend so screens can be wired to real
APIs without being rewritten.

## Running it

```bash
npm install
```

```bash
npx expo start
```

Then press `a` for Android, `i` for iOS, or `w` for the browser. Maps render
through `react-native-maps` on device; the browser gets an equivalent projected
surface (see *Platform notes*).

Typecheck:

```bash
npm run typecheck
```

### Email sign-in

Follow [Email OTP setup](EMAIL_OTP.md) to configure Gmail SMTP and the backend.
Enter your email, request a six-digit code, and use the code received in your inbox.
New accounts continue to name and vehicle setup. There is no demo login or on-screen code.

## Architecture

```
app/                    expo-router routes only — thin screens
  (onboarding)/         welcome → phone → otp → name → first vehicle
  (tabs)/               map · activity · vehicles · wallet · profile
  parking/              start · active/[id] · receipt/[id]
  vehicles/ wallet/ activity/ violations/ profile/
src/
  components/ui/        design-system primitives (AppButton, BottomSheet, …)
  components/domain/    parking-aware components (ZoneSheet, PlateBadge, …)
  components/map/       platform-split map surface
  services/             typed service interfaces + mock implementations
  hooks/                TanStack Query hooks, one per domain
  store/                zustand: auth (SecureStore) and preferences (AsyncStorage)
  types/                domain model
  theme/                colour, spacing, radius, typography, shadow, motion tokens
  utils/                pricing, money, time, plate, geo, errors
  i18n/                 en (source of truth) + ar overlay
```

**Screens never touch data directly.** They call hooks, hooks call
`services.*`, and `src/services/index.ts` is the single place where the mock
implementations are swapped for HTTP.

## Business rules worth knowing

These live in the service layer, not the UI, because that is where they belong
when a real backend arrives.

- **One active session per _vehicle_, never per account.** Two cars on the same
  account can be parked simultaneously; the same car cannot be parked twice. The
  start screen surfaces the conflict and offers the running session.
- **Cost is derived from timestamps.** `computeSessionBreakdown(session, now)` is
  a pure function of `startedAt` and the frozen rate. The one-second interval on
  the active screen only triggers a re-render — it is never the source of truth,
  which is why killing the app and reopening it recovers the exact value.
- **The tariff is snapshotted at start.** A price change mid-session cannot
  re-price a session already running.
- **Payment failure never destroys parking data.** If the wallet cannot cover a
  finished session, the session still closes and is marked `PAYMENT_FAILED`, with
  the debt tracked separately and settleable from the receipt.
- **Cards are charged only on top-up.** Parking and violations settle against the
  wallet balance — never a per-minute card charge.
- **Removing a vehicle unlinks it.** Sessions and violations keep pointing at the
  vehicle, so history and enforcement records survive.
- **Violations belong to a plate**, not to a user. They surface to whoever has
  that vehicle linked, which is why they appear immediately after onboarding.
- **Double taps are absorbed** via idempotency keys on start-parking, top-up and
  violation payment.

## Interface notes

- **The timer ring** on the active-parking screen is not decoration: it fills
  against the prepaid time bought, or against the zone's maximum stay. A zone
  with neither has no honest denominator, so the arc stays empty rather than
  inventing progress.
- **Availability** is shown as a badge *and* a three-segment meter, so it never
  depends on colour alone.
- **The receipt** is notched and perforated so it reads as a ticket rather than
  a panel.
- **Onboarding steps after the account exists** (name, first vehicle) swallow the
  Android back button — reversing into the email or OTP screen of an
  already-verified account is a dead end. "Skip for now" is the way out.

## Localisation and RTL

English is the source of truth (`src/i18n/en.ts`); Arabic is an overlay that
falls back per key, so a missing translation never renders a raw key. Layout
direction is driven from React state (`useLocale().row` / `textAlign` / `dir`)
rather than `I18nManager.forceRTL`, so switching to Arabic mirrors the UI
immediately with no app restart.

## Running on Android

```bash
npx expo start --android
```

This opens the app in Expo Go on a connected device or emulator. **Every screen
works there except the map tiles**: Android's Google Maps SDK will not draw tiles
without an authorised API key, and Expo Go's built-in key is not valid for
third-party projects. The map mounts and logs `Authorization failure`.

To get real tiles, supply your own key and make a development build:

1. Create a key in the [Google Cloud console](https://console.cloud.google.com/)
   with **Maps SDK for Android** enabled.
2. Pass it through the environment — `app.config.js` reads it, so it is never
   committed:

```bash
GOOGLE_MAPS_API_KEY=AIza... npx expo run:android
```

iOS needs no key; react-native-maps uses Apple Maps there.

## Platform notes

- **Maps.** `MapSurface.native.tsx` renders `react-native-maps`;
  `MapSurface.tsx` is the default/web implementation that projects the same
  coordinates onto a stylised surface, so the app is fully previewable in a
  browser. Both satisfy one interface (`components/map/types.ts`).
- **Motion.** Entrance animations collapse to their final state when the user
  has reduced motion enabled, or when no animation frames are available. Content
  visibility never depends on an animation actually running.
- **Storage.** Tokens go to SecureStore on device (AsyncStorage on web, which has
  no secure store); preferences and the mock database use AsyncStorage.

## What is mocked

Everything behind `src/services/` is an in-memory database persisted to
AsyncStorage. It models a server faithfully — it owns the rules above, returns
realistic latency, and fails the way a server fails — but it is not one.

- **Evidence photos** are drawn, not photographed. Real captures come from the
  issuing authority's ANPR systems; rather than ship broken image slots or stock
  photos that could be mistaken for genuine evidence, each frame is rendered as a
  clearly synthetic scene labelled `SAMPLE CAPTURE`, keeping the real screen's
  layout, overlays and metadata.
- **Payments** go through `PaymentService`, which never sees card data — only a
  stored payment-method id, the same boundary the real integration keeps. A card
  added ending `0000` always declines, so the failure path is demonstrable on
  demand rather than at random.
- **Availability** is coarse (`available` / `limited` / `full` / `unknown`). No
  exact free-space counts are claimed without a trustworthy occupancy source.

## Built to extend

The data model already carries the concepts the wider platform needs, so these
are additions rather than rewrites: `ParkingFacility` + `hasAnpr`/`hasBarrier`
for garages that open a session on plate read; `ParkingEntryMethod` so QR and
manual zone codes are peers of GPS rather than afterthoughts; `Permit` and
`UserVehicle` roles for resident permits and shared or company vehicles.

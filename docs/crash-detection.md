# Crash detection

The phone watches for a crash while the driver drives. On Android this keeps
working with ParkFlow closed. If a crash is detected and the driver does not
respond, it calls an emergency number.

## How it works

1. **Armed only while driving.** GPS speed arms the detector once the car has gone
   faster than 20 km/h in the last minute. Until then GPS is read every 10 s and the
   motion sensor is off. While armed, GPS is read every second and the accelerometer
   at about 50 Hz.
2. **Detection** needs all of:
   - a hard impact: at least 4 g, lasting several samples (a dropped phone is one short spike);
   - then, 3 seconds later, either the phone has **turned over** by 60° or more
     (the car rolled or flipped), or the car has **stopped** (GPS under 8 km/h).
3. **Countdown.** A full-screen red screen vibrates and counts down (15 s by default),
   over the lock screen if needed.
   - "أنا بخير — إلغاء" cancels it.
   - "اتصل الآن" calls straight away.
   - When it reaches zero, the call is placed.
4. **Call.** On Android, with the call permission, the call goes through on its own,
   including from the background (`TelecomManager.placeCall`). Without the permission
   a notification offers to dial. On iOS the dialer opens with the number filled in.
5. **Record.** Every detection is saved on the backend (`crash_events`) with its
   location, speed, impact and outcome (`cancelled`, `called`, `call_failed`, `no_number`).
   Detections made while the app was closed are uploaded the next time it opens.

The driver can turn it off in **Settings → السلامة → كشف الحوادث**.

## Where the code lives

| Part | File |
| --- | --- |
| Android background service, countdown screen, call | `modules/crash-detection/android/…/CrashDetectionService.kt`, `CrashAlertActivity.kt` |
| Detection logic (Android) | `modules/crash-detection/android/…/CrashDetector.kt` |
| Detection logic (in-app, iOS) | `src/utils/crashDetector.ts`. Keep the two in step. |
| Starting/stopping, permissions, uploads | `src/hooks/useCrashDetection.ts` |
| In-app countdown (iOS) | `src/components/navigation/CrashCountdown.tsx` |
| Backend config and records | `server/src/modules/emergency/` |

`modules/crash-detection` is a local Expo module. It is linked automatically on
`expo prebuild` / `expo run:android` and needs no registration.

## Turning it on

Crash detection stays **off until a number is configured**. In `server/.env`:

```env
EMERGENCY_CALL_NUMBER=101
EMERGENCY_COUNTDOWN_SECONDS=15
```

Then restart the backend. The app reads the number from `GET /api/v1/emergency/config`
and passes it to the Android service, so changing it needs no new app build.

## Building for Android

It needs a development or production build. It does not run in Expo Go or on the web.

```bash
npx expo run:android
```

or, with EAS:

```bash
eas build --platform android
```

Permissions are declared already:
- **App:** `CALL_PHONE`, `VIBRATE` and location, in `app.json`.
- **Module:** `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`
  and `USE_FULL_SCREEN_INTENT`, in the module's manifest.

The first time it turns on, the app asks once for call and notification permission.
Location permission comes from the map.

### Google Play

Play reviews these permissions. Before publishing:
- **Foreground service, location type:** declare it in Play Console under App content →
  Foreground service permissions, describing crash detection while driving.
- **`CALL_PHONE`:** explain that the app places an emergency call after a detected crash.
- **`USE_FULL_SCREEN_INTENT`:** on Android 14+ Play grants this only to calling and
  alarm apps. Without it the countdown shows as a high-priority notification with the
  same buttons instead of taking over the screen. The call still goes through.

## Testing

- **Without crashing a car:** in a development build, **Settings → السلامة** has a
  "محاكاة حادث (للتطوير)" button. On Android it runs the real service flow: screen,
  vibration, countdown and call. With no number configured, letting it run out
  records `no_number` and calls nobody.
- **With the app closed:** start the app once, close it, and check the silent
  "كشف الحوادث يعمل" notification is there. That notification is the service.
- **Detection logic:** both detectors were checked against the same seven synthetic
  cases. Detected: rollover, side flip, frontal crash then stop. Not detected:
  dropped phone while parked, phone hitting the floor while driving, pothole, hard braking.
- **Real-world tuning:** check `impactG` and `rolloverDeg` on real drives and adjust
  for how phones are usually mounted. Change both detector files together.

## Limits

- **Visible notification.** Android requires a running background service to show a
  notification. It is silent and minimised.
- **After a reboot,** the service starts again the next time ParkFlow is opened.
  Android 14 does not allow location services to start at boot.
- **Battery.** While the service runs, GPS is read every 10 s even when not driving.
  This is the cost of detecting when a drive starts with the app closed.
- **Accuracy.** The detector is a heuristic. It will miss some crashes and, rarely,
  flag a hard knock. The countdown exists so a false alarm can be cancelled before
  anyone is called.

# ParkFlow Hackathon Demo Video Script

Execution status: **NOT RUN**. This script is based on static code review only. No tests, builds, migrations, or app code changes were executed.

Target length: **4:45 minutes**  
Format: vertical mobile screen recording, fast cuts, Arabic voiceover, Arabic captions with short English technical labels.  
Story: one driver opens ParkFlow, plans a trip with needs, avoids traffic, reserves/scans parking, pays, starts and stops a parking session, then reviews proof screens.

Do not claim the following as complete production features in the video:

- EV charging booking/payment/live port count: current code supports EV station discovery, filters, details, and routing only.
- Business Offers: visible as coming soon/disabled in map layers.
- Admin dashboard: admin/operator/enforcement features are backend APIs, not app UI.
- Real ANPR/live sensor hardware: violation/evidence backend exists, but no full hardware integration is implemented.

## Verified Feature Sources

| Feature | Verified in code |
|---|---|
| Email OTP onboarding | `app/(onboarding)/email.tsx`, `app/(onboarding)/otp.tsx`, `server/src/modules/auth/*`, `EMAIL_OTP.md` |
| Name and vehicle onboarding | `app/(onboarding)/name.tsx`, `app/(onboarding)/vehicle.tsx`, `src/components/domain/VehicleForm.tsx` |
| Map, parking zones, route panel | `app/(tabs)/map.tsx`, `src/components/map/*`, `server/src/modules/parking/*`, `server/src/modules/routes/*` |
| Voice destination search | `src/components/map/DestinationSearchBox.tsx`, `src/utils/voice.ts`, `app.json`, `package.json` |
| Trip Needs / shopping along route | `src/components/map/DestinationParkingPanel.tsx`, `src/utils/tripNeeds.ts`, `src/utils/tripNeedsRouting.ts`, `app/(tabs)/map.tsx` |
| Need-Aware vs Shortest route comparison | `src/components/map/CompactRoutePanel.tsx`, `src/components/map/MapSurface.tsx`, `src/components/map/MapSurface.native.tsx` |
| Traffic and road impact | `src/components/map/CompactRoutePanel.tsx`, `src/utils/routeImpact.ts`, `server/src/modules/routes/*`, `server/src/modules/roadReports/*` |
| Road reports and checkpoints | `src/components/map/RoadReportCreationSheet.tsx`, `src/components/map/RoadReportDetailsSheet.tsx`, `app/roads.tsx`, `server/src/modules/roads/*`, `server/src/modules/roadReports/*` |
| Map layers, EV, car services | `src/components/map/MapLayersSheet.tsx`, `src/store/evStationsStore.ts`, `src/store/carServicesStore.ts`, `server/src/modules/evStations/*`, `server/src/modules/carServices/*` |
| Reservations, layout, QR | `app/parking/layout/[zoneId].tsx`, `app/parking/reserve/[zoneId].tsx`, `app/parking/reservation/[id].tsx`, `app/scan.tsx`, `server/src/modules/reservations/*` |
| Wallet, cards, top-up | `app/(tabs)/wallet.tsx`, `app/wallet/add-card.tsx`, `app/wallet/topup.tsx`, `app/wallet/methods.tsx`, `server/src/modules/wallet/*` |
| Parking session, active timer, receipt | `app/parking/start.tsx`, `app/parking/active/[id].tsx`, `app/parking/receipt/[id].tsx` |
| Spoken parking alerts | `app/parking/active/[id].tsx`, `src/utils/voice.ts`, `app/profile/settings.tsx` |
| Activity, vehicles, violations, notifications, profile/settings | `app/(tabs)/activity.tsx`, `app/(tabs)/vehicles.tsx`, `app/vehicles/*`, `app/violations/*`, `app/notifications.tsx`, `app/profile/*` |

## Recording Setup

- Use one prepared Arabic app session if possible, or start from a fresh login.
- Prepare demo data before recording:
  - a valid OTP inbox,
  - one vehicle,
  - wallet balance or default payment method,
  - one parking zone with available spaces,
  - one reservable layout zone,
  - road report/checkpoint data,
  - EV stations and car services imported,
  - one unpaid violation and one notification for quick proof montage.
- Use a destination near Ramallah with useful POIs.
- Suggested Trip Needs text: `دواء + محامص + شوكولاتة`.
- Turn on Arabic UI for most of the video. If English appears in technical captions, keep it short.

## Scene-by-Scene Script

| Time | Scene | Screen recording steps | Arabic voiceover | On-screen caption | Transition |
|---:|---|---|---|---|---|
| 0:00-0:08 | Hook | Start with the map already showing route, parking markers, road alerts, and route panel. Quick zoom/pan. | "في المدن المزدحمة، المشكلة مش بس تلاقي موقف. المشكلة توصل، توقف، تدفع، وتتجنب الطريق الغلط بسرعة." | `ParkFlow: Find. Route. Park. Pay.` | Fast map zoom with sound hit |
| 0:08-0:23 | Real login | Cut to Welcome. Tap Get Started/Login, enter email, show OTP screen, paste 6-digit OTP from email. | "ParkFlow يبدأ بتسجيل دخول آمن عبر Email OTP، بدون كلمة مرور وبدون كود تجريبي ظاهر للمستخدم." | `Secure Email OTP` | Swipe up |
| 0:23-0:35 | Profile setup | Enter full name, add vehicle plate/type/color, continue to map. | "بعدها المستخدم يضيف اسمه ومركبته، لأن كل جلسة موقف مرتبطة فعلياً بسيارة محددة." | `Driver + Vehicle profile` | Match cut to map marker |
| 0:35-0:50 | Map and location | Grant location permission if shown. Show nearby parking, selected vehicle in top bar, zone cards/markers. | "على الخريطة، التطبيق يعرض المواقف القريبة، حالة التوفر، والتكلفة، مع موقع السائق والمركبة المختارة." | `Live nearby parking` | Marker pop animation |
| 0:50-1:05 | Destination and voice search | Tap destination search. Tap microphone. Say or type destination. Select suggestion. | "البحث عن الوجهة ممكن كتابة أو بالصوت. التطبيق يحول الكلام إلى بحث، ثم يجهز المسار مباشرة." | `Voice destination search` | Quick waveform overlay |
| 1:05-1:28 | Shopping along route / Trip Needs | Open shopping list / Trip Needs. Enter `دواء + محامص + شوكولاتة`. Tap Need-Aware Route. Show matched/unmatched summary if visible. | "الميزة الأقوى هنا: مشوارك مش دايماً من نقطة أ إلى ب. ممكن تحتاج دواء، قهوة، أو شوكولاتة بالطريق. ParkFlow يفهم الاحتياج، يبحث عن أماكن حقيقية، ويقترح مسار يمر عليها." | `Need-Aware Route + Shopping List` | Purple line draw |
| 1:28-1:48 | Shortest vs Need-Aware comparison | Show route comparison card: Need-Aware, Shortest, Difference. If red warning appears, tap Show shorter route, then switch back to Need-Aware. Show purple detour legend/segments. | "التطبيق لا يجبرك على الطريق الأطول. يحسب أقصر مسار بالتوازي، يقارن الوقت والمسافة، وإذا في فرق كبير يعطي تحذير أحمر. القرار يبقى للمستخدم." | `Shortest vs Need-Aware comparison` | Split-screen route labels |
| 1:48-2:03 | Traffic and safer route | Show route panel details: traffic level, issue ahead, alternative route buttons if available. Show road report marker on route. | "المسار يأخذ بعين الاعتبار البلاغات والحواجز والازدحام. إذا في مشكلة على الطريق، يظهر تأثيرها ويقترح بديل عندما يكون أفضل." | `Traffic + road impact` | Red warning flash |
| 2:03-2:20 | Road report creation | Tap report button, pick location, choose report type such as congestion/closed road, severity/direction, submit. Then open report detail and show still there/not there buttons. | "والمجتمع يساعد نفسه: السائق يضيف بلاغ طريق خلال ثواني، والآخرون يؤكدون إذا المشكلة ما زالت موجودة." | `Crowdsourced road reports` | Tap ripple |
| 2:20-2:33 | Checkpoints page | Open Roads page, expand a checkpoint, tap a status report. Show points/thanks if available. | "صفحة الطرق تعرض الحواجز وحالتها، وتكافئ البلاغات بنقاط ثقة بعد التحقق." | `Checkpoints + trust points` | Slide left |
| 2:33-2:50 | Map layers | Return map. Open layers. Switch Parking to EV Charging, show station details and route button. Switch to Car Services, choose tire/maintenance/wash category, show details. Briefly show Business Offers as coming soon. | "نفس الخريطة تدعم طبقات متعددة: مواقف، شواحن كهرباء، وخدمات سيارات. والميزات غير الجاهزة تظهر بوضوح كـ Coming Soon." | `Parking · EV · Car Services` | Layer stack animation |
| 2:50-3:10 | Need-Aware Parking recommendation | Return to destination panel, choose Need-Aware Parking. Show recommended parking near destination/needs. Open zone sheet. | "إذا الهدف هو الوقوف قرب الوجهة والاحتياجات، ParkFlow يرتب المواقف حسب القرب العملي، وليس فقط حسب المسافة المباشرة." | `Need-Aware Parking` | Card snap |
| 3:10-3:30 | Reservation and layout | Open parking layout. Select an available spot or auto assign. Continue to reserve. Choose time/duration and confirm. | "قبل الوصول، يمكن حجز مكان. شاشة التخطيط تعرض الأماكن المتاحة، المحجوزة، المشغولة، وخيارات accessible أو EV حسب البيانات." | `Reserve a parking spot` | Grid highlight |
| 3:30-3:43 | QR reservation | Show reservation detail with QR/code. Tap Route to parking. Then open Scan QR from map and simulate/scan a zone code. | "الحجز ينتج QR، والسائق أو بوابة الموقف يمكنها التحقق منه. ويمكن أيضاً بدء الموقف عبر مسح كود المنطقة." | `QR reservation + zone scan` | QR wipe |
| 3:43-4:00 | Wallet and payment | Open Wallet tab. Show balance, add-card/methods quickly, top-up preset, auto top-up toggle. | "الدفع يتم من المحفظة. المستخدم يضيف وسيلة دفع، يشحن الرصيد، ويتابع كل العمليات من سجل مالي واضح." | `Wallet · Cards · Top-up` | Money counter |
| 4:00-4:20 | Start parking | Open selected zone/start parking. Choose vehicle, mode Start/Stop or Prepaid, show total/balance, tap Start Parking. | "الآن نبدأ الجلسة. التطبيق يتحقق من السيارة، الرصيد، حالة الموقف، وطريقة الدفع قبل إنشاء الجلسة." | `Start parking session` | Button press zoom |
| 4:20-4:38 | Active parking and voice alerts | Show Active Parking timer, current cost/time remaining, Extend Parking, Stop Parking. If settings are enabled, mention spoken reminders. Stop session and confirm. | "أثناء الوقوف، يظهر العداد والتكلفة والوقت المتبقي. ويمكن تفعيل تنبيهات صوتية عند قرب انتهاء الوقت أو انتهاء المدة المدفوعة." | `Live timer + spoken alerts` | Timer speed ramp |
| 4:38-4:52 | Receipt and activity | Show receipt. Share/copy if quick. Open Activity tab with parking/payment transaction filters. | "بعد الإيقاف، يحصل المستخدم على إيصال واضح، وتظهر العملية مباشرة في سجل النشاط والمحفظة." | `Receipt + activity ledger` | Receipt tear |
| 4:52-5:07 | Proof montage | Rapid cuts: Vehicles detail/history, Violations evidence/pay/appeal, Notifications mark read, Profile points/settings Arabic/English/theme/voice alerts. | "وباقي الرحلة متكاملة: مركبات، مخالفات واعتراضات، إشعارات، نقاط ثقة، إعدادات لغة وثيم، وكلها مرتبطة بنفس الحساب." | `Vehicles · Violations · Notifications · Settings` | 0.5 sec cuts |
| 5:07-5:20 | Technical close | Return to map with active route/parking markers. Overlay architecture bullets. | "تقنياً، ParkFlow يجمع Expo، خرائط، Speech Recognition، Routing APIs، RBAC backend، Wallet، وCrowdsourced road intelligence في تجربة واحدة جاهزة للعرض." | `Expo + Express + Prisma + Routing + RBAC` | Logo/end card |

If strict 3-5 minutes is required, remove the final 13-second technical close and keep the proof montage under 8 seconds.

## Exact Recording Checklist

1. **Open fresh app**
   - Show Welcome.
   - Enter email.
   - Verify OTP.
   - If already logged in, record a very fast version by logging out first from Profile.

2. **Create or show profile**
   - Enter name if prompted.
   - Add vehicle if prompted.
   - Use a real-looking plate but not a private real plate.

3. **Map**
   - Allow location.
   - Show nearby parking panel.
   - Tap a parking zone.
   - Show availability, tariff, and action buttons.

4. **Destination and voice search**
   - Tap search field.
   - Tap microphone.
   - Speak a short destination or type it if recognition is unstable.
   - Select the destination.
   - Keep caption honest: if typing fallback is used, caption as `Voice-ready destination search`.

5. **Trip Needs / shopping route**
   - Open shopping list.
   - Enter `دواء + محامص + شوكولاتة`.
   - Show:
     - Need-Aware Route,
     - Need-Aware Parking,
     - partial matched/unmatched text if available,
     - route adds/difference text.

6. **Route comparison**
   - Show Need-Aware route on map.
   - Show purple detour segments and legend if available.
   - Show red warning only if the chosen route actually triggers it.
   - Tap `عرض المسار الأقصر`.
   - Tap back to `المسار المراعي للاحتياجات`.

7. **Traffic and road reports**
   - Show any route issue/traffic card.
   - Create a road report:
     - choose location,
     - type: congestion or closed road,
     - severity/direction,
     - submit.
   - Open report detail and show confirmation voting UI.
   - Open Roads page and show checkpoint reports.

8. **Map layers**
   - Open Layers sheet.
   - Switch primary category to EV Charging.
   - Open EV station detail and route button.
   - Switch primary category to Car Services.
   - Change service category and open detail.
   - Show Business Offers as disabled/coming soon for one second only.

9. **Reservations and QR**
   - Open a zone that supports layout/reservation.
   - Tap layout/reserve.
   - Select a space or auto assign.
   - Choose valid time/duration.
   - Confirm reservation.
   - Show QR and route-to-parking.
   - Open Scan QR and use simulate scan if real camera scanning is slow.

10. **Wallet**
    - Open Wallet.
    - Show balance and recent transactions.
    - Show payment methods/add card briefly.
    - Top up using a prepared default method.
    - Show success and updated balance.

11. **Start and stop parking**
    - Open parking start screen.
    - Confirm vehicle.
    - Choose Start/Stop or Prepaid.
    - Start session.
    - Show active timer.
    - Show Extend if prepaid.
    - Stop session.
    - Show receipt.

12. **Final proof montage**
    - Activity tab filters.
    - Vehicles detail/history.
    - Violations detail/evidence/pay/appeal.
    - Notifications list/mark read.
    - Profile points/settings/help/about.

## Arabic Voiceover Full Text

Use this as one continuous read, then cut it scene-by-scene:

"في المدن المزدحمة، المشكلة مش بس تلاقي موقف. المشكلة توصل، توقف، تدفع، وتتجنب الطريق الغلط بسرعة.

ParkFlow يبدأ بتسجيل دخول آمن عبر Email OTP، بدون كلمة مرور وبدون كود تجريبي ظاهر للمستخدم. بعد الدخول، يضيف السائق اسمه ومركبته، لأن كل جلسة موقف مرتبطة فعلياً بسيارة محددة.

على الخريطة، التطبيق يعرض المواقف القريبة، حالة التوفر، التكلفة، وموقع السائق. البحث عن الوجهة ممكن كتابة أو بالصوت، وبعد اختيار الوجهة يبدأ التخطيط.

الميزة الأقوى هنا أن المشوار مش دائماً من نقطة أ إلى ب. ممكن تحتاج دواء، قهوة، أو شوكولاتة بالطريق. ParkFlow يفهم الاحتياج، يبحث عن أماكن حقيقية، ويقترح مساراً يمر عليها.

والتطبيق لا يجبر المستخدم على الطريق الأطول. يحسب أقصر مسار بالتوازي، يقارن الوقت والمسافة، وإذا في فرق كبير يعطي تحذيراً واضحاً. المقاطع البنفسجية توضّح فقط الالتفاف الذي يخدم الاحتياجات.

المسار أيضاً يأخذ بعين الاعتبار البلاغات، الحواجز، والازدحام. والسائقون يساهمون ببلاغات طريق يمكن للآخرين تأكيدها أو نفيها، مع نقاط ثقة عند التحقق.

الخريطة ليست للمواقف فقط. يمكن عرض شواحن الكهرباء، خدمات السيارات مثل الصيانة والإطارات، وطبقات الطريق. الميزات غير الجاهزة تظهر بوضوح كـ Coming Soon.

قبل الوصول، يستطيع المستخدم حجز مكان من مخطط الموقف، اختيار وقت ومدة، والحصول على QR للحجز. ويمكن كذلك بدء الموقف بمسح كود المنطقة.

الدفع يتم عبر المحفظة: إضافة وسيلة دفع، شحن الرصيد، وتسجيل كل العمليات. عند بدء الجلسة، يتحقق التطبيق من السيارة، الرصيد، وحالة الموقف، ثم يعرض عداداً حياً للتكلفة والوقت المتبقي.

وعند انتهاء الوقوف، يحصل المستخدم على إيصال واضح، وتظهر العملية في سجل النشاط. وباقي التجربة متكاملة: مركبات، مخالفات واعتراضات، إشعارات، نقاط ثقة، وإعدادات لغة وثيم وتنبيهات صوتية.

ParkFlow يجمع الخرائط، البحث الصوتي، التخطيط الذكي، بلاغات المجتمع، الدفع، والحجز في تجربة واحدة تساعد السائق على الوصول والتوقف بثقة."

## Captions Pack

Use short, punchy captions:

- `Secure Email OTP`
- `Vehicle-linked parking`
- `Nearby parking availability`
- `Voice destination search`
- `Shopping needs along your route`
- `Need-Aware Route`
- `Shortest Route baseline`
- `User chooses, app does not force`
- `Purple = need detour`
- `Traffic + road reports`
- `Crowdsourced confidence`
- `EV stations`
- `Car services`
- `Coming Soon shown clearly`
- `Reserve by space`
- `QR reservation`
- `Scan zone code`
- `Wallet + top-up`
- `Start parking`
- `Live timer`
- `Receipt + activity ledger`
- `Violations + appeals`
- `Notifications + settings`

## Editing Notes

- Keep each tap visible for at least 0.4 seconds.
- Use 1.1x to 1.25x speed for navigation, but normal speed for route comparison and parking start.
- Blur any real email, OTP, plate number, token, QR value, or payment card data.
- Add small arrows or circles only for important taps: microphone, shopping list, Show shorter route, Reserve, Scan QR, Start Parking, Stop Parking.
- Use one consistent transition style. Avoid heavy effects that hide the UI.
- If a feature depends on missing data during recording, replace it with a 1-second caption: `Data-backed feature: requires imported dataset`, and do not fake a working screen.

## Short 3:30 Cut

For a tighter hackathon reel, use this timing:

| Time | Content |
|---:|---|
| 0:00-0:12 | Hook + OTP login |
| 0:12-0:28 | Vehicle + map + nearby parking |
| 0:28-0:55 | Voice destination + Trip Needs |
| 0:55-1:20 | Need-Aware vs Shortest + purple detour |
| 1:20-1:45 | Traffic + road report + checkpoints |
| 1:45-2:05 | EV + car services + map layers |
| 2:05-2:35 | Reservation + QR + scan |
| 2:35-3:05 | Wallet + start active parking |
| 3:05-3:22 | Stop + receipt + activity |
| 3:22-3:30 | Proof montage + closing logo |

## Final Claim To Use

"ParkFlow is not just a parking app. It is a route-aware, need-aware, payment-ready mobility assistant that helps drivers choose where to go, what to avoid, where to stop, and how to pay, all from one mobile flow."

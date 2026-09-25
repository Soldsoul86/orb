# Mobile Sensing — the Pixel's observable surface

> Status: **research, Phase 3 material. Not a contract, not an implementation.**
> Maps what an Android device can lawfully perceive, and how each signal enters
> Orb through the existing `Sensor` → `Observation` boundary.
> Verified against Android 17 (API 37, June 2026) and Android 16 (API 36).
> See `contracts/Sensor.md`, `contracts/Observation.md`, `CAPABILITY_MODEL.md`,
> `RUNTIME_LOOP.md` §8, `SECURITY.md`.

---

## 0. Scope

`apps/pixel/` is an empty placeholder and this document does not fill it. No
APK is built, no module is scaffolded, no Kotlin is written. The roadmap places
device hosts at item 8 of "Beyond Phase 4", behind Evidence Graph, Storage,
Sync, Twin, Agent Runtime and Capabilities. That ordering is not revisited here.

What this document is: the **capability map** — the catalogue of signals a Pixel
can emit, the platform gates on each, and the honest statement of what each
signal can and cannot tell you. It exists so that when the Pixel host is built,
the sensor set is a decision already reasoned about rather than whatever the
first implementation happened to reach for.

**It proposes no new kernel contract.** Every signal below is an implementation
of `Sensor` v1. Where a signal *would* require a new contract, §8 says so and
stops.

---

## 1. The one legal path

There is exactly one way a phone signal becomes part of Orb:

```
Android API  ──▶  Sensor (Service)  ──▶  Observation  ──▶  Event  ──▶  journal
                  attributed          occurrence,         append-only,
                  never interprets    + confidence        hash-chained
```

This is not a stylistic preference; it is Art. IX §34 (*never bypass the Event
Journal*) and the `Sensor` invariant list. Four consequences bind every row of
every table below:

1. **A sensor emits Observations and Attachments. Nothing else.** "The user
   fell" is not an Observation. "Accelerometer magnitude exceeded 3.1g at
   14:02:11, then no motion for 40s" is. The fall is a *Belief*, derived later,
   revisably, in the Knowledge Plane.
2. **Every emission carries a `confidence` in [0,1]** — the Confidence of
   Reality. It is recorded, never resolved. The proposed values in §4 are
   *proposals about source reliability*, not measurements.
3. **The runtime schedules the sensor; the sensor never schedules itself.** On
   Android this collides directly with the platform's own scheduler (§3). The
   collision is resolved in Orb's favour only in the sense that Orb *records*
   the deferral — it cannot override it.
4. **Reading a sensor is a Capability at tier `Observe`** (`CAPABILITY_MODEL.md`
   §5). Acting on what it sees is a different tier entirely, and §7 is careful
   about that line.

---

## 2. Four gates, not one

Every Android signal passes four independent gates. An implementation that
clears three and not the fourth silently emits nothing — which, under the
`Sensor` contract, is a defect, because deferral must be *recorded*, not
invisible.

| Gate | What it is | Failure mode if ignored |
| --- | --- | --- |
| **G1 — Runtime permission** | The user grants `ACCESS_FINE_LOCATION`, `RECORD_AUDIO`, … Revocable at any time. | `SecurityException`, or silently empty results. |
| **G2 — Foreground service type** | Since Android 14 (API 34) every long-running service must declare a type *and* hold both the matching `FOREGROUND_SERVICE_*` manifest permission and the runtime permission the type implies. | `SecurityException` at `startForeground()`. |
| **G3 — Background-start restriction** | `microphone` and `camera` services **cannot be started while the app is in the background**, nor from a `BOOT_COMPLETED` receiver. `location` cannot start from background without `ACCESS_BACKGROUND_LOCATION`. Since Android 15, most types cannot start from `BOOT_COMPLETED` at all. | The continuous-observation runtime simply never starts after a reboot. |
| **G4 — Power and quota** | Doze, App Standby buckets, and — since Android 15 — a **6-hour-per-24h cap** on `dataSync` and `mediaProcessing` foreground services, tracked separately per type. Android 16 further subjects jobs started from a foreground service to their own runtime quotas, including `WorkManager`. | A "continuous" runtime that stops at hour six and cannot restart itself until the user opens the app. |

**G4 is the finding that matters most.** Orb's `RUNTIME_LOOP.md` §4 assumes "a
long-lived process on each device". On Android that assumption is false as
stated. The runtime host cannot be one perpetual `dataSync` service. It has to
be a **set of typed, individually-justified services** — `location` and `health`
carry no 6-hour cap, `dataSync` does — plus `WorkManager` for the rest, with
every gap between them recorded as a `deferred` transition rather than a hole in
history.

This is not a compromise of the architecture. `Sensor.md` already anticipates
it: the `deferred` state exists precisely for "battery/thermal/offline", and
"deferred is never dropped". Android's quota is simply a fifth constraint of the
same kind. What the architecture requires — and what the map below is designed
to support — is that **the deferral itself becomes an Observation**, so replay
can distinguish "nothing happened" from "we were not permitted to look".

---

## 3. Sideload reality

Relevant now only because it decides what is *possible later*, and because two
gates have moved recently.

- **No Play policy applies to a self-signed personal build.** The Play
  requirements around background location declarations, `specialUse`
  justification, and sensitive-permission review are *store* policy, not OS
  enforcement. A locally installed build faces G1–G4 and nothing else. This is a
  genuine and large freedom for a local-first system.
- **Restricted Settings.** Android blocks apps installed from outside Play from
  being granted Accessibility and Notification Listener access, unless the user
  explicitly clears the restriction per-app in Settings. Both of those are
  high-value observation surfaces (§4.5), and both therefore cost a deliberate
  user action.
- **Developer verification.** Devices shipping with Android 16 QPR2 or later
  preload a verifier that blocks installation of apps from unverified
  developers. A personal build needs a registered signing identity, or an
  install path that the verifier exempts. This is the single most likely thing
  to invalidate a "just sideload it" plan, and it is worth confirming against
  the target device before any APK work begins.
- **`PACKAGE_USAGE_STATS` is not a runtime dialog.** It is granted by hand in
  Settings → Special app access. Same for `SCHEDULE_EXACT_ALARM` on most builds.

---

## 4. The capability map

Grouped by the safety question each group answers, because that is how the user
asked the question. Columns:

- **Gate** — the binding constraint from §2.
- **Bg** — available with the app in the background? (Y / Y\* = only inside a
  correctly-typed foreground service / N)
- **Conf.** — *proposed* Confidence of Reality for the emitted Observation,
  following the scale in `Observation.md`. Proposals, not measurements.

### 4.1 — "Did something happen to my body?"

| Signal | Android surface | Gate | Bg | Conf. | What it cannot tell you |
| --- | --- | --- | --- | --- | --- |
| Raw motion | `SensorManager` — `TYPE_ACCELEROMETER`, `TYPE_GYROSCOPE`, `TYPE_LINEAR_ACCELERATION` | none for normal rate; `HIGH_SAMPLING_RATE_SENSORS` above 200Hz | Y\* (`health`) | 0.95 | Whether the phone was on the body. A phone dropped on tile reads like a fall. |
| Significant motion | `TYPE_SIGNIFICANT_MOTION` (hardware trigger, one-shot) | none | Y | 0.90 | Direction, cause, or who moved it. Very cheap — a good wake source. |
| Step count | `TYPE_STEP_COUNTER` / `TYPE_STEP_DETECTOR` | `ACTIVITY_RECOGNITION` (API 29+) | Y | 0.92 | Whose steps. Counter is since-boot and monotonic — a **reset means reboot**, itself a signal. |
| Activity transitions | Play Services `ActivityRecognitionClient` Transition API | `com.google.android.gms.permission.ACTIVITY_RECOGNITION` | Y | 0.75 | Intent. "IN_VEHICLE" is not "being driven somewhere against my will". Batched and delayed by design. |
| Heart rate | Health Connect `HeartRateRecord` | API 36+: `READ_HEART_RATE`; API ≤35: `BODY_SENSORS`. Background needs `READ_HEALTH_DATA_IN_BACKGROUND` (API 36+) or `BODY_SENSORS_BACKGROUND` (33–35) | Y\* (`health`) | 0.90 | Cause. Elevated HR is exercise, fear, caffeine or a bad sensor contact, indistinguishably. |
| SpO₂ / skin temp | Health Connect | `READ_OXYGEN_SATURATION`, `READ_SKIN_TEMPERATURE` (API 36+) | Y\* | 0.85 | Anything, on its own. Only meaningful against a personal baseline — which is exactly what a Digital Twin is for. |
| Sleep | Health Connect `SleepSessionRecord` | `READ_SLEEP` | Y\* | 0.70 | Whether you were asleep. It is a wearable's *inference*, ingested as an observation of that inference. |
| Fall | **No platform API.** | — | — | — | Android exposes no fall-detection primitive. Wear OS surfaces its own; the phone does not. Any phone-side fall detection is your own classifier over 4.1 row 1 — a *Belief*, not an Observation. |
| Car crash | **No developer API.** Pixel's Personal Safety app uses accelerometer + microphone, and is a privileged system app. | — | — | — | Not readable. Observable only *indirectly* — see §4.5, notification listener. |

### 4.2 — "Where am I, and is that where I should be?"

| Signal | Android surface | Gate | Bg | Conf. | What it cannot tell you |
| --- | --- | --- | --- | --- | --- |
| Fix (fused) | `FusedLocationProviderClient` | `ACCESS_FINE_LOCATION`; background needs `ACCESS_BACKGROUND_LOCATION` **and** FGS type `location` | Y\* | 0.97 (GPS) / 0.6 (coarse) | Whether the phone is with you. Accuracy radius is part of the observation, not a footnote. |
| Geofence | `GeofencingClient` | as above | Y | 0.80 | Precise timing. Dwell/enter/exit events are deliberately delayed and batched for power. Cheaper than polling by a wide margin. |
| Last-known | `getLastLocation()` | `ACCESS_COARSE_LOCATION` | Y | 0.5 | *When*. It may be minutes or hours stale — it must be emitted with its own timestamp, never the read time. |
| Altitude / pressure | `TYPE_PRESSURE` | none | Y | 0.6 | Floor, without calibration. Weather moves it. |
| Local network peers | `ACCESS_LOCAL_NETWORK` (**new in Android 17**) | that permission | Y | 0.7 | Identity. Android 17 closed local-network discovery as a tracking vector; it now costs an explicit grant. |

Note on Play policy, for later: if an app targets Android 17+ and only needs
session-based location, Play requires the **location button** rather than a
background grant, with enforcement anticipated from late October 2026. Not
binding on a personal build; binding the day it is distributed.

### 4.3 — "Is someone or something following me?"

This is the group where Android has moved most, and where the platform does more
for you than any app can.

| Signal | Android surface | Gate | Bg | Conf. | Notes |
| --- | --- | --- | --- | --- | --- |
| Unknown tracker alerts | **OS feature**, not an API. Cross-platform (Google/Apple). Alerts when an unowned tag travels with you; as of July 2026 alerts are faster, "Find Nearby" locates the tag interactively, and a "Temporarily Pause Location" control exists for up to 24h. | — | — | — | The strongest anti-stalking primitive on the device, and Orb cannot call it. Observable only as a notification (§4.5). **Do not reimplement it** — a worse duplicate of a working OS feature is a liability. |
| BLE scan | `BluetoothLeScanner` | `BLUETOOTH_SCAN` (+ `neverForLocation` flag, or location permission) | Y\* (`connectedDevice`) | 0.85 | Raw device presence. Resolvable-private-address rotation defeats naïve "same device seen twice" logic — which is exactly why the OS feature above is worth more than a hand-rolled one. |
| Wi-Fi scan | `WifiManager.getScanResults()` | `NEARBY_WIFI_DEVICES` or location | Y | 0.8 | Heavily throttled in background (a small number of scans per period). Useful as a coarse *place fingerprint*, not as a tracker detector. |
| Companion devices | `CompanionDeviceManager` | user-selected pairing | Y | 0.95 | Presence/absence of *your own* known devices. A clean, low-power proximity signal with an explicit consent model. |

### 4.4 — "Is the device itself under attack?"

The group most often skipped, and the one that matters most for a system holding
a decades-long record of a life.

| Signal | Android surface | Gate | Bg | Conf. | Notes |
| --- | --- | --- | --- | --- | --- |
| Fake cell tower / downgrade | **OS feature.** Android 16 adds a *Mobile network security* page in Safety Center with "Network Notifications" — warnings when the device is on an unencrypted network or when the network requests IMSI/IMEI. Builds on: 2G disable (Android 12), null-cipher block (Android 14), OS notification of identifier requests (Android 15). | — | — | — | **Requires modem support** (IRadio HAL v3.0+); not present on every device. Not an app API. Counters the classic stingray downgrade. |
| Intrusion Logging | Android 16 *Intrusion Detection* API, enabled via Advanced Protection. Logs app installs, screen unlocks, USB/Bluetooth/Wi-Fi connections, partial browsing history; end-to-end encrypted, tamper-resistant, off-device. | system-only | — | — | **Not readable by a third-party app.** For off-device forensics by the user. Architecturally interesting: it is an append-only, tamper-evident device log — the same shape as Orb's journal, built by the OS, and deliberately out of reach. |
| Advanced Protection state | `AdvancedProtectionManager` — `isAdvancedProtectionEnabled`, plus a change callback via `registerAdvancedProtectionCallback` | `QUERY_ADVANCED_PROTECTION_MODE` | Y | 1.00 | Readable. Sources disagree on whether the manager is available from Android 16 or 17 — verify on the target.  A genuine, cheap posture observation: *the user's own protection level, and the moment it changes*. A drop from enabled to disabled that the user did not perform is a first-class alarm. |
| Boot / root integrity | Play Integrity verdicts (`MEETS_DEVICE_INTEGRITY` covers root, unlocked bootloader, system tampering); Verified Boot / dm-verity underneath; hardware-backed key attestation | Play Services; network round-trip to Google | Y | 0.9 | **Verdicts are issued by Google's servers, not the device** — a remote authority, which cuts against Art. VIII §31 if it is ever load-bearing. Usable as an *observation with a named remote source*, never as Orb's root of trust. Since May 2025 an unlocked bootloader fails device integrity by hardware design on Android 13+. |
| App installs / removals | `ACTION_PACKAGE_ADDED` / `_REMOVED` broadcasts; `PackageManager` enumeration | `QUERY_ALL_PACKAGES` is restricted; scoped queries preferred | Y | 1.00 | A new package with Accessibility or Device Admin is the classic stalkerware install. Cheap, high-value, low-noise. |
| Permission / role changes | `PackageManager.checkPermission` polled; Device Admin state | none beyond visibility | Y | 1.00 | *Your own* app's permissions being revoked is itself evidence — and the `Sensor` contract already requires that revocation may be recorded. |
| Screen unlock / lock | `ACTION_USER_PRESENT`, `ACTION_SCREEN_OFF` | none | Y | 1.00 | Unlocks at times you were asleep are a strong signal. Note the OS records this too, in Intrusion Logging, where you cannot read it. |
| USB attach | `UsbManager` broadcasts | per-device consent | Y | 0.95 | A physical-access signal. Correlates with forensic extraction attempts. |
| SIM / carrier change | `TelephonyManager` + `ACTION_SIM_STATE_CHANGED` | `READ_PHONE_STATE` | Y | 0.95 | SIM swap in the physical sense. |

### 4.5 — "What is the device being told?"

| Signal | Android surface | Gate | Bg | Conf. | Notes |
| --- | --- | --- | --- | --- | --- |
| Notifications | `NotificationListenerService` | `BIND_NOTIFICATION_LISTENER_SERVICE` + user grant; **blocked by Restricted Settings for sideloaded apps** until cleared | Y | 0.9 | The **only** route to the OS safety features above: an unknown-tracker alert, a Personal Safety crash prompt, a mobile-network-security warning all surface as notifications. Also the broadest privacy surface on the device — it sees everything. Highest-value / highest-cost row in this document. |
| App usage | `UsageStatsManager` | `PACKAGE_USAGE_STATS`, granted in Settings | Y | 0.95 | Aggregate, bucketed. Not content. A sudden usage pattern at 3am is a signal. |
| Screen content | `AccessibilityService` | user grant; **Restricted Settings** | Y | — | **Recommended against.** It reads everything on screen, it is the exact mechanism stalkerware uses, and it buys little that §4.4 does not. Listed to be explicitly rejected, not to be used. |
| Call state | `TelephonyCallback` / `CallScreeningService` | `READ_PHONE_STATE` | Y | 0.95 | Whether a call is active — including an emergency call the Personal Safety app placed. Metadata only. |
| SMS | `SmsRetriever` (scoped) | `READ_SMS` is restricted; Android 17 further withholds WebOTP-format messages from non-recipient apps for 3 hours | Y | — | Treat as unavailable. Not worth the permission. |
| Ambient audio | `AudioRecord` | `RECORD_AUDIO` + FGS type `microphone`, **and the service cannot be started from the background at all** | N→Y\* | 0.8 | G3 makes continuous ambient audio effectively impossible without a user-initiated start, by design. Also the single most invasive sensor in the catalogue. |

---

## 5. What the platform will not give you

Stated plainly, because a map that omits its own edges is a worse map.

1. **Car crash detection has no API.** It is a privileged Pixel system app using
   accelerometer and microphone. You can observe its *notification*; you cannot
   invoke it or read its confidence.
2. **Safety Check, Emergency SOS, Emergency Sharing have no API.** Same.
3. **Unknown tracker alerts have no API.** Same — and this one you should be
   glad of, because it works cross-platform and a hand-rolled BLE version would
   be defeated by address rotation.
4. **Intrusion Logging is not readable.** By design: off-device, for the user's
   forensics, not for apps.
5. **Mobile network security warnings are not readable**, and depend on modem
   HAL support you cannot assume.
6. **Fall detection does not exist on the phone.** Only on Wear OS, and not as a
   third-party API.

The pattern is consistent and worth naming: **Android's best safety features are
system features, exposed to the user and not to apps.** The only general bridge
between them and Orb is the notification listener — a single, fragile, extremely
broad channel, gated behind Restricted Settings for a sideloaded build. That is
the central architectural fact of mobile safety sensing, and any Pixel host
design has to decide about it deliberately rather than by accident.

---

## 6. Where each row lands in the architecture

Nothing above changes the kernel. Concretely:

| Architectural element | Binding |
| --- | --- |
| Each row in §4 | one `Sensor` implementation, registered with a stable source identity |
| Each emission | an `Observation` with `confidence`, realized as an `Event` on the **Pixel's lane only** (Art. IV §15) |
| Raw audio, images, log blobs | `Attachment`, referenced by content hash, never inlined (`Observation.md` inv. 5) |
| G1–G4 denial or deferral | a recorded observation of *deferral* — `Sensor.md` §3 `deferred`, §7 "permission revoked … the revocation itself may be recorded" |
| "Is the user in danger?" | **never** a Sensor output. A `Belief` in the Digital Twin, grounded in Evidence linking several of the rows above |
| Reading any row | Capability, tier **`Observe`** (`CAPABILITY_MODEL.md` §5) |
| Raising an alarm to a human | tier **`Act (irreversible)`** — see §7 |
| Cross-device availability | the Mac sees Pixel observations only after replication; the Pixel's lane is read-only to the Mac (`SYNC_PROTOCOL.md`) |

---

## 7. Risks

**R1 — This is the stalkerware sensor list.** Every capability in §4 is, item
for item, what covert monitoring software installs. The difference is not
technical; it is structural, and Orb already states it: the user is the root of
trust (Art. VIII §30), the data stays on the user's own devices (§31),
disclosure is minimized, permissioned and recorded (§32), and every action is
recorded with no silent actions (Art. VII §29). Those are not slogans here —
they are the design constraint that decides whether this is a safety system or a
surveillance system. A concrete test follows from them: **if any observation in
§4 can leave the device without the departure itself being an event the user can
read, the design has failed.** §4.5's accessibility row is rejected on exactly
this ground.

**R2 — G4 breaks the "long-lived process" assumption.** `RUNTIME_LOOP.md` §4
says each device runs a long-lived process. Android will not permit one. The
host must be several typed services plus `WorkManager`, and — the part that is
not optional — every gap must be recorded. Otherwise replay cannot distinguish
"quiet" from "blind", and Art. I's promise that history is complete becomes
false in a way that is invisible.

**R3 — A safety alarm is irreversible.** Calling a contact, sharing a location,
or dialling emergency services cannot be undone and is `Act (irreversible)` by
default, requiring explicit scoped authorization. But a person who has fallen
cannot confirm a prompt — which is precisely why the Pixel's own crash detection
*asks first, then acts on silence*. Any Orb equivalent needs that pattern
expressed as `Policy`, and `Policy` has no contract yet (`ARCHITECTURAL_DEBT`).
**This is the one place where the map runs out of architecture**, and it should
not be improvised.

**R4 — Art. XI §42 applies to alarms too.** Orb must never assume an alarm
reached anyone. "SMS sent" is runtime activity; "the contact replied" or "the
call connected" is the Observation that closes the loop. An unconfirmed alarm
leaves reality un-updated and Reflect records the gap — which for a safety
feature is the difference between a system that works and one that believes it
worked.

**R5 — Play Integrity is a remote authority.** Its verdicts come from Google's
servers. Recording them as observations attributed to a named remote source is
fine. Letting them gate anything is Art. VIII §30 violated. Note also that it is
routinely bypassed, so its negative signal is weak evidence in both directions.

**R6 — False positives cost trust, and trust is the product.** A fall detector
that fires on a dropped phone, twice, will be disabled by the user and then
protects nobody. This argues for the architecture Orb already has: sensors stay
dumb and honest, confidence is recorded rather than resolved, and the *decision*
is a belief weighed against a personal baseline in the Twin — not a threshold in
a sensor.

**R7 — Device-verification risk to any future build.** §3: Android 16 QPR2+
devices block unverified-developer installs. Confirm against the actual target
device before committing to a sideload plan.

---

## 8. If it is ever built: the smallest correct first step

Not a proposal to act on now — a record of what the reasoning above concludes,
so the decision is not re-derived later.

**Three sensors, in this order**, chosen because each is background-capable,
cheap, low-noise, and needs no new contract:

1. **Device integrity sensor** — app install/remove, screen unlock/lock, USB
   attach, SIM change, Advanced Protection state and its change callback. All
   §4.4. No FGS, no continuous power draw, no new permission dialogs beyond
   `QUERY_ADVANCED_PROTECTION_MODE` and `READ_PHONE_STATE`. Highest safety value
   per unit of privacy cost in the whole catalogue.
2. **Coarse presence sensor** — geofence transitions plus significant motion.
   Establishes "the phone moved / arrived / left" at near-zero battery cost and
   exercises the `location` FGS type and the `deferred` path honestly.
3. **Deferral sensor** — emits an Observation whenever a gate denies or defers
   any other sensor. Sounds like plumbing; it is the row that makes R2
   survivable and is the reason replay can be trusted.

Explicitly **not** first: microphone (G3 makes it near-useless in background and
it is the most invasive row), accessibility (rejected, R1), continuous raw IMU
(power, and its value is entirely in a classifier that belongs in the Knowledge
Plane).

**Blocked on contracts that do not exist yet:** anything that *acts* on a safety
signal. `Capability`, `Action` and `Policy` are all outstanding debt. Sensing is
unblocked; alarming is not. That boundary is the honest stopping point.

---

## 9. Sources

Platform facts above were verified 2026-09-25 against:

- [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types) — types, permissions, restrictions
- [Foreground service timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout) and [Behavior changes: Android 15+](https://developer.android.com/about/versions/15/behavior-changes-15) — the 6-hour `dataSync` cap
- [Restrictions on starting a foreground service from the background](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)
- [Advanced Protection Mode](https://developer.android.com/privacy-and-security/advanced-protection-mode) — `AdvancedProtectionManager`, `QUERY_ADVANCED_PROTECTION_MODE`
- [Behavior changes: Android 17](https://developer.android.com/about/versions/17/behavior-changes-17) and [Android 17 summary](https://developer.android.com/about/versions/17/summary) — `ACCESS_LOCAL_NETWORK`, WebOTP, ECH
- [Access location in the background](https://developer.android.com/develop/sensors-and-location/location/background), [Minimum Scope: Foreground Location Access and the Location Button](https://support.google.com/googleplay/android-developer/answer/17033915) — Play policy and the Android 17+ timeline
- [Activity Recognition Transition API](https://developer.android.com/develop/sensors-and-location/location/transitions)
- [Health Connect: read raw data](https://developer.android.com/health-and-fitness/health-connect/read-data), [data types](https://developer.android.com/health-and-fitness/health-connect/data-types) — background reads
- [Mobile network security](https://source.android.com/docs/security/features/cellular-security/mobile-network-security) (AOSP) and [Android 16 fake cell tower warnings](https://www.androidauthority.com/android-16-mobile-network-security-3571497/)
- [Android 16 Intrusion Logging](https://www.androidauthority.com/android-16-intrusion-logging-3556876/), [Log your device activity with Advanced Protection](https://support.google.com/android/answer/16927813)
- [Find unknown trackers](https://support.google.com/android/answer/13658562), [Unknown tracker alert updates](https://blog.google/feed/android-unknown-tracker-alerts/)
- [Personal Safety app](https://www.android.com/articles/personal-safety-app/), [Get help in an emergency using your Pixel](https://support.google.com/pixelphone/answer/7055029) — crash detection, Safety Check
- [UsageStatsManager](https://developer.android.com/reference/android/app/usage/UsageStatsManager); Restricted Settings for sideloaded apps; Android 16 QPR2 developer verification

Where a row says "no API", that is the absence of a documented public API as of
the date above — an absence, not a proof. It should be re-checked before it is
relied on.

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

## 9. Degrees of freedom

§4 asks *what can be observed*. This section asks the harder question: **for each
capability, how much of it do I own, and what is left when the platform takes it
back?**

Freedom here is not one number. It is three:

> **who grants it**  ×  **what survives revocation**  ×  **which direction it is moving**

### 9.1 — The grant ladder

Android is usually discussed as one platform. For sovereignty purposes it is
seven, and they are not equally yours.

| Level | Grantor | Who can withdraw it | Examples |
| --- | --- | --- | --- |
| **L0 — Silicon + kernel** | The hardware, through the HAL | Nobody, short of different hardware | `TYPE_ACCELEROMETER`, `TYPE_GYROSCOPE`, `TYPE_PRESSURE`, `TYPE_SIGNIFICANT_MOTION` |
| **L1 — AOSP, unpermissioned** | AOSP | AOSP at a major release | `ACTION_SCREEN_ON/OFF`, `USER_PRESENT`, `PACKAGE_ADDED`, `BOOT_COMPLETED`, USB attach |
| **L2 — AOSP, user-permissioned** | **The user** | The user, at will | `LocationManager`, `AudioRecord`, `BluetoothGatt`, `SensorManager` high-rate, `TelephonyManager` |
| **L3 — Mainline module** | AOSP nominally, **Google operationally** | Google, via a Play system update, between OS releases | Health Connect (`com.google.android.healthconnect`, a HealthFitness APEX), Bluetooth, Permission Controller, Remote Key Provisioner |
| **L4 — Play Services** | Google, closed proprietary binary, auto-updating, **not in AOSP** | Google, silently, at any time | `FusedLocationProviderClient`, `GeofencingClient`, Activity Recognition Transition API |
| **L5 — Remote verdict** | Google's servers, per call | Google, per call, and any network outage | Play Integrity |
| **L6 — System app only** | Google/OEM privileged app | n/a — never yours | Crash detection, unknown tracker alerts, Intrusion Logging, cell-security warnings |
| **L7 — Distribution** | Play policy; device developer-verification | Google, by policy change | Background-location declarations, sensitive-permission review, sideload verification |

**L2 is the constitutionally ideal tier**, and it is worth naming why: at L2 the
grantor *is* the root of trust. Art. VIII §30 says authority lives with the user.
A capability the user grants and can revoke is not a dependency — it is the
architecture working. Everything above L2 replaces the user with a vendor as the
party who decides.

**L3 is the trap.** "Health Connect is part of Android now" reads as a move
*down* the ladder. It is not. A Mainline module ships through Google Play system
updates, which means its behaviour can change between OS releases, on Google's
schedule, on a device you did not update. Being inside the OS image is not the
same as being under your control.

**L4 is undeclared vendor lock-in.** Most Android code reaches for
`FusedLocationProviderClient` without noticing it has just taken a dependency on
a closed, auto-updating, non-AOSP binary. Art. III §11 forbids hardcoding a model
provider. Play Services is a *sensor* provider, and the same law should bind it.

### 9.2 — What each high-tier capability costs, and its freer substitute

The useful finding is that **almost every L4/L5 capability has an L0–L2
substitute**, at a stated price. The price is nearly always *power* or
*accuracy* — never *function*.

| Want | Convenient path | Freest path | What you give up |
| --- | --- | --- | --- |
| Position | `FusedLocationProviderClient` (L4) | `LocationManager` `GPS_PROVIDER` (L2) | Sensor fusion, battery efficiency, indoor/urban-canyon accuracy. You keep position. |
| Place transitions | `GeofencingClient` (L4) | Own hysteresis over L2 fixes, **woken by `TYPE_SIGNIFICANT_MOTION` (L0)** | Power — unless you gate on significant motion, which is the whole trick. Then the gap narrows a lot. |
| Motion class | AR Transition API (L4) | Own classifier over L0 IMU | Google's trained model and its batching efficiency. You *gain* a model tuned to one body — which is what a Digital Twin is for. |
| Heart rate | Health Connect (L3) | **Direct BLE GATT — Heart Rate Service `0x180D`, measurement `0x2A37`** (L2, open Bluetooth SIG standard) | The vendor's cleaned-up data and history. You gain a path that needs no Google module and no vendor app — any strap exposing the standard service works. |
| Device integrity | Play Integrity (L5) | **Keystore key attestation** (L2): `getCertificateChain()`, verify the chain offline against a pinned Google attestation root, read `RootOfTrust` in the hardware-enforced list for `deviceLocked` and `verifiedBootState` | Google's device-reputation database. You gain *offline verification* — no server round-trip at check time. **Caveats, stated honestly:** the chain still roots in a Google key; attestation-key provisioning is itself now remote (Remote Key Provisioner, a Mainline module); revocation checking is an online step; and hardware attestation has been bypassed via leaked keyboxes. Better than L5, not absolute. |
| Fake cell tower | OS warnings (L6, modem-dependent) | `TelephonyManager` cell-info watch (L2): cell ID / LAC / TAC changes, implausible tower transitions, `NETWORK_TYPE` downgrades | Everything the modem knows and won't tell you — cipher state, IMSI requests. You get the classic pre-Android-16 heuristic: weak evidence, honestly recorded as weak. |
| Crash detection | Pixel Personal Safety (L6) | Own threshold over L0 IMU against a personal baseline | Google's accuracy and its tuning across millions of crashes. You own the threshold, and can see why it fired. |
| Tracker detection | Unknown tracker alerts (L6) | Raw BLE scan (L2) | **Do not substitute.** Resolvable-private-address rotation defeats a naïve scanner. This is the one row where the platform genuinely beats anything you would build, it works cross-platform, and a worse copy is a liability. Take the L6 shadow via notification and be glad. |

The pattern: **you can buy your way down the ladder almost everywhere, and the
currency is battery.** That is a much better trade than it first looks, because
Orb is not a real-time system. Art. V §20 — *nothing is live* — means a sensor
that is 90 seconds late and vendor-free is architecturally *preferable* to one
that is instant and owned by Google.

### 9.3 — The four freedoms, in time

A capability's freedom changes across its life. Separating the four is what makes
the question answerable.

| | Freedom | Who decides | Where Orb stands |
| --- | --- | --- | --- |
| **F1** | **Acquisition** — can I get it at all? | User (L2), Google (L3–L5), nobody (L6) | Varies by row; §9.1 is the map. |
| **F2** | **Continuity** — once granted, does it keep producing? | The platform: Doze, App Standby, while-in-use, the 6h `dataSync` cap | **Weakest link.** §2 G4. Mitigated by typed services, not solved. |
| **F3** | **Revocation** — who takes it, how fast, and do I *learn* it happened? | User or Google | Solvable, and currently unbuilt — see below. |
| **F4** | **Retention** — when it is gone, what do I keep? | **You. Entirely.** | **Already maximal.** |

**F4 is the answer to the question as asked.** A platform takes over the *future*
of a capability. It never takes its *past* — provided the past went through the
journal. Append-only, hash-chained, encrypted at rest, replicated across the
user's own devices (Art. I, `SECURITY.md` §3, `SYNC_PROTOCOL.md`). Google can
delete an API in the next release; it cannot reach into a lane and remove what
was already observed. Every observation recorded today is permanently outside
any platform's reach.

That is not a consolation prize. It inverts the usual calculus: **the value of
recording a signal now is not only what it tells you now, but that it is the last
moment the platform cannot revoke.** A capability with a falling derivative
(§9.4) is an argument to start recording *sooner*, not to avoid depending on it.

**F3 has a design consequence that costs almost nothing and is currently
missing.** If a sensor census runs each cycle — enumerate our own granted
permissions, FGS eligibility, Advanced Protection state, Play Services presence
and version — then every loss of freedom becomes *an observation with a
timestamp*. Replay then shows exactly when each capability was withdrawn and by
whom. `Sensor.md` §7 already permits this ("the revocation itself may be
recorded"); nothing yet does it. It converts losing freedom into evidence, which
is the most Orb-native response available.

### 9.4 — The derivative

Freedom has a direction. Android's travel has been consistently one way, and a
capability's *trend* matters more than its current value for anything meant to
last decades.

**Narrowing — do not build a foundation here:**

| Capability | Narrowed at |
| --- | --- |
| Background location | Android 10, 11; Play policy and the location button for Android 17+ targets, enforcement anticipated late Oct 2026 |
| Package visibility | Android 11 (`QUERY_ALL_PACKAGES` restricted) |
| SMS | Long restricted; Android 17 withholds WebOTP messages from non-recipients for 3h |
| Accessibility / notification listener | Restricted Settings, sideload-gated |
| Local network | **Android 17 — `ACCESS_LOCAL_NETWORK` is a brand-new gate on something previously free** |
| Foreground services | Android 14 types → 15 caps and boot restrictions → 16 job quotas |
| Sideload install | Android 16 QPR2 developer verification |

**Stable for a decade or strengthening — safe to build on:**

| Capability | Why |
| --- | --- |
| `SensorManager` IMU | L0. Unchanged in substance since Android 1.5. |
| Screen / boot / package *events* | L1. The events survive; only the freedom to react in background has narrowed. |
| `BluetoothGatt` + SIG standard profiles | L2 + an **open standard body that is not Google**. The single most durable non-trivial row in this document. |
| Keystore key attestation | Strengthened since May 2025 (hardware-backed signals required), not narrowed. |

Note the shape: **everything durable sits at L0–L2, and the most durable thing
here is the one governed by a standards body rather than a vendor.** Orb's
existing law — no vendor lock-in, no hardcoded provider — is the correct
instinct, and §9.2 gives it a concrete sensor-level reading.

### 9.5 — Cross-device arbitrage

The constraints in §2 are the *Pixel's*, not Orb's. Art. IV §14 says devices are
equal peers and §15 says each writes only its own lane — which means **an
observation's value does not depend on which device produced it.** So:

> Put each sensor on the freest device that can see the signal, and let
> replication carry it.

- A **Mac** has no Doze, no foreground-service type system, no 6-hour cap, and no
  Play Services dependency. Anything it can perceive, it perceives more freely.
- A **stationary BLE observer** you own — a Pi with a radio — can watch for
  persistent unknown devices at home continuously, with no phone permission, no
  battery constraint, and no vendor in the path at all. That is an L0 answer to
  an L6 problem, available only because sync makes the device irrelevant.
- The **Pixel's genuine monopoly** is small and specific: it is the device that
  is *on the person*. Body signals, real-world position, and physical proximity
  are its and nothing else's. Everything else is better observed elsewhere.

This reframes the roadmap item. The Pixel host is not "the mobile version of
Orb." It is the sensor for the three things only a carried device can see — and
deliberately *not* the place to put anything another device could observe more
freely.

### 9.6 — What this changes

1. **Add a principle to sensor selection, mirroring Art. III §11:** prefer the
   lowest-level implementation that answers the question. Take a higher-level one
   only when its advantage is decisive (almost always power), and when you do,
   **name the provider in the observation's source identity** — so history shows
   the dependency, and a future migration off it is a query rather than an
   excavation.
2. **The §8 first step is already the high-freedom set** — integrity (L1/L2),
   presence (L2 woken by L0), deferral (internal). That was arrived at on
   privacy-cost grounds and sovereignty grounds independently, which is a good
   sign.
3. **Extend sensor 1 with a self-census** (§9.3 F3): our own permissions, FGS
   eligibility, Advanced Protection state, Play Services presence and version,
   recorded each cycle. It is the cheapest sensor in the catalogue and the only
   one that measures Orb's own freedom.
4. **Revisit the Play Integrity question with an actual answer.** Keystore
   attestation, verified offline against a pinned root, is the
   constitutionally-compatible substitute — with the caveats in §9.2 stated in
   the observation rather than hidden.

## 10. Sources

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
- [Verify hardware-backed key pairs with key attestation](https://developer.android.com/privacy-and-security/security-key-attestation) and [Key and ID attestation](https://source.android.com/docs/security/features/keystore/attestation) (AOSP) — offline chain verification, `RootOfTrust`, `deviceLocked`, `verifiedBootState`; bypass caveat from [Quarkslab](https://blog.quarkslab.com/bypassing-android-hardware-attestation.html)
- [Heart Rate Service](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/HRS_v1.0/out/en/index-en.html) (Bluetooth SIG) — `0x180D` / `0x2A37`
- [Mainline](https://source.android.com/docs/core/ota/modular-system) (AOSP) and [Project Mainline in Android 14](https://www.androidpolice.com/project-mainline-android-14/) — HealthFitness APEX, Google Play system updates

Where a row says "no API", that is the absence of a documented public API as of
the date above — an absence, not a proof. It should be re-checked before it is
relied on.

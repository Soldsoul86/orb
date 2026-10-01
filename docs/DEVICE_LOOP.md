# The Device Loop — strengthen, validate, rule

> Status: **standing process.** Adopted 2026-09-25.
> How Orb's device work proceeds: build the smallest thing, test it against a
> real phone, and turn what the phone says into recorded rulings.
> Governs the validation of `MOBILE_SENSING.md` and `SOVEREIGN_STACK.md`.

---

## 0. Pass 1, summarised — 2026-09-25

*One day, one Pixel 10a on Android 16 (`CP1A.260405.005`), 1475 events. The
detail and its provenance are in §5a–§5k; this is what a reader arriving cold
needs, including the author in three months.*

### The predictions

| | Prediction | Result |
| --- | --- | --- |
| **P0** | A self-signed APK installs today | **Held.** No developer-verification block on this build (§5a) |
| **P0a** | `adb install` bypasses the Play Protect novel-app scan | **Held.** Development builds stay private; only sideloading discloses (§5b) |
| **P1** | `dataSync` is stopped at ~6 cumulative hours | **Refuted.** Ran **6h31m untouched** under *Optimised*, the default (§5h). `specialUse` then ran **13.5 h continuous** after a reboot, and `dataSync` never came back (§5l) |
| **P2** | Nothing resumes after reboot until the app is opened | **Refuted.** `specialUse` reached the foreground **133 s after boot** and recorded 15 clean beats with nobody present (§5k) |
| **P4** | The runtime can record that it was killed or deferred | **Held, in every condition.** Now across a full day: 21.1 h, two services, three reboots, eight process restarts, **zero unexplained** — and the beat counter never skips (§5l) |
| **P3** | A differently-typed service outlasts six hours | **Overtaken.** `dataSync` itself lasted, so the premise was never tested. The types differ elsewhere: at boot (§5k) |
| **P6** | Cheap signals arrive with no foreground service | **Held 2026-09-27, strengthened 2026-09-28 (§7b19).** First shown on a delivery 31m59s after boot (§7b1); now measured at **131 s uptime** on a reboot, matching pass 1's genuine boot deliveries (133 s, §5k) on an app that has never had a service of any kind |
| **P0b** | The novelty scan is declinable on the sideload path | **HELD 2026-09-28 (§7b38).** Play Protect blocked `dev.orb.app` v5 outright — *Harmful app blocked* — and offered **Install anyway**, which worked. The block is declinable, which is all P0b asked. What it cost is a separate finding: on a controlled comparison (same package, same key, same day) v1–v4 with **no permissions** installed silently and v5 with `QUERY_ALL_PACKAGES` was blocked |
| **P12** | `ENABLED_ACCESSIBILITY_SERVICES` is readable with no permission | **Confirmed 2026-09-26** — by two independent APIs |
| **P13** | `ENABLED_NOTIFICATION_LISTENERS` is readable on the same terms | **Confirmed 2026-09-26** — 5 entries, no permission |
| **P14** | Active device admins are enumerable without being one | **Confirmed 2026-09-26** — one active admin returned, no permission |
| **P15** | `ACTION_PACKAGE_ADDED` reaches a runtime receiver inside `specialUse`, as the screen signals do | **Superseded** — pass 2 has no service, so the question became P6 |
| **P16** | A grant enabled while the app is not running is detected at the next process start, from history | **Held 2026-09-28, both directions.** First on the mirror case — two listeners turned off while the process was dead, next `process.start` read `changed: true`, named both in `notificationListenerLost`, 5 → 3, `baseline: false` (§7b2). Then as literally written — two listeners turned **on** while dead, named in `notificationListenerGained`, 3 → 5 (§7b3) |
| **P17** | *(never predicted; measured)* A `signal:…BOOT_COMPLETED` reading means the device rebooted | **Refuted 2026-09-28** — delivered **four times** in one boot session, every event deriving the same boot instant to the millisecond. `elapsedRealtimeMs` is the only field that can date a boot. **Mechanism accounted for:** the operator force-stopped the app and reopened it; three of the four land mid-launch, and the one launch that followed an ordinary process death carries none (§7b2, §7b3, §7b4) |
| **P18** | The settings watch reports a change while the process is alive, with no wake and no launch | **Held 2026-09-28** — the first `settings.changed` readings ever recorded: one `changed: false` 0.9 s after a launch, then `changed: true` 24 s later naming the listener that was re-enabled, 4 → 5. Accessibility and notification listeners only; **device admin has no URI** (§7b3) |
| **P19** | A package broadcast reaches the manifest receiver and is read as `signal:…PACKAGE_ADDED:package:<name>` | **Refuted 2026-09-28.** An app was installed with the process **alive, launched three times and never force-stopped** — proven by `grants.process.start` appearing nowhere in the window — and no broadcast arrived, while the same receiver's `BOOT_COMPLETED` filter fired in the same file. **There is no prompt route for packages**, so the scan is the whole mechanism and §§7b5–7b9's "safety net" framing was wrong. The mechanism of the failure is unknown and recorded as unknown (§7b10) |
| **P20** | A `signal:…BOOT_COMPLETED` at non-zero uptime marks the package **leaving the stopped state** — and is absent after an ordinary process death | **HELD 2026-09-28 (§7b21, §7b23).** Controlled inside one boot session: boot delivery at 131 s, then `low.memory` → no reading, **force-stop with a live process** → reading, `package.updated` → no reading. Three distinct death causes, both readings explained by one rule. First-sight refuted; queue-replay refuted (§7b4–§7b5, §7b10 — only the boot broadcast returns). **Caveat that stays**: a force-stop of an already-dead app is invisible at `exitScope: process` (§7b20), so an absent `user.requested` never means no stop |
| **P21** | *(never predicted; structural)* Comparison against history reports on **endpoints, not intervals** | **Limit, recorded 2026-09-28, narrowed not closed.** A grant given and withdrawn between two process starts reads `changed: false`, so *nothing happened* and *something happened and was undone* are the same record. The installed-package set is now compared against history, and on 2026-09-28 that recovery **ran for real**: an uninstall performed inside a force-stopped window reached no broadcast at all, and the next scan reported it — 484 → 482, both packages named, one alert under `packages-changed` (§7b9). What remains open is unchanged: an install *undone* before the next **scan** is still invisible, and §7b7 widened that window from the next wake to the scan interval in exchange for the battery it was costing (§7b5–§7b7, §7b9) |
| **P22** | The installed-package set is readable, complete under `QUERY_ALL_PACKAGES`, and a package change is caught by comparison at the next **scan** | **Held 2026-09-28 on the device** — `scope: "all"`, **484 packages**, baseline on the first scan, and a second scan reading `baseline: false` **across an intervening observation**, which is `lastOfType(PACKAGES)` proven rather than argued (§7b8). Built as `dev.orb.pass2b` after the update to the installed pass 2 was refused for a signature mismatch. Earlier note: Built, 65 desktop checks and 657 TypeScript tests. Three readings settle it: a `grants.packages` event with `because: "operator.scan"` after pressing the button; `installedPackageBaseline: true` on the first one; then a named entry in `installedPackageGained`/`…Lost` with `scope: "all"` after an install taken with Orb opened first (§7b6, §7b7) |

### What it establishes

**A record that knows the limits of its own reliability.** Not that the runtime
survives — that it can be honest when it does not. Doze froze the heartbeat 47
times, once for 9.6 minutes, and every lost minute is declared. Across a clean
six hours, a crash loop and two reboots, **every gap has an entry beside it.**

**An always-on path exists on this device.** `specialUse` ran 6h31m alongside
`dataSync` and starts itself after a reboot. Neither run needed a human, so
`RUNTIME_LOOP.md` does not need one either — on this device, this build, today.

**It costs nothing to run and something to store.** 0% battery over 6h31m; 598
bytes per event, which is 1.6 MB a day and 0.59 GB a year at the current
cadence. The heartbeat is most of that volume and almost none of the
information.

**The integrity claim was verified off-device.** 1475/1475 envelope hashes and
1475/1475 payload hashes re-derived from stored fields by a machine that did not
write the file — the check the phone cannot make, since `verify()` there is
linkage-only.

### What it corrected in this project's own documents

- `MOBILE_SENSING.md` §2 G4 — the six-hour quota did not fire. Downgraded from
  constraint to condition, then confirmed to be under default settings.
- **G4a added** — `dataSync` is refused by name at `BOOT_COMPLETED`;
  `specialUse` is not.
- **G5 added** — *Manage app if unused* archives an app and strips its
  permissions after months idle. An always-on recorder is precisely an app
  nobody opens. **The first gate a day of measurement cannot reach.**
- `CLAIMS.md` C2 — narrowed from *"any deletion is detected"* to the sequence
  only, with C2d naming the undetectable case.

### What it found in the instrument, by being the instrument

Three defects, each caught by the thing built to catch defects:

1. **The hash chain caught its own author** (§5d). A numeric extractor on a hex
   string forked the chain at every restart. The fork is still at line 4,
   permanently, and every restart since links clean.
2. **An unhandled exception ate its own evidence** (§5i). `dataSync`'s refusal
   killed `specialUse`, which had started correctly — so the first reboot could
   not answer P2. Fixed, re-run, answered (§5k).
3. **The self-test was correct and useless** (§5j). Asking *"is the chain
   perfect?"* meant reporting FAILED forever for a break that can never be
   repaired. It now asks whether anything is new — and the fix itself shipped
   with §5d's bug, a counted offset, caught by a test on first run.

### What is still open

- **P6 and P0b** — untested, and both need a run without a foreground service.
- **G5 (hibernation)** — months to trigger; the device loop has no way to reach
  it.
- **`specialUse` alone, for a long time.** §5k shows 14 minutes after a boot.
  Nothing yet shows six hours that way.
- **`specialUse`'s real cost** — the type needs a manifest justification the
  Play Store reviews and a sideload does not. A path open to an operator may be
  closed to anything distributed.
- **One device, one build, one day.** Everything above is a demonstration that
  something *can* happen on `CP1A.260405.005`, never a measurement of how often.

---

## 1. Why the phone, and not the easy device

The obvious shortcut is to prove the runtime on a Mac, where there are no
foreground-service types, no Doze, no quotas and no install gate. That shortcut
is wrong, and Orb's own law says why.

`MOBILE_SENSING.md` is not a description. It is a set of **predictions** about
what Android permits — assembled from documentation, which is a claim about the
world rather than an observation of it. Art. XI §42 forbids assuming reality
matched an expectation; the loop closes only when something *observes* the
result. A Mac would confirm the runtime works where nothing is hard. It would
say nothing about the four gates that decide whether this is buildable at all.

So the device under test is the device the architecture is for. The document is
the expectation; the phone is the observation; the difference between them is the
finding. That is Reflection (`RUNTIME_LOOP.md` §11) applied to our own design
rather than to the user's life.

---

## 2. The loop

```
Strengthen ──▶ Validate ──▶ Rule ──▶ (back to Strengthen)
```

**Strengthen** — build the smallest thing that makes the next prediction
testable. Not the smallest useful product; the smallest *falsifiable* one. A
pass ends when the build runs on the device, not when it is pleasant to use.

**Validate** — run it against the predictions in §4 and record what actually
happened. A prediction is answered `held`, `refuted`, or `untested`. "Seemed
fine" is not an answer.

**Rule** — every refuted prediction becomes a correction to the document that
made it, recorded and dated, in the same style as the Art. I §2 ruling in
`PARTIAL_REPLICATION.md` §10. A finding that is not written down did not happen.

The loop's output is **not** an app. It is a document set that has stopped being
wrong, and a runtime that is known to survive.

---

## 3. The device under test

| | |
| --- | --- |
| Model | Pixel 10a |
| Android version | 16 (API 36) |
| Install path | sideload, self-signed |

**Deliberately not recorded here: IMEI, EID, serial, phone number, MAC or IP.**
This repository is public. A device identifier in a committed document is a
permanent disclosure that no later commit can retract, and it would be a strange
way to run a project whose subject is minimising exactly that. Where a test needs
an identifier, it stays on the device.

What Android 16 fixes, from `MOBILE_SENSING.md`:

- Health permissions are the API 36+ set (`READ_HEART_RATE`,
  `READ_OXYGEN_SATURATION`, `READ_SKIN_TEMPERATURE`), not legacy `BODY_SENSORS`;
  background health reads need `READ_HEALTH_DATA_IN_BACKGROUND`.
- The Android 15 six-hour `dataSync` cap applies, and Android 16 additionally
  subjects jobs started from a foreground service to their own runtime quotas.
- Advanced Protection exists on this device, so the 16-vs-17 uncertainty about
  `AdvancedProtectionManager` (§4.4) is directly settleable — P5.
- Mobile network security and Intrusion Logging exist as OS features, neither
  with an app-facing API.

---

## 4. The predictions

Each is a claim this project currently relies on. Each names what changes if it
is false, because a prediction whose refutation changes nothing was not worth
testing.

### Pass 1 — can the runtime survive, and does it know when it didn't?

**P0 — A self-signed APK installs on this device today. — HELD, 2026-09-25.**
*Source:* `MOBILE_SENSING.md` §3 — devices shipping with Android 16 QPR2 or later
preload a verifier that blocks unverified-developer installs.
*Result:* installed and ran, by the tap-the-file path, on build
`CP1A.260405.005` (security patch 2026-04-05). **No developer-verification block
appeared.** See §5a for what did appear, which was not predicted.

Whether the verifier is absent from this build or merely has not reached this
device is not determinable from the device alone, so the claim in
`MOBILE_SENSING.md` §3 is **not refuted — it is not yet applicable.** The
practical consequence is the one that matters: the door is open today, and the
window argument in §7 R1 stands and is now dated. An update may close it.

**P1 — A `dataSync` foreground service is stopped at roughly six cumulative
hours per 24, and cannot be restarted from the background. — REFUTED,
2026-09-25.** See §5h. One process ran **6h31m untouched** with `dataSync`
foreground throughout and was never stopped. §2 G4 does not hold on this device,
this build, this day — and the design simplifies, subject to the uncontrolled
variable in §5h.

**P2 — Nothing resumes after a reboot until the user opens the app. — REFUTED,
2026-09-25, §5k.** Observation resumed **by itself**: `specialUse` reached the
foreground 133 seconds after boot and recorded 15 consecutive beats with none
skipped, while nothing opened the app. The first attempt (§5i) was confounded by
our own unhandled exception; with that fixed, the measurement came through.
*The consequence is the opposite of the one predicted:* the human is **not**
necessarily part of the runtime, and continuous observation across a reboot is
achievable on this device.

**P3 — A `location`- or `health`-typed foreground service runs past six hours.**
*If false:* there is no long-running option at all on this device, and the host
must be `WorkManager`-only with much coarser cadence.
*Partly overtaken, 2026-09-25.* §5h showed **`dataSync` itself** running 6h31m,
so the premise that a different type is needed for duration has not been tested
because it has not been needed. §5k found the types differ somewhere else
entirely: at boot, where `dataSync` is refused by name and `specialUse` is not.

**P4 — When the system kills or defers us, we can record that it happened, when,
and why. — HELD, 2026-09-25, and re-held decisively in §5h.** Over 391 minutes,
332 beats were delivered and 59 were declared skipped: **391 accounted for, zero
unexplained**, independently for both services.
*This is the prediction the architecture depends on.* Everything else is a
capability question; this one is an honesty question.
*If false* — if the process can die without leaving a trace — then a history with
holes is indistinguishable from a quiet one, `PARTIAL_REPLICATION.md`'s declared
horizon is unenforceable on this device, and the design needs rethinking rather
than adjusting.

**P6 — Cheap integrity signals arrive in the background without a foreground
service.** `ACTION_USER_PRESENT`, `PACKAGE_ADDED`/`_REMOVED`, USB attach.
*If false:* even the cheapest sensor in the catalogue needs a service, and the
first-sensor recommendation in `MOBILE_SENSING.md` §8 is wrong.

**P0a — `adb install` bypasses the Play Protect novel-app scan. — HELD,
2026-09-25.** A package the device had never seen (`dev.orb.probeb`, fresh
signing key) installed over USB with no dialog at all. **Development builds stay
private; only the sideload path discloses.** See §5b.

**P0b — the scan is declinable on the sideload path.** *Untested, and downgraded
by P0a.* It no longer blocks development; it decides only whether a build can
reach a phone without a cable and without going through Google first. Worth
answering before anything is ever handed to someone else.

### Pass 2 — is the capability map accurate?

P10 and P11 are recorded here before anything can test them, because
`THREAT_MODEL.md` §7a rests on assumptions about this device that nobody has
checked. An unchecked assumption written as a prediction is honest; the same
assumption written as a fact is not. Both need the instrument to change, so
neither moves while pass 1 runs (§7 R4).


**P5 — `AdvancedProtectionManager.isAdvancedProtectionEnabled` is readable on
Android 16 with `QUERY_ADVANCED_PROTECTION_MODE`.** Settles the hedge in §4.4.

**P7 — Restricted Settings blocks the notification listener for a sideloaded app
until cleared by hand.** Decides whether the only bridge to the OS safety
features (§5) costs one deliberate user action or is unavailable.

**P8 — Key attestation verifies offline.** `getCertificateChain()` yields a chain
carrying `RootOfTrust` with `deviceLocked` and `verifiedBootState`, verifiable
against a pinned root with no network call. This is the substitute for Play
Integrity in `MOBILE_SENSING.md` §9.2; if it does not work here, that row is
wrong. It is also the prediction `THREAT_MODEL.md` §7a rests on: that section
describes what attestation asserts, and nothing has checked it on this device.

**P10 — Android Protected Confirmation works on this device.** The TEE signs a
statement that a human confirmed *specific text* on a display the app cannot
draw over.
*If true:* the consent gate in `CLAIMS.md` C1 becomes hardware-backed, and two
of its six routes close outright — **A4** (approve a dry run, then change an
argument) and **A5** (batch into a moment of inattention) — because the signature
commits to the bytes actually shown. A better answer to `THREAT_MODEL.md` R5
than sensor attestation, and the attestation-adjacent capability worth chasing
first.
*If false:* consent stays an app-level dialog that anything with the same
privileges can draw over, and C1 narrows to what software can promise itself.
*Recorded as a question, not a fact.* Believed available from API 28 with patchy
support — believed is not measured, which is what this loop is for.

**P11 — the journal's signing key can live in StrongBox on this device, and P8's
attestation can name it.**
*If true:* a truncate-and-re-sign needs physical possession of the device, and —
the part that matters — *someone else can check that*, which is what makes
`ERASURE.md` §2a mean anything to anyone but the owner. Unattested, "my key is
in secure hardware" is a claim; attested, it is checkable.
*If false:* key custody is a claim the owner makes about themselves, and
`CLAIMS.md` C2c depends entirely on witnesses.
*Distinct from P8:* that one asks whether a chain verifies offline; this asks
whether the key the journal actually signs with can be the attested one.

### Pass 3 — does the architecture hold across devices?

**P9 — The phone syncs to the Mac over `SyncPeer`, and the prune guard permits a
drop only after the Mac actually holds custody.** The first test of
`PARTIAL_REPLICATION.md` against two real devices rather than two objects in one
process.

---

## 5. Pass 1 scope

The smallest build that answers P0–P4 and P6. Explicitly **not** a safety app.

**What it is:** one cheap sensor — screen unlock, package added, USB attach —
appending to a local journal, plus a deferral sensor recording every gate denial
and every service stop, plus enough of the journal to append and verify.

**What it is not:** no evidence graph, no twin, no reasoner, no alarms, no UI
beyond "is it running and what has it recorded". Those need `Capability`,
`Action` and `Policy` to be accepted first, and they are Drafts.

**Shape.** The phone is a **thin peer**, not a second Orb: observe, append, speak
`SyncPeer`. The Mac holds everything else and receives by replication. That is
what the port was built for, and it keeps the Kotlin surface small enough that
the second journal implementation cannot quietly drift into a second
interpretation layer.

**Success is not "it works."** Success is: after a week of ordinary carrying, the
journal can be replayed and every gap in it is explained by a recorded deferral.
A week with no gaps and no deferrals means the instrumentation is wrong, not that
the phone behaved.

---

## 5a. Finding — the gate is a scan, not a signature check

The predicted obstacle was identity: an unverified *developer* being refused.
What actually stood in the way was novelty, and the remedy was disclosure.

The sequence on 2026-09-25, tapping the file in Files by Google:

1. **Install unknown apps** — "Allow from this source" for Files. Expected.
2. **Google Play Protect — "App scan recommended."** *"Play Protect hasn't seen
   this app before. To protect your device and data, send this app to Google for
   a security scan."* Offered: **Scan app** / **Don't install app**.
3. **Google Play Protect — "This app looks safe."** Install proceeded.
4. The app ran.

**The finding, stated carefully.** On this build, installing a self-signed APK
that Google has not seen before was gated on **sending the APK to Google**. The
two options presented were to scan or to abandon the install; whether a decline
path exists behind "More details" was not tested (P0b).

**Why it matters here more than it would elsewhere.** This is an egress event, in
a project whose subject is deciding what leaves the device. The artifact
containing everything the app does is uploaded to a third party as a condition of
running it on hardware the user owns. That is not a criticism of Play Protect,
which is doing something sensible for most people — it is a fact that belongs in
`SOVEREIGN_STACK.md`'s ladder, because it is a rung nobody had counted:

> **The build itself is subject to the same egress question as the data.**

A private build is not private until P0b says it can be. If the scan cannot be
declined, then either development moves to `adb` (P0a), or every iteration of
Orb's phone host is disclosed to Google before it ever observes anything.

**A second observation, incidental but not trivial.** The device reports security
patch **2026-04-05** — roughly five months old at time of test. That is almost
certainly *why* P0 held, and it means this result describes a device that is
behind, not a device that is current. It should be re-tested after the next
update, and R1's window is narrower than it looks.

---

## 5b. Finding — privacy of the build is a property of the install path

P0a settles what §5a raised. The two paths are not variations of one mechanism;
they are different mechanisms with different disclosure consequences.

| Path | Mechanism | Novel app is | Disclosure |
| --- | --- | --- | --- |
| Tap the file | session installer, via Files | scanned by Google before installing | **the APK is uploaded** |
| `adb install` | direct, over USB | installed | **none** |

**So the loop can run privately.** Every iteration of Orb's phone host can be
built, installed and tested over a cable without the artifact ever leaving the
two machines that made it. That is a materially better position than §5a
implied, and it means the disclosure question only arrives at distribution —
which this project may never reach, since a personal runtime has an install base
of one.

### The cost, which is not nothing

`adb install` requires **USB debugging enabled**, and that is a standing
weakening of the device. A phone with developer mode on is meaningfully easier
to extract data from with physical access — which is precisely the threat
`MOBILE_SENSING.md` §4.1 and §4.4 were written to detect.

So the private install path and the security posture this project exists to
protect are in direct tension, and the tension is not resolvable by cleverness.
Two consequences, both worth carrying forward:

1. **Developer mode is itself an integrity signal.** "USB debugging is enabled"
   belongs in the device-integrity sensor alongside app installs and USB attach,
   because for any device *not* being developed on it is an anomaly worth
   raising. Orb's own development posture should trip Orb's own alarm — and the
   alarm firing correctly on its author's phone is the cheapest honest test of
   whether it works at all.
2. **The development device is knowingly degraded** and should not be treated as
   representative of a carried, protected phone. Findings about battery, kills
   and deferral transfer; findings about the device's security posture do not.

### Addendum, 2026-09-25 — the operator is turning developer mode off

Chosen deliberately, and it is the right call for a phone that is meant to carry
a life rather than a build. Two consequences follow, and the first undoes part
of what P0a bought:

- **Every future install goes through the scan.** `adb` is the only path that
  bypassed it (§5b). A device without developer mode installs by tapping the
  file, which means each build is uploaded to Google before it runs. P0a's
  finding stands as a fact about Android and stops being a fact about *this*
  project: "development stays private" is true only for a workflow that uses a
  cable, and this one will not.
- **The journal needed a way out.** Since Android 11 the Files app cannot browse
  another app's `Android/data`, so `adb pull` was the only route off the device.
  The probe now exports to Downloads on demand, and records the export as an
  event before performing it.

**No prediction is lost.** P1, P2, P3, P4 and P6 are all answerable from the
phone alone — the six-hour run, the reboot, a package install with the services
stopped, a force-stop and reopen. Only `logcat` corroboration goes, and that was
convenience rather than evidence: the probe was built to record its own death
precisely so it would not depend on something watching from outside.

The device is also no longer knowingly degraded, which makes its posture
findings meaningful again.

---

## 5c. Finding — targeting API 36 draws under the system bars

Incidental, cheap, and exactly the kind of thing the loop exists to catch before
it matters. The first pass-1 build put its controls behind the status and action
bars, where they could not be tapped. The probe installed, ran, recorded and
exported correctly — and could not be started.

Apps targeting SDK 35 or higher draw edge to edge whether they ask to or not, so
a fixed top padding is wrong by however much the system bars happen to occupy on
that device. Fixed by asking the window for its insets rather than guessing a
number that would be wrong on the next phone, and by dropping an action bar that
carried no function.

Worth recording for two reasons beyond the fix. It cost an install cycle, and on
a phone without developer mode an install cycle means another upload to Google
(§5b) — so a layout bug now has a disclosure cost, which is not a sentence
anyone expects to write. And it is the first finding that came from *using* the
instrument rather than from reading about the platform, which is the whole
argument for §1.

---

## 5d. Finding — the tamper-evidence caught its own author

The probe's first real run reported `line 4: chain broken`, and it was right.

`Journal.restore()` read the lane's head hash with the **numeric** extractor
rather than the string one. A hash begins with a hex character, the numeric
extractor stops at the first non-digit, so it returned null every time. `head`
stayed null, and the first append after any process restart claimed no
predecessor — forking the chain at every restart, silently, forever.

**Nothing external found this.** No test, no review, no reading of the platform
documentation. The hash chain found it, on its author's phone, within three
minutes of the services first running — and it found it as what it was, an
unexplained discontinuity, which is the same signal it would raise for
tampering.

That is the strongest evidence so far that the journal design is worth what it
costs. `SECURITY.md` §5 argues hash chaining makes silent rewriting detectable;
this is that property working before anyone was trying to attack anything, on a
defect that would otherwise have produced a week of history in two disconnected
halves with nothing to indicate it.

**Three changes followed.**

1. The extractor bug is fixed, so a restarted process continues its chain.
2. `verify()` now reports **every** break rather than stopping at the first. A
   single known break earlier in the file would otherwise hide every one after
   it, which is precisely when a hidden break matters most.
3. A lane whose head cannot be resolved on open now records
   `probe.chain.discontinuity` before anything else. A journal that cannot link
   to its own past must not look as though it did, and an unexplained break
   sitting next to its explanation is worth far more than a clean-looking file.

**The existing break stays.** Art. I forbids rewriting history to make it look
tidy, and the break is a true record of what happened. `verify()` will keep
reporting it, and now reports anything after it too.

**Verified on the device, 2026-09-25 10:24.** The fixed build restarted the
process to install itself — precisely the event that used to fork the chain —
and the journal still reports exactly one break, at line 4. A restart thirty
events later produced none. The old break remains visible behind the new
events, which is what change 2 was for: had `verify()` still stopped at the
first break, this confirmation would have been impossible to obtain from the
device at all.

---

## 5e. Findings from the first exported journal

74 events, 17 minutes, read independently against its own hash chain. All 74
`payloadHash` and all 74 envelope `hash` values verified, which confirms the
encoding on the device matches the recipe the vectors pin (§7 R2).

**The `"35"` link, root-caused.** The break at line 5 carried a `previous` of
the literal string `"35"`. The reading offered was a persisted head lagging the
store and being truncated on reload; the actual cause is simpler and worth
recording precisely, because the two would be fixed differently.

`restore()` read the head hash with the **numeric** extractor, which consumes
digits and stops at the first non-digit. Line 4's hash began `c23c88bb…`, so it
returned null and the loop walked *backwards*; line 3's hash began `35…`, so it
returned those two digits and stopped. Hence a link that is both truncated and
stale, and hence intermittent — whether it fires at all depends on the first
character of a SHA-256. Fixed in §5d before this journal was read; the later
restarts at lines 30 and 68 link correctly in this same file, which is the fix
working.

**Heartbeat drift, and a design error behind it.** Both services beat at
60.00–60.07 s except one at 65.9 s, immediately after an export, slipping both
services identically and **permanently**. Two causes, both mine: the export did
file I/O on the main looper, which both services share, and the beat re-posted
a constant interval *from the end of each beat* — fixed delay, so any single
stall shifts every later beat forever.

Now a fixed **rate**: the schedule advances on its own clock and the beat
reports `lateByMs` and `skippedBeats`. A skipped beat is the smallest unit of
"we were here and could not observe", and it belongs in history rather than
being silently absorbed by the cadence.

**The gap threshold was wrong, and would have cost P4 its first evidence.**
Four process starts, no stops — every death silent, exactly what P4 exists to
catch — and **no `probe.gap.inferred` was recorded for any of them**, because
each gap was around 90 seconds and the threshold was 135.

That threshold was a mistake of category. `reconstructGap()` only ever runs when
a *new process* is starting, and a new process whose predecessor recorded no
stop is a discontinuity **whatever its length**: the old process was observing,
then it was not, and nothing said so. A duration gate belongs to detecting a
stall *within* a living process, which is what `skippedBeats` now does. The gate
is gone; the duration is recorded as a property, and a short gap is flagged
rather than dropped.

This is the most valuable finding in the pass so far, and it is one the probe
could not have produced about itself: it required reading a journal against the
predictions rather than watching the instrument appear to work. It had been
running, beating steadily, looking healthy, and silently failing the single
prediction it was built for.

**Minor.** The export's `events` field was taken before the export event was
appended and read as a line count that was one short; renamed to
`eventsBeforeThis`. Identical signal payloads share a `payloadHash` because they
carry no timestamp — correct, since the envelope hash still differs. Screen-off
periods never exceeded ~45 s, so this pass does not exercise Doze.

---

## 5f. First full journal read — P4 held, and the run has not started

97 events, 10:17–10:39 IST, verified independently against the recipe in
`runtime/journal/src/integrity.ts`.

**Integrity: 97/97 payload hashes and 97/97 envelope hashes verify.** One chain
break, at line 4 — the known `previous='35'` from §5d. The three later restarts
(lines 29, 67, 91) all link correctly, so the `restore()` fix is now confirmed
three more times in a file that also still carries the original defect. A
journal that shows both the bug and its repair in the same verified chain is a
better artefact than a clean one.

### P4 — HELD

`probe.gap.inferred` at 10:39:27: **47.1 s**, last event a heartbeat, flagged
`shortGap: true`, `confidence 0.6`.

The data also settles the §5e argument rather than merely supporting it. Every
gap in this run:

| Restart | Gap | Old 135 s threshold |
| --- | --- | --- |
| 10:19:54 | 93.0 s | missed |
| 10:24:48 | 48.4 s | missed |
| 10:33:35 | 34.9 s | missed |
| 10:39:27 | 47.1 s | **recorded** (gate removed) |

**Four silent deaths, and the old build would have recorded none of them.** Not
a threshold that was slightly too high: one that would have missed every case in
the sample.

### P1, P2, P3, P6 — all still untested, and one of them is my fault

- **P1 and P3.** No `probe.service.timeout`. The longest process lived about six
  minutes against a six-hour cap.
- **P2.** No reboot. `elapsedRealtime` climbs monotonically across all five
  starts — the device has been up roughly 13 days.
- **P6.** Zero manifest-registered signals, **and that is not a refutation.**
  All 34 signals are runtime-registered (`SCREEN_ON/OFF`, `USER_PRESENT`,
  `POWER_CONNECTED`). The manifest receiver listens for `BOOT_COMPLETED` and
  package changes; no reboot happened and no third-party app was installed or
  removed, so nothing that *should* have produced a manifest signal occurred. An
  absence with no corresponding attempt is untested, not refuted — the same
  distinction `PARTIAL_REPLICATION.md` §5 insists on for a partial replica.

### The finding that matters most

**Four of the five process deaths were caused by me installing a new build.**
Only the first — 10:18, after `TRIM_MEMORY_BACKGROUND`, with no services
running — was Android reclaiming the process.

So **no process running foreground services has yet been left alone long enough
for the platform to do anything to it.** The instrument is now validated; the
experiment has not begun. Everything in this journal is the instrument
describing its own construction.

That is §7 R4 arriving on schedule — the loop becoming the product. The
correction is not another build. `ACTION_MY_PACKAGE_REPLACED` would be a genuine
addition, and it waits for pass 2, because shipping it now would restart the
process, upload another APK to Google, and reset the clock on the only
prediction that needs six uninterrupted hours.

**Stop improving the instrument. Start the run.**

### Heartbeat drift, measured

Fixed-delay scheduling costs a consistent **60–70 ms per beat** — about 21 s of
cumulative drift over six hours — and the 65.86 s beat after the 10:29:55 export
shifted every subsequent beat permanently, from `:54` to `:00`. Both services
slipped identically, confirming the shared main looper.

This run predates the fixed-rate build, so **the fix is shipped but unverified.**
The next run's `lateByMs` and `skippedBeats` are its test.

**Answered 2026-09-26 (§5l): verified.** Median `lateByMs` is 60 ms, the same
per-beat cost as here — but it no longer accumulates. The beat returns to its
slot after a disturbance instead of walking permanently. Read the median, not
the mean: the mean is doze time, which is declared, dragging an average.

---

## 5g. Finding — the instrument was untested, and one comment was false

**2026-09-25, off-device.** Not a device finding: the phone was untouched
throughout, the pass-1 run continued, and nothing was rebuilt or reinstalled.

The probe's Java had no automated tests. `runtime/journal` has 441; the code
that actually decides what this project's history says had none, and the one
silent data-corrupting defect found so far (§5d) was in it. That defect reached
a real run and had to be caught by the hash chain rather than by a test.

`apps/pixel/pass1/tests/run.sh` now runs the shipped sources on a desktop JVM —
43 checks. `Journal` touches Android in exactly one place, a `Context` asked for
a directory, so a fake `Context` on the test classpath runs `src/` unmodified.
Nothing in `src/` is conditioned on being under test; what the tests exercise is
what the phone runs.

**The §5d regression test was verified by failing.** Reintroducing the defect in
a scratch copy — `extract` in place of `extractString` — fails the suite in
under a second. A regression test that has never failed pins nothing, which is
rule R2 in `CLAIMS.md` applied to this project's own tests.

**Confirmed on a second machine, 2026-09-25.** The operator ran both the clean
suite and the negative control on their MacBook Air, from a fresh checkout with
nothing installed beyond a JDK and `python3`. 59 checks green; the canonical
encoder produced byte-identical output and identical digests against the pinned
vectors on different hardware, a different JDK build and a different default
locale. That is two independent machines agreeing with the TypeScript runtime —
and **not** an answer for ART, which is neither of them, and which is why the
on-device self-test in §7b exists.

The negative control failed four checks there and five here. Neither count is
the reproduction: `extract` scans digits only, so what the defect does depends
on the first character of a head hash, which varies with the wall clock and the
random event id. A digit-leading hash yields non-null garbage and the chain
forks **silently**; a letter-leading one can leave the head unresolved and the
journal declares itself discontinuous. Only `chain verifies across 20 restarts`
fails on every run — 19 breaks in 20 events — because the chain forks either way.

The quiet path is the one that matters, and it is the one the device actually
took in §5d: the chain forked at every restart while the probe reported nothing
wrong. A defect that announced itself would not have needed a hash chain to be
found. Recorded in `apps/pixel/pass1/README.md` so a differing failure count is
not later read as a differing result.

### What the tests found, which is worth more than the tests

`verify()` checks **linkage only**: each event's `previous` against the recorded
hash of the line before it. It never re-derives a hash from the stored fields.

So the chain as shipped is evidence against **deletion, insertion, reordering,
and a forked restart** — which is exactly the class §5d fell into, so the §5d
result stands unchanged. It is **not** evidence against **alteration in place**:
an edit that changes what an event says happened, while leaving the hash fields
alone, verifies clean. `JournalTest` asserts that as a passing test, so the
limit is recorded rather than implicit.

`verify()`'s own docstring claimed the opposite — that it "deliberately
re-derives from the stored fields rather than trusting them". That comment was
false, and a comment asserting a security property the code does not have is how
the next reader re-derives the wrong conclusion. Corrected. `CLAIMS.md` C2a made
the same overclaim and is corrected too.

Re-derivation needs a JSON parser the probe does not have. It is not being added
now (§7 R4), and the desktop analyser is the better home for it regardless: a
chain checked only by the device that wrote it is the weaker check — the same
argument that makes tail truncation undetectable single-device in `CLAIMS.md`
C2c.

---

## 5h. The pass-1 run — 1410 events, and what they settle

**2026-09-25, 10:17–17:10 IST.** Exported `orb-pass1-20260925-171046.txt`, 1410
events, read off-device.

### Integrity, checked by a machine that did not write the file

| Check | Result |
| --- | --- |
| Envelope hashes re-derived from stored fields | **1410 / 1410** |
| Payload hashes re-derived | **1410 / 1410** |
| Linkage (`previous` = predecessor's hash) | 1409 / 1410 — **one break, at line 4** |

This is the check the phone **cannot** perform. `verify()` on the device is
linkage-only (§5g); it never recomputes a hash from the stored fields, so
alteration in place passes there. Recomputing off-device closes `CLAIMS.md` C2a
for this file — and demonstrates the point C2c rests on: *a chain checked only
by the device that wrote it is the weaker check.*

### The one break is the old defect, preserved

Line 4 carries `"previous": "35"`. Line 2's hash is `35bc0525b7bb`: the digit
prefix, read back by the numeric extractor. **That is the §5d defect's
signature**, written at 10:19:54 by the build that still had it.

Everything from line 5 to line 1409 links perfectly, across **four further
process starts**. So the fix is verified over four real restarts and seven
hours — and the fork it replaced is still sitting in history, immutable,
exactly where it happened. The chain kept the evidence of its own author's bug.

### P1 — refuted

One process, from 10:39:27 to the export at 17:10:46. Between event 96 and event
1341 there is **nothing but heartbeats and signals**: no process start, no
service start, no gap, no timeout. Both services report `serviceUptimeMs` of
**6.52 hours** at the final beat.

The last foreground interaction was the export at **10:39:33**. From there to
17:10:46 is **6h31m with the app never brought forward**, and `dataSync` ran
throughout. The cap did not fire.

**The uncontrolled variable — checked, 2026-09-25, and it was not the
explanation.**

`Settings → Apps → Orb pass 1 → App battery usage → Allow background usage` reads
**Optimised** — *"Optimise based on your usage. Recommended for most apps."* —
with `Unrestricted` **not** selected, and `Allow background usage` on, which is
also the default.

So no exemption was ever granted. **`dataSync` ran 6h31m under ordinary battery
management on a default-configured app.** The refutation stands without the
hedge: on this device and build, `MOBILE_SENSING.md` §2 G4's quota did not fire
under the conditions a normal user would have.

Still one device, one build, one day. But not one *specially configured* device,
which is what the caveat was there to guard against.

**And it cost nothing.** App battery usage reads **0% since last full charge**
after 6h31m of continuous foreground service, 706 heartbeats and 680 signals.
Rounded to whole percent, and the window may not span the whole run — but it
answers the operator's question about whether an always-on recorder can be
negligible, in the affirmative, with a measurement rather than an argument.

**Storage is the cost that is not negligible.** 598 bytes per event, so 1.6 MB
per day and **0.59 GB per year** at the current two-services-per-minute cadence.
Another argument for the event-driven design and a coarser ticker: the heartbeat
is most of that volume and almost none of the information.

### P4 — held, and more tightly than the prediction asked

The prediction was about the runtime noticing it had been **killed**. What the
run produced is stronger: the process was never killed, and it recorded being
**frozen** instead.

Doze deferred the heartbeat 47 times by more than 90 seconds, the longest by
**9.6 minutes**. Every one of those is declared:

| | dataSync | specialUse |
| --- | --- | --- |
| Elapsed | 391.0 min | 391.0 min |
| Beats delivered | 332 | 332 |
| Beats declared skipped | 59 | 59 |
| **Accounted for** | **391** | **391** |
| **Unexplained** | **0** | **0** |

Every minute of six and a half hours is covered either by an observation or by a
recorded absence. That is the property the whole architecture rests on, measured
rather than argued — and it only exists because §5f's fixed-**rate** correction
made a skipped beat something the instrument counts instead of something it
silently loses.

### The finding nobody predicted: the notification is not a liveness signal

At **16:48:16** both services recorded `probe.service.taskRemoved` — the app's
task was cleared from recents. The operator then reported seeing **no Orb
notification at all** and assumed the run had ended.

It had not. **The services kept beating for another 22 minutes**, through to the
export.

So on this device: the task leaving recents does not stop a foreground service,
and the foreground-service notification can be absent while the service runs.
**Anything that treats the notification as evidence of liveness is wrong**, and
the only trustworthy liveness signal is the journal itself. Recorded because the
operator nearly ended a good run on that reading, and because pass 2 must not
instruct anyone to check the shade.

### What the run did not test

- **P2 (reboot)** — the device never rebooted; `elapsedRealtime` rises monotonically.
- **P3** — both service types survived, so nothing distinguishes them. The half
  that mattered is answered anyway: `dataSync` itself was not capped.
- **P6** — signals arrived in volume (252 `SCREEN_OFF`, 252 `SCREEN_ON`, 172
  `USER_PRESENT`, 2 power connect/disconnect), but a foreground service was
  running the whole time, which is the condition P6 excludes.

The screen counts also say the phone was **used normally** throughout, which
makes this a realistic carry test rather than a device left face-down on a desk.

---

## 5i. The reboot — what came back, and what killed it

**2026-09-25.** Operator rebooted at 17:20 IST, waited 15 minutes without
opening the app, then exported. 32 new events.

| Time | Event |
| --- | --- |
| 17:18:30 | Last heartbeat before shutdown |
| ~17:18:52 | Boot (derived from `elapsedRealtimeMs`, not from the reported clock) |
| 17:21:45 | `BOOT_COMPLETED` delivered at 172 s uptime; process starts; **194 s gap recorded** |
| 17:21:45 | `probe.boot.restart` → `outcome: "requested"` |
| 17:21:50 | Process dies and restarts — **4.7 s gap recorded** |
| 17:21:50 | `specialUse` `service.start`. **No `dataSync` start, ever** |
| 17:35:10 | Operator opens the app — **800 s gap recorded** |

**Zero heartbeats in 13.3 minutes.**

### What the prediction got wrong

P2 assumed nothing would arrive. **The boot broadcast works**: a
manifest-registered receiver was delivered at 172 seconds of uptime, and the app
learned the phone had rebooted without anyone touching it.

### `outcome: "requested"` is a false positive, and that is our bug

`startForegroundService()` does not throw at the call site. The denial arrives
later, *inside* the service, when it calls `startForeground()`. So
`SignalReceiver` recorded a success for something that had not happened yet, and
the field means **"the request was accepted for delivery"**, not "the service
started".

`probe.boot.restart` therefore cannot answer the question it was written to
answer. Recorded as a defect in the instrument, not a finding about the platform.

### `dataSync` did not start; `specialUse` did

No `probe.service.start` was ever written for `dataSync`. That append sits at
`HeartbeatService.java.in:108`, **after** `startForeground()` at line 100, with
nothing catching in between — so an exception there writes nothing and takes the
process down. A process death 5 seconds later fits exactly.

`specialUse` wrote its `service.start`. **It worked.** Then it died anyway,
because it shares a process with `dataSync`, whose unhandled exception killed
both.

### So one leg of this is confounded, and the claim must say so

**We cannot conclude `specialUse` fails at boot.** The evidence says it
succeeded and was killed by our own missing `try`/`catch` in a sibling.

That matters more than the rest of this section: **if `specialUse` starts at boot
and `dataSync` cannot, the always-on path exists** — the host simply must not
attempt `dataSync` at boot. Today's data hints at exactly that and does not
establish it, and the difference between those two is the whole reason this loop
exists.

### The fix, made 2026-09-25 — not shipped

Three defects, all in the instrument rather than the platform:

1. **`startForeground()` is now wrapped.** A refusal is caught, its exception
   class and message journaled on `probe.service.start` as
   `outcome: "refused"`, and the service stops cleanly with
   `START_NOT_STICKY`. **A service that may not start no longer takes its
   sibling down with it** — which is the confound above, removed.
2. **`probe.service.start` gained an `outcome`.** `"foreground"` or
   `"refused"`, written where the answer is actually known, plus the
   `foregroundType` so the record says which type was refused rather than
   leaving it to be inferred from the service name.
3. **The boot receiver asks for each service separately**, and records each
   answer separately. One try/catch around both meant a throw on the first left
   the second unasked, so a type that boots could never be observed booting
   behind a type that does not. Its `outcome` is now `"accepted"` rather than
   `"requested"`, because accepted-for-delivery is all a call site can honestly
   claim.

Compiles against `android.jar` API 36; the desktop suite still passes. **Not
built into an APK and not installed** — it ships with pass 2, and until then P2's
`specialUse` leg stays confounded and is written that way.

### P4, three times in one reboot

194 s, 4.7 s, 800 s. Every gap inferred and recorded, including the 13 minutes
during which the runtime was blind and nothing else in the system knew. The
honesty property is now demonstrated across a clean six-hour run, a crash loop,
and a reboot.

---

## 5j. The self-test was correct, and useless

**2026-09-25.** The pass-2 build shipped with `SelfTest` and the operator's
screen immediately read:

```
events: 1445
chain:  1 break in 1445 events, at line 4
self:   FAILED "chain.linksEndToEnd"
```

Everything there is true. Line 4 is the §5d fork (§5h), the phone's Java
verifier and the off-device Python one agree on it exactly, and **it can never be
repaired** — Art. I forbids editing history and the E2/E3 ruling forbids removing
it.

So the check would have read `FAILED` for the rest of this journal's life.

**A check that always fails is worse than no check.** It teaches its reader to
dismiss it, and the day something genuinely breaks it looks identical to months
of noise they have learned to ignore.

This is the same family as the three distinctions that decided designs earlier
today — `closed` not *complete*, *unavailable* not *none*, *cannot check* not
*failed the check* — with a fourth member: **failed for a reason already known
and permanently true.**

### The fix

The question is now *"has anything broken since I last looked?"*

`Journal.chainBreaks()` returns break **positions**, which are durable — an
append-only file never moves a line, so a break at 4 is at 4 forever, while the
rendered sentence carries an event count that changes on every append.
`SelfTest` compares them against the previous `probe.selftest` event.

**The baseline lives in history, not in a file beside it.** State belongs where
every other durable fact in this system lives (Art. I §3), and a separate
baseline file would be precisely the second trail the operator's ruling forbids.

A first run has nothing to compare against, records `chainBaseline: true`, lists
the breaks it found, and passes. That is honest, and it is also the one moment an
already-damaged journal goes unremarked — stated rather than hidden.

**It is not tamper detection and must not be read as such.** Whoever can append
to the journal can record a new break as known. `SelfTest` is a regression and
liveness check; the tamper claim rests on off-device re-derivation and on
witnesses (`CLAIMS.md` C2a, C2c).

### And the fix contained §5d's bug again

`lastKnownBreaks` read the recorded value with a counted offset — `at + 16` for a
15-character key — so it silently dropped the first digit and no baseline ever
matched. The test caught it on first run.

**Same class as §5d**: a hand-rolled extractor with a magic number, in a file
whose whole purpose is to notice when something is wrong. It now derives the
offset from `key.length()`, so the literal cannot drift from the number again.

Twice in one day, in two different files, by the same author. The lesson is not
*be more careful* — it is that ad-hoc string parsing keeps producing this, and
the probe has no JSON parser because it has no dependencies. Recorded as
`ARCHITECTURAL_DEBT.md` material for the production host, which is Kotlin and
should never inherit this.

---

## 5k. The reboot, measured — P2 refuted, and the always-on path exists

**2026-09-25.** The §5i fix installed at 17:47, phone restarted at ~17:47:30,
untouched for 15 minutes, exported at 18:04.

| | |
| --- | --- |
| `BOOT_COMPLETED` delivered | 17:49:52, **133 s after boot** |
| First heartbeat | 17:49:52 — the same second |
| Process starts after boot | **none.** The app was never opened |
| `specialUse` | 15 beats, max gap 60 s, **zero skipped** |

### Android said it in words, because we caught the exception

```
probe.service.start  service: dataSync
  outcome:  refused
  error:    android.app.ForegroundServiceStartNotAllowedException
  message:  "FGS type dataSync not allowed to start from BOOT_COMPLETED!"
  foregroundType: 1

probe.service.start  service: specialUse
  outcome:  foreground
  foregroundType: 1073741824

probe.service.stop   service: dataSync  cause: onDestroy  beats: 0
```

`dataSync` is **refused by name** at boot. `specialUse` is not. And `dataSync`
stopped cleanly rather than crashing the process, so it **did not take
`specialUse` with it** — the §5i confound, removed, and the measurement came
through on the first attempt afterwards.

This is the loop working exactly as it is supposed to: a defect in the
instrument produced an ambiguous result, the defect was fixed, and the re-run
answered the question that the first run could only hint at.

### What it settles

**The always-on path exists on this device.** `specialUse` survived 6h31m
alongside `dataSync` (§5h) *and* starts itself after a reboot. Nothing in the
two runs required a human.

`RUNTIME_LOOP.md` does not need the human in it after all — on this device, this
build, today.

### What it does not settle, stated plainly

- **Fourteen minutes is not six hours.** This run shows `specialUse` recording
  cleanly for 14 minutes post-boot. §5h showed it running 6.5 hours *alongside*
  `dataSync`; nothing yet shows it running long after a boot, alone.
- **The battery-optimisation setting is still unrecorded** (§5h). It remains the
  uncontrolled variable across both results.
- **`specialUse` carries a cost this journal cannot see.** The type requires a
  written justification in the manifest, and on the Play Store that is reviewed.
  A sideloaded personal build is not. So this path may be available to the
  operator and not to anything distributed — which is a distribution question,
  not a platform one, and belongs in `MOBILE_SENSING.md` rather than here.

### The other half of the reboot

`gap.inferred` fired again for the 145-second shutdown, and the two process
starts around the APK install are both explained. Across three runs today — a
clean six hours, a crash loop, and two reboots — **every gap has an entry next
to it.** P4 has not failed once.

---

## 5l. A full day — 2303 events, and the honesty property across a reboot

**2026-09-26, 01:52 UTC.** `orb-pass1-20260926-072249.txt`, 2303 events spanning
**21.1 hours** from 09-25 04:47 to 09-26 01:52. Re-derived off-device against
`runtime/journal`.

### Integrity

**2303 of 2303 envelope hashes and 2303 of 2303 payload hashes re-derive.** One
linkage break, between lines 4 and 5 — the §5d fork, unchanged and permanent.
HLC strictly increasing across every event, through **three reboots and eight
process restarts**. No HLC regression anywhere, which is the property a reboot
is most likely to break.

### P4 across a whole day — zero unexplained

**The beat counter never skips.** Zero jumps on either service: every beat a
service intended to write, it wrote. That is the strongest form of the claim,
and it is stronger than the accounting below, because a counter jump would mean
a beat was lost without anything noticing.

| | span | beats | declared skips | delta |
| --- | --- | --- | --- | --- |
| `dataSync` | 419 min | 361 | 59 | **−1** |
| `specialUse` | 1262 min | 940 | 294 | +28 |

`dataSync` has **zero** intervals losing a whole beat undeclared. `specialUse`
has exactly one: the 31.4-minute reboot window at 11:48:30, where the process
died, so `skippedBeats` could not carry it — the counter had reset. It is
declared by the other mechanism instead: **five `gap.inferred` events totalling
31.0 of those 31.4 minutes.** The residue is the boot itself.

So the honesty property now holds across a clean six-hour run (§5h), a crash
loop (§5i), a reboot (§5k), and a full day of ordinary use. Two mechanisms,
covering each other exactly where the other cannot reach: `skippedBeats` while
the process lives, `gap.inferred` when it does not.

### The new result — 13.5 hours continuous, and `dataSync` never came back

The 11:51 reboot reproduced §5k exactly: `dataSync` refused with
`ForegroundServiceStartNotAllowedException` (`foregroundType=1`), `specialUse`
accepted (`foregroundType=1073741824`).

What is new is what followed. **`dataSync` never returned.** From 12:19 the
journal runs on `specialUse` alone for **13.5 hours**, with one process restart
at 18:49. More than double the 6h31m of §5h, on the one service type that
survives boot. The system did not merely permit the always-on path — left alone,
it converged on it and stayed there.

### Drift — the fixed-rate fix is verified, and an earlier figure here was wrong

§5f asked for this directly: *"the fix is shipped but unverified. The next run's
`lateByMs` and `skippedBeats` are its test."*

**Median `lateByMs` is 60 ms on `specialUse` and 59 ms on `dataSync`** (excluding
windows over 60 s, which are doze, not drift). That is the same per-beat cost
§5f measured before the fix — but under fixed-rate it **does not accumulate**.
Across the last 7.6-hour stretch the beat stays pinned at `:52` for runs of ten
and more, and the 25 distinct second-values over 337 beats are re-pinnings after
a doze window, not a walk. Pre-fix, one 65.86 s beat shifted every subsequent
beat permanently from `:54` to `:00`. Post-fix, the beat returns to its slot.

The *mean* `lateByMs` is 26 s, and quoting that would be wrong: it is doze time,
which is declared, dragging an average. The median is the statistic that answers
the question asked.

### The signals — 950 of them, and the first thing here about a person

| count | signal |
| --- | --- |
| 357 | `SCREEN_OFF` |
| 357 | `SCREEN_ON` |
| 223 | `USER_PRESENT` |
| 11 | power connected / disconnected |
| 2 | `BOOT_COMPLETED` |

**223 unlocks in 21 hours.** That is not a fact about the instrument. It is the
first thing in this journal that is a fact about a day, and §7 R4 is explicit
that pass 2 fails without one. The raw material is already arriving on the
always-on path, recorded event-driven while the phone is awake — which is the
§5h principle holding: *don't ask the phone to wake up; record when it is
already awake.*

### Method — two analyses that produced a false alarm

Recorded because both are easy to repeat and both looked like a serious P4
failure before they were checked.

1. **Counting only `gap.inferred`.** Skips are declared *in the beat payload*
   (`skippedBeats`, `lateByMs`), not as separate events. Counting events alone
   reported 129 undeclared holes where there was one.
2. **Treating both services as one beat series.** Two services beating once a
   minute each, interleaved, invent a hole wherever they alternate. The series
   must be split by `payload.service` before any interval is measured.

A third, subtler: **summing sub-beat lateness as "drift"** smears declared doze
time across every beat and produced a figure ~75× the real one. Lateness is a
per-beat measurement with a long tail; it is read with a median, never a sum.

---

## 6. What a finding does

| Outcome | What happens |
| --- | --- |
| Prediction held | Recorded as confirmed, with the date and the device. The claim stops being a claim. |
| Prediction refuted | The document that made it is corrected, dated, and the old text kept in the commit message rather than silently replaced. |
| Prediction untestable | Recorded as untestable **with the reason**. An absence of result is a result. |

Findings never accumulate in someone's memory or in a chat log. The same rule
the runtime lives under applies to the project: if it is not in the journal —
here, the repository — it did not happen.

---

## 7. Risks of this loop

**R1 — The window may be closing.** P0 is not a formality. If developer
verification reaches this device in an update, a sideload path that works today
may not work next quarter. That argues for testing P0 immediately and for
establishing a signing identity early, not for hurrying the rest.

**R2 — Two journal implementations.** TypeScript on the Mac, Kotlin on the phone.
The contracts make this legitimate — implementations are replaceable, the
contract is not — but two implementations can disagree. Mitigation: the phone's
journal does append and sync only, never projections, so there is no second
interpretation to diverge. Shared test vectors across both should arrive with
pass 3.

**Arrived two passes early, 2026-09-26.** `apps/pixel/pass1/tests/vectors.json`
pins both envelope formats from both sides — v1, and v2 in its two branches,
computed by the TypeScript encoder so that Java agreeing with them means
something. The fixture states no coarse type: each side derives it with its own
rule, so one check pins the rule and the bytes together. A negative control
found the hole that made an earlier version of those tests worthless — they
canonicalised the fixture's own objects, so an encoder consistent with itself
and wrong against the other passed everything.

**R3 — Validating on one device proves one device.** A Pixel 10a on Android 16 is
not Android. Findings are recorded against *this* device and version, and never
generalised into "Android does X" without a second device saying so. The same
discipline as `MOBILE_SENSING.md`'s standing rule: a demonstration on a stated
date against a stated version is never a rate.

**R4 — The loop can become the product.** Three passes of instrumentation and no
observation of the user's actual life would be a failure even if every
prediction were answered. Pass 2 should end with at least one signal that is
useful to a person rather than to this document.

**Started 2026-09-26 — `apps/pixel/pass2`.** *What currently holds power over
this device, and what changed:* accessibility services, notification listeners,
device admins. `MOBILE_SENSING.md` §4.4 rates a new package with Accessibility
or Device Admin **the classic stalkerware install — cheap, high-value,
low-noise**, at no permission cost.

The occasion was measured rather than imagined. An accessibility service was
enabled on this phone that day; a payment app detected it within hours and
refused to run; **the pass-1 journal contained no record that anything had
happened.** `CLAIMS.md` C1 route A6 — a path Orb does not mediate — arriving as
an event rather than a hypothesis.

That service was the operator's own experiment, and the approach behind it has
since been discarded (`DECISIONS.md` DR-2: Orb will not request accessibility).
The gap it exposed is unaffected — this signal is about what *other* apps gain,
so it outlives the story that prompted it.

**A separate package, because pass 1 is still running.** §8 criterion 4 wants a
week of carrying and the run is at about a day; P6 is untested. R4 above forbids
changing the instrument mid-run and §5h priced it. A second app restarts
nothing, and takes `Json` from pass 1 at build time rather than copying it, so
R2's one encoder stays one encoder.

Logic tested on the desktop, 27 checks, three negative controls. **Nothing has
run on the device**, so P12–P16 are predictions and §7 R3 stands.

**P12–P14 answered first, by a throwaway — `apps/pixel/probe-grants`.** Pass 2's
signal is worthless if any of the three reads is impossible, and its Android glue
would then have been written against an assumption. So the glue waits: a separate
zero-permission APK (its own package id, its own key, no services, no journal)
reads the three sources once and prints what it got. It declares no
`<uses-permission>` at all, because each prediction is of the form *readable with
no permission* and a single permission line would answer a different question;
`aapt2 dump badging` printing no permission rows is the experiment's control. A
second control reads the settings database file directly and **must fail** —
without it, three CONFIRMED lines would be unfalsifiable, since a probe that
reported success regardless would look exactly the same.

**The scoring rule is fixed before the result, because one chosen afterwards is
not a test.** Three outcomes are kept apart: *threw*, *absent* (`null` — never
set, or withheld, and the call cannot say which), and *value* (possibly empty).
**An empty answer confirms nothing.** An empty list handed to a permissionless app
is byte-identical to a full list being filtered out of it, so it scores
INCONCLUSIVE. Only entries actually handed over confirm. What turns an empty
answer into a *falsification* is the operator's independent knowledge that an
entry exists — three checkboxes, unchecked by default, ticked against what the
Settings screens show, rather than a hardcoded claim that would go stale the
moment a service was switched off and would then read a correct empty answer as
an alarm. This is §5d's distinction once more: *cannot check* is not *failed the
check*.

The probe also reads accessibility through `AccessibilityManager` as well as
through `Settings.Secure`, so a falsification can be attributed to one API or to
the platform. If the setting is withheld but the framework list works, the signal
survives and `Grants` changes source; if both fail, pass 2's first signal as
designed is impossible, and the nearest honest substitute — *installed*
accessibility services via `PackageManager` — is a weaker fact that would have to
be named as such rather than quietly swapped in.

33 desktop checks, three negative controls verified to bite. Still nothing has run
on the device.

### P12–P14 on the device — 2026-09-26

Pixel 10a (`stallion`), Android 16, API 36, security patch 2026-04-05, build
`CP1A.260405.005`, read at 11:53 IST by `dev.orb.probeg`, a package declaring no
permissions. §7 R3: a finding against *this* device and *this* build.

**The control held.** A direct read of `/data/system/users/0/settings_secure.xml`
failed with `EACCES (Permission denied)`. The successful reads below went through
the framework and not around it, so they are facts about what Android hands a
sandboxed app rather than about a sandbox that was not there.

**P13 — confirmed.** `Settings.Secure.getString("enabled_notification_listeners")`
returned 555 characters, five entries, to an app holding no permission. Each was
matched by the operator against the Settings *Allowed* list rather than read off
its package name: **Pixel Stand** (`dreamliner`), **Android Auto** (`gearhead`),
**Android System Intelligence** (`com.google.android.as`), the **Pixel Launcher**
(`nexuslauncher`), and **Play Protect** (`com.google.android.odad`). Two things
follow. The read works, so the signal is buildable; and the baseline on an
untouched phone is five entries, all Google, which is what makes a sixth worth
an event. The stalkerware case `MOBILE_SENSING.md` §4.4 describes is exactly a
non-Google name appearing in that list.

*Corrected 2026-09-26.* An earlier version of this paragraph named `dreamliner`
as the Android Auto dashboard. That was inferred from the package name and it was
wrong — the same mistake in miniature as every other artefact in this section:
something that was not read being written down as if it had been. Package names
are not evidence of what an app is; the Settings screen is.

**A revocation was then observed**, which is worth more than the naming fix.
Operator-reported, from a run of the probe this session did not see the file for:
at 15:25 the list held five entries (555 characters); Pixel Stand was switched
off; at 15:26 it held four (442 characters), with `dreamliner` the only name
missing. So a **grant being taken away is visible to a zero-permission app on
this device**, by hand and end to end, which is half of what pass 2 exists to
emit — `MOBILE_SENSING.md` §4.4's note that *your own app's permissions being
revoked is itself evidence* now has a measurement behind it. It also settles the
naming: the entry that vanished is the app that was switched off.

**P12 — inconclusive, and the first run scored it wrong.** Both reads came back
empty: the setting, and `AccessibilityManager.getEnabledAccessibilityServiceList`.
The operator had ticked *an accessibility service is On*, so the probe printed
FALSIFIED twice — but the context read directly underneath showed
`accessibility_enabled = 0`, meaning none was. The accessibility experiment of
that morning had been switched off. Three independent indicators agreed with each
other and the checkbox was the outlier.

So the probe was wrong about the operator, not about the platform, and the fault
was the design's: it took a human claim as ground truth while reading an
independent witness to the same fact and doing nothing with it. **Fixed by
surfacing the disagreement, not by resolving it.** When the claim and the master
toggle disagree the reading now scores `UNSCORED` — the verdict replaced, not
accompanied, since a FALSIFIED line printed beside a warning is the line that
gets quoted. Deciding in the device's favour would have been a guess dressed as a
measurement; the operator settles it by looking at the screen again.

P12 needs one more run with an accessibility service actually enabled. Until then
it is not a fact about Android, only a fact about a phone with nothing to report.

**P14 — open.** `DevicePolicyManager.getActiveAdmins()` returned **`null`** —
not an empty list, not a `SecurityException`. That is the `absent` outcome, and
it is genuinely undecidable from inside the app: *no admin is active* and *the
list is withheld from you* arrive as the same value. It needs the operator to
read the Device admin apps screen; that answer turns the same `null` into a
confirmation of "none" or a falsification.

**What it cost to be careful.** Two of the three verdicts in the first run were
artefacts of a checkbox rather than findings, and both were caught by evidence
the probe had already printed. The rule that an empty answer scores INCONCLUSIVE
did its job — it is the reason P12 was not quietly written up as a confirmation
when the device returned nothing.

**Second run, 12:12 IST, with the accessibility service switched back on.**

**P12 — confirmed, by both routes.** `Settings.Secure` and
`AccessibilityManager.getEnabledAccessibilityServiceList` each returned the same
44 characters, one entry, `app.orb/app.actionlock.guard.PayGuardService`, to an
app holding no permission — and this time `accessibility_enabled` read `1`, so
the operator's claim and the device agreed and the reading was scored rather than
held. Pass 2's first signal is buildable as designed: **an app can see which
accessibility services are enabled on the phone it is running on, with nothing
granted to it.** Which is the finding in both directions — it is what lets Orb
notice a silent install, and it is what let a payment app notice Orb's own guard
within hours on 2026-09-26.

Two independent APIs agreeing also settles the fallback question the first run
left open: `Grants` can read either, so the choice is free rather than forced.

**P13 — unchanged, confirmed.** The same five Google listeners.

**P14 — still open, and the checkbox was wrong a second time.** The Device admin
screen on this phone lists **Find Hub** and **Repair mode** with *both toggles
off*. No admin is active, so `getActiveAdmins()` returning `null` is the correct
answer and tells us nothing: on a device with nothing to enumerate, "none active"
and "withheld from you" are the same `null`. The operator ticked the box because
the screen was not empty.

That is a trap in the instrument, not in the operator. A screen that lists
candidates whether or not any is switched on invites exactly that reading, so the
checkbox now says **"a toggle is ON (the screen lists apps even when all are
off)"**, and the probe reads the installed admin receivers as context —
separating *which packages are visible* from *which are active*, since from
outside the two failures look alike. Settling P14 needs one admin actually
enabled; until then it stays open rather than being written up from a `null`.

**Twice now the human claim has been the weakest input.** Both times the device
was already carrying the contradiction and the probe was not using it. The
accessibility case is guarded by the master toggle; the admin case had no
equivalent, and it is the one that slipped again. The lesson is not that the
operator is unreliable — it is that **a claim with a corroborant gets checked and
a claim without one gets believed**, so a probe that must ask a human something
should be built around what the device can independently confirm.

**Third run, 13:21 IST — the admin was switched on, and the run is still
unusable.** The operator enabled Find Hub's device-admin toggle, and the
screenshots show it on. The readout says `read at 13:21:38` and the exported file
is named `132354` — **two minutes and sixteen seconds apart**, because the screen
rendered once on launch and the export wrote whatever that render had produced.
The Settings trip happened in between. So the `null` in that file was read at a
moment whose admin state cannot now be established, and the FALSIFIED line it
carries is not a finding about Android.

That is the third consecutive verdict produced by the instrument rather than the
platform, and the first two have a shape the third completes:

1. A claim with no corroborant was believed (the accessibility mis-tick).
2. A label invited a wrong claim (the Device admin screen lists apps that are off).
3. **A readout was allowed to be older than the device it describes.**

Each one presented an artefact of how the probe was *operated* as a measurement
of what was *read*. The fix for the third is the same kind as the other two —
remove the way to get it wrong rather than ask the operator to be careful: the
screen now re-reads in `onResume`, so returning from Settings always shows
current state, the export re-reads before writing, and the file carries an
`exported at` line beside `read at` so any gap is visible in the artifact itself.

**One thing the third run did establish**, independent of the timing:
`PackageManager.queryBroadcastReceivers(DEVICE_ADMIN_ENABLED)` returned **two**
entries — `com.google.android.repairmode` and
`com.google.android.gms/…MdmDeviceAdminReceiver`. Package visibility is not the
obstacle: the probe can see the candidate admin receivers. Whatever `null` means
for `getActiveAdmins()`, it is about the *active set* and not about the packages
being hidden. That narrows P14 without settling it.

**Fourth run, 14:08 IST — the staleness fix holds and the checkbox finally fails
visibly.** `read at` and `exported at` are the same second, so that defect is
closed. And the readout shows the accessibility box *unticked* on a device whose
`accessibility_enabled` reads `1` with `PayGuardService` in the list — the guard
caught it and printed UNSCORED three times instead of a verdict. Working as
built. But it is the fourth run in which what the operator ticked and what the
device held were different things, and P14 was still being scored from the tick.

**So the tick comes out of P14 entirely.** `DevicePolicyManager.isAdminActive` is
public, takes any component, needs no permission, and does not require being that
admin. Asked once per installed admin receiver, it is a second permissionless
route to the fact `getActiveAdmins()` reports in bulk — and the two together
decide what a `null` enumeration means with no human in the loop:

| per-component | enumeration | verdict |
| --- | --- | --- |
| some admin active | nothing | **FALSIFIED** — the list is withheld, not empty |
| some admin active | the same admins | **CONFIRMED** |
| none active | nothing | **INCONCLUSIVE** — correct, and proves nothing |
| none active | entries | **UNEXPLAINED** — neither read can be trusted |
| did not answer | any | **INCONCLUSIVE** — nothing to check against |

The checkbox is still printed, and the probe notes when it disagrees with the
device, but it no longer decides anything.

**That is the fourth instrument fix in four runs, and they are one fix.** A claim
with no corroborant was believed; a label invited a wrong claim; a readout was
allowed to go stale; and a verdict rested on a tick when the device could answer
for itself. The general rule is the one §5d has been circling all along: **ask the
device before asking the person, and where the device can answer, do not ask the
person at all.** A human claim is a legitimate input only where nothing on the
device speaks to the same fact — and for all three of P12, P13 and P14, something
does.

### P14 — confirmed, 14:12 IST

With Find Hub's device-admin toggle on, `DevicePolicyManager.getActiveAdmins()`
returned **`com.google.android.gms/.mdm.receivers.MdmDeviceAdminReceiver`** — one
entry, 60 characters, to an app declaring no permission. `read at` and
`exported at` are the same second, and the control still held.

**All three predictions are now answered on this device**, and pass 2's three
kinds are all readable with nothing granted:

| | | |
| --- | --- | --- |
| **P12** | accessibility services enabled | confirmed, two independent APIs |
| **P13** | notification listeners enabled | confirmed, 5 entries |
| **P14** | device admins active | confirmed, 1 entry |

**And the earlier `null`s are explained rather than excused.** Runs 1–4 had no
admin active and returned `null`; run 5 had one and returned a list. So on this
device `getActiveAdmins()` spells *none* as `null` rather than as an empty list —
which is exactly the reading the INCONCLUSIVE rule refused to commit to at the
time, and it was right to refuse: the same `null` would have been produced by a
platform that withheld the list, and nothing in runs 1–4 could tell the two
apart. Being unable to say was the correct answer until run 5 made it decidable.

That confirmation came from a build where P14 was still scored by the generic
rule rather than by `isAdminActive`, and it is sound anyway: *entries actually
handed over* confirm under either operator claim, which is the invariant the
desktop suite pins hardest. The per-component cross-check stays in the probe
regardless — it is what turns a future `null` from an ambiguity back into a fact,
and `Grants` needs that, because **on this platform a missing admin list and a
withheld one are the same value.**

### Pass 2's glue, built on those answers — 2026-09-26

The Android side now exists: `Pass2` (an `Application`, no service), a
`WakeReceiver` for boot and package events, a `ContentObserver` on the two
settings that have a URI, and one screen to see it working and get the journal
off the phone. One permission, `RECEIVE_BOOT_COMPLETED`; the three reads cost
nothing, which is a measured fact rather than a hope.

**The probe's finding is now code.** `GrantReader` does not pass a bare `null`
from `getActiveAdmins()` through as *unknown* — that would make device admin
unreadable on every ordinary phone for ever — nor read it as *none*, which would
record a real stalkerware admin as an empty set. It asks `isAdminActive` per
installed receiver and returns `null` only when that says something is active
while the enumeration does not. Five runs of a throwaway bought exactly one
branch, and it is the branch on which the signal is either honest or blind.

**The last observation comes out of the journal, not a cache** (Art. IX §33; a
cache would outlive an erasure of the events it describes). `Journal` has no JSON
parser and is not getting one mid-run, so the holding set is stored in the
platform's own colon-joined form and recovered by the same single-field
extraction `Journal.last()` already uses — sorted and de-duplicated, so two
observations of an unchanged device are byte-identical rather than merely
equivalent. **This depends on the v1 envelope:** under v2 the fine type is
coarsened to `orb.content`, `lastOfType` would match nothing, and every
observation would silently re-baseline for ever. Switching pass 2 to v2 is
therefore not a one-line change, and the note sits on the method that would break.

**Every observation is recorded, changed or not.** Recording only changes would
make silence mean *nothing happened* and *nothing was watching* at once, and a
journal that cannot separate those cannot be used to say a grant did **not**
appear on a given day. It is the same error as recording an unreadable setting
as an empty one, one level up.

**No foreground service, which makes this pass 1's missing experiment.** The
comparison is against history, so the signal needs a live process only to be
prompt, never to be correct. P6 — cheap signals arrive with no foreground
service — was untestable in pass 1 because a service ran throughout. It is under
test now, and the `because` field on every event names which route caught a
change: the settings watch, a boot, a package broadcast, or only the next process
start. That is P16 answered from the record instead of argued about.

---


---

### 7b1. The first export read back — 2026-09-27

The phone's journal came off the device as
`orb-pass2-20260927-213805.txt` and went through `importExport` into a
file-backed journal. **Eight events, one chain, no gaps:** two
`grants.process.start`, five `grants.observed`, one `grants.export`.

| wallClock (UTC) | uptime | `because` | changed | baseline | a11y / listeners / admin |
| --- | --- | --- | --- | --- | --- |
| 09-26 11:30:34.806 | 2h05m45s | *(process.start)* | | | boot ≈ 09-26 09:24:49 |
| 09-26 11:30:34.813 | 2h05m45s | `process.start` | false | **true** | 1 / 5 / 1 |
| 09-26 11:30:34.833 | 2h05m45s | `app.opened` | false | false | 1 / 5 / 1 |
| 09-27 16:02:59.403 | 0h31m59s | *(process.start)* | | | boot ≈ 09-27 15:31:00 |
| 09-27 16:02:59.436 | 0h31m59s | `process.start` | false | false | 1 / 5 / 1 |
| 09-27 16:02:59.588 | 0h31m59s | `signal:…BOOT_COMPLETED` | false | false | 1 / 5 / 1 |
| 09-27 16:08:03.867 | 0h37m03s | `app.opened` | false | false | 1 / 5 / 1 |

**The cross-implementation check ran on real history.** `verifyLane` re-derived
every envelope hash and every payload hash over the phone's own chain — the
check the probe structurally cannot perform on itself, since re-derivation needs
a JSON parser `Journal.java.in` does not have. It passed. Re-importing the same
file replicated 0 and observed 0, so idempotence holds on real data and not only
on the generated fixture.

**P6 — held, on one signal, on this date, against this build.**
`signal:android.intent.action.BOOT_COMPLETED` was delivered to a manifest
receiver with **no service of any kind running**, and the reading it produced
landed five minutes before the operator opened the app. That is the experiment
pass 1 could not run, because a foreground service ran throughout. It is a
demonstration that the route works, not a measurement of how often it does.

**And it is late.** `wallClock − elapsedRealtimeMs` puts boot at ≈15:31:00 UTC
and the broadcast at 16:02:59 — **31m59s after boot**. The process started 152 ms
before the signal event, so the broadcast is what created the process; the delay
is in delivery, not in us. The likely cause is that a receiver which is not
direct-boot aware waits for the first unlock — *that is a hypothesis, not a
reading.* Either way the operational fact stands: a watchdog on this route can
learn nothing for half an hour after a reboot.

**P16 — the mechanism is confirmed; the subject never occurred.** Nothing
changed in this window: five readings, `changed: false` on every one, identical
holdings across ~28.5 hours and one reboot. So the question P16 asks — *is a
grant that moved while the app was dead caught at the next start?* — was never
put to the device, and it stays open. What the run does establish is the part
P16 depends on: the 09-27 post-reboot reading carries **`baseline: false`**. A
fresh process on a freshly booted phone compared against history instead of
re-baselining. Had a grant moved, there was something to move against.

**Zero alerts, correctly.** `project` folded five Observations into three
holdings, `alertsFor` returned nothing, `raiseAlerts` wrote nothing. Silence here
means *watched and unchanged*, which the journal can say because every reading is
recorded whether or not it changed.

**One gap, and the file is honest about it.** The chain's first event carries
`previous: null` and the first reading `baseline: true`, so **this lane starts on
09-26 at 11:30 UTC** — the three events from the morning's install are not in it.
A fresh journal, not a truncated one; the distinction is visible rather than
inferred.

---

### 7b2. P16 answered, and a route label that lies — 2026-09-28

The second export, `orb-pass2-20260928-071608.txt`: thirteen events, five of them
new, `verifyLane` clean again, five replicated, three Observations, re-import
0/0.

**P16 held.** Two notification listeners were turned off while pass 2 was not
running, and the **next process start caught it from history**:

```
2026-09-28 01:46:04.997  uptime 10h15m04s  because="process.start"  changed=true
  notificationListenerHoldingCount: 5 → 3
  notificationListenerLost: ["…apps.dreamliner/…", "…projection.gearhead/…"]
  notificationListenerBaseline: false
```

`baseline: false` is the load-bearing field: the reading compared against
history instead of starting over, which is the whole mechanism the prediction
names. The two readings 14 ms and 44 ms later both say `changed: false` — they
compare against the reading just written — so a single revocation produced a
**single** change, not three.

**And the loop closed, once, on a real device.** `project` folded the three
Observations into one `AuthorityChange`; `alertsFor` returned one
`PendingAlert`; `raiseAlerts` journalled one alert and a second call journalled
nothing. The operator answered — *they had turned the two listeners off
themselves* — and the answer went into the journal as `orb.alert.answered`
citing the alert in `causes`. The next `project` reads that answer, and
`raiseAlerts` still returns zero, because the alert was already raised and **not
because the answer taught the rule anything** (DR-8). Journal → Observation →
projection → rule → person → answer → journal, with nothing in that chain
invented.

### The power-off, cross-confirmed by two sources that cannot copy each other

The operator's account: the phone switched off the previous day, the listeners
were turned off, and it is back on. The record agrees and dates it. Both the
09-27 and 09-28 sessions derive the **same boot instant, to the millisecond**:

| session | wallClock | `elapsedRealtimeMs` | derived boot |
| --- | --- | --- | --- |
| 09-27 | 16:02:59.403 | 1,918,763 | **2026-09-27 15:31:00.640** |
| 09-28 | 01:46:04.981 | 36,904,341 | **2026-09-27 15:31:00.640** |

So the power-off preceded 15:31:00.640 UTC (21:01 IST), and §7b1's
**31m59s** was measured from a genuine cold boot rather than from a process
restart — a person's memory and a monotonic counter agreeing, which is worth
more than either alone. It does not explain *why* the broadcast took half an
hour; the not-direct-boot-aware-waits-for-first-unlock reading stays a
hypothesis.

### P17 — the signal name is not the event

The same table shows something that was never predicted and is now measured:

```
2026-09-27 16:02:59.588  uptime  0h31m59s  signal:…BOOT_COMPLETED
2026-09-28 01:46:05.011  uptime 10h15m04s  signal:…BOOT_COMPLETED
```

**`BOOT_COMPLETED` was delivered twice inside one boot session, 9h43m apart.**
`elapsedRealtimeMs` rises monotonically across the two and the derived boot
instant is identical, so the record *rules out* a second reboot; and the second
delivery landed 14 ms after the process started and 30 ms before `app.opened`,
i.e. as the app was launched, not at boot.

**What this settles:** `because: "signal:…BOOT_COMPLETED"` is not evidence that
the device rebooted. Only `elapsedRealtimeMs`, and the boot instant derived from
it, can say that — and here it says the opposite, twice. Any rule that reads the
action string as *a reboot happened* would be wrong on both events in this file.

**What it does not settle:** why the broadcast was delivered again. A broadcast
queued while the app sat in a stopped or frozen state and released on launch
would fit, but nothing in the journal says the app was ever force-stopped, so
that is a guess and is recorded as one.

**One consequence for P6.** Today's delivery is coincident with a user launch, so
it is *not* independent evidence that a signal arrives with nothing running.
P6 still rests on the single clean instance in §7b1 — one signal, one date, one
build.

### 7b3. Both prompt routes answered, and an answer that cannot survive a replay — 2026-09-28

The third export, `orb-pass2-20260928-085048.txt`: **28 events, 15 of them new**,
`verifyLane` clean, all 28 replicated into an empty journal, 19 Observations,
**4 alerts**. Two experiments were asked for and both held; a third left no trace
at all; and the import exposed something about the loop's own memory that two
earlier exports could not.

#### Step 2 — a gain caught from history. The first non-empty `gained` outside a test

```
uptime 11h43m45s  because="process.start"  changed=true
  notificationListenerGained: ["…apps.dreamliner/…", "…projection.gearhead/…"]
  notificationListenerGainedCount: 2
  notificationListenerHoldingCount: 3 → 5
  notificationListenerBaseline: false
```

Two listeners were switched **on** while pass 2 was not running, and the next
process start named both. This is what **P16 literally predicted** — *a grant
**enabled** while the app is not running* — which §7b2 held on the mirror case, a
revocation. The prediction now holds in the direction it was written in, on the
same build, with `baseline: false` again doing the load-bearing work: the reading
compared against history rather than starting over.

Three minutes later the same route caught the reverse again:

```
uptime 11h47m45s  because="process.start"  changed=true
  notificationListenerLost: ["…projection.gearhead/…"]
  notificationListenerHoldingCount: 5 → 4
```

So the dead-process route is now exercised **three** times across two days, twice
losing and once gaining, and it has never yet reported a change that the operator
did not make.

#### Step 3 — the live route works. The first `settings.changed` ever recorded

```
uptime 11h47m46s  because="settings.changed"  changed=false  holding 4
uptime 11h48m10s  because="settings.changed"  changed=true
  notificationListenerGained: ["…projection.gearhead/…"]
  notificationListenerHoldingCount: 4 → 5
```

The `ContentObserver` on `enabled_notification_listeners` fired **with the
process already alive**, 24 seconds apart, and the second reading caught the
grant being turned back on. No wake, no launch, no boot: the route that exists
only for promptness demonstrated that it is prompt.

Both readings matter, and for different reasons. The `changed: false` one is the
platform notifying on a URI whose *value* Orb's own comparison says is
unchanged — the observer is a hint that something may have moved, never a claim
that it did, and the journal records it as an observation exactly like the rest
rather than suppressing it. The `changed: true` one is the route delivering what
it was built for. **A route that reports only when something changed could not be
distinguished from a route that had stopped working.**

**What this does not establish.** `settings.changed` has a URI for accessibility
and notification listeners and **none for device admin** — nothing here changes
that. An admin enabled while the process is dead is still only ever seen at the
next wake.

#### Step 1 — absent, and the record cannot say why

There is **no reading of any kind** labelled `signal:…PACKAGE_ADDED`,
`PACKAGE_REMOVED` or `PACKAGE_REPLACED` in this export, or in any export so far.
The four `because` values present are `process.start` (6), `app.opened` (7),
`signal:…BOOT_COMPLETED` (4) and `settings.changed` (2).

Two explanations fit the journal equally: the install was not performed, or the
broadcast did not reach the manifest receiver. **The journal cannot separate
them,** because nothing records that an install was attempted — the same shape as
an unreadable setting and an empty one being the same value (§7b's `getActiveAdmins`
note), one level up again. It is recorded as **untested with the reason** rather
than as a refutation, and the operator was asked which of the two it was. If the
answer is *the install happened*, the manifest route is refuted and that is the
most consequential finding of the pass, because it is the only route that can
notice a **new app** rather than a changed grant.

#### P17 — now four deliveries in one boot session

| uptime | `because` | `app.opened` |
| --- | --- | --- |
| 0h31m58s | `signal:…BOOT_COMPLETED` | 5h05m later |
| 10h15m04s | `signal:…BOOT_COMPLETED` | same second |
| 11h44m32s | `signal:…BOOT_COMPLETED` | same second |
| 11h47m45s | `signal:…BOOT_COMPLETED` | same second |

Every one of the 24 events with an `elapsedRealtimeMs` in this boot session
derives the **same boot instant, 2026-09-27 15:31:00.640**, to the millisecond.
So `BOOT_COMPLETED` was delivered **four times without a reboot**, and P17 stands
refuted more strongly than it was.

The three later deliveries each land within milliseconds of a process start that
is itself coincident with a user launch. That pattern is consistent with a
broadcast released when the app leaves a stopped or frozen state, which is now
the hypothesis with the most evidence behind it — and it is still a hypothesis:
nothing in the journal records the app being force-stopped, and four instances of
a coincidence are not a mechanism.

**P6 is untouched by this.** Its clean instance is the first row, and what makes
it clean is the 5h05m gap to `app.opened`: that process start cannot have been a
user launch, so the broadcast is what started the process. Rows two to four
cannot carry P6 and were never asked to.

#### What the import exposed about the loop's own memory

The journal this import ran against was **empty** — a new container, a new
hostname, so a new machine lane (`vm`, where the previous one was `desk`). The
28 device events replayed into it and produced the 19 Observations and the 4
alerts again, from the events alone. That part is the architecture working: the
projection is a function of the journal and nothing else.

The operator's `dismissed` answer from §7b2 did **not** come back, and it could
not have, for two independent reasons that are worth separating:

1. **Answers are not in the export.** The phone writes the `grants` lane; the
   answer was written to the *machine* lane by the operator. An export carries
   the device's history and by construction never carries the desk's.
2. **Alert ids are minted at raise time, not derived from the change.** Replaying
   the same grants lane raises four alerts with four **new** ULIDs. Even with the
   old answer event present, its `causes` would cite an id this journal does not
   hold — precisely the dangling citation the CLI refuses to create, arriving by
   replay instead of by typo.

So the loop's memory is split across two lanes with different durability, and
answers are addressed to an identity that a replay does not preserve. Neither is
a bug in what was built; both are limits of it, and (2) is the one that matters
architecturally, because *every feature must be replayable from events* (Art. IX)
and an answer is currently only replayable **alongside the lane that raised what
it answers**. Making an alert's identity derive from the change it describes —
so the same history mints the same id — is the fix, and it is a design change,
not an implementation one. It is recorded here and not made.

The practical consequence today: the four alerts are **unanswered**, and the
operator answers them once rather than being told they were already handled.

### 7b4. P17's mechanism, from the operator — and a force-stop marker — 2026-09-28

The operator's account, given after §7b3 was written: **they force-stopped Orb and
then opened it 2–4 times.** That is the missing half of P17, and it makes the
record read differently. Grouping every event in the third export by the process
that wrote it:

| process start, uptime | `BOOT_COMPLETED` after start | `app.opened` after start |
| --- | --- | --- |
| 2h05m45s *(previous boot)* | — | +27 ms |
| **0h31m58s** | **+184 ms** | **+304,463 ms** |
| 10h15m04s | +30 ms | +59 ms |
| 11h43m45s | **—** | +54 ms |
| 11h44m32s | +46 ms | +78 ms |
| 11h47m45s | +55 ms | +95 ms |

**Three launches carry a re-delivered `BOOT_COMPLETED`; one does not.** Each of
the three arrives *between* `process.start` and `app.opened` — 30, 46 and 55 ms
in, and 29, 32 and 40 ms before the Activity resumed — so the broadcast is
dispatched during the launch itself. Three re-deliveries against an account of
two to four opens is a fit, not a coincidence.

**The launch that carries nothing is the load-bearing row.** At 11h43m45s a fresh
process started, read the journal, caught the two re-enabled listeners (§7b3) and
resumed the Activity, and **no `BOOT_COMPLETED` was delivered.** So re-delivery is
not a property of launching, and not a property of starting a process. Something
about the *previous* shutdown decides it. The operator's account names what:
being force-stopped rather than merely dying.

That also discriminates, weakly, between the two platform mechanisms that would
produce this shape. A broadcast queued against a **frozen or cached** process
would be released whenever that process came back — including at 11h43m45s, where
the app had been closed for 1h28m. A broadcast withheld from a **stopped package**
and released when the user launches it would not, because an ordinary reclaim does
not set that state. The record shows the second pattern. It is one absence
against three presences, which is evidence and not proof, and the platform's
internal queueing was not read.

#### The consequence: the first thing in the record that can mark a force-stop

A force-stop is **how a person stops this watch.** Until now the journal had no
way to separate *I was force-stopped*, *I was killed and reclaimed* and *I was
never installed* — the third time this same distinction has decided a design
here, after `unreadable` versus empty and `baseline` versus unchanged. If the
re-delivery is really the stopped-state release, then a `signal:…BOOT_COMPLETED`
reading at a **non-zero uptime, coincident with a launch** is a marker that the
app was force-stopped since it last ran, and its absence at 11h43m45s is the
control that gives the marker meaning.

That is a side effect of platform behaviour, not an API, so it is weak by
construction: it can disappear in an OS update without warning, and it cannot
distinguish a force-stop from a *Clear cache*-style stop that clears the same
flag. It is written down because a weak marker recorded with its own limits is
worth more than a strong one assumed, and because the alternative today is
nothing at all.

**P20**, written as a prediction rather than claimed: *force-stop, then open →
a `BOOT_COMPLETED` reading at non-zero uptime; let the process die on its own,
then open → none.* Two exports settle it, and the second half is the one that
matters, because a marker that fires on every launch marks nothing.

#### P6 is untouched, and the 31m59s narrows slightly

The 0h31m58s delivery had **no launch within five hours** — `app.opened` is
+304,463 ms, 5h04m later — so nothing cleared a stopped state at that moment and
it is not a re-delivery of this kind. P6 rests on that row exactly as before.

One thing it does settle: a force-stopped package does not receive
`BOOT_COMPLETED` at boot on this platform (documented behaviour, not measured
here), and this delivery arrived with nobody present. So whatever delayed it by
**31m59s**, a stopped-state exclusion was not it. The delay itself is still
unexplained.

#### Still open, unchanged by any of this

**P19.** The operator's account is about force-stopping, which was not the
question asked — no package install or uninstall is confirmed or denied, and no
`signal:…PACKAGE_*` reading exists in any export. It stays untested with the
reason.

### 7b5. P19's silence explained, and the routes that cannot self-heal — 2026-09-28

The operator's second account: **an app (Clash Royale) was uninstalled, after the
force-stop.** So step 1 *was* performed, and the manifest route still recorded
nothing. That is not a refutation, and the reason is the state the app was in.

**A force-stopped package is excluded from broadcasts until it is launched again**
(documented platform behaviour, not measured here). The uninstall happened inside
a stopped window, so `WakeReceiver` was never offered the broadcast. **The test was
null by construction** — it exercised the route while the route was switched off
by the platform. P19 stays untested, now with a known reason instead of two
indistinguishable ones.

The corrected procedure for the next attempt, and the reason it differs: **open
Orb first**, so the package is not in the stopped state, *then* install or
uninstall something, then export. Grant changes do not need this — they are caught
by comparison whenever the process next starts (P16) — and that difference is the
finding below.

#### Every stopped window in this file is closed by a launch

The record bounds where the uninstall can have fallen. Six minutes hold the whole
episode:

```
01:46:04.981   process start  10h15m04s   BOOT_COMPLETED +30ms
03:14:46.431   process start  11h43m45s   (none)            <- caught the two gained listeners
03:15:33.450   process start  11h44m32s   BOOT_COMPLETED +46ms
03:18:46.096   process start  11h47m45s   BOOT_COMPLETED +55ms
03:20:48.466   export
```

A force-stop kills the process, so every stopped window shows up as the gap before
the next `grants.process.start`, and **every such gap in this file ends in a
launch.** No further process start exists after 03:18:46, so the uninstall fell
either in one of those gaps — in which case a launch followed it — or after the
export at 03:20:48, in which case it is simply not in this file yet.

That is decidable by the next export rather than by argument, and it is why the
next export is worth taking: if the uninstall came after 03:20:48 and the route
works, its first launch carries a `signal:…PACKAGE_REMOVED:package:…`.

#### A correction to §7b4's preferred mechanism

§7b4 preferred *withheld from a stopped package, released when the user launches
it* over *queued against a frozen process*, on the strength of the 03:14:46 launch
carrying nothing. If the uninstall fell in one of the gaps above, that preference
does not survive: a launch followed it, that launch released a `BOOT_COMPLETED`,
and **no `PACKAGE_REMOVED` came with it.** A queue that releases what was withheld
would have released both.

What survives is narrower and fits all six rows: `BOOT_COMPLETED`'s reappearance is
specific to that broadcast — the system telling a package that has just left the
stopped state that boot is complete — rather than a replay of whatever it missed.
Under that reading a one-shot package event in a stopped window is **lost for
ever**, which is consistent with the silence here. It is a hypothesis, unverified,
and it is now the one with the most rows behind it.

**P20 is unaffected.** It asserts a correlation — reading present after a
force-stop, absent after an ordinary death — and never depended on which mechanism
produces it. The mechanism claim in §7b4 is withdrawn pending the ordering; the
marker stands on the same evidence as before.

#### The finding: comparison-based routes self-heal, event-based routes do not

This is the asymmetry the two accounts together expose, and it is sharper than
either.

| route | kind | missed while stopped? |
| --- | --- | --- |
| `process.start` | compares the set against history | **no** — the next start catches it, whenever that is |
| `settings.changed` | compares the set against history | no; it only ever cost promptness |
| `signal:…PACKAGE_*` | reports an **event**, with no state behind it | **yes, permanently** |

There is no installed-package set in the observation payload, so a package event
has nothing to be compared against. Nothing recovers it later, and nothing records
that it was missed.

**And the same gap exists without any force-stop.** Comparison against history
reports on **endpoints, not intervals.** An app installed, granted a notification
listener, used, and uninstalled between two process starts returns the grant set to
its previous value, and the next reading says `changed: false` — true about the two
endpoints and silent about everything between them. The journal cannot separate
*nothing happened* from *something happened and was undone*, which is the same
family as recording an unreadable setting as an empty one and a lost history as an
unchanged one. The broadcast routes were the only mitigation for it, and they are
exactly the routes that are lossy.

That is recorded as a limit, not fixed. The two candidate answers, neither
implemented: **carry an installed-package set** in each observation, so a package
change becomes a comparison like the others and the broadcast drops to
promptness-only — which is the posture the design already claims for
`settings.changed`; or **record the blind window explicitly**, so a reader can see
where the loop was not watching rather than inferring safety from silence. The
first is the architecturally consistent one. Both are design changes and need
approval.

### 7b6. The package set, built — 2026-09-28

P21's first candidate fix, implemented and approved: **each observation now carries
the installed-package set**, compared against history exactly like the three
grants. Pass 2's Java, `packages/device-watch`, and the fixture that pins the two
against each other. 59 desktop checks on the Java side, 657 on the TypeScript, lint
clean.

**What it buys.** A broadcast reports an event, so missing the moment loses it for
ever; a set compares, so the next process start catches what the missed broadcast
would have said, whenever that start comes. §7b5's uninstall would be caught today
— not at the moment it happened, but at all, which is the difference between a
signal and a gap. It was written to demote `signal:…PACKAGE_*` from load-bearing to
prompt — the posture `watchSettings` already had. **§7b10 refuted that route
entirely**, so what this actually did was replace a mechanism that never worked with
one that does, and the scan interval is the detection latency rather than a
fallback.

**What it does not buy, stated in the code and again here.** It does not close the
interval gap. An app installed, granted a listener, used and uninstalled between two
observations returns both sets to where they began, and both readings still say
`changed: false`. P21 stays open as a **limit**, narrowed and not closed.

#### It is not a fourth grant, and two things enforce that

`installedPackage` is in `Grants.KINDS` and deliberately **not** in the new
`Grants.GRANT_KINDS`, and `ruleFor` routes it to a second rule,
`device-watch.packages-changed`. An app appearing is not an app being given power
over the device, and the rule name is the field a person reads first when deciding
whether to care. The mechanism is shared because the mechanism is what was worth
having; the claim is not.

They also differ in expected rate by orders of magnitude — a grant moves when
somebody decides something, the package set moves on every system update — so they
have to be tunable apart, or §7 R6 turns one into noise and takes the other with it.
The test asserts the routing **both ways**: it is `packages-changed` and it is *not*
`authority-changed`, because the failure worth guarding against is a true-looking
alert that misnames what happened.

#### The second permission, and the field that makes it reversible

`getInstalledPackages` is filtered on API 30+ without `QUERY_ALL_PACKAGES`, and the
apps it omits are the ones that declared no matching intent — which is to say, the
target of §4.4 made invisible to the signal watching for it. So the manifest now
declares it. **It is the second permission this app has ever asked for, and it is
the permission a surveillance app would want**, held here by an app whose purpose is
to notice one. It is normal and install-time: nobody is prompted, nothing leaves the
device, and it is stated in the manifest comment rather than buried.

It is also reversible in one line, and that is the point of the other half:

**every reading records the scope it was taken under** — `installedPackageScope` is
`all`, `visible`, or `unknown` when the check itself threw. `Grants.previous`
**refuses to compare across a change in it** and re-baselines instead. Without that
refusal, dropping the permission would make the next reading report every package
the filtered look cannot see as *lost*: two hundred uninstalls that never happened,
in the one signal whose value is that it does not cry wolf. It is the
`unreadable`-is-not-empty rule one level along, and the same shape as the
v2-envelope note on `Pass2.lastObservation` — **a change in the instrument must
never read as a change in the world.**

A kind with no scope records no scope field, so the three grants and every reading
taken before today are unaffected. There is a test for that specifically, because the
alternative was re-baselining the whole device's history on the next process start.

#### Costs, stated before they are measured

| | |
| --- | --- |
| journal size | the holding set is stored whole, so each observation grows by roughly the package count × the average name length — guessed at **5 KB**, against ~300 bytes today. **Measured on the device (§7b8): 16.7 KB**, from 484 packages. The guess was low by 3.3× |
| noise | a system update changes the package set, so this rule will fire where the grant rule would not. That is the second reason it is a separate rule |
| the screen | a set over 25 entries shows as a count. The set itself is in the journal whole; the screen is not the record |

#### What settles it

The next export, and two readings in it. `installedPackageBaseline: true` on the
first observation from the new build — nothing to compare against yet, which is
correct and must not be an alarm. Then, after installing or uninstalling anything
with **Orb opened first** so it is not in the stopped state, a `process.start`
reading with the package named in `installedPackageGained` or `…Lost` and
`installedPackageScope: "all"`. That also gives P19 its clean re-test, since a
launch before the install is exactly what §7b5 says was missing.

### 7b7. A scan, not a fourth field — 2026-09-28

§7b6 put the installed-package set on **every** observation. The operator's
objection, the same day: *instead of carrying so much, can we run a scan
periodically or whenever we feel it's necessary?* They were right, and for a
better reason than the one they gave.

**The byte count was the smaller cost.** ~5 KB an observation at eight wakes a day
is ~15 MB a year, which a phone does not notice. The cost that mattered is the
**read**: enumerating every installed package is hundreds of `PackageInfo` objects
across a binder transaction, and doing it at every wake spends the operator's
stated constraint — battery — on a set that moves far more slowly than the grants
do. The three grant reads are two `Settings.Secure` lookups and one
`DevicePolicyManager` call; they belong at every wake. The package read does not.
Putting them in one event forced one cadence on two things that do not share one.

#### The shape now

| event | what it reports | when |
| --- | --- | --- |
| `grants.observed` | the three grants | **every wake** — process start, app opened, any signal, the settings watch |
| `grants.packages` | the installed-package set | **on a scan** (below) |

A scan happens on three triggers, and none of them needs a service, an alarm, or a
new permission:

1. **A package broadcast** — unconditionally. This is the one moment a scan is
   certain to find something, and it makes the broadcast useful again without
   making it load-bearing.
2. **Any wake, if the last scan is stale** — `SCAN_INTERVAL_MS`, 12 h, read from
   the journal by `lastOfType("grants.packages")` rather than from a cache.
3. **The operator** — a *Scan installed packages now* button, recorded as
   `because: "operator.scan"`. A scan a person asked for is different evidence
   from one a timer produced, and the journal says which it was.

#### Why it had to be a separate event type, and not a field left out

Two reasons, and the first is the one that would have been a silent defect.

**`Grants.previous` would find the wrong line.** The comparison reads the last
recorded set out of the journal. Scanning less often than we observe means the most
recent event is almost always an observation, which carries no package fields — read
as a prior record that means *no usable history*, so the set would re-baseline at
every scan and the signal would never report a change and never say why. A separate
type makes the previous *scan* findable past however many observations came between,
which is exactly what `lastOfType` already does. There is a test for this that
asserts an observation line yields no prior package set.

**And a skipped read must not be recorded as a failed one.** Had the observation
kept naming the kind, a wake that skipped the scan would have written
`installedPackageReadable: false` — *we could not find out*, when the truth is *we
chose not to look*. That is this project's founding error in a new costume, the
same one as an unreadable setting recorded as an empty one. So a scan that did not
happen writes **no package fields at all**, and absence means *this event is not
about that*. `Grants.GRANT_KINDS` and `Grants.PACKAGE_KINDS` are two arrays rather
than one list with a filter so that nothing can drift into naming a kind it did not
read.

#### The silence that is allowed, and why

A wake that does not scan records nothing about not scanning. Everywhere else this
document treats that as the mistake — §7b's *every observation is recorded, changed
or not*, because silence would otherwise mean *nothing happened* and *nothing was
watching* at once. It is allowed here for one reason: `lastOfType("grants.packages")`
makes **when the last scan happened** a fact anyone can read off the journal, so
"was the package set being watched that day" has an answer without a per-wake record
of the negative. That is the test to apply if this pattern is ever reached for
again — not *is the negative cheap to omit*, but *can the negative still be
answered*.

The interval uses `wallClock`, which can jump. A clock change makes a scan early or
late: promptness, never correctness, since the comparison is against history
whenever it runs. Unreadable history falls through to scanning once more than
needed, which is the harmless direction.

#### What is unchanged from §7b6, and what got worse

Unchanged: the scope field and the refusal to compare across a change in it; the
second rule `device-watch.packages-changed`, because an app appearing is still not
an app being given power; `QUERY_ALL_PACKAGES`, still the second permission and
still stated rather than buried.

Worse, and deliberately: **P21's window is wider.** An app installed and removed
between two *scans* is invisible, where §7b6 would have needed only two
observations. The scan interval is now the resolution of this signal. 12 h is a
guess and labelled one in the source — the journal will say how often it actually
fires, and that is the evidence for changing the number rather than an opinion
about it.

**P22 is unchanged in what settles it** and now has a third reading to look for: a
`grants.packages` event with `because: "operator.scan"` after pressing the button,
which is the cheapest confirmation that any of this works at all.

### 7b8. The scan, on a real device — 2026-09-28

The update to the installed pass 2 was **refused**: *App not installed*. The build
environment's keystore is not the one that signed what is on the phone, so that
install can never be upgraded — only removed, which would take its journal with
it. §7b7's build went on instead as **`dev.orb.pass2b`**, its own package, its own
key, its own lane `grants-b`, alongside the original and touching nothing of it.

Seven events, a fresh chain, `verifyLane` clean, imported beside `grants` with no
conflict. **P22 holds**, and four separate properties held with it.

#### What the seven events settle

```
1  grants.process.start                              uptime 14h59m22s
2  grants.observed   process.start   baseline: true  (3 grant kinds, no package fields)
3  grants.packages   process.start   baseline: true  scope: "all"   484
4  grants.observed   app.opened      changed: false  (3 grant kinds, no package fields)
5  grants.packages   operator.scan   baseline: FALSE changed: false 484
6  grants.observed   app.opened      changed: false  — and no scan
7  grants.export
```

**The permission took.** `installedPackageScope: "all"` on a real device:
`QUERY_ALL_PACKAGES` is granted at install with no prompt, and the list is the
complete one. **484 packages.**

**A first scan is not an alarm.** `installedPackageBaseline: true`, `changed:
false`. §5j's lesson holds for the new kind on its first outing.

**The operator's button is a third trigger and says so.** Event 5 carries `because:
"operator.scan"` — a scan a person asked for, distinguishable in the record from
one a wake produced, which is the whole reason the field exists.

**And the load-bearing property is now proven rather than argued.** Event 5's
`installedPackageBaseline: false` is the one to read twice. Between the two scans
sits **event 4, an observation carrying no package fields at all.** Had
`scanPackages` looked up the last *observation* — the obvious implementation —
it would have found event 4, read it as *no usable history*, and re-baselined. It
looked up the last **scan** and found event 3. That is `lastOfType(PACKAGES)`
walking back past an intervening observation, on a real journal, which is exactly
the silent defect §7b7 was written to avoid.

**Observations stayed silent about packages.** Events 2, 4 and 6 have no
`installedPackage*` fields — not `installedPackageReadable: false`. *Did not look*
is an absence; *could not find out* would have been a claim. Both now demonstrated
on the device rather than only in the desktop suite.

**The interval gate works.** Event 6 is an `app.opened` 70 seconds after the scan,
and it took no scan: `scanPackagesIfDue` read the journal, found a scan well inside
12 h, and declined. The first wake scanned because there was no prior scan at all.

**Orb can see itself.** The set contains `dev.orb.pass1`, `dev.orb.pass2`,
`dev.orb.pass2b`, `dev.orb.probe`, `dev.orb.probeb` and `dev.orb.probeg`. Removing
any Orb app is therefore a change this signal reports — including removing the
watcher, by whichever build is still installed.

**Cross-checked three ways at one moment.** `grants-b`'s baseline names the same
five notification listeners, the same admin and the same accessibility service as
the old pass 2's last reading (11:48) and as `probeg`'s independent readout (11:49).
Three implementations, one device, no disagreement.

#### The cost, measured — and my estimate was wrong

§7b6 guessed "on the order of 5 KB" per scan. **Measured: 16.7 KB**, from 484
packages rather than the couple of hundred assumed. Off by 3.3×, and the error was
in the direction that mattered, so the number is recorded here in place of it.

| | bytes | |
| --- | --- | --- |
| `grants.process.start` | 573 | |
| `grants.observed` | 1,809 | three grant sets |
| `grants.packages` | **16,740** | **10.5× an observation** |

At six wakes a day, the design §7b7 replaced — the set on every observation — would
cost **98 KB/day, 35 MB/year**. As built, six observations and two scans cost **42
KB/day, 15 MB/year**.

Note what that decomposes into: **33 KB of the 42 is the two scans.** Moving the set
off every observation was worth 2.3× and the *scan interval* now governs the rest.
Halving the interval roughly doubles the journal; the number to tune is
`SCAN_INTERVAL_MS`, and it is now tunable against a measurement instead of a guess.

#### Still open, and unchanged by this

**P19** — no app was installed or uninstalled in this window, so the package
broadcast route is still untested. The clean test is now cheap: Orb pass 2 B is
open and not stopped, so an install should produce both a
`signal:…PACKAGE_ADDED:package:…` reading *and* a named entry in the next scan's
`installedPackageGained`. Either arriving without the other is itself the finding.

**P20** — no force-stop was performed. Both halves still needed.

### 7b9. The scan recovers what the broadcast lost — 2026-09-28

The operator force-stopped Orb pass 2 B, uninstalled an app while it was stopped,
reopened it and scanned. That is the exact scenario §7b5 was written about, run
deliberately this time, and **the recovery worked.**

```
 5  06:30:28  15h10m27s  packages  operator.scan   base=false  n=484  unchanged
 8  06:41:54  15h10m53s  process.start                    <- after the force-stop
 9  06:41:54             observed  process.start
10  06:41:54  15h10m54s  observed  signal:…BOOT_COMPLETED  <- +69 ms
11  06:41:54             observed  app.opened              <- +151 ms
14  06:42:03  15h11m02s  packages  operator.scan   changed: TRUE  484 → 482
                                   lost: com.ixigo, com.nhn.android.band
```

#### P21's fix, demonstrated end to end

**No package broadcast of any kind appears.** The uninstall happened inside a
stopped window, so the platform withheld it from `WakeReceiver` exactly as it did
on the first attempt. The event route lost it, permanently and silently.

**The scan caught it anyway.** `changed: true`, 484 → 482, both packages named.
One alert was raised on import, under `device-watch.packages-changed` — not
`authority-changed`, because an app being removed is not an authority being
revoked, and the rule name says which happened.

That is the whole argument of §7b5–§7b7 happening for real: *a broadcast reports an
event and is lost if it is missed; a set compares, so a later scan catches what the
missed broadcast would have said.* The scenario that exposed the gap is now the
scenario that closes it.

**And the interval gate stayed out of the way.** Event 8's process start took **no**
scan — the last one was eleven minutes earlier, well inside 12 h — so the recovery
came from the operator's button rather than from the wake. Had nobody pressed it,
the next due scan would have reported the same two losses up to twelve hours later.
Slower, and still not lost, which is the property being bought.

#### P20's first half, this time under controlled conditions

`signal:…BOOT_COMPLETED` at **uptime 15h10m54s**, 69 ms after a process start that
followed a deliberate force-stop, and 82 ms before the Activity resumed. Every
event in this lane derives the same boot instant as the `grants` lane —
**2026-09-27 15:31:00.640** — so this is the **fifth** delivery inside one boot
session, and the first where the operator stated the force-stop in advance rather
than the record reconstructing it afterwards.

The count is now five deliveries after a stop, against **one** launch after an
ordinary process death that carried none (§7b4's 11h43m45s row). P20's control half
still rests on that single absence, so the prediction is strengthened and not yet
settled: *let the process die on its own, then open, and expect nothing.*

#### P19, untested for the third time, and the reason is now a pattern

Three uninstalls have now been performed across two days, and **not one package
broadcast has ever reached the receiver** — because every one of them happened
while the app was force-stopped. The route has never had an opportunity to work or
to fail. That is not evidence about the route; it is evidence about the procedure,
and the procedure keeps invalidating the test in the same way.

The test that would settle it does not involve a force-stop at all: **open Orb pass
2 B, leave it alone, and install something.** If a
`signal:…PACKAGE_ADDED:package:…` reading appears, the route works and the scan is
a safety net. If the scan sees the new package and no reading exists, the manifest
route is refuted — and that is the finding worth having, because it is the only
route that could be prompt about a new app rather than up to twelve hours late.

#### A change the operator did not announce — and the answer

The scan reported **two** losses: `com.nhn.android.band`, which was stated, and
`com.ixigo`, which was not. Nothing in the record said which was which — the journal
knows what moved, never why — and that was the first time this loop surfaced a
change its operator had not mentioned. The alert put the question rather than
guessing at it, and **the operator answered: both were them.**

So the package rule's loop has now closed end to end, the way the grant rule's did
in §7b2: reading → scan → comparison → change → alert → person → answer → journal.
The answer is `orb.alert.answered` citing the alert in `causes`, the next projection
reads it, and a second `raiseAlerts` returns **zero** — not because the answer taught
the rule anything (DR-8) but because the alert was already raised. Verified after the
fact: the lane length did not move, `alertsFor` returns nothing, and the answer folds
as `dismissed`.

**A false positive would have looked identical up to the answer**, which is the
reason the answer is recorded at all: §7 R6 says false positives cost trust, and a
rule nobody can measure for them is a rule nobody can improve. This one was true,
and the record can now say so with a date.

### 7b10. P19 refuted — the package broadcast never arrives — 2026-09-28

An app was reinstalled with the process **alive and never force-stopped**, and no
broadcast reached the receiver. P19 is refuted.

```
 8  06:41:54  15h10m53s  process.start            <- the last process start in the file
16  06:42:15  15h11m15s  observed  app.opened
17  06:55:23  15h24m22s  observed  app.opened
18  06:56:54  15h25m54s  observed  app.opened
19  06:56:56  15h25m56s  packages  operator.scan   changed: TRUE  482 → 483
                                   gained: com.ixigo
20  06:57:02  export
```

**The process never restarted.** `grants.process.start` appears on lines 1 and 8 of
the export and nowhere else, so one process ran continuously from 06:41:54 to
06:57:02 — fifteen minutes spanning the install. `Pass2.onCreate` writes that event
unconditionally, so its absence is proof rather than inference. The app was launched
three times in the window, which clears any stopped state, and the operator
force-stopped nothing.

**The only `signal:` in the whole file is one `BOOT_COMPLETED`.** No
`PACKAGE_ADDED`, under any data scheme, at any point.

**And the same receiver demonstrably works.** `WakeReceiver` is registered once and
its `BOOT_COMPLETED` filter fired at 15h10m54s in this very file. The class, the
registration and the delivery path are all live; the package intent-filter beside it
is what produces nothing.

#### What this costs, stated plainly

**There is no prompt route for packages. There never was one.** Every earlier note
in this document describing the broadcast as *promptness* and the scan as a *safety
net beneath it* is wrong, and the direction of the error matters: the scan is not a
backstop, it is the **entire mechanism**. `SCAN_INTERVAL_MS` is therefore not a
convenience, it is the **detection latency for a new app** — up to twelve hours,
always, with nothing faster underneath it.

**And §7b5's explanation was sufficient but not the cause.** I attributed the three
earlier silences to the force-stop and the stopped-package exclusion. That fitted
every fact available then, and it was wrong as a *diagnosis*: the route fails with
no force-stop anywhere near it, so those tests would have produced nothing either
way. The force-stop was never the reason. Recording that the explanation was
consistent with the evidence and still not true is the point of §7 R5.

#### The mechanism is unknown, and is recorded as unknown

Three candidates fit, and this run distinguishes none of them:

1. **Manifest receivers may no longer receive implicit package broadcasts.** Android
   8 restricted implicit broadcasts to context-registered receivers with a published
   list of exceptions; `BOOT_COMPLETED` is on that list and arrives here, which is
   consistent.
2. **Package visibility.** On API 30+ an app is told about packages it can see, and
   this app declares `<queries>` for one intent only.
3. Something specific to this platform build.

The record says the route does not deliver on **`CP1A.260405.005`, API 36, target 36,
2026-09-28**. It does not say why, and a guess dressed as a finding would be worth
less than the refutation.

#### What is kept, and why

The package intent-filter stays in the manifest and `WakeReceiver.isPackageAction`
stays in the code, both relabelled as **refuted and retained as a detector.** They
cost one filter and one comparison; what they buy is that if a future Android, a
different `<queries>` declaration or a context-registered receiver ever makes the
route work, a `signal:…PACKAGE_ADDED:package:…` reading appears in the journal and
says so. A refuted route deleted is a refutation nobody can un-make; kept and
labelled, it is a standing measurement.

#### The loop, twice more — and what the answers do and do not measure

The reinstall raised a second package alert — `+ com.ixigo`, under
`device-watch.packages-changed` — and the operator answered it as they had the
first. Three package changes have now gone reading → scan → alert → person →
answer → journal, **none of them with a broadcast involved**, which is now known to
be the only way any of them could have been caught.

**Two alerts, two answers, both `dismissed`, and zero false positives — which are
not the same statement.** `dismissed` records that the person recognised the change
as their own doing. A false positive would be an alert for a change that **did not
happen**, and there has not been one: every entry named in every alert moved on the
device, confirmed by the operator in both cases. The distinction matters because §7
R6 makes false positives the expensive failure, and a rule whose dismissals were
counted as errors would be tuned in exactly the wrong direction. Two is not a rate
and is not offered as one; it is the start of a count that now exists.

### 7b11. Why pass 1 stopped opening — an unbuffered read, measured — 2026-09-28

Pass 1 held on its launch splash and then raised *isn't responding*. The operator
got it open long enough to export: **5,667 events, 3.3 MB.**

It is not a crash, and **it is not the journal's size.** 3.3 MB is nothing to read.

#### The measurement

`Journal.readLines` used `RandomAccessFile.readLine()`, which is **unbuffered** —
one `read()` per byte, so 3.3 MB costs about 3.3 million syscalls per pass. Against
pass 1's real lane, on a desktop JVM, which is faster than ART:

| | unbuffered | buffered |
| --- | --- | --- |
| one pass over the lane | **1,017 ms** | **6 ms** |

Byte-identical output, asserted across three rounds. **A 60× constant factor**, and
the launch path walks the lane six or seven times before a screen can draw:

| call | before | after |
| --- | --- | --- |
| `Journal.open` | 1,065 ms | 54 ms |
| `last` (in `reconstructGap`) | 987 ms | 8 ms |
| `chainBreaks` (in `SelfTest`) | 1,028 ms | 32 ms |
| `verify` (on the screen) | 2,141 ms | 16 ms |
| `lastOfType` (last self-test) | 1,127 ms | 12 ms |
| **launch path, together** | **~6.3 s** | **~0.12 s** |

Android's *isn't responding* threshold is five seconds, and ART is slower than the
JVM these numbers came from. **That is the ANR, measured rather than argued.**

#### What the defect actually was

A constant factor that nothing could see until a lane grew large enough to make it
fatal. Every test passes at every size; the desktop suite's 101 checks passed before
the fix and after it. It is invisible to correctness and lethal to usability, and
**the only thing that could have caught it is a real journal that had been running
for days** — which is what this loop is for.

The fix is `BufferedReader` over `FileInputStream`, decoding UTF-8 directly instead
of round-tripping bytes through ISO-8859-1 (which the old shape needed only because
`RandomAccessFile.readLine` returns one char per byte). The journal writes `\n`
only, so the two readers agree on line breaks.

**Pass 2 inherits it, and would have hit the same wall.** `Journal.java.in` is taken
from pass 1 at build time, and `Pass2.observe` calls `lastOfType` on every wake while
`scanPackages` calls it again. At the measured 42 KB/day (§7b8), pass 2's lane
reaches 3.3 MB in about **eleven weeks** — and it was on course to become unopenable
in exactly the same way, silently, having passed every test the whole time.

#### What the export also confirms, and does not fix

`verify` reports **1 break in 5,667 events, at line 4** — line 5's `previous` is the
string `"35"`, the first two characters of a hash from two events earlier. That is
**§5d, already diagnosed and already recorded**: a partial read of the chain head on
reload. It is confirmed still present and is not news.

It does mean `chain.linksEndToEnd` reports FAILED **correctly**. The chain really is
broken there, history is never rewritten to hide it, and no fix to the self-test
changes that. The pending self-test change was about the check's own logic, not about
this break, and saying otherwise would be the §5j error again: a real pre-existing
failure reported as if the instrument were at fault.

#### The design fault this exposed

Pass 1's journal can leave the phone **only through pass 1's own Export button**. An
app that will not open cannot surrender the evidence of why it will not open, and
nothing else on the device can read app-private storage. It cost something today —
the export arrived only because the ANR dialog could be waited out — and it is
recorded now rather than after it costs more.

### 7b12. The fix, measured on the device by the device — 2026-09-28

Pass 1's fix installed cleanly — the key matched, unlike pass 2's (§7b8) — and the
journal it was fixing recorded the repair.

#### The self-test passes, for the first time

```
probe.selftest  07:28:26
  ok: true      failed: []      chainBaseline: true      chainBreaks: "4"
  chain.noNewBreaks: true
  encoder.canonical: true   encoder.payloadDigest: true   encoder.eventDigest: true
  storage.appendSurvivesReopen: true
  locale: en-IN   vm: Dalvik 2.1.0
```

Twelve self-tests are in this lane. **Eleven read `ok: false`, failing
`chain.linksEndToEnd`; the twelfth is the first that has ever passed.** The old
check name is gone from the payload, which is the confirmation §5j's fix landed
rather than a reassurance that it did.

**`chainBreaks: "4"` is the honest part.** The baseline captured the §5d break at
line 4 rather than hiding it, and from here only a **new** break fails. The damage
is still in the chain, still immutable, still exported. Nothing was repaired; what
changed is that the check now asks a question whose answer can change.

#### The launch cost, measured on the phone

`probe.process.start` and `probe.selftest` are written back to back, and the
self-test's dominant cost is one `chainBreaks()` pass over the lane. The gap between
them is therefore a direct measurement of one full read — taken by the device, on
every process start, for three days:

| date | events in the lane | `process.start` → `selftest` |
| --- | --- | --- |
| 09-25 | 1,443 | 694 ms |
| 09-25 | 1,447 | 3,345 ms |
| 09-25 | 1,962 | 1,222 ms |
| 09-26 | 3,020 | 3,594 ms |
| 09-27 | 5,635 | **5,628 ms** |
| 09-28 | 5,639 | 2,838 ms |
| 09-28 | 5,648 | 5,562 ms |
| 09-28 | 5,656 | 2,931 ms |
| **09-28, new build** | **5,748** | **51 ms** |

Roughly a millisecond per event, growing with the lane, exactly as an unbuffered
per-byte read predicts — and **5,628 ms for the self-test alone already exceeds
Android's five-second threshold**, with six or seven such passes in the launch path.
Then 51 ms at a larger lane than any row above it. **A 55–110× improvement on the
device**, against the 60× measured off it (§7b11).

*(A 09-25 12:05 process start is left out of the table rather than dropped silently:
it wrote no self-test at all, because that build predates `SelfTest`. Pairing it with
the next process's result would have produced a 722-second row that measures nothing.)*

#### What the fix did not establish

**The encoder checks were already passing.** `encoder.canonical`,
`encoder.payloadDigest` and `encoder.eventDigest` read `true` in the first self-test
on 09-25 and in every one since, under `Dalvik 2.1.0` with `locale: en-IN` — which
is not the test machine's, and which is what §7b said could only be asked on the
device. That question was answered on **09-25**, not today, and today's pass adds
nothing to it. Reading a newly-green screen as newly-green evidence would be the §5j
error with the sign flipped.

#### The app recorded its own absence

```
probe.gap.inferred  07:28:26
  durationMs: 37,380      shortGap: true      confidence: "0.6"
  detectedBy: "process-restart-after-unexplained-last-event"
  lastEventType: "probe.heartbeat"
```

The 37.4 seconds it took to replace the app are in the journal as an inferred gap,
with the confidence and the inference method named. P4's property — *the runtime can
record that it was killed or deferred* — holding across its own upgrade.

#### Why this one matters beyond the bug

The defect passed **101 desktop checks** before the fix and after it. It was
invisible to every test the project has, at every size those tests use, and it was
lethal to usability at a size only a real run reaches. Nothing but a journal that had
been carried for three days could have surfaced it — and then the same journal
measured the repair, on the device, without anyone adding an instrument to do it.
That is `DEVICE_LOOP.md` working as designed, on itself.

---

## 7a. Sequencing the pass-1 run

The predictions are not independent in practice, because P6 needs the services
**stopped** and P1/P3 need them running for six uninterrupted hours. Run them in
an order that does not spoil the long one:

1. **P1 and P3 first, and alone.** Leave the probe recording and the phone
   untouched for more than six cumulative hours. A `probe.service.timeout`, and
   which service it names, is the answer. Interrupting this is the only mistake
   that costs a whole day.

   **Do not open the app.** Android's own description of the cap is that the six
   hours accrue *unless the user interacts with the app, which resets the
   timer* — so opening it to check on it is enough to restart the clock, and the
   test would then run forever without ever firing. Force-stopping obviously
   ends it too, but the subtler failure is the well-meaning check.

   The foreground-service notification is the check that costs nothing: it is
   visible in the shade without launching anything, and the probe's notification
   carries no tap action, so it cannot accidentally foreground the app.

   Exporting means opening the app, so **export only after the timeout fires**
   or after the window has clearly elapsed.

   A consequence worth holding onto: if interaction resets the timer, then the
   cap binds a runtime the user never opens far more tightly than one they touch
   during the day. P1 measures the **worst case**, which is the right thing to
   measure and is not the same as the typical one. `MOBILE_SENSING.md` §2 G4
   should be read that way once this returns an answer.
2. **P2.** Reboot, then wait without opening the app. Anything that appears
   arrived without the user.
3. **P4.** Force-stop from Settings, reopen, look for `probe.gap.inferred`.
   Already held once (§5f), so this is corroboration on a deliberate kill rather
   than an incidental one — cheap, and strictly after the long run, never during
   it.
4. **P6.** Stop the services, install or uninstall any app, and look for a
   `probe.signal` carrying `"registration":"manifest"`.

Export after each, not only at the end: an export is cheap, and a run that is
only exported once can lose everything to a single mistake.

---

## 7b. Written and held for pass 2 — the device checks itself

**2026-09-25.** Written, tested on the desktop, compiled against `android.jar`
API 36, and **not built into an APK and not installed.** §7 R4 stands: the
instrument does not change while the run is under way. This ships when pass 1
ends.

### Why the device needs its own checks at all

`tests/run.sh` (§5g) runs the probe's classes on a desktop JVM. That is the
right place for most tests and the wrong place for three of them, because three
questions are about *this device on the day it runs* and cannot be asked
anywhere else:

1. **Does the encoder agree under ART?** The desktop suite proves agreement on
   JDK 21. ART is not JDK 21, and the device's default locale is not the test
   machine's. `Journal.sha256` formats bytes with `String.format("%02x", b)`,
   which resolves against `Locale.getDefault()`. The formatting is believed
   locale-independent for hex. Believed is not measured, and this project
   replaces believed with measured. A divergence would not look like a wrong
   answer; it would look like this device being permanently unable to agree with
   any other about the history it holds.
2. **Does the chain this device is carrying still link end to end?** Only this
   device holds it.
3. **Is the directory Android gives us still writable, and does an append
   survive a reopen?** Permissions, scoped storage and free space change under
   the app across OS updates. A fake `Context` cannot notice. The reopen is the
   path that carried the §5d defect, so a build whose `restore()` is broken says
   so on its first start rather than forking the real chain silently.

That is the whole set. Everything else stays on the desktop, where it is faster
and where states can be constructed that a device cannot be talked into.

### Why not an instrumentation test APK

The usual Android answer — `androidTest`, a second APK, run over `adb` — needs a
host running Gradle and a cable, which is the path this project has moved off
(§5b addendum). It also tests the wrong artifact: the test APK is a *different*
build, so it exercises a copy of the instrument rather than the one carrying the
history. Installing a JDK on the phone is worse for the obvious reasons.

Self-contained means the checks ship **inside** the production APK.

### The result is an event, not a log line

`SelfTest.run` returns a payload and `Probe` appends it as `probe.selftest` on
every process start. Art. XI §42 — the runtime never assumes reality matched an
expectation — applies to the instrument's belief about itself. Recording the
check as history means a build that started encoding differently, or a
filesystem that stopped accepting writes, appears in the same replay as
everything it would have corrupted. The phone's own screen shows the last
recorded result, read back from the journal rather than re-run.

The storage check writes to a throwaway lane and deletes it. Test data in the
real lane would be indistinguishable from history, and there is a test asserting
it never lands there.

### What this is not

The app reporting on itself is a **regression and liveness check, not an
attestation.** A compromised instrument reports whatever it likes. This is the
same limit as `CLAIMS.md` C2c — a claim checked only by the party who could have
broken it is the weaker claim — and it is why the desktop suite and the
cross-implementation vectors still matter. It catches a broken build, a changed
platform and a failing filesystem. It does not catch a hostile one.

The self-test also cannot test itself: one that is broken toward always passing
reports that everything is fine, which is the single failure it would never
catch. Its coverage lives in `tests/SelfTestTest.java.in`, where a broken chain
is staged deliberately and the self-test is required to notice.

### Cost, stated

One extra event per process start, and a few hashes plus one small file of work.
Pass 2's journals will therefore not be shaped like pass 1's, which is worth
remembering when comparing them.

---

## 8. Exit criteria for pass 1

1. ~~P0 answered, either way, before Kotlin is written.~~ **Done 2026-09-25:
   held.** P0a and P0b raised in its place and carried into pass 1.
2. P1, P2, P3, P4, P6 each answered `held` or `refuted`, with evidence from the
   device. **Partly done 2026-09-25 (§0): P1 refuted, P2 refuted, P4 held. P3
   overtaken rather than tested; P6 still untested because a foreground service
   ran throughout.**
3. `MOBILE_SENSING.md` corrected wherever the device disagreed with it.
   **Partly done 2026-09-25: G4 corrected, G4a and G5 added (§0).**
4. A week of real carrying replayed, with every gap explained by a recorded
   deferral — or P4 refuted, which is the more valuable outcome, because it would
   be found now rather than after a year of trusted history turned out to have
   holes in it.


## 9. The other loop

This document tests whether the runtime survives a real device. It does not
test whether the product promise is true — that Orb puts a consent gate at the
irreversible moment, keeps a record no agent can rewrite, and holds data the
user owns, with any provider.

`CLAIMS.md` carries those as C1–C4, under the same rules these predictions
follow: a named adversary, a negative control, a dated and versioned
comparison, and a stated boundary. Same discipline, different subject. Neither
loop starts a new test while the other one is mid-run.

---

### 7b13. P20's control half — a second absence, and it is not elapsed time — 2026-09-28

`orb-pass2-20260928-151525.txt`, lane `grants-b`, 26 events. Every event derives
the boot instant **1790523060640 ±1 ms**, so this is one boot session throughout —
no reboot anywhere in the window.

Two launches in the same export, and they disagree:

| Launch | Gap since the lane's last event | `signal:…BOOT_COMPLETED`? |
| --- | --- | --- |
| 06:41:54 (uptime 54,653 s) | **10 min 15 s** | **yes** — 06:41:54, uptime 54,654 s |
| 09:45:12 (uptime 65,651 s) | **2 h 48 min 09 s** | **no** — `process.start`, `observed(process.start)`, `observed(app.opened)`, and nothing else |

**Whether this is the control half or a refutation is not known**, and the two
readings point in opposite directions.

This section first recorded the operator as having confirmed no force-stop in the
2 h 48 m window. **That was wrong, and is retracted 2026-09-28.** What they said
was that they *did not know* — and that their habit is to force-kill, so a
force-stop in that window is more likely than not.

The consequence is not a weaker version of the same finding. It is a different
finding, or its opposite:

| If, in that window | Then the 09:45 absence is |
| --- | --- |
| no force-stop occurred | **the control half**, as §7b9 predicted |
| a force-stop occurred | **a counterexample.** P20 predicts a `BOOT_COMPLETED` on the next launch. None arrived |

A force-stop leaves no trace in the journal of the app it stops, so **the lane
cannot settle this and neither can recall.** The honest state is *unknown*, which
is not the same as the control having failed — and recording it as a confirmation
was the exact error this project keeps a register for: reasoning to a conclusion a
source could not support.

The pairing is what makes it worth recording rather than the absence alone.
**The longer gap produced no signal and the shorter one did**, which rules out
elapsed time as the trigger in the most direct way available: the same device, the
same boot, the same build, four hours apart. Any explanation of the form *the app
had been closed long enough* now has a counterexample inside one export.

The control half therefore still rests on §7b9's **single** absence. P20 is **not
settled** — a correlation over six deliveries and two
absences is still a correlation, and the mechanism remains unexplained after §7b4's
queue-replay guess was withdrawn — — but one thing here does survive the retraction intact.

**Elapsed time is still ruled out.** That conclusion never depended on knowing
about the force-stop: the 06:41 launch carried the reading after ten minutes and
the 09:45 launch did not after two hours and forty-eight, so *the app had been
closed long enough* has a counterexample inside one export either way.

#### The real lesson: stop asking a person to remember

Both halves of P20 now depend on a fact **no instrument records** — whether a
force-stop happened — and the only witness has been human recall. §7b9 got it
right by having the operator declare the force-stop in advance; this section got
it wrong by asking afterwards. A protocol that works only when someone remembers
to declare is not a protocol.

The fix is to get the answer from the OS instead. Android exposes historical
process exit reasons (`ActivityManager.getHistoricalProcessExitReasons`, API 30+;
this device is SDK 36), which would let pass 2 record **why its previous process
died** at the next start — from the platform, not from memory. That would turn
P20's subject from something reconstructed into something observed, by an
independent source that the person cannot misremember.

**Unverified against the SDK on this device.** It is the candidate worth trying
next, not a mechanism this document is claiming. It is also the same principle
the C1 vantage question landed on (`CLAIMS.md` §5): when you need a fact the
actor cannot supply reliably, find a **second source**, not a second machine.

#### The package set moved twice, and the scan caught both

Four `operator.scan` readings, `scope: all`, `readable: true` throughout:

| Scan | Count | Change |
| --- | --- | --- |
| 06:30:28 | 484 | none (`baseline: false`) |
| 06:42:03 | **482** | lost `com.ixigo`, `com.nhn.android.band` |
| 06:56:56 | **483** | gained `com.ixigo` |
| 09:45:21 | 483 | none |

`com.nhn.android.band` stays uninstalled; `com.ixigo` left and returned, which is
the reinstall already recorded in §7b10 repeating in a fresh window. Both
transitions were reported by the scan, on demand, with the gained and lost sets
named — no broadcast was involved in either, consistent with P19's refutation.

**The fourth scan is the one that carries information.** `changed: false` at
09:45:21, after two changes earlier in the same lane, is `lastOfType(PACKAGES)`
working across intervening observations: the comparison reached past three
`grants.observed` events to the previous scan, and correctly found nothing new.
A baseline that reset on every launch would have said `baseline: true` here.

---

### 7b14. The exit-reason probe — asking the platform instead of a person — 2026-09-28

`apps/pixel/pass2/src/Exits.java.in`, wired into `Pass2.onCreate` immediately
after `recordStart()`. New event type `grants.exits`.

**The problem it removes.** Both halves of P20 turn on whether a force-stop
happened, and **a force-stopped app writes nothing — that is what being
force-stopped is.** So this journal is structurally unable to record its own
force-stop, and the only witness has ever been human recall. §7b13 is what that
costs: one absence that is either the control half or a counterexample, with
nothing in the lane able to decide, after an answer given in good faith turned out
to be *I did not know*.

`ActivityManager.getHistoricalProcessExitReasons` survives the stop because the
platform does. **Verified present in the SDK before writing against it** —
`android.app.ApplicationExitInfo` carries `REASON_USER_REQUESTED` and
`REASON_USER_STOPPED` among seventeen codes, and the method is
`getHistoricalProcessExitReasons(String, int, int)` on `ActivityManager`. `minSdk`
is 34, so no version branch is needed.

It is **a second source, not a second machine** — the same conclusion `CLAIMS.md`
§5 reached for C1's vantage, arrived at independently on the device side. When a
fact cannot be supplied reliably by the actor, find something that already knows.

#### What it records, and the three disciplines it carries

| Field | Why it is shaped that way |
| --- | --- |
| `exitsReadable` | `false` on any throw or missing service. **Cannot-check is never an empty list** — an empty list would claim *this process has never died*, which of a running app on its second start is false and load-bearing |
| `exitReasons` **and** `exitCodes` | The integer is what the platform said; the name is this build's reading of it. A future Android adding a constant would otherwise have it silently rendered as an existing one, so an unmapped code becomes `unmapped:<n>` |
| `exitsUserInitiated` | A **reading**, recorded beside the codes rather than instead of them, so P20's answer never depends on this function being right. Deliberately narrow: `REASON_OTHER` and `REASON_UNKNOWN` are not counted, because an exit the platform could not classify is not evidence a person caused it |
| `exitsThrough` | Newest timestamp seen, the watermark the next start compares against — not a count, because the platform trims its own history and a count would drift the moment it did |
| `baseline` | Same meaning as everywhere else: no prior record, so what is listed was already there. A first run finds every exit still remembered, and reporting those as news would be §5j's always-failing check in a new place |

`exitCount: 0` is deliberately still written. It separates *nothing died between
these two starts* from *this was never looked at*.

#### What it will settle

A launch that carries `signal:…BOOT_COMPLETED` should carry an exit report naming
`user.requested` or `user.stopped`; a launch without the reading should not. **P20
becomes checkable from one export, with no one required to remember anything.**
It may also answer a question §7b9 raised and left open — whether swiping from
recents counts as a force-stop — since the platform will say which reason it
recorded.

#### A risk this build surfaced, unrelated to the probe

`keys/pass2b.keystore` is **gitignored, untracked, and exists only in the build
container**. It is the one key that can upgrade the installed pass 2 B, so if the
container is recycled the app can never be updated again and `grants-b` goes with
it at the forced reinstall — §7b8's signature-mismatch failure, arriving by a
different route. Signer SHA-256 `98093b72163770afd40b1744934d9064889da8b725f4922389b6b7ce4fb69019`.
The key was handed to the operator to keep off-container; it cannot live in the
repository, because a signing key in version control is a worse failure than the
one it prevents.

---

### 7b15. P20 answered, and §7b13 settled — by the platform, against recall — 2026-09-28

`orb-pass2-20260928-185558.txt`, lane `grants-b`, 39 events. The exit probe
(§7b14) was installed at ~13:24 and **produced a decisive result on its first two
records.**

#### Every exit the platform reported, paired with the launch that followed it

| Exit at | Platform's reason | Next launch | `BOOT_COMPLETED`? | P20 predicts |
| --- | --- | --- | --- | --- |
| 06:41:05 | `user.requested` | 06:41:54 | **yes** | yes ✓ |
| 07:26:29 | `low.memory` | 09:45:12 | no | no ✓ |
| 12:02:45 | `low.memory` | 13:24:27 | no | no ✓ |
| 13:24:46 | `user.requested` | 13:25:48 | **yes** | yes ✓ |

**Four for four, in both directions.** Two user-initiated exits, each followed by
the reading; two low-memory deaths, neither followed by it. This is the first time
both halves of P20 have been tested against a witness that is not a person's
memory, and the first time the *negative* half has more than one instance.

P20 is no longer *"a correlation over deliveries and absences"*. It is a
correlation whose independent variable is now **measured at each occurrence** by
the platform that caused it. The mechanism is still unexplained — why a force-stop
should produce a `BOOT_COMPLETED` at 21 hours' uptime is not answered by knowing
that it does — but the prediction itself is now checkable from one export with
nobody required to remember anything.

#### §7b13 is settled, and recall was wrong

The launch at 09:45:12 is §7b13's. The exit that preceded it, at 07:26:29, was
**`low.memory`** — not a force-stop.

So that absence **was the control half**, and §7b9's single negative now has
company. The operator's stated expectation was the opposite: *"I would have force
killed it, I meant I didn't know."* The platform disagreed with the habit.

This is the outcome the probe was built for, arriving faster than expected — and
it arrived because **the platform's history reached back past the probe's own
installation.** The exit at 06:41:05 happened nearly seven hours before `Exits`
existed on the device, and the answer to §7b13's question was sitting in the OS
the entire time it was being argued about from the lane. Nothing needed to be
re-run.

> The general lesson, which is the same one `CLAIMS.md` §5 reached from the other
> end: **when the actor cannot supply a fact reliably, the answer is usually
> already held by something else that was watching anyway.** Both times, the
> instinct was to add apparatus — a second device, a stricter protocol — and both
> times the existing second source was cheaper and better.

#### One defect in the probe, found on first contact with data

`exitsUserInitiated` is an **any-of across the batch**, and on the baseline record
it read `true` while the *immediately preceding* exit was `low.memory`. For a
single-exit report it is exactly right; for the baseline it answers a question
nobody asked. The pairing above was recoverable only because `exitTimestamps` and
`exitCodes` are ordered and complete — the flag alone would have misled.

**Not yet fixed, deliberately**: the operator has just started the control run
with the app backgrounded, and installing a new build would force-stop it and
destroy that run. The fix is to name the most recent exit's reason in its own
field and leave the any-of as an aggregate. It waits for the next export.

---

### 7b16. The control for P20 has existed since §5k, on the same phone — 2026-09-28

§7b15 closed with *"the mechanism is still unexplained."* That is true, but it
skipped past evidence this project already has, and the operator was right to
push back on it.

#### What the early runs established, and why it matters here

§5i and §5k measured the boot path in pass 1 directly:

| | |
| --- | --- |
| **Two services**, sharing one process | `dataSync` and `specialUse` |
| `dataSync` at boot | **Refused by name.** `ForegroundServiceStartNotAllowedException` — *"FGS type dataSync not allowed to start from BOOT_COMPLETED!"* |
| `specialUse` at boot | **Starts.** 15 beats, zero skipped, nobody opened the app |
| `BOOT_COMPLETED` delivered | **133 s after boot** (§5k); 172 s in the confounded first attempt (§5i) |

The last row is the one that bears on P20, and it is the one §7b15 did not use.
**In pass 1, a genuine boot delivery has a shape: it arrives about two to three
minutes into uptime, once per boot, with nothing having been opened.** Every
reading P20 is about looks nothing like that — 15 h 10 m in §7b9, 21 h 54 m in
§7b15 — which is already strong evidence that pass 2's readings are not boot
deliveries at all.

#### Pass 1 is the negative control, it is installed, and it has been running

The package set in this export names **seven** Orb-family packages: `app.orb`,
`dev.orb.pass1`, `dev.orb.pass2`, `dev.orb.pass2b`, `dev.orb.probe`,
`dev.orb.probeb`, `dev.orb.probeg`.

So pass 1 is on the device, with a `specialUse` foreground service that §5k
showed restarts itself at boot and §5h showed running 6 h 31 m. **An app running
a foreground service is never in the stopped state**, which is the condition the
force-stop hypothesis turns on. The two apps therefore differ in exactly the
variable under test, on the same phone, through the same boot.

That makes the comparison sharp, and it costs one export:

| | Pass 1 (`probeg`) — service running, never force-stopped | Pass 2 B — force-stopped repeatedly |
| --- | --- | --- |
| Expected `BOOT_COMPLETED` readings since the 09-27 15:31 boot | **exactly one**, at ~2–3 min uptime | **several**, at 15 h and 21 h uptime |

**Both outcomes are informative**, which is what makes it worth doing rather than
assuming:

- **One reading at low uptime in pass 1** → the readings in pass 2 are not boot
  broadcasts, and the difference tracks the stopped state exactly. P20 stops
  being a bare correlation and gains the control it has never had.
- **Readings at high uptime in pass 1 too** → the force-stop is not the variable
  at all, and P20's whole framing is wrong. That would be a refutation, and a
  cheap one.

#### What was wrong in §7b15's closing line

*"The mechanism is still unexplained"* conflated two questions that the early
runs already separate:

1. **Is this a boot broadcast?** Answerable, and probably already answered:
   pass 1 shows what a real one looks like and these do not resemble it.
2. **Why does Android emit this action to a package leaving the stopped state?**
   Genuinely unexplained, and a question about platform internals rather than
   about Orb.

Only the second is open. Treating both as open ignored a measurement this
project paid for four days ago — which is the failure `SETTLED.md` exists to
catch, arriving this time as *under*-using a settled finding rather than
re-deriving one.

**Next export needed: pass 1 (`dev.orb.probeg`), whole lane.** Nothing needs to
be done to the phone first, and the pass 2 B control run must not be disturbed to
get it.

---

### 7b17. The platform distinguishes them itself — `dataSync` is the discriminator — 2026-09-28

`orb-pass1-20260928-190715.txt`, lane `pixel`, 5,757 events. **§7b16's prediction
was wrong in both of its premises, and the export is more valuable for it.**

#### Every `BOOT_COMPLETED` in pass 1's whole history

| Delivered | Uptime | `dataSync` outcome | `specialUse` |
| --- | --- | --- | --- |
| 09-25 11:51:45 | **0.05 h** | — | foreground |
| 09-25 12:19:52 | **0.04 h** | **refused** — *"FGS type dataSync not allowed to start from BOOT_COMPLETED!"* | foreground |
| 09-26 09:27:53 | **0.05 h** | **refused** — same message | foreground |
| **09-28 07:06:48** | **15.60 h** | **`foreground`** | foreground |

#### The finding: Android applies the boot restriction to three of these and not the fourth

At a genuine boot, the platform refuses `dataSync` **by name, citing
`BOOT_COMPLETED` in the message**. At 15.60 h uptime, the same receiver, the same
code path and the same action string produced `foreground`.

**The action is identical and the platform's treatment of it is not.** That is a
discriminator attested by Android rather than inferred by us, and it says these
are not the same event. A real boot broadcast carries the boot-time
foreground-service restriction; this one did not.

The natural reading — consistent with everything observed, and still short of
proof from source — is that the late delivery reaches an app **that has just been
launched by hand**, which carries its own exemption from background FGS-start
limits. A boot broadcast at 133 s has no such exemption, which is exactly why
`dataSync` dies there and lives here.

> This is what §7b15's "unexplained" should have been narrowed to. Not *why does
> this arrive* — but *why does it arrive without the restriction that defines a
> boot broadcast*. The second question has an answer visible in the data.

#### Both of §7b16's premises were wrong

1. **"Pass 1 runs a `specialUse` service, so it is never in the stopped state."**
   Pass 1's services were alive for **21 minutes** on 09-28 — 07:06:57 to
   07:27:48 — and have been dead since. In the 09-27 boot session they ran only
   in that window, because **the only thing that starts them is the
   `BOOT_COMPLETED` receiver**, and it fired once.
2. **"Pass 1 was never force-stopped."** The morning of 09-28 shows six process
   starts between 06:18 and 07:06 — the ANR window of §7b11, where the app hung
   and was closed by hand repeatedly. Closing an unresponsive app is a stop, so
   pass 1 was in the stopped state, over and over.

So pass 1 is **not the negative control this project still lacks.** It is a
**second independent instance of the same phenomenon**, in a different app, on a
different build, through the same boot — which is worth more than the control
would have been for one purpose (it reproduces) and worth nothing for the other
(it does not isolate).

#### Where P20 stands now

- **Reproduces across apps.** Two packages, two codebases, same signature.
- **Six positives, two negatives**, all with the platform's own exit reason or
  service outcome attached rather than recall.
- **The discriminator is stronger than the correlation.** Uptime alone is
  circumstantial; `dataSync` refused-versus-allowed is the platform stating that
  it classified the two deliveries differently.
- **Still missing: a true negative control** — an app on this phone that went
  through a boot and was never stopped. Nothing on the device currently qualifies,
  and pass 2 B cannot provide one while it is the thing being tested.

#### An unrelated fact the export settles

Pass 1's `chainBaseline` and `chainBreaks` fields first appear at **09-28
07:28:26**, so the §5j build landed between the 07:06 reading and that self-test.
`chainBreaks: 4` and `chainBaseline: true` on first run, `chainBreaks: 4` again at
13:37 — the historical §5d break captured and not re-reported, which is §5j
working as designed and `SETTLED.md`'s second row confirmed once more.

---

### 7b18. The negative control, and the hypothesis it does not separate — 2026-09-28

#### Half of it already existed, and it is thirty hours long

The 09-26 boot session in pass 1's lane, read in full:

| | |
| --- | --- |
| `BOOT_COMPLETED` | 09-26 09:27:53, **0.05 h uptime**, `dataSync` refused by name |
| Heartbeats | **1,474**, continuous, 09-26 09:27:53 → 09-27 15:22:53 — about **thirty hours** |
| Other events in the session | **none.** No second process start, no gap, no `taskRemoved`, no service restart |
| Second `BOOT_COMPLETED` | **none** |

The unbroken beat series is what makes this a control rather than an absence: a
force-stop kills the service and breaks the series, and a restart writes a
`gap.inferred`. Neither happened. **So pass 1 went through a boot, was never
stopped for thirty hours, and never received a second delivery.**

Paired with pass 2 B's two `low.memory` negatives — an app with *no* service,
not stopped, launched, no reading — the control exists on both sides of the
service variable.

#### What it still does not separate

Two hypotheses fit **every** observation on this phone:

- **H1 — re-delivery.** The stopped state withholds the boot broadcast; leaving
  the stopped state releases it.
- **H2 — first sight.** An app that has not yet received *this boot's* broadcast
  gets it at its first opportunity — whether it missed the boot by being stopped,
  or by not being installed yet.

H2 is not a stretch here: **pass 2 B was installed at 06:25 on 09-28, fifteen
hours after the 09-27 15:31 boot.** Every reading it has ever recorded is for a
boot that happened before the app existed. That is a materially different claim
from a re-delivery, and nothing recorded so far distinguishes them.

#### The experiment that does — and it answers P6 on the way

The discriminating case is **an app that already received this boot's broadcast
at low uptime, is then stopped, and is then launched.** H1 says the reading comes
again. H2 says it does not, because that app has already seen this boot.

Pass 2 B has never been through a boot, so it can provide both halves:

| Step | Do | Expect | What it settles |
| --- | --- | --- | --- |
| 1 | Open pass 2 B once. **Do not force-stop, do not swipe from recents.** | — | Establishes it is not in the stopped state |
| 2 | **Reboot the phone.** Leave it alone ~10 minutes, then open and export | `BOOT_COMPLETED` at **~2–3 min uptime** | **Answers P6** — cheap signals with no foreground service, open since pass 1 because a service ran throughout |
| 3 | Later the same day, open it again normally. No force-stop anywhere. Export | **No second reading** | The negative control, with no service and through a boot |
| 4 | **Now force-stop it deliberately**, then launch. Export | H1 → a second reading · H2 → none | **Separates H1 from H2** |

Step 2 is worth the reboot on its own. **P6 has been open since pass 1** and could
never be answered there, because a foreground service ran throughout — which is
precisely the condition P6 excludes. Pass 2 B has no service at all, so a boot
delivery to it is P6 answered for the boot signal.

**The record is now self-verifying.** Whatever the operator does or forgets,
`grants.exits` (§7b14) writes the platform's own reason for each process death,
so a force-stop that was supposed not to happen shows up as `user.requested` and
the run is known to be spoiled rather than silently misread. That is the whole
point of §7b14 and the reason this experiment can be trusted where §7b13's could
not.

---

### 7b19. The reboot ran — P6 strengthened, and **P20 refuted as written** — 2026-09-28

`orb-pass2-20260928-193337.txt`, lane `grants-b`, 55 events. The phone rebooted at
**13:49:00** (derived; new boot instant `1790603340662`). Three results, and the
second is the one that matters most.

#### 1. A genuine boot delivery, with no foreground service — P6 strengthened

| | |
| --- | --- |
| Launch after the reboot | **131 s uptime** |
| `BOOT_COMPLETED` | **131 s uptime**, same second |
| Foreground service in this app | **none, ever** |
| `grants.exits` at that start | `exitCount: 0` — correct; a reboot is not an app exit |

P6 was already **held** from §7b1, but on a delivery **31m59s** after boot. This
one lands at **131 seconds**, which matches pass 1's genuine boot deliveries
(133 s, §5k) to within two seconds — on an app that has never had a service of
any kind. The strongest form of P6 is now measured, not inferred.

The exit history also **survived the reboot**: the later report lists all six
exits, including the four from before the restart.

#### 2. P20 is refuted as written

At **13:40:30** the process died. The platform's reason was **`low.memory`**,
`exitsUserInitiated: false`. At **13:48:18** the app was launched, and
`signal:…BOOT_COMPLETED` **fired**.

P20 says the reading marks *a force-stop since the app last ran, and is absent
after an ordinary process death.* Here there was no force-stop and the reading
appeared. **The prediction is wrong, and the exit probe is what proved it** —
under the old procedure this would have been recorded as another positive and
attributed to a force-stop nobody could check.

Six for six became six for seven the moment the instrument could disagree.

#### 3. The before-and-after is the real signal

Every pass 2 B launch, with the platform's reason for the preceding death:

| Launch | Uptime | Preceding exit | Reading? |
| --- | --- | --- | --- |
| 06:30:23 | 15.0 h | *(install)* | no |
| 06:41:54 | 15.2 h | `user.requested` | **yes** |
| 09:45:12 | 18.2 h | `low.memory` | no |
| 13:24:27 | 21.9 h | `low.memory` | no |
| 13:25:48 | 21.9 h | `user.requested` | **yes** |
| 13:48:18 | 22.3 h | **`low.memory`** | **yes** ← the counterexample |
| — | — | *— reboot —* | — |
| 13:51:11 | **131 s** | *(none; reboot)* | **yes** — genuine |
| 14:03:35 | 874 s | `low.memory` | **no** |

**Above the line**, pass 2 B had never received the 09-27 boot's broadcast — it
was installed fifteen hours after that boot. **Below the line**, it received the
new boot's broadcast properly, at 131 s. The launch after that, following an
ordinary death, got **nothing**.

That is the negative control §7b18 asked for, and it holds: **once the app has
received a boot's broadcast at the boot, the re-delivery stops.**

#### What is now established, and what is not

**Established.** The reading is *not* caused by a force-stop — a `low.memory`
death produced one. And it *does* stop once a genuine boot delivery has occurred.
Both halves point at H2 (first sight of a boot the app missed) rather than H1
(re-delivery on leaving the stopped state).

**Not established, and stated rather than papered over.** H2 does not predict the
table either. If an undelivered app were simply re-offered the broadcast on every
launch, the 06:30, 09:45 and 13:24 rows would all carry a reading, and they do
not. **Three launches in the undelivered state produced no reading and three
did**, and nothing recorded so far separates them.

So the honest position: **the force-stop framing is dead, the first-sight framing
fits better and is incomplete, and the next step is not another guess.** What
would discriminate is a second reboot run — this time letting the app receive the
boot delivery and then force-stopping it deliberately. H2 predicts no reading;
any surviving form of H1 predicts one. That is a single run, and the exit probe
makes it self-verifying.

---

### 7b20. The probe's blind spot, and why §7b19's refutation does not stand — 2026-09-28

**`getHistoricalProcessExitReasons` records process exits. A force-stop is a
package stop.** When a package is force-stopped while it has **no running
process**, there is no process to exit, so **nothing is recorded** — and the most
recent entry stays whatever killed the process earlier.

§7b19's counterexample falls exactly in that gap:

| | |
| --- | --- |
| 13:40:30 | process dies, platform reason `low.memory` |
| 13:40:30 → 13:48:18 | **a force-stop here would leave no trace** — the process was already gone |
| 13:48:18 | launch, `signal:…BOOT_COMPLETED` fires |

So the probe's report — *the last process death was `low.memory`* — is true, and
the conclusion drawn from it — *therefore no force-stop happened* — **does not
follow.** Those are different claims, and reading the first as the second is the
project's founding error in a new place: `Readable: false` means *cannot check*,
never *nothing there*. The instrument answers **why the last process died**. It
does not answer **whether the package was stopped**, and §7b14 should have said
so.

**P20 is therefore restored to unresolved**, not refuted. Its status before this
export stands: strongly supported, six positives and two negatives, one row
(13:48:18) that the instrument cannot classify either way.

**What genuinely survives §7b19, untouched by this correction:**

- **P6 at 131 s with no foreground service.** Independent of the blind spot; the
  delivery and its uptime are directly recorded.
- **The negative control** — after the genuine boot delivery, a `low.memory`
  death and a launch produced **no reading** (14:03:35). Also independent: that
  row needs no claim about stops, only that a reading was absent.

#### The fix to the probe, and the fix to the procedure

**Procedure, immediately:** a force-stop only becomes visible if the app has a
**live process when it is stopped**. So the test must be *open the app, then
force-stop it* — never force-stop an app that is already dead.

**Instrument, next build:** record the package's stopped-state transitions
directly rather than inferring them from process exits, or at minimum have
`Exits` state in its own payload that a `user.requested` absence is **not**
evidence of no force-stop. The honest field name is not `exitsUserInitiated` but
*"the last recorded process death was user-initiated"*, and the flag should say
so or go.

This is the second defect found in `Exits` within hours of its first data
(§7b15 named the first). Both were found by the data rather than by review,
which is the argument for shipping a small instrument early — and both were
about the same thing: **a field whose name claims more than the measurement
supports.**

---

### 7b21. P20 HELD — the controlled test, inside one boot session — 2026-09-28

`orb-pass2-20260928-194246.txt` and `…-194453.txt`, which bracket the force-stop.
Everything below happens in **one boot session** (`1790603340662`), with every
precondition attested by the platform rather than by recall.

| Uptime | What happened | Preceding exit | Reading? |
| --- | --- | --- | --- |
| **131 s** | launch after reboot | *(none — reboot)*, `exitCount: 0` | **yes** — the genuine boot delivery |
| **875 s** | launch | `low.memory` | **no** |
| 1 427 s | app open and **running** | — | — |
| **1 433 s** | **force-stop, with a live process** | — | — |
| **1 551 s** | launch | **`user.requested`** | **yes** |

#### What this settles

**The app had already received this boot's broadcast**, at 131 s. It was then
force-stopped **while running**, so the stop is recorded as `user.requested`
rather than falling into §7b20's blind spot. On the next launch, the reading
**came again**.

- **H2 — first sight of a missed boot — is refuted.** The app had seen this boot.
  It got the broadcast a second time anyway.
- **H1 — re-delivery on leaving the stopped state — is confirmed**, and **P20
  HOLDS**.
- **The negative control sits between the two positives, in the same session.**
  A `low.memory` death at 875 s produced no reading; a force-stop at 1 551 s did.
  Same app, same boot, same build, twenty minutes apart.

This is the test the loop has been circling since §7b4, and it took the exit
probe to make it possible: the force-stop had to be *proven* rather than
remembered, and the negative had to be proven as a non-stop rather than assumed.

#### It also explains §7b19's stray row

The 13:48:18 reading followed a `low.memory` death — apparently a counterexample.
With H1 confirmed, the explanation is §7b20's blind spot: **a force-stop of an
already-dead app, invisible to the probe.** The withdrawal in §7b20 was correct,
and the row is now explained rather than merely unclassifiable.

#### The asymmetry worth recording

**Only `BOOT_COMPLETED` comes back. Package broadcasts do not.** §7b4–§7b5
established that a `PACKAGE_REMOVED` occurring in a stopped window is **not**
released at the next launch, and §7b10 refuted the package route outright. So
this is **not** a generic queue replay — the withdrawal of that guess in §7b4
stands. Something specific to the boot broadcast survives the stopped state and
is re-offered when the package leaves it.

That also fits §7b17's independent evidence from the other side: at a real boot
Android **refuses `dataSync` by name**, and at a re-delivery it allows it — so
the platform is not treating the re-delivery as a boot-time broadcast at all,
which is exactly what a delivery to a just-launched app would look like.

#### What remains open, narrowly

Why the boot broadcast specifically is retained and re-offered is a question
about AOSP's handling of the stopped state, not about Orb, and no export will
answer it. **P20 is now a rule the journal can rely on**: a
`signal:…BOOT_COMPLETED` at non-trivial uptime means the package left the stopped
state, and — because §7b20's blind spot is real — the absence of a recorded
`user.requested` does **not** mean the stop did not happen.

---

### 7b22. The `Exits` flag, fixed — a field that says what it measures — 2026-09-28

Two defects, both found by the probe's own first day of data rather than by
review, and both the same shape: **a field whose name claimed more than the
measurement supports.**

| Defect | Found | Fix |
| --- | --- | --- |
| `exitsUserInitiated` was an **any-of across the batch** — `true` on a baseline because one of three historical exits was user-initiated, while the death immediately before that start was `low.memory` | §7b15 | **Removed.** Replaced by `lastExitReason` and `lastExitUserInitiated`, which describe the **newest** exit — the one that actually pairs with this process start |
| The name read as *the app was force-stopped*, but a stop of an **already-dead** package records nothing, so `false` was never evidence of no stop | §7b20 | **`exitScope: "process"` on every reading**, and the payload comment states the limit |

#### `exitScope` follows the precedent that already exists

It is `installedPackageScope` again, one signal over: **a reader must be able to
tell what kind of look produced the answer.** A package set read under `visible`
compared against one read under `all` reports two hundred uninstalls that never
happened — and an exit history read at `process` scope, compared against a future
one that could see package stops, would be the same error with a different
subject. The scope travels so the comparison can refuse rather than silently diff
two different measurements.

If a later build observes stopped-state transitions directly, this becomes
`package` and the change is visible in the record rather than inferred from a
build date.

#### What was deliberately not added

**No replacement aggregate.** Anything of that shape — *were any of these
user-initiated* — is derivable from `exitCodes`, which is on every reading in
full and in order. A second copy would be a second source of truth for one fact
(Art. IX §33), and the first copy is what went wrong.

Built and signed on the same key, so it upgrades in place and `grants-b`
survives.

---

### 7b23. The fix verified, and the install was itself a test — 2026-09-28

`orb-pass2-20260928-195200.txt`. The new build's first `grants.exits`:

```json
{ "baseline": false, "exitScope": "process", "exitCount": 1,
  "exitCodes": "16", "exitReasons": "package.updated",
  "exitTimestamps": "1790605292642", "exitsThrough": 1790605292642,
  "lastExitReason": "package.updated", "lastExitUserInitiated": false,
  "exitsReadable": true }
```

Every part of §7b22 landed: `exitScope` present, `lastExitReason` and
`lastExitUserInitiated` describing the newest exit, and `exitsUserInitiated`
gone. **`baseline: false`** matters on its own — the new build read the watermark
out of a line the *old* build wrote, so the format change did not re-baseline the
series.

#### The install exercised the mapping it was never asked to

`REASON_PACKAGE_UPDATED` (code 16) is the **first reason outside `low.memory` and
`user.requested`** this probe has ever seen, and it came out as
`package.updated` rather than `unmapped:16`. The seventeen-case table in `name()`
is doing its job on a code nobody planned to test, which is the argument for
having written it out instead of special-casing the two that mattered.

It is also correctly **not** user-initiated. An update is not a force-stop, and a
flag that had guessed from "the process died right before a launch" would have
said otherwise.

#### A third negative, with a third distinct cause

The install killed the process and the relaunch carried **no `BOOT_COMPLETED`** —
consistent with P20, since an update does not put the package in the stopped
state. One boot session now holds:

| Uptime | Death before it | Reading? |
| --- | --- | --- |
| 131 s | *(reboot)* | **yes** — genuine boot delivery |
| 875 s | `low.memory` | no |
| 1 551 s | `user.requested` | **yes** |
| 1 977 s | **`package.updated`** | no |

**Four launches, three distinct death causes, and both readings explained by the
same rule.** The negatives are no longer one repeated condition — an ordinary
memory kill and a package update are different platform paths, and neither
re-delivers.

P20 needed a human to remember on Sunday morning. By Sunday evening it is a rule
with a controlled test, three negatives, two positives, and an instrument that
states its own scope and was twice corrected by its own data.

---

### 7b24. Consolidating to one app — what must happen first — 2026-09-28

Seven Orb-family packages are installed (§7b16). The operator has decided to keep
one. Two facts make the order of operations matter more than the choice.

#### 1. Uninstalling destroys a journal. The export is the durable form.

App-private storage goes with the package. `dev.orb.probeg` holds **5,757
events** — four days, three reboots, every `gap.inferred`, the §5d chain break
that Art. I forbids repairing, and the whole of P4's *zero unexplained* record.
None of it is anywhere else.

That is not an argument against uninstalling. It is an argument for **exporting
every app before uninstalling any of them**: `importExport` already adopts an
export into a journal (`packages/device-watch`), so the history is *relocated*
rather than lost — the same distinction `PARTIAL_REPLICATION.md` §10 turned on.

#### 2. Four packages write the **same lane name**, and the exports will not say so

`Probe.java.in:48` opens lane `"pixel"` as a literal — pass 1 has no `ORB_LANE`
parameter, unlike pass 2's `build.sh`. So `dev.orb.pass1`, `dev.orb.probe`,
`dev.orb.probeb` and `dev.orb.probeg` **each hold a different chain claiming the
lane `pixel`**, in four separate private stores.

Nothing on the device has noticed, because a journal never sees another app's
store. It is noticed the moment two of those exports meet: `replicate` refuses
two chains under one lane name, correctly and after the fact.

> **So the exports must be labelled by package at the moment they are taken.**
> The file names carry a timestamp and the lane says `pixel` for all four. Once
> they are in a folder together, nothing in the data distinguishes them.

| Package | Lane | Note |
| --- | --- | --- |
| `dev.orb.pass1`, `dev.orb.probe`, `dev.orb.probeb` | `pixel` | superseded builds; one may be signature-locked (§7b8) |
| `dev.orb.probeg` | `pixel` | **the live pass 1** — 5,757 events, the one that matters |
| `dev.orb.pass2` | `grants` | signature-mismatched, cannot be upgraded (§7b8) |
| `dev.orb.pass2b` | `grants-b` | **the live instrument** — keep this one |
| `app.orb` | — | a **different product** (ActionLock/PayGuard); it is what pass 2 *watches* |

#### The order

1. **Export from every Orb package that opens**, one at a time, renaming each file
   to name its package before taking the next.
2. Keep **`dev.orb.pass2b`**. Uninstall the rest of the `dev.orb.*` family.
3. Leave **`app.orb`** alone unless it is genuinely unwanted — it holds the
   accessibility grant pass 2 watches, so removing it will correctly produce an
   `accessibilityLost` reading. **That is the signal working, not a fault**, and
   it belongs in `SETTLED.md`'s spirit: a change in what is installed is not a
   change in the instrument.

#### On the name `pass2b`

It is an accident of §7b8's signature mismatch, and renaming it costs the
`grants-b` lane — a new package is a new store and a new chain. **Not worth it.**
The next real app gets a clean package name and a fresh lane, and these exports
are imported into it. The ugly name is cheaper than the discontinuity.

### 7b25. The consolidation procedure, and what the collision reveals — 2026-09-28

#### You cannot relabel the exports, and the reason is mechanical

The tempting fix is to rewrite `pixel` to `pixel-probeb` in one export so the four
can live together. **It does not work and must not be attempted.**
`eventPreimage` puts **`lane` inside the hash** in *both* v1 and v2
(`integrity.ts`). Changing it invalidates every event's hash and every `previous`
link behind it — so the chain fails verification immediately, and `replicate`
refuses it as tampered rather than adopting it. Art. I §2 forbids it; the
integrity check would catch it anyway.

**So exactly one of the four `pixel` chains can ever be adopted as lane `pixel`.**
The others stay as archive files. That is a real cost and it is worth naming:
the superseded builds' histories become readable records that no journal will
ever hold.

#### The procedure needs no way to read package names

Android will not readily show which sideloaded app is which package, and **the
export does not say either** — see below. The way around it is to never hold two
unlabelled exports at once:

> **For each `dev.orb.*` app except `pass2b`, in any order:**
> **open it → export → rename the file immediately → uninstall it → next.**

Renaming only needs to make them *distinguishable* (`a`, `b`, `c`, `d` is
enough), because with one app uninstalled at each step there is never ambiguity
about which one produced the file in front of you.

Afterwards, line-count them. The **~5,757-line** file is the live pass 1 — four
days, three reboots, P4's whole record — and that is the one to adopt as lane
`pixel`. The rest are archive.

`dev.orb.pass2` (lane `grants`) has no collision and can be exported at leisure.
Leave **`app.orb`** alone; it is a different product and it is what pass 2
watches.

#### What the collision actually reveals: `device` names the hardware, not the writer

The deeper problem is not the hardcoded lane literal. It is that
`Probe.java.in:48` sets `device` to `Build.MODEL + "/" + Build.DEVICE` — **the
phone**. Four packages on one phone therefore share a lane name *and* a device
string, and nothing in any envelope distinguishes them.

That contradicts the model. Art. IV §14 makes devices equal peers and
`SECURITY.md` §4 says **a device writes only its own lane**; `custody.ts` relies
on the holder being `event.device`. All of that assumes **one writer per
`device` value.** Here there are four, and the architecture never said they could
not exist — it assumed one Orb per phone, which stopped being true the moment
testing needed a second build.

**Requirements this puts on the consolidated app**, rather than a patch to
builds about to be deleted:

1. **`device` identifies the install, not the handset.** A per-install identity
   minted at first run, so two Orbs on one phone are two peers rather than one
   peer contradicting itself.
2. **The lane is derived from that identity**, never a literal. Pass 2 already
   parameterised it (`ORB_LANE`); pass 1 never did, and that asymmetry is what
   produced four chains under one name.
3. **The export names its own source.** It currently records `destination` and
   `eventsBeforeThis` and nothing about where it came from — a record that cannot
   say who produced it, which is `Observation.md` inv. 3's *always attributed*
   failing at the file boundary rather than the event one.

#### A better way, found by asking — nothing has to be lost (2026-09-28)

§7b25 above concluded that three of the four `pixel` chains become archive files.
**That was wrong**, and the correction needs no code and no edit to any event.

**1. Four chains, four journals.** `importExport(journal, text)` takes the
journal as a parameter, and `scripts/device-import.mjs` already honours
`ORB_JOURNAL` to relocate it. So:

```
ORB_JOURNAL=~/.orb/probeg node scripts/device-import.mjs probeg.txt
ORB_JOURNAL=~/.orb/probeb node scripts/device-import.mjs probeb.txt
```

Each chain is adopted under its own store, verified, replayable, queryable.
Nothing is edited, no hash is touched, and `replicate` never sees two chains
under one lane because it never sees two at all.

**This is not a workaround — it is the honest representation.** AD-8's whole
point is that four packages are **four writers**. Forcing four writers into one
lane is the thing that would be false; giving each its own store says exactly
what happened. The single-journal assumption was mine, not the architecture's.

**2. The irreversible step is not the uninstall.** It is uninstalling *before
adopting*. Once each export is imported, the history lives off the device and the
APK holds nothing unique — so the uninstall becomes free, and the operator gets
the single-app phone they asked for with nothing surrendered for it.

> **Revised order: export each → import each into its own journal → then
> uninstall freely.**

**3. If the decision is to be deferred, force-stop rather than uninstall** — and
this project has just measured why that works. §7b17 found pass 1 **in the
stopped state through the 09-27 boot, receiving no `BOOT_COMPLETED` at that
boot**; it got one later, on launch, at 15.6 h. So a force-stopped build starts no
service, receives no broadcast, and costs battery nothing while its journal sits
intact. Four days of P20 work, paying off as an operations decision.

The residual cost of the revised plan is **nothing**, against three permanently
unadoptable histories in the original. The error was assuming one journal because
the script defaults to one.

### 7b26. The import dry run — pass 2 adopts, pass 1 **cannot** — 2026-09-28

Run before asking for the four files, on exports already in hand.

**Pass 2 B (`grants-b`) adopts cleanly.** 69 events replicated, projection built,
two alerts raised from the `com.ixigo` / `com.nhn.android.band` changes. The
route works end to end.

**Pass 1 (`pixel`) is refused outright:**

```
JournalIntegrityError: lane hash chain is broken
  index: 4   expectedPrevious: c23c88bb…   actualPrevious: '35'
```

That is `SETTLED.md`'s **first row** — §5d's defect, a numeric extractor that read
a hash's digit prefix, written on 2026-09-25 by a build that still had the bug.
**Historical, permanent, correctly reported, and unrepairable**, because Art. I §2
forbids editing the event that carries it.

#### This is a bigger constraint than the lane collision

`Journal.replicate` calls `verifyLane` over the **whole lane** before adopting
anything, so one break at index 4 refuses all 5,757 events. **It is not that only
one of the four `pixel` chains can be adopted — it is that none of them can**, if
they all carry the §5d break, and the four all descend from builds of that era.

§7b25's *"import each → then uninstall freely"* therefore does not hold for
pass 1. Correcting it twice in a day is the price of having said it before
running it.

#### What actually makes the uninstall safe

Not the import. **The export files themselves.** Two reasons:

1. **Adoption is unavailable to pass 1** for the reason above.
2. **This container is ephemeral.** `~/.orb/journal` lives in the session's
   filesystem, not the operator's — so importing here preserves nothing that
   outlives the session. An earlier note in this project already corrected
   *"outside the repo"* to *"still inside the container"*; this is the same fact
   with consequences.

> **So: the `.txt` exports are the durable artefact. Uninstalling is safe once
> they are stored somewhere the operator controls** — and analysis needs no
> journal at all, since every finding in §7b13–§7b23 was read straight out of
> these files.

#### The asymmetry worth naming: two chain policies for one fact

The device **tolerates** the break and has appended past it for four days. Its
self-test reports `chainBreaks: 4` with `chainBaseline: true` and **passes**,
because §5j's `chain.noNewBreaks` compares break *positions* against the previous
self-test and fails only on a **new** one.

`verifyLane` never learned that. It sees a break and refuses everything.

So Orb-on-device says *"a known, recorded, historical break — carry on"*, and
Orb-on-import says *"reject all of it"*. Both are defensible in isolation and
they cannot both be the policy. Opened as **AD-9**.

### 7b27. The import, run — and the abandoned app was still working — 2026-09-28

Four files arrived. **They are three chains and one exact duplicate**
(byte-identical `sha256`), and only **one** carries lane `pixel` — so the other
pass-1-family packages were not exported, and §7b24's four-way collision has not
in fact been realised on disk.

| File | Lane | Events | Result |
| --- | --- | --- | --- |
| `…pass1-201622` | `pixel` | 5,877 | **refused** — break at index 4, `actualPrevious: '35'` |
| `…pass2-201626` | `grants` | 42 | **adopted** |
| `…pass2-201631` | `grants-b` | 71 | **adopted** |
| `…pass2-201631` (2nd) | `grants-b` | 71 | **no-op** — see below |

`grants` and `grants-b` are different lane names, so **one journal holds both**;
the separate-store advice only ever applied to the `pixel` collision. The `pixel`
refusal is exactly AD-9, at exactly the predicted index.

#### Two properties demonstrated rather than assumed

**Idempotence.** The duplicate was imported into the same journal and the lane
stayed at **71 lines, not 142** — `replicate` skipping what it already holds,
shown on a real byte-identical re-import rather than a test fixture.

**Lane independence.** Two lanes from two packages, adopted into one journal,
projected together, with no interaction between them.

#### The finding: `dev.orb.pass2` was never dead

The signature-mismatched build from §7b8 — *"can never be upgraded, only
removed"* — **has been recording since 09-26 and nobody had ever read its
journal.** It holds four authority changes, all on 09-28, none previously seen:

| Time | Change | Caught by |
| --- | --- | --- |
| 01:46:04 | **lost** `dreamliner` and `gearhead` notification listeners | `process.start` |
| 03:14:46 | **regained** both | `process.start` |
| 03:18:46 | **lost** `gearhead` again | `process.start` |
| 03:19:10 | **regained** `gearhead` | **`settings.changed`** |

**Both routes are in that table.** Three were caught by comparison against
history at the next process start; the fourth by the live `ContentObserver` while
the process happened to be alive. That is P16 — *signal or poll* — answered from
the record in a single lane, and the `because` field is what makes it answerable.

**This is the alert loop's first output on data nobody curated.** Six alerts now
stand unanswered, four of them from a lane whose app the operator had written off
as unupgradable and was about to uninstall. It is also the strongest possible
argument for §7b25's revised order: **export before uninstalling**, because the
app you have given up on may be the one holding the signal.

> **Open question for the operator, and the loop cannot answer it:** did anything
> change about notification access between 01:46 and 03:19 on 09-28? If yes, the
> alerts are `dismissed` and the rule is behaving. If not, four authority changes
> happened unattended — which is precisely the case this signal exists for.

### 7b28. The loop closed — and the alert-identity defect, measured — 2026-09-28

**The operator answered: the notification-listener changes were their own doing.**
All six alerts `dismissed`; **six raised, zero unanswered.**

That is DR-8's loop complete for the first time on data nobody curated:
*observe → journal → project → rule → alert → human answer → recorded.* The four
authority changes came from a lane the operator did not know was still being
written, and the answer came from the one person who could give it.

**`dismissed` is not a false positive** (`SETTLED.md`). It means the person
recognised the change as their own. A false positive would be an alert for a
change that did not happen, and there has still never been one.

#### The defect, no longer an assertion

`STATE.md` has carried this as a design note: *alert ids are minted at raise
time, not derived from the change, so replaying the same lane mints new ids and
an existing answer's citation dangles.* It was reasoned, not measured. It is now
measured:

```
same export -> fresh journal -> 01M3M86AY4KGDRQNVRTX9WWCDM  …AY5FD…  …AY69B…  …AY73F…
original journal            -> 01M3M7ZT2RN0V995ZQKQ5ZBTE0  …2SJ0A…  …2SWG4…  …2T9F5…
```

Four identical changes, four completely different identities. The ULIDs come from
the clock at raise time, so **an answer is durable only alongside the exact
journal that raised what it answers.**

Two consequences, and the second is the one that bites:

1. These six answers live in a **scratch journal in an ephemeral container**.
   They will not survive the session. What survives is this paragraph — the
   *fact* that the operator confirmed it, written where facts are kept.
2. More generally, **an answered alert cannot be re-derived.** Re-import the same
   export anywhere and the loop raises the same six changes as *unanswered*, with
   no way to connect them to answers already given. The human is asked the same
   question again, which is the one thing an alert loop must not do.

#### The fix has a name already used in this project

Derive the identity from **what the alert is about** rather than when it was
raised: the lane, the envelope hash of the observation that carries the change,
and the rule id. Same change, same rule, same id — in any journal, at any time,
on any device.

That is precisely the technique the Execution review settled for the
authorization record — *"the authorization record specified with a **derived**
identity"* — and `Attachment.md` inv. 1–2 for content. **Three places in this
architecture have now needed the same answer**, which is a strong sign it belongs
in a contract rather than being rediscovered a fourth time.

Carried as a design change, now with evidence rather than reasoning behind it.

### 7b29. The alert identity, derived — and the drift was never in the alert — 2026-09-28

Implemented, with the finding that the first diagnosis was one hop short.

#### The defect was in the Observation, not the alert

`deriveAlertId(rule, observation, kind)` was written against
`AuthorityChange.observation` — and the test of *two journals that never meet*
**failed**, with two different ids for one change. The probe said why:

```
mac   changes: [ 01M3M8HFQX8J8GPRYHC1FX4A5H ]
phone changes: [ 01M3M8HFR0KJJ0DKRKXSY4GZDP ]
```

ULIDs minted **milliseconds apart, at import time.** `importExport` does two
things, and only the first preserves identity: it **replicates** the device lane
verbatim — the phone's event ids survive — and then **translates** each reading
into a *new local Observation* citing it through `causes`. The projection was
reading the second. So the alert id inherited a local identity and drifted
exactly as before.

**The stable identity was one hop back the whole time**: `causes[0]`, the phone's
own id for the reading. `AuthorityChange` now carries it as `reading`, and the
derivation uses it — falling back to the local `observation` when a reading cites
nothing, which is journal-local **honestly rather than silently**.

> Worth recording as a method note: the fix was written, the test failed, and the
> failure named a defect one layer below the one being fixed. Deriving the id
> without that test would have produced something that looked right, passed
> inspection, and drifted anyway.

#### What landed

- `deriveAlertId(rule, reading, kind)` — sha256 over **length-prefixed** parts,
  so no separator can be forged across them (`("a:b","c")` must not collide with
  `("a","b:c")`; there is a test).
- `gained`/`lost` are **not** inputs. They are what the rule *concluded*; an
  identity that moved when a rule's wording changed would defeat the purpose.
- `AlertRaised` carries `alertId` and `reading`, so a reader can **recompute** the
  identity rather than trust it.
- `AlertAnswered.alert` is now the derived id; `alertEvent` is an optional local
  convenience. **Answering an alert this journal never raised is now possible**,
  with `causes: []` — no lineage invented to fill the gap.
- Six tests, and two existing ones updated because they asserted the old contract.
  **672 passing.**

#### The contract

`Event.md` **inv. 9** — *a recomputed record's identity is derived from what it
is about, never minted.* Inv. 8's *"structurally (for interpretation)"* is the
loophole it closes.

Added to a contract that was already **Accepted**, which is not free: Art. X §37
and §38 are named in the text, the change is argued non-breaking because no
existing Event becomes invalid, and the alternative — that this belongs in an
`Event` v2 — is stated so it can be chosen instead.

### 7b30. Four files, three chains, and the derived identity confirmed on real data — 2026-09-28

#### What the four files are

| File | What it is | Lane | Events | Genesis |
| --- | --- | --- | --- | --- |
| `…probeg-203904` | **not a journal** — a capability report | — | — | — |
| `…pass1-203909` | journal | `pixel` | 5,914 | `b8c10c31d8` |
| `…pass2-203915` | journal | `grants` | 45 | `b1d116a651` |
| `…pass2-203920` | journal | `grants-b` | 74 | `b23b46f10b` |

**All three genesis hashes match chains already held**, so these are the same
three journals as before, extended by 37, 3 and 3 events. No new chain arrived —
`Orb probe` and `Orb probe B` are separate packages whose journals are not in
this set. Stated as a fact about the files, not as a task.

**A correction.** §7b25 said the pass-1 builds all carry the label `Orb pass 1`
and are indistinguishable in the launcher. The launcher shows otherwise —
`Orb grants …`, `Orb pass 1`, `Orb pass 2`, `Orb pass 2 B`, `Orb probe`,
`Orb probe B`, each labelled distinctly. `ORB_PROBE_LABEL` was set per build. The
identification problem was real *inside the exported data* and never on the
phone, and conflating those was sloppy.

#### The capability report already does what AD-8 asks of the journal export

`dev.orb.probeg` is the P12–P14 prober, not a journal app, and its first lines
read:

```
package:  dev.orb.probeg  (no permissions declared)
```

**It names its own source.** That is AD-8's third requirement — *"the export names
its own source"* — already implemented, in the same codebase, by the artifact
that did not need it as badly. The journal export, which does need it, omits it.
The precedent for the fix is already written and can simply be followed.

The report itself re-confirms P12, P13 and P14 with the control holding: the
direct read of `settings_secure.xml` threw `EACCES`, so the successful reads went
**through the framework and not around it**. Its five notification listeners match
the `grants` lane's current holdings, which is two independent instruments
agreeing about the same device.

#### §7b29's fix, confirmed on the operator's own data

Two journals, two device identities (`vm` and `other-machine`), sharing no
storage and never having met, each folding the same two exports:

```
A: 6 ids   B: 6 ids
IDENTICAL — two journals, two devices, never met, same six identities
```

The six alerts now carry `sha256:…` identities derived from the phone's own
reading id, where three hours earlier the same six changes produced ULIDs that
differed between journals by milliseconds of import time. **Tested on real device
history rather than on the fixture**, which is the difference between the fix
working and the fix being believed to work.

---

### 7b31. The consolidated app — AD-8 paid, and the first sensor that is handed its mandate — 2026-09-28

`apps/pixel/orb/`, package `dev.orb.app`, 21 KB. **Zero permissions.**

The first build whose purpose is to be *useful* rather than to be measured. It
starts by paying what the instruments left behind.

#### AD-8, in three changes

| | Before | Now |
| --- | --- | --- |
| Identity | `Build.MODEL + "/" + Build.DEVICE` — the **handset** | **96 random bits minted at first run**, stored app-private (`Install.java.in`) |
| Lane | a literal in pass 1, a build flag in pass 2 | **derived from that identity** — there is no `ORB_LANE` |
| Export provenance | absent | `orb.export` carries `package` |

**Minted rather than derived, and that is the point.** An identity taken from
`ANDROID_ID`, a build fingerprint or a serial would be *identical for two
installs on one phone* — which is the defect — and would also be a stable
cross-app identifier for a person, which `MOBILE_SENSING.md` says not to build.

**Removing the flag is half the fix.** Pass 2 parameterised its lane, which felt
like the correction to pass 1's literal and was not: a build flag still puts the
lane's identity *outside the install that writes it*, so it can be set wrong,
forgotten, or duplicated by rebuilding. A name that cannot be supplied cannot be
supplied twice.

**The envelope stopped naming the phone.** Model, device, build and patch moved
into the `orb.process.start` payload. A witness holding envelopes and no payloads
(`WITNESSES.md` W2) now learns *that* someone wrote and nothing about which
handset — a privacy improvement that fell out of the identity fix rather than
being aimed at.

`orb.export` repeats the install identity **nowhere**: it is on every envelope as
`device` already, and a second copy would be a second source of truth (Art. IX
§33). Only `package`, which no envelope can supply, is added — following the
precedent §7b30 found in `dev.orb.probeg`'s own report.

#### The share sensor

`ShareActivity`, built from `SENSOR_SHARE.md` — **declared before it was
written**, which is the test AD-7 failed by being decided in a manifest at build
time. Two results from that order carried straight into the code:

- **Receiving a share needs no permission and is not a `Capability`.** The
  manifest declares none. `Capability.md` §8's *reads are capabilities too* is
  about Orb reaching out and taking; a share is the world reaching in.
- **A share hands over a reference, not content.** Nothing opens a stream or
  fetches a link. A share sensor that resolved a shared URL for a preview would
  make Orb initiate a connection to an arbitrary third party on the strength of a
  tap — a disclosure at tier *Act (irreversible)* under DR-9. **Sharing a link is
  not authorization to visit it.**

Recorded per hand-off: the declared `mimeType` (never sniffed — sniffing is
interpreting, `Sensor.md` §1), `referrer` or `unknown` (never omitted, so *we do
not know* and *nowhere* stay different facts), the references, `itemCount`, and
`resolved: false` with `absenceReason: unfetched`.

The activity is `exported`, and it is safe to export **because it takes
nothing**: it records what it was handed and finishes. `noHistory` and a dialog
theme keep it out of the way, because a sensor that is annoying to feed stops
being fed.

#### What is deliberately absent

**The grants watch and the package scan.** They work, they are pass 2 B's, and
porting them in the same change as a new identity scheme would make a failure in
either indistinguishable from a failure in the other. Pass 2 B keeps running
until this replaces it — §7 R4, the rule that let pass 2 be built while pass 1
ran.

**Resolution of shared references**, declared with its tiers in
`SENSOR_SHARE.md` §3 and not built. Recording pointers is complete and honest on
its own.

#### A new signing key exists, and that is a liability from this moment

`keys/app.keystore`, signer SHA-256 `3ab87f9a…2f9f31d1`. New package, so a new
key was minted and the build said so. It is gitignored — a signing key in version
control is a worse failure than the one it prevents — and it is **the only key
that can ever upgrade this install**. §7b8 is what losing one costs.

### 7b32. Orb v1 on the device — AD-8 confirmed, and a problem the declaration missed — 2026-09-28

Three events, and every one of them carries something that was argued for before
it was built.

#### AD-8, confirmed on the phone

```
device : orb-d7d5f6ec2ea184ae5b990ab7      ← minted, 96 bits
lane   : orb-d7d5f6ec2ea184ae5b990ab7      ← derived from it, not a literal
payload: model "Pixel 10a", device "stallion", sdkInt 36, …
```

**The envelope names a writer and nothing else.** The handset is in the
`orb.process.start` payload, where a W2 witness holding envelopes cannot reach
it. Both halves of the fix are visible in one event.

`orb.export` carries `package: dev.orb.app` and **does not repeat the install
identity** — it is on the envelope already (Art. IX §33). A file that arrives
alone can now say which app wrote it, which is what four indistinguishable
`pixel` exports cost us.

The derived boot instant is `1790603340662` — **the same 13:49 reboot** the older
lanes derive, from an app that did not exist then. Two independently-written
journals agreeing about when the phone started is `wallClock − elapsedRealtimeMs`
working exactly as §7b2 established.

#### The share sensor held its boundary

```json
{"because":"user.shared","action":"android.intent.action.SEND",
 "mimeType":"image/jpeg","itemCount":1,
 "references":"content://com.google.android.apps.photos.contentprovider/0/1/…/REQUIRE_ORIGINAL/…",
 "referrer":"android-app://com.google.android.apps.photos",
 "resolved":false,"absenceReason":"unfetched","shareReadable":true}
```

A pointer, not bytes. No stream opened, no link fetched, no permission held.

**`referrer` was supplied** — Android named Photos — so the `unknown` fallback is
**untested rather than confirmed**. Worth saying plainly: the field exists and
was never exercised.

#### The problem: the reference may already be dead

The URI is a Photos content provider reference granted to `ShareActivity` by the
intent. **That grant lasts until the receiving activity's task finishes**, and
this activity is `noHistory` and calls `finish()` immediately. So by the time
anything could resolve it, **the permission is gone.**

`SENSOR_SHARE.md` §3 drew a clean line — *record the reference now, resolve later
under a declared Capability* — and that line **does not survive contact with
Android's URI grant model.** Deferred resolution needs
`takePersistableUriPermission`, which needs the *sender* to have offered a
persistable grant, and share intents generally do not.

So the sensor currently records **that a photo was shared, from Photos, at
21:56** — which is a complete and honest observation — while **the photo itself
is not retrievable from that record, ever.**

Three ways out, and the choice is not mine:

1. **Resolve during the share**, copying bytes into an `Attachment` while the
   grant is live. Complete, and it moves the Capability act *into* the sensor —
   the separation §3 wanted, abandoned.
2. **Accept reference-only.** The record says what happened and not what was in
   it. Cheapest, honest, and enough if the value is the *event* rather than the
   *content*.
3. **Ask at share time.** Preserves the separation with real consent, and a
   sensor that is annoying to feed stops being fed.

**Unverified**: that the grant is gone is expected from the platform's model and
has not been shown on this device. The cheap test is to attempt a read of that
reference now and see whether it throws — worth doing before choosing, because
option 2 is only forced if it does.

> The declaration was still worth writing first. It got the Capability boundary
> right, kept a URL fetch from being smuggled in as a preview, and produced a
> sensor that needs no permission. What it could not do was know how long a
> permission it deliberately declined to use would last.

#### The probe for it — `orb.resolve.attempt`

`Resolve.java.in`, behind an explicit tap. It attempts the first reference of the
most recent `orb.shared` and records the outcome:

| Outcome | Means |
| --- | --- |
| `readable` | the grant survived — deferred resolution is available, and §3's line stands |
| `refused` | `SecurityException` — the grant died with the activity, and §3's line does not |
| `failed` | something else went wrong; **not** an answer to the permission question |
| `openedNull` · `noShare` · `noReference` · `historyUnreadable` | each a distinct finding rather than a shrug |

`failed` is separated from `refused` deliberately. A missing file or a departed
provider is an *availability* failure, and collapsing it into `refused` would
answer a permission question with an unavailability — the `Readable: false`
mistake in a fourth costume.

**The probe is the Capability act it is testing for, and says so.**
`SENSOR_SHARE.md` §3 puts resolving a `content://` reference at tier `Observe`;
running it to find out whether it *can* run is still running it, and pretending
otherwise would be the self-exemption `Capability.md` inv. 4 forbids. So it never
fires on its own, and every attempt is journaled whether it succeeds or not.

**It keeps nothing.** At most 64 bytes are read and discarded, and `retained:
false` is in the record rather than only in a comment. A probe that captured the
photo to prove it could have would have answered the question by doing the thing
the answer was meant to gate.

`sinceShareMs` travels with the result, because the whole question is a lifetime
and an answer without one is not usable evidence.

### 7b33. Measured: the grant does not outlive the activity — 2026-09-28

Two attempts, two different failure modes, and **the distinction the probe was
built to preserve is what made them legible.**

| Attempt | Age of the reference | Outcome | Threw |
| --- | --- | --- | --- |
| 1 | **32.3 min** | `failed` | `FileNotFoundException` — *"No content provider: …"* |
| 2 | **9.5 s** | **`refused`** | `SecurityException` — *"Permission Denial: opening provider … from dev.orb.app … that is not exported from UID 10216"* |

#### The answer

**`SENSOR_SHARE.md` §3's line — *record the reference now, resolve later under a
declared Capability* — is not available on this platform.** Nine and a half
seconds after the share, the read is a clean permission denial: Photos' provider
is not exported, `dev.orb.app` holds no grant, and the request is refused
outright.

**Stated precisely, because the number is misleading.** This does *not* show that
a grant expires after nine seconds. The grant is scoped to the **receiving
activity's lifetime**, and `ShareActivity` is `noHistory` and calls `finish()` at
once — so it was already gone long before the probe ran. What is measured is that
**the grant does not outlive the activity it was granted to.** A share target that
held its activity open would still hold the grant.

#### The two failure modes are not one finding twice

`failed` was deliberately separated from `refused` on the grounds that collapsing
an availability failure into a permission failure would be *"the `Readable: false`
mistake in a fourth costume."* That separation earned itself inside one run:

- At **32 minutes** the URI does not even resolve to a provider — the wrapper is
  transient and is simply gone. Nothing about permissions is stated.
- At **9.5 seconds** the provider is there and the permission is denied. That is
  the answer.

Had both been recorded as `refused`, the conclusion would have been right for the
wrong reason in one of the two cases — and a reader checking it later would have
found a `FileNotFoundException` under a permission verdict.

#### An unexpected finding: a reference is not a content identity

The two shares were **the same photograph**. Their references differ:

```
…/content%3A%2F%2Fmedia%2Fexternal%2Fimages%2Fmedia%2F229335/…/615544899
…/content%3A%2F%2Fmedia%2Fexternal%2Fimages%2Fmedia%2F229335/…/378787396
```

Photos wraps a **stable** MediaStore id (`media/229335`) in a **per-share** token.
So the same content shared twice produces two different references, and the
reference is a handle to *an act of sharing*, not a name for *a thing*.

That bears directly on `Event.md` inv. 9 and §7b29: **anything deriving an
identity from a share reference would mint a new identity for every re-share of
one photo.** The embedded MediaStore id is the stable part, and it is the part a
derivation would have to use — a finding worth having before something is built
on the wrapper.

#### What follows, and the choice is the operator's

Option 3 — *ask at share time* — survives, since the activity could stay alive
while a person answers. Options 1 and 2 are unchanged:

1. **Resolve during the share**, copying bytes into an `Attachment` while the
   grant is live. **This is the recommendation.** The separation §3 wanted was a
   good idea that the platform does not permit, and the honest response is to
   declare the Capability where it must happen rather than pretend it can happen
   later. The share *is* the authorization event: a person deliberately handed
   this over, which is stronger consent than any prompt Orb could invent
   afterwards.
2. **Accept reference-only.** Honest, and enough if the value is the *event*
   rather than the *content* — but it means the proposal PDF in
   `MOBILE_SENSING.md`'s motivating loop can never be read, which is most of why
   the share sensor was chosen first.

`SENSOR_SHARE.md` §3 needs amending either way. **It is the first thing in this
project written as a declaration that contact with the device has falsified**,
and the declaration was still worth writing: it got the Capability boundary
right, stopped a URL fetch being smuggled in as a preview, and produced the
sensor whose failure is this legible.

### 7b34. Resolving during the share — ruled, and the device grows an Attachment store — 2026-09-28

**Ruled: resolve during the share.** §3's separation was a good idea the platform
does not permit, so the Capability is declared where it must happen rather than
where it would be tidiest.

#### The boundary survived; only the timing moved

- **Only `content://`** references the sender granted are opened. A `file://`
  path is one this app has no business reading.
- **A URL is still never fetched.** That is egress at *Act (irreversible)* under
  DR-9, and a different act from reading what was handed over. The thing §3 was
  written to prevent is still prevented.
- **Only the first item** of a multi-item share is resolved. All references are
  recorded and `itemCount` is on the event, so a reader can see what was not
  taken.
- **Every outcome is written**, including `refused`, `tooLarge` and
  `notAContentUri`. Leaving the field untouched on failure would make *not
  attempted* and *attempted and refused* the same record.

#### What it forced: `Attachment.md` is Accepted, so the phone needed a real store

Bytes had to land somewhere, and landing them as plaintext in app-private storage
would breach an accepted contract on the first photograph. `Attachments.java.in`
implements three invariants in about a hundred lines:

| Invariant | Implementation |
| --- | --- |
| inv. 1–2 — identity is the content hash | `sha256:<hex>`, scheme-tagged from the first one |
| inv. 7 — the address is blinded | `HMAC(addressSecret, identity)`, because **a store addressed by identity is a list of identities**: encrypting the bytes hides the content and never *which* content |
| inv. 8 — sealed under its own key | AES-256-GCM, one key per Attachment, so erasure is *destroy that key* — which reaches a peer's copy and flash residue, neither of which deleting reaches |

**Written against `runtime/journal/src/attachment.ts` rather than against its
description.** Same hash, same tag, same HMAC construction. §7 R2 says two
implementations of one thing must not diverge, and the cheapest way to prevent
that is to read the first while writing the second.

**Keys are stored, never derived** — anything derivable is re-derivable, so
destroying a derived key destroys nothing (`ERASURE.md` §2a).

**Idempotent by identity.** The same photograph shared twice lands at the same
address under the same key and costs one copy — which also answers §7b33's
finding that the *reference* differs per share while the content does not. The
wrapper token changes; the content hash does not, and the content hash is what
this stores by.

**64 MB cap, refused rather than truncated.** A shared video can be gigabytes.
Half a file under a hash of the whole would fail inv. 5's re-check and look like
corruption, which is a worse answer than *too large*.

### 7b35. Resolution working, and content-addressing confirmed on one photograph — 2026-09-28

Two shares of **the same photograph**, minutes apart:

| | Reference wrapper | Attachment identity | Bytes | Outcome |
| --- | --- | --- | --- | --- |
| Share A | `…/media%2F201987/…/1692595697` | `sha256:c49c6297…beacbe15` | 3,642,498 | `held` |
| Share B | `…/media%2F201987/…/580396436` | `sha256:c49c6297…beacbe15` | 3,642,498 | `held` |

**Different reference, identical content identity.** §7b33 predicted exactly this
— Photos wraps a stable MediaStore id in a per-share token — and it is now
measured on the thing that matters: the *wrapper* is not the content, and storing
by content hash is what makes a re-share cost nothing.

`resolved: true`, `resolveOutcome: "held"`, and **`absenceReason` is gone** from
both events. That field was written optimistically by the sensor and removed by
the resolver, because leaving *unfetched* on an event whose content is in hand
would be a false statement about what this device holds.

A 3.64 MB photograph is now sealed under its own AES-256-GCM key at a blinded
address. Erasing it is destroying that key — which reaches a peer's copy and the
flash residue, where deleting the file reaches neither.

#### The deferred path is still dead, now measured alongside a working one

Event 13 is the probe run **10.2 s after a successful resolution**, on the same
reference: `refused`, `SecurityException`. So within one export the record now
shows both halves — **resolution during the share succeeds, and the same
reference is unreadable ten seconds later.** §7b33's ruling is not an inference
from one failure; it is a contrast measured in one lane.

#### A gap this run exposes

`Attachments.store` returns `held` whether it wrote the bytes or found them
already present, so **the record cannot distinguish a first store from a
duplicate.** Share B is indistinguishable from Share A in the journal, even
though only one of them cost 3.64 MB of disk.

That matters for a question an operator will certainly ask — *how much is Orb
storing?* — and the answer is currently underivable from history, which is the
sort of thing this project treats as a defect rather than a detail. It is the
same shape as every `Readable: false` argument: two different facts sharing one
value. **Fixed the same day**: `stored` and `held` are now separate outcomes. Both mean
*the content is here*; only one of them cost disk, and the journal now says
which.

### 7b36. The grants watch, ported — and AD-7 half paid on the way — 2026-09-28

`Grants`, `GrantReader`, `Exits` and `WakeReceiver` came across **byte for byte**.
They work, they have four days of evidence behind them, and rewriting working
code during a port is how a port becomes a rewrite nobody asked for. 33 KB.

**The event types are unchanged**: `grants.observed`, `grants.packages`,
`grants.exits`. A type says what an event *is*, not which app wrote it, and
`packages/device-watch/src/import.ts` keys on exactly those strings — so the
TypeScript importer reads the new app's lane with no change at all. Renaming them
would have diverged two implementations of one thing, which §7 R2 exists to
prevent.

#### What did not come across unchanged: the package scan

`AD-7` says `device-watch` reads a person's whole package list outside the
Capability boundary — *"decided in a manifest, at build time, with no declaration
and no Policy involvement."* Porting that as it stood would carry the debt
forward into the app built to pay debts.

| Read | Gate | Why |
| --- | --- | --- |
| accessibility, notification listeners, device admins | **none** | P12–P14 confirmed them readable with no permission; they cost nothing and they are what the signal is *for* |
| the installed package set | **an explicit, recorded grant** | `Capability.md` §8, tier `Observe`: 484 entries describing a person's life |

`PackageAccess` is the Capability shape at its smallest — **declared, authorized
by a person, recorded, and only then acted on.** The grant is an event, the
revocation is an event, and **a refused scan is an event too**: *the scan did not
run because nobody authorized it* and *the scan ran and found nothing* are
opposite facts, and a signal that rendered them identically would be the
`Readable: false` mistake at the level of the whole reading.

Two orderings chosen rather than defaulted: the grant **records before** it
enables, so a crash between the two leaves a journal claiming a capability the
device is not yet exercising; the revocation **disables before** it records, so
the same crash leaves the capability off. Both fail toward not-reading.

**This does not close AD-7.** There is no `Policy` on this device to consult and
no `Capability` registry to declare into, so the debt stays open. What it does is
move the decision **out of the manifest and into history** — which is the half
that can be done now, and the half that was missing.

#### What is still pass 2 B's

Nothing, once this is confirmed on the device. Pass 2 B can be retired after one
export shows the grant reads, a scan and an exit record arriving in the new lane —
the §7 R4 rule that let pass 2 be built while pass 1 ran, applied one more time.

### 7b37. The port confirmed, and the capability gate working — 2026-09-28

Six events, in the order the design predicted:

| Event | What it says |
| --- | --- |
| `orb.process.start` | the new build running |
| `grants.exits` | **four `package.updated` exits** — v2→v3→v4→v5, every upgrade caught, with `exitScope: process` and `lastExitUserInitiated: false` |
| `grants.observed` | accessibility 1, notification listeners 5, device admins 1, all `baseline: true` — a new lane, correctly announcing it has nothing to compare against |
| `grants.packages` | **`installedPackageReadable: false`, `installedPackageScope: "ungranted"`** |
| `grants.capability.granted` | `installedPackages.read`, **tier `Observe`**, scope *all installed packages on this device*, by operator |
| `grants.packages` | **484**, scope `all`, `baseline: true` |

**The refusal is on the record, which is the whole point.** The scan ran before
the grant existed and said so, rather than being silently skipped — *the scan did
not run because nobody authorized it* and *the scan ran and found nothing* are
opposite facts, and both are now distinguishable by a reader who was not there.

The grant event carries its **tier and scope**, so the record states what was
authorized rather than only that something was. That is `Capability.md`'s shape
running on a phone, three contracts short of the machinery that would enforce it.

**484, up from pass 2 B's 483** — and `dev.orb.app` is in the list. The new app
counted itself, which is a small proof that the read is the whole set rather than
a filtered view.

### 7b38. Play Protect blocked it — and the natural experiment says which permission

**`Harmful app blocked` — *"This app may be harmful."*** Declined once, then
installed via *Install anyway*.

#### P0b is answered

`P0b` — *the scan is declinable on the sideload path* — has been **Untested**
since 2026-09-25. It is now **held**: the block offers *Install anyway*, so a
sideloaded build the operator wants can still be installed. That is the whole of
what P0b asked.

#### What changed, on a controlled comparison

This is as close to a natural experiment as this project has had. **Same package
name, same signing key, same device, same day, four prior versions installed with
no warning at all:**

| Build | Permissions | Play Protect |
| --- | --- | --- |
| v1 – v4 | **none** | silent |
| **v5** | `QUERY_ALL_PACKAGES`, `RECEIVE_BOOT_COMPLETED` | **blocked** |

**The confound, named:** v5 also added a `BOOT_COMPLETED` receiver and grew from
21 KB to 33 KB, and Google's heuristics are not published. So this is a strong
correlation across one controlled change, not a proof of which permission did it.
`QUERY_ALL_PACKAGES` is the likeliest by a distance — it is the permission
stalkerware needs and the one Play's own policy singles out.

#### Why this matters beyond one dialog

`AndroidManifest.xml` already called `QUERY_ALL_PACKAGES` *"the permission a
surveillance app would want, held here by an app whose purpose is to notice
one."* **Google's heuristics independently reached the same judgement about the
same permission on the same day** — which is corroboration of AD-7's severity
from outside this repository, and the first time anything outside it has weighed
in at all.

It also sharpens the India-first distribution question. The thesis puts the
notification listener and the package scan at the centre of mobile context, and
this is the first hard evidence of what carrying them costs: **an app holding
them is one a user must be told to force past a harm warning.** That is survivable
for the operator's own build and a serious problem for anything handed to someone
else — which is exactly the split `MOBILE_SENSING.md` predicted between *available
to the operator* and *available to anything distributed*.

**A cheap next measurement, when it is wanted:** build the same code with the
`QUERY_ALL_PACKAGES` lines deleted — the manifest already documents that as the
one-step reversal — and see whether the block goes away. That would separate the
permission from the receiver and the size in one install.

### 7b39. The one-change build — `QUERY_ALL_PACKAGES` omitted — 2026-09-28

§7b38 named the cheap next measurement and this is it: **the same code, built
with the permission deleted, staged for one install.** The deletion is not a
hand-edit — it is a build flag, `ORB_PACKAGE_SCAN=0`, so both variants stay
reproducible and the manifest carries an XML comment where the permission was
rather than losing the line silently.

```
ORB_PACKAGE_SCAN=0 ./build.sh
→ QUERY_ALL_PACKAGES: omitted
→ package: dev.orb.app  versionCode: 29843605  (same key, upgrades in place)
→ aapt2 dump permissions: RECEIVE_BOOT_COMPLETED only
```

Same signing key as v5, so it **upgrades in place and keeps the lane**
`orb-d7d5f6ec2ea184ae5b990ab7` — the journal is continuous across the change,
which is what makes the degradation observable on one device rather than
inferred across two.

#### One variable, and it is genuinely one this time

§7b38's comparison carried three confounds at once — the permission, a new
`BOOT_COMPLETED` receiver, and 21→33 KB of growth. This build changes **only the
permission**. The receiver is already present in v5 and stays; the code is
byte-for-byte the same source; the APK is the same 33 KB. If v5 was blocked and
this installs silently, the receiver and the size are cleared and
`QUERY_ALL_PACKAGES` is left holding the result alone. If this is *also* blocked,
the permission is exonerated and the receiver or the heuristic's memory of the
package becomes the candidate.

#### Two predictions, written before the install

Stating them first is the point — a prediction recorded after the fact is not a
test.

1. **Play Protect lets it through silently.** This is the §7b38 thesis's
   prediction: if `QUERY_ALL_PACKAGES` is what tripped the block, removing it
   removes the block. A residual risk is named: Play Protect may remember the
   package (`dev.orb.app` was flagged once) and re-flag on reputation rather than
   on the current manifest, in which case a silent install cannot be read as
   *the permission was the cause* — it would only show the block is not
   permission-gated on re-install.
2. **The package scan degrades honestly, with exactly one re-baseline.** The
   runtime keeps the capability machinery; what changes is that the platform now
   answers `getInstalledPackages` with the **visible** set (the `<queries>` admin
   filter plus self) instead of all 484. The prediction, which the manifest
   comment says has *never actually been run*: `GrantReader.packageScope` records
   `visible`, `Grants.previous` refuses to diff across the scope change and
   **re-baselines once**, and the journal shows a single `baseline: true` package
   reading at the scope boundary — **not** two hundred `installedPackageLost`
   entries for uninstalls that never happened.

The second prediction is the one that matters for the architecture. It is the
claim `Watch` and `Grants` have carried in a docstring since they were written —
that a scope contraction is reported as a contraction of *what can be seen*, not
as a mass uninstall — and it has only ever been argued. This install runs it.

#### What a grant does under the omitted permission

`PackageAccess.grant` still writes its event and still flips the flag, and the
scan still runs. What it cannot do is make the platform return packages it is no
longer permitted to see. So a grant here authorizes a **visible-scope** scan, and
the record will say so: `installedPackageScope: "visible"`, not `"all"`. That is
the correct shape — the capability gate governs *whether Orb asks*, the manifest
governs *what the platform answers*, and conflating them was the AD-7 mistake in
the first place. The grant is honoured; the answer is smaller; both are on the
record.

**Staged:** `orb-app-v6-noquery.apk`. Awaiting one install and one export.

### 7b40. Both predictions held — and the grant was over-claiming its scope — 2026-09-28

The install ran, and both predictions from §7b39 are confirmed on one device,
one continuous lane (`orb-d7d5f6ec…`), export `orb-20260928-230133.txt`.

#### Prediction 1: Play Protect let it through — silently

*"This app looks safe."* A green tick, not the neutral unknown-app dialog and
certainly not v5's *Harmful app blocked*. Same package, same key, same day, same
`BOOT_COMPLETED` receiver, same 33 KB — **the only difference from the blocked v5
is the removed `QUERY_ALL_PACKAGES`**, and the block lifted.

This also retires the caveat §7b39 named. The worry was that Play Protect might
re-flag on the package's reputation rather than the current manifest — in which
case a silent install would prove nothing. It did **not** re-flag: the same
package name that was blocked yesterday passed today with the permission gone. So
the block was manifest-driven, not reputation-driven, and §7b38's three confounds
(the permission, the receiver, the size) are now separated. **`QUERY_ALL_PACKAGES`
was the cause.** Google's heuristic and `AndroidManifest.xml`'s own comment agree
on which permission is the dangerous one — now by a controlled single-variable
change rather than a correlation.

#### Prediction 2: the scan degraded honestly, with exactly one re-baseline

The v6 process came up (`package.updated` exit confirms the in-place upgrade),
the operator revoked, re-granted, and pressed scan. That scan:

```
installedPackageScope: "visible"
installedPackageHoldingCount: 135        (was 484 under "all")
installedPackageBaseline: true
changed: false
```

**One re-baseline, not two hundred phantom uninstalls.** `Grants.previous` saw
the stored line's scope was `all` and the current scope was `visible`, refused to
diff across the boundary, and re-baselined once — exactly the behaviour the
manifest comment said had *"never actually been run."* Now it has. The
honest-degradation claim `Watch` and `Grants` carried in a docstring is a
measured fact: a scope contraction reads as a contraction of *what can be seen*,
never as 349 apps vanishing.

#### The defect the experiment surfaced: the grant over-claimed

This is the §7b40 finding, and it follows the pattern `grants.exits` set — an
experiment producing a defect in its own first data. The scan degraded honestly,
but the **grant** did not. Both `grants.capability.granted` and `...revoked`
recorded:

```
scope: "all installed packages on this device"
```

…while the scan they authorized returned `visible`. The grant asserted a breadth
the build could never deliver, because `PackageAccess.record` hardcoded the
string. *The grant claims more than the manifest can honour* is the same shape as
`exitsUserInitiated` claiming more than the platform reported — a record stating
more than the measurement supports.

**Fixed.** `PackageAccess.declaresQueryAll` now reads our own package's
`requestedPermissions` and the grant records the scope it can actually honour —
`"packages visible without QUERY_ALL_PACKAGES"` with `manifestScope: "visible"`
when the permission is omitted, `"all…"` with `manifestScope: "all"` when it is
declared. The breadth is the manifest's fact, read from the APK, not the
operator's intent and not a constant. The scan still confirms the realized scope
independently; this only stops the grant and the scan from contradicting each
other. Staged as `orb-app-v7-noquery-scopefix.apk` — the grant it writes will
read `visible` to match its own scan.

#### What this settles about the no-permission build

It is a **coherent product**, not a degraded one. Play Protect passes it; the
capability gate still works (grant, revoke, re-grant all recorded in order); the
scan runs and reports the smaller set it can see, labelled honestly; and the
comparison machinery survives the scope change without inventing events. What the
operator loses is reach — 135 packages instead of 484, the visible set rather
than the whole installed life — which is precisely the trade `MOBILE_SENSING.md`
framed: *available to anything distributed* costs the breadth that *available to
the operator* keeps. This build is the distributable half, and it now has device
evidence that it degrades where the thesis said it would and nowhere else.

#### The "exactly one" in "exactly one re-baseline" — proven by the second scan

`orb-20260928-230744.txt` carries the lane seven events further, through a
second visible-scope scan, and it closes the part of Prediction 2 the first scan
could only assert. The first visible scan (event 28) re-baselined —
`installedPackageBaseline: true` — because it crossed the `all → visible`
boundary. The **second** visible scan (event 35) did **not**:

```
event 28  scope=visible  count=135  baseline=true   changed=false   ← boundary
event 35  scope=visible  count=135  baseline=false  changed=false   ← normal diff
```

This is the difference between *re-baselines once* and *re-baselines forever*. A
scope change that reset the baseline on every subsequent reading would be a
permanent regression dressed as a one-time event — silence that never resolved.
Instead, once both the stored and the current reading are `visible`,
`Grants.previous` diffs them normally and reports `changed: false` against a real
comparison. The boundary is a single event; steady state resumes immediately
after it. The honest-degradation claim is now confirmed on both halves: one
re-baseline at the contraction, ordinary diffing on either side of it.

**Still pending on-device: the grant-scope fix.** These grant and revoke events
(33, 34) still read `scope: "all installed packages on this device"` with **no
`manifestScope` field** — the pre-fix build. So this export confirms the
over-claim is still present exactly where §7b40 found it, and the v7 build that
derives `manifestScope` from the manifest has not yet been installed. The fix is
staged (`orb-app-v7-noquery-scopefix.apk`); its confirmation is the grant reading
`manifestScope: "visible"` to match its own scan, and that reading is not yet in
any export.

#### Confirmed: the grant now matches its own scan

`orb-20260928-231246.txt`, events 37–42 — v7 installed (a `package.updated`
exit at 38) and the grant-scope fix is on the device:

```
event 40  grants.capability.revoked  scope="packages visible without QUERY_ALL_PACKAGES"  manifestScope="visible"
event 41  grants.capability.granted  scope="packages visible without QUERY_ALL_PACKAGES"  manifestScope="visible"
event 42  grants.packages            installedPackageScope="visible"  count=135  baseline=false  changed=false
```

The grant's `manifestScope: "visible"` matches the scan's
`installedPackageScope: "visible"` — the two records no longer contradict each
other, and both are read from what the build actually is rather than from a
constant string. The over-claim §7b40 found is closed on-device, not just in the
tree.

The scan (42) is a **third** consecutive visible reading and is still
`baseline: false, changed: false` — steady state held across the v6→v7 upgrade
itself. An in-place update that carried a code change to the grant path did not
disturb the package comparison, because the two are independent: the scope of the
*answer* is a manifest fact, the scope of the *grant record* is now the same
manifest fact, and neither is a baseline event once the boundary is behind them.

### 7b41. The assist probe — what Android hands an assistant app, measured before it is declared — 2026-09-29

**Status: run 2026-09-29 — results in §7b42.** Predictions are written here before the first
invocation so that the result can refute them. `apps/pixel/probe-assist`,
package `dev.orb.probea`, 29 KB, no permissions.

#### Why this comes before the sensor declaration

The direction agreed for Android is an assistant overlay: invoke Orb from
anywhere, see a small card, tap **Remember**. Whether that is a sensor at all —
and what it may retain — depends on facts nobody in this repository has measured:
what the platform actually delivers to an app that is *only selected* as the
assistant, for which apps, how fast, and what it refuses. Declaring first would
be writing a mandate from documentation. `SENSOR_SHARE.md` and `SENSOR_GRANTS.md`
were written the other way round (measure, then declare) and both survived
contact with real exports; this follows them.

#### What it records — and the structural reason it cannot record more

`assist.*` events, each **numbers and yes/no facts only**, plus at most one
package name (the app that was on screen) and a fixed vocabulary of invocation
sources:

| Event | Answers |
| --- | --- |
| `assist.service.ready` | did the platform bind the service; is the role held (P23) |
| `assist.show.failed` | an invocation that did not reach us — so "not reached" and "not tried" differ |
| `assist.invoked` | the show flags, whether the platform asked for structure/screenshot, the invocation source |
| `assist.structure` | `arrived`; package; node, text-node, description-node counts; **total characters** of text (a length, never the text); depth; nodes that opted out (`blockedNodes`); WebView and web-domain nodes; latency |
| `assist.content` | `arrived`; whether a web URI / an intent / structured data / a clip was **present** (and whether the app supplied it); never their values |
| `assist.screenshot` | `arrived`; size; a 32×32 sample summarised as colour count, dark percentage, `uniform` — enough to tell a real capture from a blanked one, not enough to reconstruct it |
| `assist.closed` | callbacks received, time to first draw, time visible |
| `assist.export` | the operator exported |

**What it never records**: the text, descriptions, hints, URLs, intents, clip
contents, view ids, or the picture. This is enforced by types, not by care:
`Facts` — the only place a record is built — has no parameter that can carry text,
and `GuardTest` (59 checks, all passing) fails the build if any other source file
builds a record, logs, writes a file or a picture, keeps a second copy, uses a
content accessor for anything but its length or presence, requests a permission,
or puts a component in its own process (a lane has one writer). A record whose
package name does not look like a package name is written as `invalid`, not as
whatever it was.

**One consequence to know about**: the export names the package of every app you
invoke it on. That is metadata, but it *is* which apps you were using. Read the
file before sharing it, and skip invoking on anything you would rather not list.

#### Predictions

| | Prediction | If false |
| --- | --- | --- |
| **P23** | A sideloaded app with no permission can be **selected** as the default assistant, and the platform then binds it: `assist.service.ready` with `roleHeld: true`, `activeService: true` | The overlay direction is closed for a distributable build, before any screen is involved. If it is missing from the chooser, the probe includes the recognition service the docs list, so the platform's restriction — not an omission — is the cause |
| **P24** | The system gesture reaches the session: `assist.invoked` with `withAssist: true` **and** `withScreenshot: true`, with no `assist.show.failed` | Either the user-facing "use text / use screenshot" settings gate delivery (test them off — see protocol) or the gesture cannot reach a non-default-signed assistant |
| **P25** | For an ordinary app (a messaging app, Chrome, Settings) `assist.structure` arrives with `nodes > 0` and `textNodes > 0`, and `package` names the app that was on screen, not us | Structure is not a reliable input; Remember must come from the screenshot or from Share |
| **P26** | A screen that opted out of capture (FLAG_SECURE — a payments or banking screen, Chrome incognito) is **withheld or blanked, not silently delivered**: the screenshot arrives `uniform: true` or not at all, and structure shows `blockedNodes > 0` or fewer text nodes | The platform delivers protected screens and **the sensitive-screen policy must be ours to enforce** — the larger finding, and the one that shapes step 5 |
| **P27** | Chrome on a normal page supplies a web URI (`assist.content.webUri: true`) and web-domain nodes | Web pages remember as text only, with no source URL — the "where did this come from" lineage would have to be asked of the person |
| **P28** | Structure and screenshot each arrive within **1,500 ms** of invocation, and the card first draws within **500 ms** | The card cannot honestly promise to be instant; it would have to show "reading…" and the design changes from a card to a two-stage one |
| **P29** | An app that draws its own surface (a game, a video, some Flutter/Compose screens) arrives with `nodes > 0` but `textNodes ≈ 0` — the structure is present and useless, and the screenshot is the only signal | Nothing to plan for; the fallback is unnecessary, and this row closes cheaply |

Two things are **deliberately not predicted**: the invocation `sources` value (the
platform's vocabulary for *how* it was invoked is not documented well enough to
guess; the probe records it and the result will be read as a fresh fact), and
whether the phone would accept the assistant **without** the recognition stub. The
stub is in the build because the documentation lists one and the answer is
unconfirmed; that is a known uncertainty, recorded, and not needed to proceed.

#### The operator's protocol

1. Install `orb-assist-probe-v1.apk`. Note what Play Protect says — a screenshot
   if it is anything but *looks safe* (§7b38 is why this matters).
2. Open **Orb assist probe** → **Choose default assistant** → pick it. Come back.
   The screen should read *assistant role held: yes* and *active service: yes*.
   (If it is not in the list, that is P23's answer — export and stop.)
3. Invoke the gesture you normally use for the assistant (long-press power or
   home, or the corner swipe) on each of these, **one invocation each, a few
   seconds apart**. Nothing needs to be tapped in the card.
   1. a messaging app on a conversation
   2. Chrome, an ordinary page
   3. Chrome, an **incognito** tab
   4. a payments or banking screen *(open a screen; do not sign in)*
   5. a video or a game
   6. the home screen
   7. Settings
4. Invoke once more anywhere, then in **Settings → Apps → Default apps → Digital
   assistant app**, turn **Use text from screen** off and invoke again; turn it
   back on and turn **Use screenshot** off and invoke again. Turn both back on.
5. Back in the app: **Export journal**. The file is
   `Downloads/orb-probea-<date>.txt`; Claude reads it from there.

#### Reverting

Settings → Apps → Default apps → **Digital assistant app** → choose your usual
assistant (or *None*). Uninstalling the probe also reverts it — **export first**:
the journal goes with the package.

### 7b42. The assist probe, run — the platform delivers, the app decides what is protected — 2026-09-29

Export `orb-probea-20260929-122630.txt`: 47 events, one lane, **one install** with
no restart; `verifyLane` (the TypeScript encoder re-deriving every envelope and
payload hash) accepts all 47. Nine invocations, one `assist.service.ready`, one
`assist.export`, **no `assist.show.failed`**. Every string in every payload is a
package name or `assistGesture` — checked mechanically, not read by eye — so the
"never records content" guarantee held on real data as well as in the tests.

Which invocation was which app comes from the package field; that the
Chrome-with-nothing-in-it invocation was the **incognito** tab comes from the
operator's protocol order and from the pattern below, not from anything the probe
recorded.

#### Scoring

| | Result | Evidence |
| --- | --- | --- |
| **P23** | **Held** | `roleHeld: true`, `activeService: true`. A sideloaded app with no permission is selectable as the device assistant and is bound. The recognition stub was present, so *whether it is required* stays unanswered |
| **P24** | **Held** for the default settings | all nine: `withAssist`, `withScreenshot`, `sources: "assistGesture"`, `assistCallbacks: 1`, `screenshotCallbacks: 1`. `flags` was **263** every time; 7 of it decodes to assist + screenshot + gesture, and the remaining **256 is a bit this build does not decode** — left as recorded. **The "text off / screenshot off" invocations in the protocol are not in the export** (every invocation has both), so what those settings change is **untested**, not refuted |
| **P25** | **Held** | messaging app 415 nodes / 40 with text; YouTube 615 / 53; Settings 183 / 45; launcher 689–715 / 187–195; Chrome 4,702 / 1,592. `package` named the app on screen every time, never this probe. The same WhatsApp screen twice gave **415 nodes both times** — the structure is stable, not sampled |
| **P26** | **Half held, half refuted — and the refuted half is the important one** | see below |
| **P27** | **Half held** | Chrome supplied a web URI, **supplied by the app itself** (`appProvidedWebUri: true`), and 272 characters of structured data. So did YouTube (URI, 218 characters). **`webDomainNodes` was 0** even in Chrome (`webViewNodes: 1`): the per-node domain is not delivered here, only the page-level URI. WhatsApp: no URI, 73 characters of structured data |
| **P28** | **Held with wide margin** | structure 5–268 ms (the 268 was the 4,702-node Chrome page), screenshot 7–162 ms, first draw 18–148 ms. Every figure is **inside the probe, from the start of the session** — the time from the gesture to the session starting is not measured and is not part of this claim |
| **P29** | **Not tested** | no game or self-drawing app was used. One app (the payments app) shows the *shape* — 50 nodes, **0 text nodes**, 24 with descriptions — but it is not the case the prediction was about |

#### P26 — what the platform protects, and what it does not

Two screens, opposite results:

| | structure | screenshot |
| --- | --- | --- |
| Chrome, the empty one (incognito) | **1 node, `blockedNodes: 1`, 0 text** | `uniform: true`, **1 colour, 100 % dark — blanked** |
| The payments app (Google Pay), signed out | 50 nodes, 24 descriptions, 0 text nodes | `uniform: false`, **42 colours, 13 % dark — a real capture** |

**The platform does not decide what is sensitive. The app does.** Incognito opted
out twice, by two independent mechanisms (structure blocked, screenshot blanked);
that is the app's doing, and it worked. The payments screen opted out of neither,
and the platform handed over a genuine screenshot of it. I do not know which
Google Pay screen was showing — the operator was told not to sign in — so this is
**one screen, not a verdict on the app**: sign-in and payment screens of banking
apps commonly do opt out, and this one evidently did not.

Two consequences, both for step 5 and neither decided here:

1. **Two signals are free and reliable.** `blockedNodes > 0` and a `uniform`
   screenshot are how a protected screen presents on this device. A rule that
   says *when either appears, retain nothing* costs nothing and matches what the
   app asked for.
2. **They are not enough.** A screen that is sensitive and did not opt out
   arrives intact. Whether Orb needs its own rule for those — by package, by
   category, by an explicit allow-list, or by the person's confirmation on
   each capture — is a **policy decision, and the operator's**, and it is what
   step 5 exists to put in front of them.

#### What else the run showed

- **Callbacks fire exactly once.** No invocation delivered a second structure or
  screenshot, and none delivered neither.
- **The card drew every time**, in under 150 ms, and stayed as long as it was left
  (1.0–6.6 s).
- **`intent: true` on all nine with `appProvidedIntent: false`**: the platform
  supplies its own intent, so its presence says nothing about the app. Not a signal
  to build on.
- **WhatsApp supplied structured data** (73 characters) and no URI. What it is,
  the probe does not record and does not need to.

#### What is still open

The text-off and screenshot-off behaviour; a self-drawing app (P29); whether the
stub is required; the meaning of flag bit 256; and how the platform behaves when
a **second** assistant-capable app (the operator has ChatGPT, Claude, Perplexity
and Google all registered) is invoked while this one is default — that is not a
concern of the probe, only a fact of the device.

#### Addendum, 2026-09-29 — a second export, two more invocations

`orb-probea-20260929-125517.txt`: the same lane and install, 58 events (`verifyLane`
accepts all of them), the first 47 unchanged, then two invocations:

| App | structure | screenshot |
| --- | --- | --- |
| LinkedIn | 260 nodes, 34 with text, 529 characters | real capture (58 colours) |
| A crypto exchange app | 60 nodes, **1 text node (20 characters)**, 27 descriptions, **2 web views** | **real capture** (45 colours, 74 % dark) |

**P26's refuted half now has a second instance**: the exchange screen opted out of
neither structure nor screenshot, and the platform delivered a genuine screenshot.
Two financial apps, two intact screens; it is not one app's quirk. Under DR-14 both
are outside the allow-list and would not be captured.

**P29, closer but still not tested**: the exchange screen is mostly web views, so its
structure is present and nearly empty of text — the shape P29 predicted, in an app
that is not a game. A game itself is still untried.


### 7b43. Track 0 — the build on the record, transfer closed, and the four untested rows — 2026-09-30

Three small closes from the roadmap (`ROADMAP.md`, *The personal runtime on Android*),
done together because none of them is large and all three are checked on one
install.

#### 0a. `orb.process.start` names its build

`versionCode` and `versionName` are now in the start event, built by `Start.java.in`
(the pure part of `Orb`, as `Shares` is of `ShareActivity`), so the fixture the
importer is tested against is written by the same class. `versionCode` is **-1 when
the platform will not say** — never 0, never absent. Three tests: the phone's own
record carries a numeric `versionCode`; `Orb` builds the record only through
`Start`; the unreadable value is -1. **Check on the device:** the first export
after installing `orb-app-v9-version.apk` should carry `versionCode: 29845625`.

#### 0b. AD-11 finished — `allowBackup="false"` was not enough

Android's own text (`developer.android.com/identity/data/autobackup`): *"For apps
targeting Android 12 (API level 31) or higher … on devices from some device
manufacturers, specifying `android:allowBackup="false"` disables cloud-based backup
and restore … but doesn't disable device-to-device transfers for the app."* The
unchecked half of AD-11 was therefore a real gap, not a formality. Both builds now
declare `android:dataExtractionRules`, excluding every domain (`root`, `file`,
`database`, `sharedpref`, `external`) from **both** `cloud-backup` and
`device-transfer`. A test reads the manifest and the rules and fails if a domain is
dropped from either section (mutation-checked: removing `file` from
`device-transfer` fails it). **Not verifiable from a phone's own data** — nothing on
the phone reports what a transfer would have carried; this is closed by the
platform's documented behaviour plus the test, not by an observation. The retired
builds (`pass1`, `pass2`, `pass2b`, `probeg`) keep the default and hold readings,
not keys.

#### 0c. The four untested rows

| Row | Disposition |
| --- | --- |
| Flag bit 256 (every invocation carries `flags: 263` = 7 + 256) | **Not a public constant in API 36** (`VoiceInteractionSession` defines 1, 2, 4, 8, 16, 32, 64, 128). Constant across all eleven invocations, nothing in this design depends on it; recorded as unknown, not chased |
| "Use text from screen" / "Use screenshot" off | **Measured now** — P31, P32 |
| A game (P29) | **Measured now** — P33 |
| Is the recognition stub required | **Measured now** — P30. A second build, `dev.orb.probena`, ships without it (`ORB_PROBE_STUB=0`); its own package so a *fresh* install is what is tested, not whether an old selection survives |

`assist.service.ready` now carries `versionCode` and `recognitionStub` so each export
says which variant produced it. The export file is named by the package suffix
(`orb-probea-…` or `orb-probena-…`).

#### Predictions (before the run)

| | Prediction | If false |
| --- | --- | --- |
| **P30** | The build **without** the recognition stub is listed as a selectable assistant, is bound (`assist.service.ready` with `roleHeld: true`, `recognitionStub: false`) and receives an invocation | The platform requires a recognition service; the stub stays, and "an assistant with nothing to declare" is not possible on this device |
| **P31** | With **Use text from screen** off, an invocation still reaches the session but **no structure with nodes arrives** (`assist.structure` `arrived: false`, or `assistCallbacks: 0` in `assist.closed`); the screenshot still arrives | The setting does not gate delivery to this kind of assistant — then it is **not a control the person has**, and the retention rules cannot lean on it |
| **P32** | With **Use screenshot** off, no screenshot arrives (`arrived: false` or `screenshotCallbacks: 0`); structure still arrives | Same consequence for the screenshot |
| **P33** | In a game, structure arrives with `nodes > 0` and **fewer than 5 text nodes**, and the screenshot is a real capture | Games deliver text: nothing to plan for, and P29 closes cheaply |

#### The operator's protocol

1. Install `orb-app-v9-version.apk` (updates Orb in place). Open it once.
2. Install `orb-assist-probe-v2-nostub.apk` (a **new** app, *Orb assist probe (no
   stub)*). Open it → **Choose default assistant** → is it in the list? If it is
   not, take a screenshot of the list and skip to step 6 with the other probe.
3. Select it, return to the app. It should read *assistant role held: yes*.
4. On **one messaging screen** (the same one each time), invoke the gesture: once as
   it is; then **Use text from screen** off (Settings → Apps → Default apps →
   Digital assistant app) and invoke; turn it back on; **Use screenshot** off and
   invoke; turn it back on.
5. Open any **game** and invoke once. Then **Export journal**.
6. *(Only if step 2 failed.)* Install `orb-assist-probe-v2.apk` (updates the first
   probe in place, keeping its journal), choose it as the assistant, and do steps 4–5
   with it.
7. Reverting: Settings → Default apps → Digital assistant app → your usual one.
   Export first if you uninstall — the journal goes with the app.

Also export Orb itself once (step 1's check).

### 7b44. Track 0 on the device — the build is on the record, and the settings round is half-answered — 2026-10-01

Three exports, all `verifyLane`-clean: `orb-20261001-083535.txt` (Orb, 54 events),
`orb-probea-20261001-083530.txt` (the assist probe, 91), `orb-probena-20261001-083524.txt`
(the variant without the recognition stub, **1**).

#### 0a — confirmed on the device

Event 50 of Orb's lane is a start with `versionCode: 29845625`, `versionName:
"0.1-orb"` — the first export that names the build that wrote it. v9 is installed
and, with it, `dataExtractionRules` (0b; not observable from the phone, §7b43).
The share importer still reads the lane (5 shares, 13 grants readings, re-import a
no-op).

#### What the run actually was

The assist probe's `assist.service.ready` at event 70 has **no `versionCode` and no
`recognitionStub`** — so the build that answered was **v1**, the one installed
before; v2 was never installed (the protocol only asked for it if the variant failed).
That matters for one reason: the probe did not record the state of the system's
switches, so **an invocation cannot be matched to a switch position from the export
alone.** What follows is therefore read from the *pattern* of each invocation, and
labelled as such.

#### P30 — the stub-less variant: provisional, one fact missing

`dev.orb.probena` holds **no `assist.service.ready` at all**, no invocation, and its
only event is the export: the platform **never bound it**. Whether that is because it
was **absent from the chooser** (the platform requires a recognition service —
P30 refuted) or **never selected** is not in the data, and the operator fell back to
the stubbed probe, which suggests the first. **Asked, not assumed.**

#### P31 — text off: structure is withheld, and so is the screenshot

One invocation (the last, 220549234) has the signature of the text switch being off:
`assistCallbacks: 1` but **`assist.structure arrived: false`** with no package,
`assist.content arrived: false`, and **`screenshotCallbacks: 0`** — *no screenshot
callback at all*. `argKeys` is **6** where every other invocation has 7.

- The **structure half of P31 held**: with the switch off the structure does not arrive.
- The **screenshot half was refuted**: I predicted the screenshot would still arrive.
  It did not. **The screenshot is coupled to the text switch** — consistent with the
  operator's report that the screenshot switch cannot be used while text is off.
- **`flags` did not move.** It stayed **263** and `withAssist` / `withScreenshot` stayed
  **true** on the invocation where nothing arrived. **The flags do not tell a session
  what it will receive; arrival does.** Anything built on them would be wrong.

#### P32 — screenshot off alone: **not measured**

No invocation has structure arriving and the screenshot not. Since the screenshot
cannot be switched off independently while text is off, the only way to measure P32 is
**text on, screenshot off**, which this round did not do.

#### P33 — a game: it opted out, like incognito

The chess app, twice (events 76–85): `nodes: 1, blockedNodes: 1`, no text, and a
**uniform black screenshot** — the same two-mechanism opt-out as the incognito tab in
§7b42. So a game that protects itself is withheld by the app, not by the platform;
**P33 as stated (a game delivers structure with little text) is not tested**, because
this game delivered none. P29 stays open for a game that does not opt out.

#### Two things from the invocations before the round

- **A second screenshot callback.** After the second chess invocation's session had
  closed, a further `assist.screenshot` with `arrived: false` was recorded 31.6 s
  after its invocation — at the instant the next invocation began. §7b42's *"callbacks
  fire exactly once"* held for that round and is **not a rule**: a stray null screenshot
  callback can arrive late. Not harmful (the probe records it as not-arrived), but
  `Remember` must never treat a late callback as belonging to the invocation in
  front of it.
- **Apps that deliver intact:** the Claude app (83 nodes, 18 with text, a real
  capture) and Instagram (784 nodes, 61 with text), recorded before the round. Both
  fall under DR-14's allow-list rather than the platform's protection.

#### An unrelated observation in Orb's own lane

`com.google.android.apps.photos` was **gained** in the visible-package set at event 47
(a share from Photos was about to be recorded) and is **lost** at event 53, at the next
process start, with nothing uninstalled. Under the no-`QUERY_ALL_PACKAGES` build the
"visible" set is whatever the platform lets Orb see, and **that set appears to move
with Orb's own interactions** — here, a share from that app. **Hypothesis, two data
points:** a package becomes visible while a share from it is in flight and leaves the
set afterwards. If it holds, the install/uninstall alert at this scope will raise a
change for something that did not happen. Recorded for track D; not yet investigated.

#### What the next probe build adds, and the one round that remains

`orb-assist-probe-v3.apk` records the system's own switches on every `assist.invoked`
(`textSetting`, `screenshotSetting`: 1 on, 0 off, -1 unreadable, -2 absent) — so a
later export names the switch state instead of leaving it to be inferred. The key
names are the platform's hidden ones; if the platform refuses to read them they come
back -1, and that is itself the answer.

One round, on **WhatsApp, the same chat each time**: text on, screenshot on → text on,
**screenshot off** → text off → back to both on. Then export. That measures P32
directly and checks P31 against a recorded switch state.

### 7b45. The settings round, with the switches recorded — 2026-10-01

Export `orb-probea-20261001-084402.txt`: 113 events, `verifyLane`-clean, continuing the
same lane. **v3 is the build that answered** — `assist.service.ready` carries
`versionCode: 29847068` and `recognitionStub: true` — so every invocation below names
the state of the system's text switch instead of leaving it to inference. Four
invocations on two apps.

| Invocation | `textSetting` | Structure | Screenshot | `argKeys` | `flags` |
| --- | --- | --- | --- | --- | --- |
| 1 — WhatsApp | **1** (on) | arrived, 373 nodes, 32 with text | arrived, real | 7 | 263 |
| 2 — same chat | **0** (off) | **`arrived: false`**, no package | **no callback at all** (`screenshotCallbacks: 0`) | **6** | 263 |
| 3 — a mobile game | 1 | arrived, **7 nodes, 0 with text** | arrived, real (217 colours) | 7 | 263 |
| 4 — the same game | 1 | arrived, 7 nodes, 0 text | arrived, real (193 colours) | 7 | 263 |

#### Scoring

- **P31 — held in full, now against a recorded switch.** Text off means no structure
  **and** no screenshot. The earlier reading (§7b44) was made from the pattern; this
  is the same pattern with the switch's value beside it. `flags` stayed 263 and
  `withAssist`/`withScreenshot` stayed true on the invocation where nothing arrived:
  **the flags are not a promise and must never be read as one.** The signatures of
  "the person withheld it" are `arrived: false` and `argKeys: 6`.
- **The operator's report** — *use screenshot cannot be turned on while use text from
  screen is off* — **is the same fact seen from the settings screen**: the screenshot
  switch depends on the text switch, as the probe saw it depend on arrival.
- **P32 (screenshot off, text on) — not measured, and not needed.** The screenshot
  switch's own value reads **-2 (absent)**: the platform has no stored row under the key
  this build asks for, which is consistent with a switch never moved from its default
  and says nothing about whether the key is the right one. **No invocation had text on
  and the screenshot withheld.** What step 5 needs does not depend on it — see below.
- **P33 and P29 — held.** A game that does *not* opt out delivers a structure that is
  present and empty of text (7 nodes, none with text) and a genuine screenshot. This is
  the first game that did not block itself (the chess app of §7b44 did). **For an
  overlay that keeps text only, a game is a screen with nothing to keep.**

#### A pattern worth keeping, recorded as a pattern and not a rule

A **late, null screenshot callback** appeared again (event 98, 9.0 s after its
invocation, `arrived: false`), landing at the instant the *next* invocation began. That
is the second time, and **both times the next invocation was the first one made with the
text switch off** (§7b44, event 86 → 87; here 98 → 99); the invocations between the
other transitions had none. Two instances are a coincidence-sized sample. What is firm
and enough to build on: a screenshot callback can arrive after its session closed and
carry nothing, so a callback is matched to an invocation by the id it carries, never by
"the latest one".

#### What this settles for step 5

1. **Arrival is the only signal.** The flags and the setting say what was *permitted*;
   only what arrived says what was *delivered*, and only a delivered screen can be
   remembered.
2. **A rule that does not need P32.** The screenshot is needed for one thing even though
   no screenshot is stored: it is how a screen that protected itself from capture *without*
   marking its structure blocked is told from an ordinary one (a blanked, uniform
   image). So a capture should require **both** to have arrived, and treat a missing
   screenshot as *cannot check*, not as *fine*. If the person turns the screenshot off,
   Orb keeps nothing from that invocation and says why. That holds whatever P32 turns out
   to be.
3. **Text-only memory has a natural empty case.** A game, or any screen whose structure
   arrives with no text, leaves nothing to keep; the right outcome is *nothing kept, and
   the person told* — not a fallback to the picture (DR-14 ruling 5).

#### Track 0 — where it stands

0a closed (§7b44). 0b closed (§7b43; documented behaviour plus a test, not observable
from a phone). 0c: P31, P33 and P29 answered; P32 not measured and not needed; flag 256
unknown by design. **One fact is still missing:** whether the stub-less build was *absent
from the chooser* or *never selected* (P30). The platform never bound it; the data
cannot say why.

#### P30 — answered, 2026-10-01

The operator confirms the stub-less build **did not appear in the Default digital
assistant list**. With the data (no `assist.service.ready` ever written, no invocation), that is **P30 refuted**: on this device a sideloaded assistant is
offered **only if it declares a recognition service**. The do-nothing stub stays, and
`SENSOR_ASSIST.md` records it as required. Caveat: measured on one phone and one Android
version; it says nothing about other makers' builds.

Track 0 is closed. 0c's remaining unknowns are the ones deliberately left: flag bit
256, and the screenshot switch alone (§7b45), neither needed.


### 7b46. Step 6 — the phone can destroy a key — 2026-10-01

**Status: built, tested off the phone, and verified on it (§7b47–§7b49).** Predictions are written
here before the first erasure. `orb-app-v10-erase.apk`.

#### What it does, in one paragraph

*Kept by Orb: erase* lists what Orb holds under a key it can destroy — time, kind, size,
**never the content** — and erases one on request, after saying what that will do.
Erasing **declares first, then destroys**: an `orb.erasure` event naming `{lane, hash}`,
then the key is overwritten and deleted and the ciphertext removed. If something else
readable still cites the same content, the declaration stands and the content stays
until the last of them is erased — the rule of `Attachment.md` inv. 8, which is a
question over history (*can any readable event still resolve this?*) and **not a stored
count**.

#### The design decisions that were not obvious

1. **Declare, then destroy.** The other order has a crash window in which content is gone
   and nothing says so (`ERASURE.md` §1: *never silently*). Declare-first leaves, at worst,
   *declared and not yet done*, and `Erase.reconcile` finishes it at the next start
   (tested by simulating exactly that crash).
2. **A marker, written before the key is touched, outranks the key.** Destruction writes
   a tombstone (named by the *blinded* address, never the identity), then overwrites and
   deletes the key, then deletes the ciphertext. A crash between the first two leaves both
   on disk and reads as **destroyed**, not held.
3. **The same bytes do not undo it.** `Attachment.md` inv. 8 and `ERASURE.md`: a keyring
   that minted a fresh key on the next `put` would make an erasure reversible by an accident
   of timing. So `store` and `mintKey` both refuse a destroyed identity. **A consequence to
   know:** if you erase a capture and later capture *the identical text*, Orb will not keep
   it again and will say so — recorded as `resolveOutcome: erased`, `absenceReason:
   erased`, which is **not** `unfetched` (a helpful peer would restore the second and must not
   restore the first). That is the contract, applied to a case — repeated identical captures
   — that text makes likelier than photographs do.
4. **Nothing is declared that did not happen.** An event whose content is *in the journal
   itself* cannot be unwritten by this app, so for it the plan is `noAttachment`, **no
   declaration is written**, and the screen says so.
5. **No parser.** The phone cannot parse JSON. The journal writes canonical JSON (keys
   sorted, no spaces), so the three fields needed — the envelope hash, the `attachment`
   identity, the declaration's hash — sit at fixed places, and a quote inside a string is
   escaped, so a sentence that contains the field's spelling is not the field (tested).
   **Checked on your real export**: from 5 shares the extractor finds exactly the 3 that
   carry a sealed photograph, pairs the two that are the same photograph (`keptByOthers`,
   1 other) and leaves the single one `willDestroy`.

#### Cross-implementation agreement

`tests/fixtures/erasure-export.txt` is written by **`Erase.execute` itself** against real
keys on a temp disk (`tools/gen-erasure-export.sh`): one photograph shared twice, the
first erasure kept, the second destroying, the bytes offered again and refused. The
TypeScript side then reads it: the chain verifies; `erasedHashes` returns exactly the two
envelope hashes the phone named — computed by a regex on the phone and by the encoder
here, so a match means they agree; `confirmationsFor` names the phone as the confirming
device; a declaration carries a lane and a hash and nothing else; the refused re-share says
`erased`. Tests: **39** on the phone's side (off-device JVM), **355** TypeScript.

Mutation-checked: letting an erased event keep content alive fails 4 checks; removing the
tombstone check in `store` fails the re-share refusal; not deleting the key fails the
reconcile checks.

#### What it does **not** do — and is registered, not hidden (AD-12)

- **Shared text cannot be erased.** `references` carries the text itself in the clear, and
  the phone has no sealed payloads. Only sealed attachments are erasable on the phone. The
  screen says so; the assist capture was designed for this (text sealed, only numbers in
  the clear), shares of plain text were not.
- **A destroyed key on flash is not a guarantee of destroyed bytes.** Overwrite-then-delete
  does not control where the storage keeps stale copies. What makes the content
  unrecoverable is that the key lived nowhere else and, on the phone, file-based encryption
  keeps what is left unreadable. A hardware-backed key is the stronger answer and is a port,
  not built.
- **The desk does not yet act on a declaration.** `erasedHashes` is a projection; nothing
  on the laptop detaches an erased event's payload. The replica keeps the clear payload —
  for a sealed attachment that is a content-source URI and numbers, never the content.
- **Other devices:** there are none yet. The screen says other devices may hold copies of the
  *record*; the content was only ever on this phone.

#### Predictions (before the run)

| | Prediction | If false |
| --- | --- | --- |
| **P34** | The screen lists your photograph shares, **two rows for the photograph shared twice** and one for the other | The extractor or the screen is wrong; the real-export check passed off-device, so suspect the screen |
| **P35** | Erasing the first of the twice-shared pair says the content is *also kept by 1 other*; the export gains **one** `orb.erasure`, and the photograph is not destroyed | The guard let a still-cited key go — the serious failure |
| **P36** | Erasing the second says nothing else keeps it; the export gains a **second** `orb.erasure`; and the two hashes are exactly those of the two shares (TypeScript `erasedHashes` equals them) | The two implementations disagree on the hash; the declaration names nothing |
| **P37** | Sharing that same photograph again records `resolveOutcome: erased`, `absenceReason: erased`, no attachment — Orb says it recorded the share, and the content is **not** kept | The erasure was undone by the same bytes — the key was re-minted; a defect in `store` that the off-device test missed |
| **P38** | A shared **text** is not on the screen | It is: the screen lists something it cannot erase |

#### The operator's protocol

1. Install `orb-app-v10-erase.apk` (updates Orb in place).
2. Take a screenshot of anything that is not private. Share it to Orb **twice**.
3. Orb → **Kept by Orb: erase**. You should see the new pair plus your earlier photographs.
4. Erase the **newer** of the new pair. Read what the dialog says. Confirm.
5. Erase the **older** of the pair. Read what the dialog says. Confirm.
6. Share the **same screenshot** a third time.
7. **Export and share journal.**

(Do not erase your earlier photographs unless you mean to. Erasing is permanent.)

### 7b47. Step 6 on the device — the declaration works; the run did not test the hard part — 2026-10-01

Export `orb-20261001-091145.txt`: 64 events, `verifyLane`-clean. v10 is installed (event 57,
`versionCode: 29847090`), and the *Kept by Orb* screen showed rows for the photograph
shares, with the dialog **"Nothing else keeps this content …"** for the one erased.

#### What held

- **P34 (partly).** The screen listed the sealed shares, newest first, with time, kind and
  size, and no content.
- **The declaration is right, on a real device.** Event 62 is an `orb.erasure` whose `hash`
  is the envelope hash of event 61, a share made fifteen seconds earlier. The phone computed
  that hash with a regex over its own line; the TypeScript encoder computes the same one.
  `erasedHashes` returns exactly it, it names a real event, and the phone is the confirming
  device. That is the cross-implementation check §7b46 did off the phone, now passed on one.
- **P38.** Shared text was not listed.
- Importing the export: 9 share Observations (the new three included), re-import a no-op.

#### What the run did **not** test

Each screenshot you shared is a **different file** — 3,317,568, 3,317,641 and 3,317,858 bytes
— so three different pieces of content, correctly kept apart. The interesting cases need the
**same bytes twice**:

| | Needs | Status |
| --- | --- | --- |
| **P35** — erase one of two citations: the content stays | the same file shared twice | **not run** |
| **P36** — erase the last: the key is destroyed | the above | **not run** |
| **P37** — the same bytes again are refused, as `erased` | the above, then a third share | **not run** |

What was erased was a single-citation item, which is the simple path (*willDestroy*).

#### A gap in my own design, found by reading this export

**The export cannot say whether the key is gone.** The declaration is written *before* the
key is destroyed — deliberately, so nothing shrinks silently — which means it is a
commitment, not a confirmation. If destruction had failed, this export would look
identical. The phone's screen knew; the file I read did not. Two small fixes, both in v11:

- the `orb.export` event now carries `attachmentKeysHeld` and `attachmentsDestroyed` —
  **counts of the store itself**, numbers only. A reader can now see that a key left;
- each erased row says what is true of its key: *key destroyed*, *the content stays while N
  other items still keep it*, or *declared; the key is not yet removed*.

The off-device suite gains five checks (45) covering the counts and the on-disk remains.

#### The next run, and what it must show

Same-file sharing is easiest from **Photos**: open one screenshot there and share it to Orb
**twice**. The two should be one Attachment (`stored`, then `held`).

1. Install `orb-app-v11-erase-state.apk`. **Export** once (this records the starting
   counts).
2. In Photos, share **one** screenshot to Orb, then share the **same** screenshot again.
3. *Kept by Orb: erase* — erase the **newer** of the two: the dialog should say another item
   keeps the content. Confirm. The row should say the content stays.
4. Erase the **older**: the dialog should say nothing else keeps it. Confirm. The row should
   say *key destroyed*.
5. Share that same screenshot from Photos once more.
6. **Export.** The export should show `attachmentsDestroyed` one higher than the first, a
   share record with `resolveOutcome: erased`, and two new declarations.

### 7b48. Step 6 on the device — the guard holds, and the key is gone — 2026-10-01

Two exports from the v11 run: `orb-20261001-091701.txt` (the starting counts, 68 events) and
`orb-20261001-091819.txt` (73), both `verifyLane`-clean. v11 is installed (event 65,
`versionCode: 29847103`).

| Evidence | What it shows |
| --- | --- |
| Event 68: **`attachmentKeysHeld: 5`, `attachmentsDestroyed: 1`** | The first erasure (§7b47, a single-citation item) **did destroy its key**: five photographs still held, one identity destroyed. The §7b47 gap is closed — the declaration was a commitment, and this is the fact |
| Events 69, 70, 72 | The same screenshot shared three more times, each recorded **`held`**, not `stored`: Orb recognised identical bytes as one Attachment (inv. 2) four times over, with the original at event 63 |
| Event 71 + the dialog *"also kept by 2 other items"* | Erasing one of the four: **the guard counted the other readers correctly** and the content **stayed** — **P35 held on the device** |
| Event 73: still **5 held, 1 destroyed** | After that erasure and a further share the key count did not move: nothing still cited was destroyed |
| `erasedHashes` over the export | Exactly two — the two shares the phone named — and each is **confirmed by the phone**; both name real events |

**P36 and P37 are not yet run:** the content is still cited by three readable items (events
63, 70, 72), so its key correctly still stands. Erasing the last of them should say *nothing
else keeps this*, move `attachmentsDestroyed` to 2, and a further share of that screenshot
should record `resolveOutcome: erased`.

The one erased row's status in the new screen (*the content stays while N other items still
keep it*) matches the data. Nothing in these exports contradicts a prediction.

### 7b49. Step 6 closed — all five predictions held on the device — 2026-10-01

Export `orb-20261001-092217.txt` (78 events, `verifyLane`-clean). The other file uploaded with
it, `…091819.txt`, is byte-identical to the earlier export of that name.

| | Prediction | Evidence |
| --- | --- | --- |
| **P34** | the screen lists the sealed shares, two rows for a photograph shared twice | the screen listed every sealed share, duplicates as separate rows; no text share (§7b47–§7b48) |
| **P35** | erasing one of several citations keeps the content | event 71; the dialog said *kept by 2 other items*; keys held and destroyed unchanged at 5 and 1 (§7b48) |
| **P36** | erasing the last citation destroys the key | events 74–76 declare the remaining three; **`attachmentKeysHeld` 5 → 4 and `attachmentsDestroyed` 1 → 2** (event 78) — the key is gone, in the store's own count |
| **P37** | the same bytes again are refused, as *erased* | event 77: `resolveOutcome: erased`, `absenceReason: erased`, `resolved: false`, and **no attachment named** |
| **P38** | shared text is not listed | none appeared |

`erasedHashes` returns all five declared hashes, each naming a real event and each confirmed by
the phone. The sequence is the one `Attachment.md` inv. 8 describes — kept while anything
readable still cites it, destroyed with the last, not undone by the same bytes — **observed on a
real phone**, and visible in its own export.

**Step 6 is closed.** What it leaves open is registered, not hidden: AD-12 (only sealed
attachments are erasable; the desk does not yet honour a declaration; flash may hold stale
copies of a deleted key).

### 7b50. Step 7, part 1 — Orb as the assistant, deciding but keeping nothing — 2026-10-01

**Status: built, 99 off-device checks, not yet run on the device.** `orb-app-v12-assist.apk`.
Part 1 of two (the operator's split): everything a real capture decides, and a **simulated**
*Remember* that records **counts**, never content. Part 2 replaces the simulation with the
sealed text.

#### What it is

- **Orb is now an assistant** (the service, the session and the do-nothing recognition
  stub — required, §7b43 — moved into the Orb app, sharing its journal; the probe stays as an
  instrument and is unchanged).
- **The five checks of `SENSOR_ASSIST.md` §5**, as one pure function (`AssistPolicy.decide`):
  structure arrived → app allowed → screenshot arrived → screen not protected → there is text.
  **The app is checked before its screen is read**, so an app that is not allowed is declined
  as that and nothing else is looked at.
- **A payments floor under the list**: ten package names (two observed on the phone, eight from
  general knowledge and **not checked against a device**) that can never be allowed — refused
  at the decision, at the *Allow* button, and in the projection of history, so nothing written
  by anything else widens it.
- **Declines name a reason and never the app.** `AssistFacts.declined` takes a reason and a
  build number and has no parameter for anything else.
- **The allow-list is a projection** of `orb.assist.allowed` / `disallowed`, latest wins,
  starting empty.
- **A 3-second wait** for the screenshot; a missing one is `noScreenshot`, never a pass; a
  callback after the session closed or decided is ignored.
- **Password fields count as nothing**, by input type, even if the platform delivered them.
- **The card says what happened in plain words**, offers *Allow* only when that is the reason
  and the app is not a payments app, and for a screen that would be kept offers *Record this
  test (nothing is kept)* — which writes `orb.assist.simulated`: the app's name (allowed apps
  only), counts, a yes/no for a page address, the build.

#### What guards it

`AssistGuardTest` reads the assistant's own source and fails on: a record built outside
`AssistFacts`; any logging or `Toast`; a content accessor used for anything but its length or a
null test (**found weak by mutation and tightened** — the first rule searched the rest of the
line and let `getText().toString()` through when a `.length()` appeared later; the probe's
copy of the rule had the same flaw and is fixed too); any picture, file, preference or
`Attachments` use; a component in its own process; any permission beyond the boot receiver's.
Mutation-checked: logging, a stringified read, an `Attachments` reference, an ignored payments
floor and a record built in glue each fail a named check.

#### Predictions (before the run)

| | Prediction | If false |
| --- | --- | --- |
| **P39** | Orb is offered in *Default digital assistant app* and can be chosen | the services moved into Orb differently from the probe's; compare the manifest |
| **P40** | On an app not on the list the card says Orb doesn't remember from it and offers **Allow**; the export holds `orb.assist.declined`, `reason: notAllowed`, with **only** `reason` and `versionCode` | a decline named the app — the failure the design exists to prevent |
| **P41** | After *Allow*, invoking again says Orb **would keep N text elements (M characters)**; `orb.assist.allowed` names the app; *Record this test* writes `orb.assist.simulated` with the same counts | the allow-list projection or the settle logic is wrong |
| **P42** | On a payments app (Google Pay, PhonePe) the card refuses, **offers no Allow button**, and the decline carries no package | the floor leaks |
| **P43** | On an allowed app's protected screen (Chrome incognito after allowing Chrome on a normal tab) the card says the screen protects itself | the protection signals do not drive the decision |
| **P44** | With *Use text from screen* off, the card says Orb could not read the screen's text, and the record is `noStructure` | arrival is not what the decision keys on |
| **P45** | The simulated counts for a screen are within about 15 % of the probe's for the same kind of screen (a WhatsApp chat: roughly 30–40 text elements, 400–600 characters) | the walk differs from the probe's; password exclusion or the allowed-app gate is miscounting |

#### The operator's protocol

1. Install `orb-app-v12-assist.apk` (updates Orb). Open Orb.
2. **Use Orb as the assistant** → choose **Orb** (not the probe). Orb → **Apps Orb may remember
   from** should say *No apps yet.*
3. Open a WhatsApp chat and invoke the gesture. Expect: *Orb doesn't remember from this app*
   and an **Allow** button. Tap **Allow**.
4. Invoke again on the same chat. Expect *Orb would keep N text elements…*. Tap **Record this
   test**.
5. Invoke on **PhonePe or Google Pay**. Expect a refusal and **no** Allow button.
6. Invoke on a normal **Chrome** tab → **Allow**. Then open an **incognito** tab and invoke.
   Expect *This screen protects itself.*
7. Settings → Digital assistant app → **Use text from screen** off → invoke on WhatsApp. Expect
   *could not read this screen's text*. Turn it back on.
8. Orb → **Export and share journal**.

To go back to your usual assistant: Settings → Default apps → Digital assistant app.

#### Part 1 on the device — first results (export `orb-20261001-102138.txt`, 87 events, `verifyLane`-clean)

| | Result | Evidence |
| --- | --- | --- |
| **P39** | **Held** | Orb offered and chosen as the assistant; the card reads *Orb*. (The first invocation answered as the old probe — the default had not been switched — which is why the probe's card appeared until Orb was chosen) |
| **P40** | **Held** | event 84 `orb.assist.declined`, `reason: notAllowed`, with **only** `reason` and `versionCode` — no app named |
| **P41** | **Half held** | event 85 `orb.assist.allowed` names `com.whatsapp`, written when the person tapped *Allow*. The *would keep N text elements* card and `orb.assist.simulated` are **not yet seen** |
| **P42** | **Held** | event 86, a second `notAllowed` decline with no app named — the operator confirms it was **PhonePe**, refused correctly (no Allow button) |

Run on the real export: `AllowList.allowed` returns `[com.whatsapp]` and `isAllowed` is true, so
the projection reads the phone's own lines correctly.

**A cost of the design, now observed:** because a decline never names the app, event 86 could
not be attributed from the file — it took the operator's word. That is the trade DR-14 chose
(a record of "declined PhonePe" would itself be the leak), and it is the right one, but it
means a surprising decline is diagnosed by asking, not by reading.

**Still to run:** P41's second half, P43 (a protected screen in an allowed app), P44 (text
switch off) and P45 (the counts against the probe's).

#### Part 1 closed — every prediction held on the device (export `orb-20261001-103119.txt`, 95 events, `verifyLane`-clean)

| | Result | Evidence |
| --- | --- | --- |
| **P41** | **Held** | events 88, 89, 94: `orb.assist.simulated` for `com.whatsapp` — 25 text elements / 301 characters on an image-heavy chat (the card read *"Orb would keep 25 text elements (301 characters)"*), and 87 / 1,669 on a text-heavy one. Numbers, an allowed app's name, a yes/no for a page address, the build — nothing else |
| **P43** | **Held** | events 91–92: Chrome allowed from a normal tab, then `declined`, `reason: protectedScreen` in the incognito tab; the card read *"This screen protects itself. Orb kept nothing from it."* over a blank screen |
| **P44** | **Held** | event 93: `declined`, `reason: noStructure` with *Use text from screen* off; the card read *"Orb could not read this screen's text…"* |
| **P45** | **Not cleanly testable** | the screens are not the same ones the probe measured, so the counts cannot be compared like for like. They are of the right order for the screens shown (a WhatsApp chat of mostly pictures: 25 elements; a text-heavy one: 87), and the walk is the probe's with passwords excluded. Left as *consistent*, not *confirmed* |

Together with §7b50's first results: **P39–P44 held; P45 consistent.**

**Something the screenshots show about "text only", worth knowing before part 2.** The chat
Orb counted 25 text elements in is mostly *pictures of tables and documents*. The text inside
a picture is not text to the platform, so a *text only* memory keeps the messages around it and
**none of what the pictures say**. That is the operator's ruling (DR-14 ruling 5) working as
written, not a defect — but it means a screen that is mostly images remembers little, and
reading text out of a picture is a different capability (OCR) that nobody has asked for.

### 7b51. Step 7, part 2 — Orb keeps the text, sealed, after a preview — 2026-10-01

**Status: built; 152 phone-side and 366 TypeScript tests; not yet run on the device.**
`orb-app-v13-remember.apk`. Part 1 (§7b50) made every decision and kept nothing; this keeps.

#### What it does

On an allowed app, with the structure and screenshot arrived and no protection signal, the card
**shows the start of the text** (400 characters, and how many more there are) and offers
**Remember** and **Don't keep**. Nothing is written before the tap. **Remember**:

1. checks the app is **still allowed** (it may have been removed since the card opened);
2. seals the text and the page address as an Attachment under its own key;
3. only then writes `orb.assist.captured` — numbers, the allowed app, the sealed identity;
4. and if that record cannot be written, **removes the sealed text again** (a rollback with no
   marker — nothing was promised), so there is never sealed content no event cites. Unlisted, it
   could not be found in *Kept by Orb* and so could never be erased.

The same screen twice is **one Attachment, two citations** (`held`); an identical screen after
it was erased is refused, recorded as `orb.assist.captureFailed` (`erased`) with no app, and the
card says so. A kept capture appears in **Kept by Orb** as *remembered*, with the same
erase-and-destroy-the-key behaviour step 6 verified.

#### What confines it

The code that touches a screen's content is **one file**:

| File | May | May not |
| --- | --- | --- |
| `ScreenReader` | read `getText` and the page address; skip passwords by input type | read anything else off a screen; keep or log anything |
| `ScreenText` | hold the text in memory, give a preview, produce the sealed document | import Android; write or log anything |
| `Capture` | seal (`Attachments`), record | read a screen; log |
| `AssistFacts` | build every record | — |
| everything else | decide and draw | read screen content; touch the sealed store; build a record; log |

`AssistGuardTest` reads these files and fails the build on a breach (mutation-checked). The
buffer is **plain Java**: it cannot import Android, which the off-device build enforces by not
compiling. It is emptied on a decline, a dismissal, a finished remember and a new invocation.

#### Seen by the importer

`orb.assist.captured` becomes an Observation, source `orb.sensor.assist@<install>`, confidence
100 **for the occurrence**, the sealed text cited by identity in `attachments`. Declines,
allow-list changes and failures stay Events. The test fixture is **written by `Capture.remember`
and `Erase.execute`**, and the first thing the test asserts is that **none of the invented
conversation's words appear anywhere in the export** — the clear record is clear of content, and
that is checked on output, not on intent. A drift guard fails if the phone writes a field the
importer has not decided about (proven to).

#### Predictions (before the run)

| | Prediction | If false |
| --- | --- | --- |
| **P46** | On an allowed app the card shows the start of the screen's text, with *Remember* and *Don't keep*, and **nothing is written before a tap** — dismissing leaves the export without a capture | the buffer is being written early |
| **P47** | *Remember* then shows *Remembered…*; the export holds one `orb.assist.captured` with the app, counts, `attachment: sha256:…`, `resolveOutcome: stored`, and **no word of the text or the page address** | the clear record carries content |
| **P48** | *Kept by Orb* lists it as **remembered**, with its size; *Erase* on it says nothing else keeps it, then destroys the key (`attachmentsDestroyed` +1 in the next export) | the capture is not erasable — the failure this step exists to prevent |
| **P49** | Remembering the **same screen twice** records `stored` then `held`; *Kept by Orb* shows two rows; erasing one says the content is also kept by 1 other | the same text is not recognised as one Attachment |
| **P50** | After erasing both, remembering the same screen again says *You erased this exact content before…* and the export holds `orb.assist.captureFailed`, `outcome: erased`, with no app | an erasure was undone |
| **P51** | A screen with a password field keeps no password text: the preview contains none of it | passwords are delivered and kept |

#### The operator's protocol

1. Install `orb-app-v13-remember.apk` (updates Orb). Open Orb once. Orb is still your assistant.
2. WhatsApp is on the allow list already. Open a **short, non-private** chat (or a note to
   yourself) and invoke Orb. Read the preview. Tap **Don't keep**. *(P46)*
3. Invoke again; tap **Remember**. *(P47)*
4. Invoke on the **same screen** and **Remember** again. *(P49)*
5. Orb → **Kept by Orb: erase**. You should see two *remembered* rows. Erase one; read the dialog;
   confirm. Erase the other. *(P48, P49)*
6. Invoke on the same screen again and tap **Remember**. *(P50)*
7. If you can, invoke on a screen with a **password field** (a login page in an allowed app) and
   read the preview. *(P51)*
8. **Export and share journal.**

Choose a screen you are content for me to read the *counts* of; the export carries **no text**,
and the sealed text never leaves the phone.

#### Part 2 on the device — first results (export `orb-20261001-111601.txt`, 105 events, `verifyLane`-clean)

v13 is installed (event 96, `versionCode: 29847188`). Four `orb.assist.captured` events: three
WhatsApp screens and one Chrome page (21 text elements, a page address supplied).

| | Result | Evidence |
| --- | --- | --- |
| **P47** | **Held** | every capture event holds exactly `attachment`, `attachmentBytes`, `because`, `package`, `resolveOutcome`, `textChars`, `textNodes`, `versionCode`, `webUri` — numbers, an allowed app, a yes/no and the sealed identity; no field able to carry text |
| **P48** | **Held** | the first capture (event 99) was erased (event 100) and the store's counts moved **`attachmentsDestroyed` 2 → 4, `attachmentKeysHeld` 5 → 7** across the session: the erased capture's key is gone |
| **P49, P50** | **Not tested** | see below |
| **P46, P51** | **Not confirmed in the export** | the preview and the password screen leave no record by design |

**Why the screen was kept again after the erasures — and why that is correct.** The operator
erased two items: **the capture (event 99) and an older shared photograph (event 82)** — two
different things, not two copies of the same capture. The next *Remember* on the same WhatsApp
screen (event 102) kept a **new** Attachment: **836 characters in 34 elements, against 917 in 36**
for the erased one. The chat had changed between the taps — a new message, a time, a *last seen*
line — so the text was **different text**, hence different content, hence a different identity.
It is not about a screenshot: Orb **keeps text and never a picture**, and the screenshot is only
the protection check. The erased-content rule (`Attachment.md` inv. 8) refuses **identical** text
and nothing near it, and a live chat almost never repeats identically.

**What that means for P49 and P50.** Both need the *exact same text* twice, which a live chat does
not give. They can be tested on a **static screen** — a Settings page that does not change. The
same property is worth stating plainly: the rule protects against re-keeping *identical* content,
not *similar* content; a near-identical screen after an erasure is a new capture.

#### Part 2 closed — P47–P50 held on the device (export `orb-20261001-112147.txt`, 113 events, `verifyLane`-clean)

A static screen (a Settings page), allowed from the card, kept twice and erased twice:

| | Result | Evidence |
| --- | --- | --- |
| **P49** | **Held** | events 108, 109: the same attachment identity, `resolveOutcome` **`stored`** then **`held`** — 18 text elements, 252 characters both times; one Attachment, two citations |
| **P48** | **Held** | events 110, 111 declare both citations erased (each names the capture it erases); `attachmentsDestroyed` **4 → 5** and `attachmentKeysHeld` back to 7 — one key made, one key destroyed |
| **P50** | **Held** | event 112: `orb.assist.captureFailed`, `outcome: erased`, **no app named**, and **no new `orb.assist.captured`** — the identical text was refused |
| **P47** | **Held** | the same clear-record shape as before (§ above) |

**Not confirmed by an export, by design:** P46 (the preview and *Don't keep* leave no record) and
P51 (a password field's text never reaching the preview) — the second has not been exercised on a
login screen. Both are visible only on the phone.

Part 2 is closed for what the export can show. Step 7 is built end to end: **invoke → card → preview →
Remember**, text only, sealed, erasable, refused when erased, and nothing kept from a payments app, a
protected screen or an app that was not allowed.

#### The password test, and what it found (export `orb-20261001-115501.txt`, 121 events, `verifyLane`-clean)

The operator ran the Wi-Fi *Add network* screen (three captures of the same page: 10 text elements, 93
characters each time — `stored`, then `held` twice) and a GitHub login page in Chrome (one capture, 36
elements, 812 characters, a page address supplied). **The preview that decides P51 was not captured**, and
**the export cannot decide it**: it holds counts, and nothing in a count says whether a password field's
contents were among the characters. So P51 is still **open**.

**What this exposed in the design.** The rule skipped a password field *by Android input type only*. A
web page in Chrome may not carry an Android input type at all — its fields describe themselves through
**autofill hints** (`current-password`, `new-password`) and an **HTML `type="password"`** attribute — so
for Chrome the first rule might never have fired. That is a gap in the design, found by asking for
evidence the export could not give, not by a failure.

**v14 (`orb-app-v14-passwords.apk`) closes the gap in the open:**

- a field is a password if its **input type**, its **autofill hints** (anything containing *password*) or
  its **HTML `type`** says so — any one is enough; reading only how a field *describes* itself, never what
  is in it (10 new off-device checks);
- every skipped field is **counted**: `orb.assist.captured` now carries `passwordFields`, and the card says
  *"(1 password field left out)"* — so a login page's login-ness is visible **in the export** without its
  contents, and the person sees it before tapping;
- the importer maps the new field (the drift guard forces the decision), and 166 phone-side / 366
  TypeScript tests pass.

**How the next export settles it:** a login page that was captured should show `passwordFields ≥ 1`. If
it shows 0 on a page with a typed password, the field is not describing itself as a password to any of
the three rules, and the fix is a stronger one (below).

**One decision for the operator, not taken here:** should Orb **decline a screen that has a password field
at all** (a new reason, *login screen*)? Skipping the field keeps the password out but still keeps the
username and the rest of a login page. Declining is simpler and safer; it also means a login page can never
be remembered. Recommended, because a login page is rarely something worth remembering and always something
worth not leaking — but it changes the decision order of `SENSOR_ASSIST.md` §5, so it waits for a yes.

#### The password test, decided — what the preview showed (export `orb-20261001-120416.txt`) and v15

The operator's screenshot of the preview on `github.com/login` with a made-up password typed:

- **The password's real characters did not appear.** v14's wider rule found *one* password field and the
  card said **"(1 password field left out)"** — the rule fires on a Chrome page, which v13 may not have
  done.
- **But a second node did appear: `••••••••`.** The page delivered the field as a node Orb recognised
  *and* a second whose text was the masked display. A row of dots is **the password's length and the fact
  that there is one**, and it would have been sealed with the rest. So **P51 half held**: no password
  text; a masked remnant of it.

**v15 (`orb-app-v15-login.apk`) closes it two ways:**

1. a run of mask characters (bullets, asterisks, discs — three or more, spaces ignored) is treated as a
   password field **whatever node it arrives on**; a single bullet (a chat-list separator) stays text;
2. **the operator's ruling (DR-14 ruling 10): a screen with a password field keeps nothing at all** — the
   new reason `loginScreen`, decided right after *the app is allowed* and **without waiting for the
   screenshot**, the buffer emptied at once. A login page cannot be remembered, so there is no username to
   keep beside a password that is not.

177 phone-side checks (was 166): the decision order with a login screen, the mask rule over bullets,
asterisks, discs and spaced groups, and the cases it must **not** catch (one bullet, two, bullets among
words, an asterisk note).

**What to erase:** the login-page captures made before v15 may hold usernames, and the earlier Chrome one
(the 11:30 login page) may hold more. They are listed in *Kept by Orb* as *remembered*.

#### v15 on the device — the password question closed (export `orb-20261001-130700.txt`, 142 events, `verifyLane`-clean)

v15 is installed (event 135, `versionCode: 29847275`). On `github.com/login` with a made-up password typed, the
card read *"This looks like a login screen, so Orb kept nothing from it."* with no *Remember* button.

| Evidence | What it shows |
| --- | --- |
| Events 138, 139, 141 | three `orb.assist.declined`, `reason: loginScreen`, each with only a reason and a build — **login screens are refused, three times, with no app named** |
| Event 140 | an ordinary WhatsApp chat **still captured**: 39 elements, 556 characters, **`passwordFields: 0`** — the new rule did not over-reach |
| Events 125–133 | nine captures erased — **every login-page capture made before v15** (114, 115, 117–120) and three earlier ones |
| `attachmentsDestroyed` **5 → 11** | six distinct contents among those nine (117–119 are one; 103 and 115 are one): six keys destroyed, the arithmetic matches exactly. `attachmentKeysHeld` 4 afterwards, 5 after the new capture |

**P51 is closed**: a password field's contents never reached the sealed text (v14 recognised the field and
the preview showed no letters); the masked-dots remnant that did appear is fixed (v15's mask rule); and a
login screen is now refused outright. The earlier captures that might have held a username are destroyed.

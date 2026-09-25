# The Device Loop — strengthen, validate, rule

> Status: **standing process.** Adopted 2026-09-25.
> How Orb's device work proceeds: build the smallest thing, test it against a
> real phone, and turn what the phone says into recorded rulings.
> Governs the validation of `MOBILE_SENSING.md` and `SOVEREIGN_STACK.md`.

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
hours per 24, and cannot be restarted from the background.**
*If false:* §2 G4 is wrong for this device and the host design simplifies
considerably.
*If true:* the host cannot be one perpetual service, and §2's conclusion stands.

**P2 — Nothing resumes after a reboot until the user opens the app.**
*If true:* "continuous observation" has a hard floor, and the human is part of
the runtime whether the architecture says so or not. That belongs in
`RUNTIME_LOOP.md`, not in a footnote.

**P3 — A `location`- or `health`-typed foreground service runs past six hours.**
*If false:* there is no long-running option at all on this device, and the host
must be `WorkManager`-only with much coarser cadence.

**P4 — When the system kills or defers us, we can record that it happened, when,
and why.**
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

**P5 — `AdvancedProtectionManager.isAdvancedProtectionEnabled` is readable on
Android 16 with `QUERY_ADVANCED_PROTECTION_MODE`.** Settles the hedge in §4.4.

**P7 — Restricted Settings blocks the notification listener for a sideloaded app
until cleared by hand.** Decides whether the only bridge to the OS safety
features (§5) costs one deliberate user action or is unavailable.

**P8 — Key attestation verifies offline.** `getCertificateChain()` yields a chain
carrying `RootOfTrust` with `deviceLocked` and `verifiedBootState`, verifiable
against a pinned root with no network call. This is the substitute for Play
Integrity in `MOBILE_SENSING.md` §9.2; if it does not work here, that row is
wrong.

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

**R3 — Validating on one device proves one device.** A Pixel 10a on Android 16 is
not Android. Findings are recorded against *this* device and version, and never
generalised into "Android does X" without a second device saying so. The same
discipline as `MOBILE_SENSING.md`'s standing rule: a demonstration on a stated
date against a stated version is never a rate.

**R4 — The loop can become the product.** Three passes of instrumentation and no
observation of the user's actual life would be a failure even if every
prediction were answered. Pass 2 should end with at least one signal that is
useful to a person rather than to this document.

---

## 8. Exit criteria for pass 1

1. ~~P0 answered, either way, before Kotlin is written.~~ **Done 2026-09-25:
   held.** P0a and P0b raised in its place and carried into pass 1.
2. P1, P2, P3, P4, P6 each answered `held` or `refuted`, with evidence from the
   device.
3. `MOBILE_SENSING.md` corrected wherever the device disagreed with it.
4. A week of real carrying replayed, with every gap explained by a recorded
   deferral — or P4 refuted, which is the more valuable outcome, because it would
   be found now rather than after a year of trusted history turned out to have
   holes in it.

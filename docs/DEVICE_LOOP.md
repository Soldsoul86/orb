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
   device.
3. `MOBILE_SENSING.md` corrected wherever the device disagreed with it.
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

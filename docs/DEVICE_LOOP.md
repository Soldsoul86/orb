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

**P0 — A self-signed APK installs on this device today.**
*Source:* `MOBILE_SENSING.md` §3 — devices shipping with Android 16 QPR2 or later
preload a verifier that blocks unverified-developer installs. This device is on
Android 16, and whether the verifier is present or arrives in a later update is
unknown from here.
*Test:* install a do-nothing APK. Twenty minutes, before any Kotlin is written.
*If false:* everything stops until a registered signing identity exists. **Test
this first** — every other prediction is downstream of it, and there may be a
closing window rather than an open door.

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

1. P0 answered, either way, before Kotlin is written.
2. P1, P2, P3, P4, P6 each answered `held` or `refuted`, with evidence from the
   device.
3. `MOBILE_SENSING.md` corrected wherever the device disagreed with it.
4. A week of real carrying replayed, with every gap explained by a recorded
   deferral — or P4 refuted, which is the more valuable outcome, because it would
   be found now rather than after a year of trusted history turned out to have
   holes in it.

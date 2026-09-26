# Where Orb Is

**Standing overview plus a snapshot as of 2026-09-26**, written so that picking
this up does not require the conversation that produced it.

> **This document is not a source of truth.** Every claim here is decided
> somewhere else and cited; where this disagrees with the document it cites, the
> other one wins and this one is stale. Art. IX §33 forbids two sources for one
> fact, and a summary that started arbitrating would become the second.
>
> **§1 is the standing overview** — what Orb is, and what exists as code.
> **§§2–6 are the dated snapshot** — what was decided, measured, and neither, on
> the date above.
>
> It exists because a session was switched by accident today and the handoff that
> followed had to be audited rather than trusted. The audit found three
> structural errors in a written recap — wrong package names, a claimed test that
> had never run, and a proposed envelope that would have undone two rulings. This
> file is the fix: one place that says what is decided, what is measured, and
> what is neither.

---

## 1. What Orb is

**A personal runtime that continuously learns, reasons and acts alongside its
user.** Long-lived — years rather than conversations. Its intelligence comes from
*continuity* rather than from any single model; its foundation is evidence; its
architecture is local-first, model-independent, and built to evolve for decades.

`MASTER.md` sets seven principles — **local first, device native, event first,
evidence first, model independent, continuous understanding, human agency** —
and `CONSTITUTION.md` turns them into twelve articles: History, Truth and
Interpretation, Models and Reasoning, Distribution, The Runtime, The Three
Planes, Capabilities and Human Agency, Ownership and Trust, Engineering, The
Kernel, Reality and Confidence, Identity and Continuity.

One pipeline:

```
Sensors → Event Journal → Evidence Graph → Knowledge Engine → Digital Twin
   → Reasoning Pipeline → Agent Runtime → Capabilities → Actions → Reflection
```

`contracts/` holds 23 kernel contracts, **9 Accepted** — Event, Observation,
Evidence, Fact, Belief, Entity, Prediction, Sensor, Attachment — and 14 Draft.
`docs/` is roughly 9,400 lines across 24 documents. By its own `ROADMAP.md`, Orb
is in **Phase 3, the Kernel and Contracts**, with two amendments running beside
it.

### What exists as code

Roughly 24,000 lines of TypeScript and 3,000 of Java. **627 tests, 0 failing**;
lint clean; every package compiles independently.

**The kernel.**

| | | |
| --- | --- | --- |
| `runtime/journal` | ~8,900 | the Event Journal: hash chains, HLC ordering, envelopes v1/v2, erasure, partial replication, sync, Attachments |
| `runtime/observation` | ~400 | occurrence, not truth — inv. 3, 5 and 7 enforced at the boundary |
| `packages/connector` | ~550 | connector Sensors: the call, the synthesis, the outcome ladder |
| `packages/device-watch` | ~450 | the first closed loop: projection, one rule, an alert, an answer |

**Amendment one — the Hyperliquid trade executor.** *Entry may come from the
signal provider; exit authority belongs to the executor.* Signal-agnostic: once a
position is open it never depends on the signal source to tell it when to leave.
This is the first real Capability — something Orb *does*, under a policy, with
every decision journaled.

| | | |
| --- | --- | --- |
| `packages/trade-executor` | ~7,700 | the execution engine |
| `packages/hyperliquid` | ~2,850 | signing, REST, WebSocket |
| `apps/executor` | ~2,950 | runtime host, production safety interlock, authenticated signal API |
| `tests/` | ~1,100 | acceptance scenarios |

**Amendment two — the device loop.** No Gradle and no libraries anywhere in it:
an instrument that pulled in a framework could not say whether a death was the
platform's or the framework's.

| | | |
| --- | --- | --- |
| `apps/pixel/pass1` | ~1,650 | foreground-service and journal survival; the 21-hour run |
| `apps/pixel/pass2` | ~730 | the grants signal; recording since 2026-09-26 |
| `apps/pixel/probe-grants` | ~640 | the throwaway that answered P12–P14 |

### What is not built at all

**The whole middle of the pipeline.** Evidence Graph, Knowledge Engine, Digital
Twin, Reasoning Pipeline, Agent Runtime — contracts written, no code. That order
is the architecture's own and not an accident: everything above depends on a
journal that cannot lie about what it knows, so the journal is finished first and
the reasoning layers stay paper until it is.

---

## 2. The logic

One distinction decided most of the design, and it keeps arriving under new
names: **cannot check is not failed the check.** Every time it was collapsed,
something reported a fact nobody had observed.

| where | the two that must not merge |
| --- | --- |
| a setting read | `absent` (returned nothing) vs `empty` (returned none) |
| a call outcome | `threw` (the attempt failed) vs `denied` (the other side refused) |
| lineage | `ungrounded` (built on nothing) vs `unresolved` (not visible from here) vs **grounded, ground detached** |
| a payload gone | `unfetched` vs `pruned` vs `erased` |
| a prune | `prunedBecause` absent means nobody recorded why — never `space` |
| a policy | `none` (never recorded) vs `unreadable` (recorded, payload gone) |
| a count | omitted where it is not a fact, never `0` |

The operational corollary, paid for across five runs of a throwaway probe:
**ask the device before asking the person, and where the device can answer, do
not ask the person at all.** Four consecutive verdicts in that probe came from
the instrument rather than the platform — a claim with no corroborant was
believed, a label invited a wrong claim, a readout was allowed to be older than
the device it described, and a verdict rested on a checkbox the device could have
answered itself. A human claim is a legitimate input only where nothing on the
device speaks to the same fact.

### The journal

`contracts/Event.md`, `docs/EVENT_MODEL.md`, `runtime/journal/`.

An Event is an **envelope plus a payload**. Every device holds every envelope;
payloads are optional and their absence always carries a reason. Hash-chained per
lane; ordered by `(hlc, lane)`; wall clock is human-facing and never an ordering.

**Envelope v2** (`ERASURE.md` §2b, operator ruling): coarse type `orb.content`
outside, the real type inside the payload, a per-event nonce, and `causes` moved
into the payload — so an envelope alone cannot state lineage, and `undefined`
there means *cannot say* rather than *built on nothing*. Bookkeeping types stay
legible because machinery outside the device reads them and can never decrypt.

Encoding is canonical JSON, **safe integers only**. That came from a measured
divergence: Java's `Double.toString` and JavaScript's `JSON.stringify` disagree on
three of six test values. Agreement *by construction* beat reimplementing
ECMAScript number formatting. The rule then found a real bug — risk measurements
carrying binary floats in the same struct as string prices.

Two encoders, TypeScript and Java, pinned against one vector file
(`apps/pixel/pass1/tests/vectors.json`). The v1 hash `dce6c5bb…` has never moved;
v2 was added beside it rather than over it.

### Erasure

`docs/ERASURE.md`, `contracts/Attachment.md`.

**E1**: the payload goes, the envelope stays. **E2 and E3**: never possible — no
one decodes what happened, the owner included.

The cost, accepted with the deciding reason given by the operator: an erased
event becomes **completely uninterpretable**, because its type went into the
payload and died with it. *"Else someone will just try to erase and get the
summary"* — a record of what was erased is an oracle, and it turns coercion into
*compel an erasure, then read what it removed*.

Attachments keep the content hash as identity and **blind the address** (inv. 7);
a per-Attachment key **dies with the last reference** (inv. 8), which makes
erasure arithmetic rather than a promise, including on a relay still holding the
bytes.

### Partial replication

`docs/PARTIAL_REPLICATION.md` §9. Seven invariants; the load-bearing ones here
are **known absence** (3), **proof before pruning** (4: K ≥ 2 other holders, one
of them owned), **journaled policy** (6) and **no retention authority** (7).

§11's two shortfalls are now closed: retention policy and sync payload policy are
both read back from history, and `horizon()` carries the policy that bounded it.

---

## 3. The policies

`docs/DECISIONS.md` holds these in full, with consequences. The companion is
`docs/ARCHITECTURAL_DEBT.md`, which holds what has deliberately **not** been
decided; nothing belongs in both.

| | decision | the consequence that matters |
| --- | --- | --- |
| **DR-1** | Orb is a **gateway, not a guard** | A6 stays not-refusable and stops being an embarrassment; the mediated set is exactly what the user starts in Orb |
| **DR-2** | the **accessibility approach is discarded** | an app that can read every screen cannot credibly report that capability as a risk while holding it |
| **DR-3** | **no feed re-ranking** | forced rather than chosen, which makes connector coverage the product risk |
| **DR-4** | confirm in Orb, **hand off prefilled**; email end to end | a hand-off and a send are **different evidence**, and the journal must not record the first as the second |
| **DR-5** | the **intent chain**, cancels included | a gate recording only what passed cannot show what it stopped; `intent_id` is `causes`, not a new field |
| **DR-6** | the pass-3 schema is a **payload** schema | `source`/`kind` in the envelope reopens the leak §2b closed; a timezone offset puts a location trail where witnesses replicate |
| **DR-7** | connectors: journal the call, keep the raw **seven days** | needed no new machinery, which is the test it passed |

### What is enforced in code, not only written

- **A device prunes under a policy from history or not at all.**
  `evaluatePruneFromHistory` fails closed on both unknowns, because a permissive
  default would drop payloads on the strength of a *missing* record.
- **A prune says what wanted the payload gone.** `prunedBecause` is required, so
  a retention window that expired is distinguishable from a device that ran short
  of room — opposite facts that `absence: "pruned"` alone reports identically.
- **A horizon says what bounded it.** `syncPolicyInForce` on `horizon()`.
- **Only a device's own records govern it** (inv. 7), and the newest record
  governs whether or not it is readable — an earlier readable one is a rule the
  device has already replaced.

---

## 4. The hardware

**Pixel 10a (`stallion`), Android 16 / API 36, security patch 2026-04-05, build
`CP1A.260405.005`.** `DEVICE_LOOP.md` §7 R3 stands over all of it: a finding is
recorded against *this* device at *this* build, never generalised.

### Pass 1 — 2303 events over 21.1 hours

Every hash re-derives. HLC monotonic across three reboots. **P4 holds with zero
unexplained gaps** — the beat counter never skips. `specialUse` ran **13.5 hours
continuous** after a reboot while `dataSync` never came back. 950 signals,
including 223 unlocks. The fixed-rate drift fix verified at a **median 60 ms**,
with no accumulation.

One §5d linkage break, explained and recorded rather than smoothed over.

### P12, P13, P14 — all confirmed, zero permissions

`apps/pixel/probe-grants`, five runs. A control held throughout: a direct read of
`/data/system/users/0/settings_secure.xml` failed with `EACCES`, so the successful
reads went through the framework rather than around a sandbox that was not there.

Two findings became code:

- **`getActiveAdmins()` returns `null` for none on this platform** — four
  readings with nothing active all returned `null`; the one with Find Hub's admin
  on returned a list. So `null` cannot be passed through as *unknown* (device
  admin would be unreadable on every ordinary phone for ever) nor read as *none*
  (a real stalkerware admin would be recorded as an empty set). `isAdminActive`
  per installed receiver settles it, and that branch is where the signal is
  either honest or blind.
- **A revocation was observed end to end**: five listeners, Pixel Stand switched
  off, four — with `dreamliner` the only name missing. `MOBILE_SENSING.md` §4.4's
  note that a revocation is itself evidence now has a measurement behind it.

Also measured: Play Protect reported *"This app looks safe"* about a self-signed
sideload it had never seen.

---

## 5. The capability

**What Orb can see holding nothing:** which accessibility services are enabled,
which apps hold notification access, which device admins are active, and every
change to those. Names only, never content.

That is `MOBILE_SENSING.md` §4.4's *"classic stalkerware install: cheap,
high-value, low-noise"* made detectable at no permission cost. The baseline on an
untouched phone is five notification listeners, all Google — which is what makes
a sixth worth an event.

What runs it is in §1. The three Android packages are there too.

---

## 6. What is not proven

The section that matters most, and the one a summary is most tempted to shorten.

| | |
| --- | --- |
| **P6 and P16** | pass 2 was installed 2026-09-26 and has not yet been read back. Until then it is not known whether a broadcast reaches it with no service running, or how coarse the detection is |
| ~~**Attachment**~~ | **implemented 2026-09-26** — identity, blinded address, per-Attachment keys, the destruction guard. 20 tests, five controls |
| ~~**Observation**~~ | **implemented 2026-09-26** — `runtime/observation`, with inv. 3, 5 and 7 enforced at the boundary. DR-7 tier 2 is wired into the connector |
| `Capability.md`, `Action.md`, `Policy.md` | Draft. DR-5's chain and DR-7's seven-day value belong in them |
| `CLAIMS.md` §5 Ruling 2 | the general timing of consent, unresolved |
| `AIRWALL.md` | an unapproved proposal |
| AD-6 | independence, open in the debt register |
| the pass-1 self-test fix | built, never installed; the running build reports `chain.linksEndToEnd` FAILED for ever |
| the device's security patch | roughly six months old |

**DR-7 is complete.** Tier 3's ambiguity was ruled on 2026-09-26: the key is
destroyed at expiry, and the **newest** referencing event decides, so one recent
citation holds the whole Attachment however old the others are. `Attachment.md`
inv. 8 now names that second ground. A window must be asked for by name, and a
recent unreadable event still blocks it.

**The first loop exists** — DR-8, `packages/device-watch`: journal, Observation,
projection, one rule, an alert, an answer, and the answer back in the journal
where the next projection reads it. It records rather than learns, and a test
asserts that by running the loop twice with each answer and comparing.

**What remains is the device and the pipe.** Pass 2 has been recording since this
morning and P6 and P16 are unread. Nothing yet carries pass 2's lane from the
phone into this runtime, so the loop runs on constructed readings. The connector
has no real driver. And `Capability.md`, `Action.md` and `Policy.md` are still
Draft, which is where DR-5's intent chain and DR-7's seven days belong.

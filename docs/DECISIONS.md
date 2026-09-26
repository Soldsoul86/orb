# Decision Register

> Architectural decisions that have been **made**, with what follows from each.
>
> The companion to `ARCHITECTURAL_DEBT.md`, which records what we have chosen
> *not* to decide yet. Nothing belongs in both: an item leaves that register by
> arriving here.
>
> Each record states who decided, what was decided, why, **what follows whether
> we like it or not**, what it explicitly does *not* change, and what is still
> open. The consequences are the point — a decision recorded without them is a
> preference, and preferences do not survive a handoff.
>
> Decisions are the operator's. This file records them; it does not make them
> (`CLAUDE.md`: *the architecture is permanent, the implementation is
> replaceable*).

---

## DR-1 — Orb is a gateway, not a guard

- **Status:** Decided · **Decided:** 2026-09-26, operator · **Supersedes:** nothing recorded
- **Bears on:** `CLAIMS.md` R4, `CAPABILITY_MODEL.md`, `Policy.md` (Draft)

**Decision.** Orb does not interpose on other applications' actions. An
irreversible action is **started inside Orb** and passes through *review →
confirm → release*. Named at the time of the decision: large payments, and
sending email, WhatsApp or Snap messages.

**Why.** `CLAIMS.md` R4 already splits the honest claim in two:

> Within the mediated set, the gate cannot be routed around.
> Outside it, the action is *detected and recorded*, never silently absent.

A guard implies cover over the outside. A gateway does not pretend to it. This
decision makes the architecture match the claim that was already written down,
rather than the other way round.

**What follows.**

- **A6 stays not-refusable.** `CLAIMS.md` is explicit that *"A6 is not refusable
  and must not be claimed as such"*. A gateway posture is the version of Orb in
  which that sentence is not an embarrassment: nothing about the design suggests
  A6 should have been caught.
- **The mediated set becomes small and legible** — it is exactly what the user
  starts in Orb. That is a far more defensible boundary than "everything the
  phone does", and it is checkable: for any action, either it began in Orb or it
  did not.
- **The gate's value now rests on Orb being worth opening first.** If nothing is
  started in Orb, nothing is mediated. See DR-3, which is the same problem from
  the other side.

**What this does not change.** Detection. Pass 2's grant signal watches what
*other* apps gain, which is independent of whether Orb mediates their actions —
and `CLAIMS.md` R4's second clause (*detected and recorded, never silently
absent*) is precisely that half of the claim, which survives intact.

**Open.** What counts as "large" for a payment, and where that threshold is
recorded. `Policy.md` is still Draft and `CLAIMS.md` §5 Ruling 2 — the general
timing of consent — is unresolved.

---

## DR-2 — The accessibility-service approach is discarded

- **Status:** Decided · **Decided:** 2026-09-26, operator
- **Bears on:** `DEVICE_LOOP.md` §7, `MOBILE_SENSING.md` §4.4, `apps/pixel/pass2`

**Decision.** Orb will not request an `AccessibilityService`. The "pay guard"
approach — reading other apps' payment screens in order to interpose — is not
the path. (The operator's own `app.orb/app.actionlock.guard.PayGuardService`,
which appears throughout this session's device findings, was an experiment, not
a component.)

**Why.** Three reasons, and each would be sufficient.

1. It is the guard posture DR-1 rejects.
2. **It was measured to be unreliable.** On 2026-09-26 a third-party payment app
   detected the enabled service and refused to run — within hours. A capability
   that announces itself to everything it touches, and that any counterparty may
   decline, is not a foundation.
3. **It would make Orb indistinguishable from what it warns about.** An app
   holding accessibility can read every screen on the device. That is exactly
   the power P12's signal exists to flag when *something else* acquires it, and
   §4.4 rates it *"the classic stalkerware install"*. Orb cannot credibly report
   that capability as a risk while holding it.

**What follows.**

- **Orb will not appear in its own P12 list**, which keeps that signal clean:
  every entry in it is something other than Orb.
- **The finding that motivated pass 2 stands.** It was `CLAIMS.md` C1 route A6
  arriving as an event rather than a hypothesis: a payment app noticed an
  accessibility service that Orb's own journal knew nothing about. Dropping the
  approach does not retract the gap — the signal is about *other* apps gaining
  power, so it survives its own origin story being abandoned.
- `DEVICE_LOOP.md` §7 and `apps/pixel/pass2/README.md` still tell that story as
  motivation. They now carry a pointer here so the approach is not read as
  current.

**What this does not change.** The three reads pass 2 performs
(`DEVICE_LOOP.md` §7, P12–P14, all confirmed on the device 2026-09-26) cost no
permission at all. None of them is an accessibility service; none is affected.

**Open.** Nothing. This one is closed.

---

## DR-3 — Orb does not re-rank other apps' feeds

- **Status:** Decided · **Decided:** 2026-09-26, operator
- **Bears on:** DR-1, DR-4, the choice of first workflow

**Decision.** Orb cannot and will not reorder the Facebook, Instagram or Snap
feeds. It competes for the **first thing you open**, with a daily overview built
from sources the user controls.

**Why.** There is no API for it, and obtaining one by other means requires the
interception DR-2 rejects. The decision is therefore forced rather than chosen —
which is worth recording, because a forced constraint that is not written down
gets re-proposed every few months.

**What follows.**

- **Connector coverage becomes the product risk, not ranking quality.** An
  overview is only as good as what it can see, so the binding question is which
  sources are connected — not how cleverly the contents are ordered.
- **DR-1 depends on this working.** A gateway mediates only what is started
  inside it, so "Orb is the thing you open first" is not a growth goal; it is
  the precondition for the gate having anything to gate.

**Open.** Which sources, and which workflow comes first. The security-baseline
alert (pass 2's grant signal) needs no permissions and no connectors, which makes
it the cheapest candidate rather than necessarily the right one.

---

## DR-4 — Confirm in Orb, hand off prefilled; email end to end

- **Status:** Decided · **Decided:** 2026-09-26, operator
- **Bears on:** `contracts/Action.md` (Draft), `Observation.md`, Art. XI §42

**Decision.** There is no public send API for a personal WhatsApp or Snap
account. Orb confirms the message, then hands it to the app **with the text
prefilled**. Email is different: the Gmail API allows Orb to own the action end
to end.

**What follows — and this is the part that must not be blurred.**

**The two halves produce different evidence, and the journal has to say which
it has.**

- For **email**, Orb performs the send. It can record that the message *was
  sent*, because it sent it.
- For **WhatsApp and Snap**, Orb performs a **hand-off**. What happens next is
  outside it: the user may edit the text, send it to someone else, or discard it,
  and **Orb never learns which**. The most Orb can truthfully record is that it
  handed over a prefilled message.

So a hand-off must never be journaled as a send. This is Art. XI §42 — the
runtime never assumes reality matched an expectation — and it is the same
distinction this project keeps arriving at from new directions: *cannot check* is
not *failed the check*, and *I handed it over* is not *it was delivered*. A
journal that recorded both as `sent` would be asserting, for one of them, a fact
nobody observed.

Consequently the two need different terminal states in DR-5's chain: `released`
for the action Orb performed, and a hand-off state that is explicitly **not** an
outcome for the one it did not.

**Open.** Whether a hand-off can ever acquire a follow-up observation — a
later, independent sighting that the message existed — and if so, at what
confidence. Until then the chain ends without a result, and the absence is the
honest record rather than a gap.

---

## DR-5 — The gateway action chain

- **Status:** Decided · **Decided:** 2026-09-26, operator
- **Bears on:** `contracts/Capability.md` and `contracts/Action.md` (both Draft),
  `contracts/Event.md`, `CLAIMS.md` pass bar

**Decision.** One chain per intent:

```
intent → review → confirm | cancel → release → result
```

recorded whole, **including cancels and the time spent hesitating**.

**Why the cancels.** A gate that records only what passed cannot demonstrate
what it stopped. `CLAIMS.md` sets the pass bar as *"A1–A5 refused, each refusal
journaled with the reason"* — the refusals **are** the evidence the gate works.
An action chain that dropped them would leave the gate's whole value unevidenced.

**What follows.**

- **`intent_id` is a causal chain, which the Event envelope already has.** It is
  `causes` (`contracts/Event.md`), not a new top-level field. Adding a parallel
  identifier would be a second way to express one relationship, and the lineage
  work of 2026-09-26 exists precisely so that `causes` is the one way.
- **Hesitation time is content about the user, not bookkeeping.** It is
  behavioural data of a fairly intimate kind — how long someone paused before
  sending money — so it is subject to `ERASURE.md` like any other payload, and
  it must not be recorded in a bookkeeping event that erasure does not reach.
- **DR-4 splits the terminal state.** `release` and `result` mean what they say
  for email; a hand-off ends the chain without a result and says so.

**Open.** `Capability.md` and `Action.md` are Draft and this belongs in them.
`CLAIMS.md` §5 Ruling 2 — the general timing of consent — bears directly on what
`review` must guarantee, and is unresolved.

---

## DR-6 — The pass-3 journal schema is a payload schema; the envelope does not change

- **Status:** **Proposed** — this one is reasoned here, not relayed from the
  operator, and needs ratifying · **Raised:** 2026-09-26
- **Bears on:** `contracts/Event.md`, `docs/ERASURE.md` §2b, `runtime/journal/`,
  `apps/pixel/pass1/tests/vectors.json`

**The question.** A handoff summary proposed a journal entry format — `id`,
`ts`, `seq`, `prev_hash`, `source`, `kind`, `device`, `read.outcome`,
`read.evidence`, entities, `data`, `content_ref`, `retention` — described as
*"one common format, whatever its source"*. Is that a **payload schema** for
pass-3 sources, or a **replacement Event**?

**Resolution: a payload schema. Nothing in it needs an envelope change**, and
three of its fields would undo rulings already made.

### Where each field already lives

| proposed | resolution |
| --- | --- |
| `id` | `id` |
| `ts` | `wallClock` — human-facing only, never ordering. *The timezone offset is new: payload.* |
| `seq` | `hlc` = `{physical, counter}`; order is `(hlc, lane)` |
| `prev_hash` | `integrity.previous` |
| `device` | `device` (build, patch and `boot_id` are payload, as pass 1 already records them) |
| `data` | that **is** `payload` |
| `read.outcome`, `read.evidence` | payload |
| entities (raw id → stable id → name) | payload; overlaps `EVIDENCE_GRAPH.md` |
| `content_ref` | payload — an Attachment reference. `contracts/Attachment.md` already gives content addressing, inv. 7's blinded address and inv. 8's per-reference key |
| snapshot + diff as separate entries | a type-and-payload pattern; `apps/pixel/pass2` already does it |
| `intent_id` | `causes` — see DR-5 |
| `source`, `kind` | **would undo the coarse-type ruling** — below |
| `retention` | **exists, and not as a field on an event** — below |

### The three that would undo a ruling

**1. `source` and `kind` in the envelope reopen the leak §2b closed.** The
operator's own ruling was *"coarse type in the envelope, real type inside the
payload."* `source: gmail | notif | calendar | usage` is a fine type under
another name. `vocabulary.ts` states why a richer split was refused, and the
argument applies unchanged: *"Every label is permanent under the E2/E3 ruling,
so the choice is asymmetric: starting coarse stays reversible… starting fine
cannot be undone."* An envelope carrying `source` tells anyone holding envelopes
— including a witness that never holds a payload and never gets a key — which
sources a life runs on, how often, and in what rhythm. Under E1 the envelope
survives erasure, so that is permanent.

**2. `ts` with a timezone offset puts a location trail in the replicated part.**
Envelopes go to every device and to witnesses; payloads do not. An offset says
roughly where its owner was, and *changes when they travel*. In the payload it
dies with the payload; in the envelope it is forever. There is no ordering need
for it — `wallClock` is already explicitly not an ordering.

**3. `retention` on an event turns a local storage choice into a travelling
claim.** `sync.ts` is explicit: *"retention is a local storage choice, not a
claim about what happened."* `RetentionPolicy` is per-device, listing owned
devices and prune eagerness. A `retention` field on the event would be one
device asserting how long another must keep something — either unenforceable, or
an authority nobody granted.

### The trade this is actually making, stated honestly

The proposal is not arbitrary: a `source`/`kind` envelope field would restore
**selective sync and retention by kind of content**, which is genuinely gone.
`holdTypes` documents the loss and refuses to route around it:

> `holdTypes(["note"])` therefore holds nothing. That is not a bug to route
> around, and routing around it is what would be the bug: any envelope field
> fine enough to make this work is a field that survives erasure and is readable
> by whoever holds the envelope, which is the leak §2b closed.

So the cost is real and it is being paid deliberately. What remains is `holdSince`
plus lane, device and content-versus-bookkeeping — enough for *keep the last
month*, *keep my own lane*, *keep nothing*, which were the motivating cases. The
convenience given up is recoverable later; the privacy spent would not be.

### The mechanical cost, separately

Renaming `integrity.previous` → `prev_hash`, or splitting `hlc` into `ts` + `seq`,
changes the **hash preimage**. `apps/pixel/pass1/tests/vectors.json` exists so the
TypeScript and Java encoders cannot diverge (`DEVICE_LOOP.md` §7 R2); the v1
vector hash `dce6c5bb…` is pinned, and the 2026-09-26 v2 work added to it without
breaking it. A rename is therefore not a rename — it is a third event format, and
every event already written becomes unverifiable. That is a reason to be sure, not
by itself a reason to refuse.

### One correction the schema needs before it is written down

`read.outcome: value | empty | threw | denied` **drops the distinction that five
probe runs were spent on**. The implemented shape is `value | absent | threw`,
where `absent` (the call returned nothing) is **not** `empty` (the call returned
an empty set). The summary's own note — *"empty must never be treated as all
clear"* — is the right instinct with no slot to put it in.

On this device that is not hypothetical: `getActiveAdmins()` returns `null` for
*none*, and the whole `isAdminActive` corroboration in
`apps/pixel/pass2/src/GrantReader.java.in` exists to tell *none* from *withheld*.
`denied` is a worthwhile addition — a refusal is a different fact from a throw —
but it is a fourth outcome, not a replacement for `absent`.

**Proposed outcome:** `value | empty | absent | threw | denied`, with `absent` and
`empty` never merged by any reader.

---

## DR-7 — Connector Sensors: journal the call, keep the raw for seven days

- **Status:** Decided · **Decided:** 2026-09-26, operator · **Extends:** DR-6
- **Bears on:** `contracts/Sensor.md`, `contracts/Attachment.md`,
  `contracts/Observation.md`, `runtime/journal/src/retention.ts`

**Decision.** A connector — Gmail, Calendar, Drive — is a **Sensor**: the
boundary at which the external world becomes history. Raw fetched content does
not live in the event payload. Instead, three tiers:

1. **The call is always journaled, content or not.** Which connector, the scope
   or query shape, when, how many items came back, and the outcome on DR-6's
   ladder (`value | empty | absent | threw | denied`). No content. An access Orb
   does not record is an access nobody can audit — and the query is itself an
   outbound disclosure, since it tells the provider what was asked.
2. **The synthesis is an Observation, never a Fact.** `confidencePercent`, and
   `causes` pointing at the call event. `Observation.md`: an Observation *owns
   confidence, not truth*.
3. **The raw is kept as an Attachment for seven days, then released.** Frozen and
   content-addressed — never a pointer, because Gmail is mutable and a reference
   into a store that can change underneath is not evidence.

**Why not simply drop the raw.** Because dropping it does not make the system
safer, and the operator's own earlier observation is the reason: *scattered data
is harder to assemble; concentrated data is already assembled*. A synthesis of
six months of mail is more revealing than any message in it. Keeping only the
synthesis discards the diffuse half and retains the dangerous half — and leaves a
conclusion about a person that **nobody, including that person, can check against
its source**. That is not safety; it is unaccountability, and it is the same
distinction as everywhere else in this system: *cannot check* is not *failed the
check*. Seven days buys the ability to check while it matters, and then spends it.

### It needs no new machinery, which is the test it passed

- **The window is `holdSince(7 days)`**, already in `retention.ts`: *hold payloads
  newer than `windowMs`, by the event's own wall clock*.
- **Seven days runs from the fetch, by construction rather than by rule.** The
  Attachment event is created when Orb fetches, so its `wallClock` **is** the
  fetch time. A three-month-old email fetched today is checkable for seven days
  from today, which is the behaviour wanted, and no separate clock states it.
- **The absence reason is `pruned`**, which already exists and already means what
  is meant: dropped by local retention policy, as against `erased` (destroyed by
  its owner) and `unfetched` (never held). No fourth reason.

### What the synthesis becomes on day eight — a correction

It does **not** become `ungrounded`. That was stated loosely when this was
proposed and it is wrong. `ungrounded` in `lineage.ts` means *derived and citing
nothing* — `causes` present and empty. Here the synthesis cites the call event,
which is permanent: its envelope survives everything, under E1.

The accurate state is **grounded, and its ground detached**: the chain resolves
end to end, the Attachment event is still in history, and only its bytes are gone
with `absence: "pruned"` recorded as the reason. So the lineage walk never breaks
and never lies — it says *this rests on something recorded, whose content this
device released on a stated policy*. A reader learns the difference between that
and evidence that never existed, which is the whole point.

**Confidence does not decay when the evidence does.** `confidencePercent` is what
the Observation was worth when it was made, and history is not mutated
(Art. I). What changes on day eight is a reader's ability to *verify* it, not its
recorded worth — and conflating those would be editing the past to reflect the
present.

### Seven days must mean seven days on every device

A window one device honours and another ignores is not a window. Two things make
it real rather than advisory:

- The policy attaches to the **Attachment kind**, not to a device's mood, so
  every owned device applies the same `holdSince`.
- **Attachment inv. 8** — the per-Attachment key dies with the last reference —
  makes expiry arithmetic rather than a promise. When the last holder releases,
  the bytes are unreadable everywhere, including on a relay that still has them
  (`ERASURE.md` §2c).

### Also decided

**Connector tokens never enter the journal.** Credentials are not history. This
is stated because it is the kind of thing that gets added "temporarily" for
debugging and then lives in an append-only log for ever.

**Open.**

- Whether expiry should emit its own event. The absence reason travels on the
  event, so a reader always learns *why* the bytes are gone; what is not recorded
  is *whether anyone checked the synthesis while they still could*. That may
  matter and may not.
- Seven days is a number, not a principle. It is a `Policy.md` value, and
  `Policy.md` is still Draft.

---

## Provenance

DR-1 to DR-5 were decided by the operator in a session on 2026-09-26 whose
transcript is not in this repository, and were relayed here as a written summary.
This file is therefore the durable form: the reasoning below each decision is
reconstructed from that summary and from the documents it bears on, not quoted
from the original discussion. Where a consequence is drawn here that the summary
did not state — DR-4's split evidence, DR-5's `causes` collision — it is drawn
from this repository and should be checked against the operator's intent rather
than assumed to carry their authority.

**DR-6 is not one of theirs at all.** It is reasoned here from the repository in
answer to a question the summary raised, and it is marked Proposed for that
reason. It needs a yes or a no before anything is built on it.

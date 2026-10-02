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
> A dated snapshot of the whole project — what is decided, measured, and neither
> — is `STATE.md`. It cites this file rather than restating it.
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

**Discharged 2026-09-28.** `Capability.md` and `Action.md` were amended to carry
this and accepted. The chain, `causes`-as-lineage, cancels-as-evidence and the
`release`/`result` split are in `Action.md` §4a; the gating obligation is
`Capability.md` §4.10; hesitation time is recorded as erasable content, not
bookkeeping.

*(This note previously cited "§5 Ruling 2 — the general timing of consent". The
timing of consent is **Ruling 1**; Ruling 2 is how narrowly C1 is stated. Ruling 1
was ruled 2026-09-28 — standing authorization only where waiting would defeat the
action's purpose — which is what `review` needed. Ruling 2 remains open and does not
bear on this.)*

---

## DR-6 — The pass-3 journal schema is a payload schema; the envelope does not change

- **Status:** **Decided — no change.** The conclusion is the status quo, so there
  is nothing to approve; keeping a design that was already ruled on is not a new
  decision. The reasoning below is reconstructed here rather than relayed, which
  is a provenance note, not a pending question · **Raised:** 2026-09-26
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

### What release means — ruled 2026-09-26, after implementation raised it

Tiers 2 and 3 disagreed, and the disagreement only surfaced when the code was
written. This paragraph says *"unreadable everywhere rather than merely deleted
here"*; `Attachment.md` inv. 8 destroyed a key only when **no readable event
references it** — and after seven days the Observation still does. So the window
could never reach the key on inv. 8's own terms.

**Ruled: destroy the key at expiry, and the newest referencing event decides.**
inv. 8 now names a second ground, and one recent citation holds the whole
Attachment however old the others are. The alternative — dropping local bytes
only — would leave the content recoverable from any peer that kept it, and seven
days would buy nothing.

Two consequences follow from making destruction reachable while a live reference
exists, and both are in the code rather than in this paragraph:

- **A window must be asked for by name.** `evaluateDestruction` cannot return
  `expired` unless a caller passes one, so the more dangerous of the two grounds
  never fires by default.
- **A recent unreadable event blocks expiry.** Its payload cannot be read, so
  whether it cites the Attachment is unknown — but its wall clock is on the
  envelope, which every device holds, so *whether it is recent* is answerable on
  a partial replica. An unreadable event older than the window could not be a
  recent reference whatever it cites, and does not block.

**Open.**

- Whether expiry should emit its own event. The absence reason travels on the
  event, so a reader always learns *why* the bytes are gone; what is not recorded
  is *whether anyone checked the synthesis while they still could*. That may
  matter and may not.
- Seven days is a number, not a principle. It is a `Policy.md` value, and
  `Policy.md` is still Draft.

---

## DR-8 — The first loop is an alert loop, and it records rather than learns

- **Status:** Decided · **Decided:** 2026-09-26, operator
- **Bears on:** `packages/device-watch`, `MASTER.md`'s pipeline, DR-1

**The shape.** Journal → Observation → a small state projection → rules → a
human-facing workflow → one Capability → the outcome back into the journal.

That is a **vertical slice**, not a new architecture. Five layers `MASTER.md`
names are occupied by two small things — the Evidence Graph collapses into
`causes`, the Knowledge Engine into a projection, the Reasoning Pipeline into one
rule, and the Digital Twin and Agent Runtime are absent — and every one of them
can be inserted later without rewriting what is below it. Nothing is amended.

**The first instance is the device-authority alert**, because it needs no
permission, no connector, no model and no network: every input is already being
recorded by `apps/pixel/pass2`.

### An alert loop before an act loop, and not as a stepping stone

An act loop needs review → confirm → release (DR-1) and its outcome is what the
act did. An alert loop has nothing to confirm — noticing is not irreversible —
and looks like the lesser of the two.

It is not, and the reason decides the order: **a rule that cannot be measured for
false positives should not be allowed to act.** §7 R6 — *false positives cost
trust, and trust is the product.* The dismissals this loop collects are what would
justify letting a rule act later; building the act loop first would grant that
authority on the strength of nobody having complained yet.

### The answer is recorded and does not teach the rule — yet

`acknowledged` and `dismissed` are kept apart in the record and **treated
identically by everything downstream.**

**Why not learn now.** A rule that changes behaviour from a person's answers is
Orb beginning to hold opinions nobody wrote down. That may well be right later —
it is Continuous Learning, principle 6 — but it should be a decision taken
deliberately rather than one discovered in a diff. Until then the record
accumulates, and it is the evidence that decision would be made on.

**Made mechanical, not stated.** A test runs the whole loop twice, once with each
answer, and asserts the two end in the same state. The day a dismissal starts
changing what the rule does, that test fails.

### Two consequences in the code rather than in this paragraph

- **The projection is disposable.** Rebuild from the same events, get the same
  answer. Anything writable there would be a second source of truth (Art. IX §33)
  outliving an erasure of the events describing it.
- **Alert identity is `observation|kind`, never content.** Content-keyed identity
  would be *do not raise this again because you dismissed it before*, which is
  learning wearing idempotence as a disguise. Keying on the reading gives
  idempotence with none of it.

**The rule refuses to judge by publisher.** *"A non-Google name appeared"* was
the obvious heuristic and is the wrong one: it bakes in an opinion about who is
safe, it is wrong the first time a legitimate third-party service is granted
access, and it is the judgement that belongs to the person being told.

**Open.** The transport. Pass 2 writes these readings on the phone, in Java, in
its own lane; carrying that lane into this runtime is an import or a sync, and
neither is built. The loop is written against the reading's shape rather than
against the pipe.

---

## DR-9 — A remote model call is a Capability; the ModelRouter is not

- **Status:** Decided · **Decided:** 2026-09-28 · **Bears on:** `contracts/ModelRouter.md`,
  `contracts/Capability.md`, `KERNEL.md`, `reviews/INFRASTRUCTURE.md` gaps 4 and 5

**The question.** `Capability.md` inv. 1 says *the runtime affects the world only
through a Capability*, and §8 says *reads are capabilities too — pretending
otherwise is how read access becomes invisible*. A remote model call is an
outbound network effect carrying the user's own history. On the plain reading of
those two clauses it is a Capability. Yet `ModelRouter.md` as drafted gates its
own disclosures by reaching `Policy` directly. **That is two egress paths, only
one of which the architecture describes as egress** — and it makes inv. 1 false as
written, which is a contradiction between two Draft contracts rather than an
ambiguity. One of them had to yield.

### The ruling

> **Resolving is not emitting.** The `ModelRouter` resolves; a `Capability` emits.
> A remote route is reached through a declared Capability like every other effect
> on the world. The router itself is not one, and never becomes one.

The router is not a Capability because a Capability **declares a specific
effect** and the router's entire job is *choosing among* effects. A component
whose destination is a parameter cannot declare honestly and completely (inv. 2).

So the work splits along the line that was already there in `ModelRouter.md` §1 —
the router chooses *where*, it never acts on what it carries:

1. **Resolve.** The router turns a request into a **proposed disclosure**: a
   concrete route plus the minimized content. Pure, no bytes move. Only the router
   can do this, because minimization and route choice are the same decision.
2. **Authorize.** The proposal goes through the egress Capability's ordinary
   authorization — `Policy`, per scope, at its tier. Nothing bespoke.
3. **Emit.** The Capability sends, and produces the `Action`. The router never
   emitted anything, so it never authorized anything, so inv. 4 holds structurally
   rather than by promise.

### What follows, whether we like it or not

1. **A remote route is tier `Act (irreversible)`.** You cannot un-disclose.
   Under `CAPABILITY_MODEL.md` §5 that means human confirmation by default, and
   routine remote reasoning therefore runs on an explicit **standing, per-scope**
   authorization (`Policy` §1, Ruling 1 of `CLAIMS.md` §5) — not on the absence of
   a gate. **Remote reasoning stops being free at the point of use.** That is the
   price of this ruling and it is charged immediately.
2. **One Capability per route, not one for "remote models".** The destination is
   part of the consequence. A Capability declared as *send text to a provider*
   declares nearly nothing, and an authorization granted against it would be an
   authorization against everything. Routes are declared individually; what may go
   is carried by the scope, exactly as it is for *send a message*.
3. **`ModelRouter` loses its `Policy` dependency, and gains no `Capability` one.**
   It depends on neither Service, because it never emits — its caller carries the
   proposal onward. **The addendum's gap 5 was a real anomaly with a wrong
   explanation**: the router reached a decision-maker because it was doing the
   deciding, which it must not. It now depends on `Encryption` alone.
4. **The no-reroute rule stops being the router's own.** `ModelRouter.md` §7
   forbids retrying a denied disclosure through a different remote route. Under
   this ruling that is simply invoking a second Capability after the first was
   denied — which `Agent.md` §4.5 already forbids as decomposition. A ruling that
   lets an existing rule do the work is doing less damage than one that adds a
   rule.
5. **The fallback becomes visible.** A remote route's unreachability is discovered
   by the Capability and reported; the caller re-resolves and the second resolution
   is its own record. §7 already insisted the fallback was provenance rather than
   an implementation detail — now it cannot be anything else.
6. **A local route reaches no Capability at all**, because nothing leaves. This is
   *cannot* versus *did not* one more time: a local route is not an unauthorized
   disclosure, it is **not a disclosure**. Recording it stays mandatory for
   provenance; authorizing it would be authorizing nothing.

### What this does not change

- **No Constitution amendment.** Art. VI §25 and Art. VII §27 are read literally,
  which is what forced the ruling; Art. VIII §32 is satisfied by the Capability's
  ordinary record rather than by a second mechanism.
- **Nothing in `Encryption.md`**, whose dependency edge was already none.
- **No other `ModelRouter` invariant.** No hardcoded provider, a local route always
  available, capability discovered never assumed, `degraded` never `unavailable`,
  history untouched by swaps — all stand unaltered.
- **AD-7 is unaffected.** `device-watch`'s package read is a separate crossing of
  the same boundary and stays open on its own terms.

### What stays open

- ~~**Who holds the authorization**~~ — **settled by DR-12 (2026-09-29): the
  `Agent`.** — the `Reasoner` that wanted the interpretation,
  or an `Agent` above it. That is a Runtime Loop question about the caller, not a
  kernel question about the contracts, and both contracts are indifferent to the
  answer. It should not be left indefinite once the loop is written.
- ~~**Whether a route's Capability is declared per provider or per model version.**~~
  **Settled by DR-12: per provider; the exact version is still recorded.**
  §5 of `ModelRouter.md` requires a recorded routing to name the exact model
  version; whether *authorization* must be that narrow is not settled here, and
  the honest answer may be that a model swap within a provider changes what is
  disclosed to nobody and so needs no re-authorization.

### The counter-argument, recorded rather than buried

The other reading was available and is not absurd: **model disclosure is a
distinct kind of effect** — it is the only effect whose payload is the user's
interpretation of their own life rather than a message to a person — and gating it
distinctly would let it be reasoned about distinctly. It was rejected because the
benefit is a property of how the Capability is *declared and scoped*, which this
ruling keeps, while the cost is a second egress path that nobody auditing the
system would know to look for. **An invisible second door is worse than a
coarse-grained first one.**

---

## DR-10 — The Airwall is rejected

- **Status:** Decided · **Decided:** 2026-09-28, operator · **Bears on:** `AIRWALL.md`,
  `ModelRouter.md`, DR-9, `SECURITY.md` §7, `AGENT_RUNTIME.md` §4

**Rejected.** `AIRWALL.md` proposed that Orb never initiate a network connection,
with intelligence reaching the outside only through an isolated exception path. It
had stood as an unapproved proposal since it was written, and is now closed.

**Recorded so it is not reopened by accident.** An unapproved proposal that keeps
sitting in `docs/` is read by the next writer as a direction not yet taken rather
than as one declined, and `ModelRouter.md` was deliberately written without
assuming it for exactly that reason. The file stays in the repository as the
argument that was made and lost; its status line now says so.

### What follows

1. **DR-9 is the egress story, alone.** Until today the architecture held two
   unreconciled answers to *can Orb call out* — DR-9's Capability at tier
   *Act (irreversible)* under a standing per-scope authorization, and the Airwall's
   *never*. There is now one.
2. **`ModelRouter.md` needs no pass.** It was written not assuming the Airwall, so
   the rejection changes nothing in it. Had the ruling gone the other way the
   contract would have needed reworking — which is the argument for not assuming
   unapproved documents, demonstrated rather than asserted.
3. **The requirement the Airwall was answering does not disappear.** *Orb stays
   offline; Orb is intelligent; an LLM call never makes Orb reachable*
   (`AIRWALL.md` §1) is still what Art. VIII §31 asks for. What is rejected is the
   mechanism, not the goal: a local route is always available (`ModelRouter.md`
   inv. 2), no remote route is ever required, and nothing makes Orb *reachable* —
   outbound-only, authorized per scope, recorded.
4. **`SOVEREIGN_STACK.md` §5 loses its companion.** Where egress is decided is now
   answered by DR-9 rather than by a document in proposal state.

### What this does not decide

Whether a *stricter* posture is later wanted — a route allowlist, an egress budget,
a per-scope default of deny. Those are `Policy` questions and remain open on their
own terms; rejecting a specific architecture is not a ruling that nothing stricter
may ever be adopted.

---

## DR-11 — an Accepted contract may gain an invariant, on one condition

- **Status:** Decided · **Decided:** 2026-09-28, operator · **Bears on:**
  `contracts/Event.md` inv. 9, Art. X §37–§38, every future contract amendment

**The question.** `Event.md` was Accepted. Inv. 9 — *a recomputed record's
identity is derived from what it is about, never minted* — was added to it after
acceptance, to close the loophole in inv. 8's *"structurally (for
interpretation)"* that `DEVICE_LOOP.md` §7b28 measured. Art. X §37 says the
kernel evolves by **addition, never by changing the meaning of an existing
contract**; §38 says a breaking change **requires a new version**. So either the
addition is legitimate or inv. 9 belongs in an `Event` v2 of its own.

**Ruled: it stays in `Event` v1.** The v2 alternative was put and declined.

### The condition, which matters more than the instance

> **An Accepted contract may gain an invariant if and only if no instance
> already in history becomes invalid.**

Inv. 9 passes because it constrains components that **recompute** records —
Service behaviour — so every Event ever appended still satisfies the contract it
was appended under. Nothing in any journal is retroactively wrong.

That test is **checkable rather than rhetorical**, which is the whole reason it
is safe to have a rule here at all. The question *"does this invalidate anything
already written?"* has an answer you can go and look for.

### What follows, whether we like it or not

1. **"Accepted" does not mean "sealed against clarification."** It means the
   contract's *meaning* is fixed. An addition that no existing record violates
   does not change the meaning; it writes down something that was already true
   and was being rediscovered — three times, in this case (`Attachment` inv. 1–2,
   the authorization record, alerts).
2. **The burden is on the addition, and it is evidential.** Anyone adding an
   invariant must be able to say *which records were checked and found already
   compliant.* An assertion that it is non-breaking is not the test; the check is.
3. **A version is still required the moment the condition fails.** If a proposed
   invariant would make any existing record non-conforming — even one, even an
   obsolete one — it is a v2, and no argument about how minor it is applies.
4. **This does not license reinterpretation.** Narrowing an existing invariant,
   or reading an old clause a new way, is mutation regardless of whether any
   record breaks. §37 still forbids it. DR-11 permits *addition*, and nothing
   else.

### The risk, named rather than hoped away

This is exactly the rule that erodes by being convenient. Every future amendment
will arrive with a case for why it is non-breaking, and the temptation will be to
accept the case rather than run the check. **The defence is that the condition is
falsifiable**: it asks for records, not for reasoning, and a proposal that cannot
name what it checked has not met it.

### What it does not change

Art. X §39 — implementations are replaceable, the kernel is not. Art. X §38's
requirement of a new version for a **breaking** change is untouched; DR-11
defines the boundary of "breaking" rather than moving it.

---

## DR-12 — The Agent carries a remote-model request; consent is per provider

- **Status:** Decided · **Decided:** 2026-09-29, operator · **Bears on:**
  `contracts/Reasoner.md` §2, `contracts/ModelRouter.md` §5, `contracts/Agent.md`,
  DR-9 *What stays open*

**The questions.** DR-9 settled that a remote model call is a `Capability` and
that the `ModelRouter` resolves but never emits. It left two things open, and
said the first *"should not be left indefinite once the loop is written"*:

1. **Who carries the proposed disclosure through the route's `Capability`** — the
   `Reasoner` that wanted the interpretation, or an `Agent` above it?
2. **What a consent covers** — a provider, or each exact model version?

**Ruled.**

1. **The `Agent` carries it.** The `Reasoner` asks the `ModelRouter`, receives a
   proposed disclosure (route + minimized content), and stops there. Binding that
   proposal to the route's `Capability` and submitting it to `Policy` is the
   Agent's work, exactly as for *send a message*.
2. **Consent is per provider.** A standing authorization for a remote route names
   the provider — the recipient of the data. A new model version from the same
   provider needs no fresh consent, because it discloses to no one new. Every
   routing still records the **exact model version** (`ModelRouter.md` §5): the
   *record* stays as narrow as it was; only the *consent* is scoped to the
   recipient.

**Why the Agent.** The Execution domain keeps four verbs in four hands — decide,
bind, permit, act — so that no component holds both a power and the rule over it.
A `Reasoner` that carried its own proposal to a `Capability` would be the thinking
layer holding a route to the outside world, which `Reasoner.md` §7 already calls
overstepping (*"a Reasoner that performs effects has overstepped"*). With the
Agent carrying it, Intelligence stays powerless: it can want a remote model, and
nothing more.

**Why per provider.** Consent is about *who receives your data*. A model version
changes what answers you, not who holds what you sent. Requiring re-consent on
every version bump would ask the same question about the same recipient again
and again — the prompt nobody reads, which is how consent stops meaning anything.
The provider changing **is** a new recipient, and needs its own authorization.

### DR-11 check — run, not asserted

Both are additions to Accepted contracts, so DR-11's condition applies: *no
instance already in history may become invalid.* Checked 2026-09-29: every event
type in `runtime/`, `packages/` and `apps/pixel/` source, and every device export
received this session (45 files). **No routing, remote-disclosure or inference
record exists anywhere.** No instance can be invalidated, because none exists.

### What it does not change

The `ModelRouter` still never emits and never authorizes. A local route still
needs no authorization. A denial is still never rerouted. Whether a *family*
rename by the same provider is a new recipient is not a question this answers —
if it ever arises, the test is the one above: did the data go somewhere new?

---

## DR-13 — The Phase 3b gate is accepted; three debts are parked, deferred and reframed

- **Status:** Decided · **Decided:** 2026-09-29, operator · **Bears on:**
  `ROADMAP.md` gate 3b, `ARCHITECTURAL_DEBT.md` AD-6, AD-7 and AD-9,
  `SENSOR_SHARE.md`

**The question.** All 30 kernel specifications were Accepted on 2026-09-29, and
`ROADMAP.md` says a phase does not begin until the operator accepts the prior gate.
The same review left three older debts open. What is decided about the gate, and
about each of them?

**Ruled.**

1. **The Phase 3b gate is accepted.** 30 of 30 Accepted, and what is still open is
   named in `STATE.md` and the reviews rather than hidden. Phase 3c is open. No
   phase definition changes; this records that the gate was passed, and by whom.
   The work that follows is the Android personal runtime, **one step at a time**:
   a step is not finished until it is verified and whatever it leaves open is
   written in a register. *("Complete one step at a time so no debts pile up.")*
2. **AD-9 is parked.** Pass 1 is retired and nothing live is affected. Checked
   2026-09-29 with `verifyLane` on the latest exports: `dev.orb.app` (43 events,
   export of 2026-09-28 23:12) and pass 2 B (74) verify; pass 1 (5,877) is refused
   as broken, consistent with the §5d break in `SETTLED.md`. Accepting a break
   because a peer says it is old would let *declaring* a break become the attack —
   `verifyLane` cannot tell a historical defect from tampering, and that is the
   property the journal exists to have. The export stays the durable artefact.
   **Reopen only if** someone needs pass 1's events inside a journal, or a live lane
   ever acquires a break.
3. **AD-7 waits for the general mechanism.** No special-case fix for the package
   scan. What Orb needs is the whole chain once — *Capability declaration → Policy →
   permission → Action or read → Journal* — built as part of Phase 3c, so that every
   sensitive read goes through it. §7b36's half-payment stands and is not extended.
4. **AD-6 is reframed: the primitive is source independence, not device
   independence.** Independent keys, unconnected witness groups and corroborating
   evidence are all one claim about *sources*; a device is one kind of source.
   Proposed vocabulary for the design thread, **not contract text**: a relationship
   between two sources is `same`, `derived`, `correlated`, `independent` or
   `unknown`. Rules that carry over whatever the final shape:
   - **`unknown` is the default, and unknown never raises confidence.** Only a
     recorded `independent` may.
   - **Software records and applies a relationship; it does not establish one.** It
     is a claim carrying an asserter and a confidence, and the user may be the
     asserter (Art. XI §43 — confidence, never presented as established).
   - **Not a 31st contract.** An Event type, as the custody receipt, revocation and
     `orb.intent.unbindable` are, and additive under DR-11.
   - **How evidence combines stays with the `Reasoner`.** Evidence grounds and never
     resolves; an independence claim is data the Reasoner reads, not a verdict.
   - **A caution the vocabulary exists for.** A WhatsApp screenshot, a voice note
     and a calendar entry saying the same thing are *not* three independent sources:
     the calendar entry may be `derived` from the message, and the voice note from
     reading it. Counted as independent, one fact is counted three times.

   AD-6 stays **Open** as a design thread. **Revisit when** Orb first combines two or
   more mobile sources about one fact, or before any tamper-evidence claim,
   whichever comes first.

### What follows, whether we like it or not

- **Source identity is fixed at write time; relationships are not.** History is
  immutable, so an observation written without a stable source can never gain one,
  while a relationship between sources can be added later as a new event. That is
  why AD-6 costs something now: each sensor must name its source when it writes.
  **This adds nothing to any contract** — `Sensor.md` inv. 2 and `Observation.md`
  inv. 3 already require it.
- `ARCHITECTURAL_DEBT.md`, `ROADMAP.md`, `README.md`, `STATE.md` and `SETTLED.md`
  are updated to say the above. AD-6, AD-7 and AD-9 stay in the debt register: none
  is discharged, and each now carries this record's decision.

### Found while writing this record

The share sensor does not yet have the shape `SENSOR_SHARE.md` declares, and it was
in no register.

- `SENSOR_SHARE.md` §4 says the sensor emits an **Observation** carrying
  `sensor: orb.sensor.share`, `reference`, `resolvable` and `confidence`.
- What the phone writes (checked against the export above) is an **`orb.shared`
  device event** with `references`, `resolved` and `referrer`, and **no `sensor` and
  no `confidence`**.
- `packages/device-watch/src/import.ts` turns exactly two phone event types,
  `grants.observed` and `grants.packages`, into Observations (attributed
  `pass2@<device>`, since renamed `orb.sensor.grants@<device>`). Nothing turns an `orb.shared` into one — nor a `grants.exits`,
  an `orb.resolve.attempt` or an `orb.process.start`. Whether each of those is an
  Observation at all, or only device diagnostics, is decided as the next step
  reaches it.

This is not a contract breach: the phone's events are not Observations yet. But it
is exactly what AD-6 makes expensive. Today the record names the sending app only
through `referrer`, which is what Android reported to the activity and is not
verified (`SENSOR_SHARE.md` §5).

**It is the next step, and it is owned here:** bring the phone's record and §4 into
agreement — changing the record, or amending §4 deliberately to what was built — and
give it an import path to an Observation with an explicit source. `STATE.md` records
it until it is done. (Its row there also said *"Declared, no code"*, stale since the
first `dev.orb.app` build; corrected.)

**Resolved 2026-09-29 (step 2).** The spec was changed to match the phone (history
is immutable, so the shipped field names stand and the source is derived from the
event's type and device), the desktop importer now turns `orb.shared` into an
Observation, and the phone's record-building was moved into `Shares.java.in` so the
test fixture is generated by the code the phone runs. Two follow-ups this created
are in `STATE.md`. See `SENSOR_SHARE.md` §4 and §4a.

### What it does not change

The kernel stays thirty contracts and no contract text changes. AD-1, AD-2, AD-3 and
AD-10 are untouched. The Phase 3c definition in `ROADMAP.md` is untouched — this
records that its gate was accepted, not what its work is.

### What is still open

- The order of mobile sources after the share sensor (photos, voice, calendar,
  notifications, device context) is not decided here.
- Whether the first reasoning step runs **local-only** is *proposed, not decided*:
  it would keep to local-first and need none of AD-7's machinery, but it is unchecked
  whether an on-device model is usable from Orb. It is settled when that step is
  designed.


## DR-14 — Payments apps are never captured by the assistant overlay

- **Status:** Decided · **Decided:** 2026-09-29 and 2026-10-01, operator · **Bears on:**
  `DEVICE_LOOP.md` §7b42, `ARCHITECTURAL_DEBT.md` AD-11, `SENSOR_ASSIST.md`

**The question.** The assist probe showed that Android hands an assistant an intact
screenshot and full structure of any screen whose app did not opt out — including a
payments screen (`DEVICE_LOOP.md` §7b42, P26). Which apps may Orb ever capture from?

**Ruled.**

1. **No payments app is captured.** The operator's reasoning: what a payment
   amounts to can be derived from the text that arrives about it, so the payments
   screen itself adds nothing worth the exposure.
2. **Messaging, travel, content and work apps may be captured.**
3. **Capture is per invocation.** Nothing here is continuous: the overlay opens when
   the person invokes the assistant, and nothing is read otherwise.

**Two things this ruling leans on, stated so they are not forgotten.**

- *"Derived from the text"* presumes a text source. **Orb has none yet** — no
  message, notification or SMS sensor exists — so today the payments facts are
  simply not captured, not derived. The ruling is sound as an exclusion and is
  not evidence that the derivation works.
- The two protected-screen signals from §7b42 (`blockedNodes > 0`, a `uniform`
  screenshot) are honoured **in addition**: an app that opts out is never
  overridden, whatever category it is in.

**Also ruled, 2026-09-29, in answer to three questions.**

4. **Allow-list only.** Orb captures from an app only if the person has said yes to
   it. An app on no list is never captured. This also removes the need to recognise
   payments apps mechanically (Android has no payments category): a payments app is
   excluded by never being allowed, and a new or unknown one is excluded the same way.
5. **Text only is kept.** *Remember* keeps the screen's text and where it came from
   (app, page address). **No screenshot is stored.** The screenshot the platform hands
   over is used, if at all, to tell a blanked screen from a real one, and discarded.
6. **Platform backup off now** (AD-11), before anything beyond a deliberate share is
   captured.

**Also ruled, 2026-10-01 — step 5's three open points, on the operator's "go with your
suggestions".**

7. **How an app joins the allow-list:** an Orb screen with a switch per app, **starting
   empty**. The list is the projection of grant/revoke events, never a stored list.
   *(Implementation note, 2026-10-01: the add step is on the assistant card, not a list
   of every app — see `SENSOR_ASSIST.md` §4 for the reason. Starting empty and the
   projection are unchanged; the mechanism's difference awaits the operator's confirmation.)*
8. **Retention:** kept **until the person deletes it**, no expiry. Deleting destroys the
   key; the event remains and says only that a capture of *N* characters existed.
9. **A capture needs both the structure and the screenshot to have arrived.** The
   screenshot is never stored; it checks for screens that protected themselves without
   marking their structure. Missing screenshot ⇒ *cannot check* ⇒ nothing kept.

10. **A screen with a password field keeps nothing at all** *(2026-10-01, the operator's yes to the
    recommendation)*. Skipping the field still kept the username and the rest of a page whose point is
    a secret; a login page is rarely worth remembering and always worth not leaking. Found by a real
    test (`DEVICE_LOOP.md` §7b51, *The password test*): the password's characters never appeared, but a
    row of mask dots did — its length, and the fact that there is one.

11. **Payments apps are recognised by what they do, not only by name** *(2026-10-01, the operator's yes to the
    recommendation)*: any app that handles a UPI payment link (`upi://pay`) is a payments app and is never
    remembered from, whatever it is called; the name list stays as a backstop for what UPI does not cover
    (an exchange, a card wallet). **If Android will not answer, every app is treated as a payments app** —
    *cannot check* is a reason to keep nothing. The manifest gains **one narrow query** (who answers that
    link), not a list of installed apps, which is the secure alternative to enumerating every app.
12. **Allowing an app takes two taps and names the app** *(same date)*: the button reads *Allow
    `com.example.app`*, the first tap asks again, only the second writes the allowance, and the payments
    check is re-run at both taps, so a stray tap on a card that appeared over another app cannot widen what
    Orb reads.
13. **A named exception for an app that can send money but is mainly something else** *(2026-10-01, the
    operator's choice of the recommendation, after v17 refused WhatsApp)*: WhatsApp answers the UPI link in
    India, so ruling 11 filed it under payments. An app that handles the link but is **not on the name floor**
    may be allowed by an explicit exception: the card says it is treated as a payments app, offers *Allow
    `<app>` (it can send money)*, and the second tap warns that payment screens inside it can be kept too
    (Orb still shows the text first and never keeps a login screen). The exception is **the grant event
    itself** (`paymentsException: true`), latest wins, revocable in *Apps Orb may remember from*. It **never
    reaches the name floor** and **never applies when Android will not answer** (*cannot check* still keeps
    nothing). **No content filter** for payment screens was chosen: it would be a guess that looks like a
    control. **Honest limit:** the check cannot tell a chat app from a bank app that also answers UPI — both
    are UPI-capable — so the warning is the safeguard, and the person decides.

All of it is mechanism in `SENSOR_ASSIST.md`. **Not ruled, and written there as
proposals:** a short list of payments packages that cannot be allowed; excluding
accessibility descriptions; the decision timeout.


## DR-15 — Recall searches by opening each remembered item; there is no index

- **Status:** Decided · **Decided:** 2026-10-01, operator ("build Recall with that search approach") ·
  **Bears on:** `ARCHITECTURAL_DEBT.md` AD-13, `ERASURE.md` §2a, `SENSOR_ASSIST.md` §8

**The question.** Reading back what Orb remembered means looking inside sealed text. Searching a lot of
it can be fast with an index, or one-copy-simple by opening each item. Which?

**Ruled.** **Open each item, in memory, and let go.** No index is built or stored. Each remembered screen
is decrypted, searched and forgotten; the words are never copied into a second place.

**Why.** An index is a **second copy of the words** (or of enough of them to reconstruct the text), and
it would **not be sealed under the key that erasing destroys**. Erasing an item would then leave the index
behind: the exact residue `ERASURE.md` §2a warns against (*"a backed-up key is an un-erased payload"* —
an index is the same thing for words). Searching by opening keeps **one copy, one key, one erasure**.

**What it costs, stated now.** Search time grows with the number of items. A search looks through the
newest **500** and says how many it did not look at (`Recall.SCAN_LIMIT`). At the size Orb will have for a
long while that is a fraction of a second; it will not stay true at thousands, which is `AD-13`.

**Also decided with it:** the Recall screen is **secure** (`FLAG_SECURE`) — no screenshot, no recording,
no recents thumbnail, and no assistant, Orb's own included, is handed its contents — because it shows the
person's own words.

---

---

## DR-16 — The phone's reasoning layers are written in Kotlin; the first step uses rules, not a model

- **Status:** Decided · **Decided:** 2026-10-01, operator ("go with your recommendation") ·
  **Bears on:** `ROADMAP.md` Track B (B1), `DEVICE_LOOP.md` R2, `ARCHITECTURAL_DEBT.md` AD-14,
  `contracts/Reasoner.md`, `contracts/ModelRouter.md`

**The question.** Orb's thinking layers (evidence, entities, reasoner, planner) exist as contracts and a
TypeScript reference; the phone has only Java capture code. A laptop can never be required, so where does
the brain run on the phone?

**Ruled.**

1. **The phone's reasoning layers are written in Kotlin**, with coroutines, as `CLAUDE.md` names. The
   TypeScript stays as the reference and the place the logic is first proved.
2. **The two copies are held together by shared test vectors**, as the journal's two encoders already are
   (R2): the vectors are computed by one side and checked by the other, so agreeing means something.
3. **The first reasoning step uses plain rules, no language model**: dates, names, phrases such as "I'll send
   it Friday". It runs wholly on the phone, answers the same every time (so it can be replayed from the
   journal), and needs none of AD-7's permission machinery. A model comes later through the `ModelRouter`
   (on-device first; anything that leaves the phone only through a `Capability`, per DR-9).
4. **The fallback is Java.** If Kotlin could not be made to build in the no-Gradle toolchain, the brain
   would be written in Java and kept easy to port. **It can be built** (below), so the fallback is not taken.

**Checked before committing (2026-10-01).** A Kotlin 2.0.21 file compiled with `kotlinc`, ran on the JVM,
and went through the same `d8` step the app uses (with the Kotlin library: a 2.2 MB dex, unshrunk). It has
**not been run on the phone**; that is the first thing the first Kotlin piece must show.

**What follows.**
- The app's build gains a Kotlin step and the Kotlin runtime library in the APK (AD-14 records the cost).
- The compiler is fetched **once**, by `scripts/fetch-kotlin.sh`, pinned by version and hash — **never during
  a build**, which keeps "nothing resolved from a network at build time".
- Reasoning code is **pure** (no Android, no files): it takes events in and returns records out, so it is
  testable on a laptop's JVM and replayable.

**What it does not change.** No contract text changes; the journal, its encoders and the capture code stay in
Java; nothing here sends anything off the phone.

**What is still open.** Which on-device model, if any, serves the later reasoning steps; whether a second
non-phone implementation (Rust) ever pays for itself.


## DR-17 — An erased item may be kept again by the person's confirmation

- **Status:** **Decided and built** · **Decided:** 2026-10-01, operator ("go with your recommendation, option 2", then
  "Go" to the written design) · **Bears on:** `contracts/Attachment.md` inv. 8,
  `ERASURE.md` §2c, `REKEEP.md`

**The question.** Erasing refuses the same exact bytes for ever, including when the person deliberately shares them again.

**The proposal.** Arrival never undoes an erasure; the person may, once and knowingly, per item. A confirmation names the
date of the erasure; "Keep again" mints a fresh key and writes a new event citing the erasure in `causes`. Replay needs no
change (the projection is identity-based, and the new event is live). Full design, crash windows and risks: `REKEEP.md`.

**Done:** `contracts/Attachment.md` inv. 8 gained the "unless the owner confirms" clause; the phone implements it for shared text
and remembered screens (`DEVICE_LOOP.md` §7b61). Pictures, files and the desk's keyring are not covered (`ARCHITECTURAL_DEBT.md` AD-16).


## DR-18 — Three small decisions closed: the scan interval stays at 12 hours, pictures are not read for words yet, the card keeps its two-tap Allow

- **Status:** Decided · **Decided:** 2026-10-02, operator ("Go with your recommendation") on the recommendations below ·
  **Bears on:** `Watch.SCAN_INTERVAL_MS`, `ROADMAP.md` B2, `DEVICE_LOOP.md` §7b51/§7b53

1. **The package-scan interval stays 12 hours.** It was a labelled guess (`Watch.java.in`). Measured on the operator's real journal (322 events):
   a scan is **4.9 KB** (the declared set is 153 apps, not the 484 of the old broad scan), the 16 scans so far — several taken by hand — are 22 % of the journal, and
   at the automatic two a day that is about 10 KB a day. It is cheap enough to leave, and **the interval is the whole detection latency** for an install or uninstall
   (the broadcast route is refuted), so lengthening it would cost detection for little saving; shortening it would roughly double the one largest item in the journal. *Scan installed packages now* covers the impatient case.
   **Revisit** if journal growth becomes a problem or a install-to-alert latency under 12 hours is wanted.
2. **Reading words out of pictures (OCR) is not built now.** It would make shared pictures searchable, but an on-device recogniser is a dependency the no-Gradle build cannot vouch for
   (the same constraint as AD-15's memory-hard function), a vendor library would be a lock-in, and it reads far more than a person expects a share to mean. Pictures stay viewable
   in Recall (verified) and are **found by their facts** (app, time, kind), not their words. **Revisit** when a recogniser can be added that ships with the build, runs fully on the phone and is asked for explicitly.
3. **The assistant card keeps its two-tap *Allow*** (tap, then confirm; a payments app needs the named-exception wording). The card appears over another app, so the first tap only asks again and **only
   the second writes anything**; the full list screen (*Apps Orb may remember from*) remains the place to see and remove them. Both were verified on the device (§7b50, §7b54). Removing the card route would
   make the first allowance a trip through settings for no gain in safety that the second tap does not already give.

**What this does not close.** P92 (restore refused on an Orb that has history) and P105 (*Not now* leaves a refusal) are small taps awaiting the device (`DEVICE_LOOP.md` §7b62). The eight payments-floor names
are covered by tests and stay unverified on a device — verifying them needs those apps installed, and a wrong answer there fails *toward* keeping nothing.


## DR-19 — The phone's first entities are computed, never recorded

- **Status:** Decided and built · **Decided:** 2026-10-02, operator ("Yes, go with approach A") on `ENTITIES_PHONE.md` §4 ·
  **Bears on:** `contracts/Entity.md` §2, `ROADMAP.md` B3, `ARCHITECTURAL_DEBT.md` AD-12/AD-13/AD-17

**The question.** `Entity.md` §2 says a resolution is recorded as an Event. The phone's journal cannot seal payloads (AD-12), so a recorded entity — *"phone number +91 98…"* —
would be written in the clear, beside records designed to say how much and not what.

**The ruling.** Entities and relationships on the phone are a **projection**, as `Entity.md` §1 already allows ("recomputable from history"): found when a screen opens, from words held in
memory for that call, and never written. The contract's recorded resolution is applied **when a person decides something** (a merge, a name) — meaning that cannot be recomputed —
and that is **not built yet**. Consequences accepted: two handles of one person stay two; the lookup is linear in the number of items (AD-13).

**What was built.** `runtime/entities` (TypeScript reference) and `Handles.kt` (the phone's Kotlin), both held to hand-written cases; `Mentions` and *Mentions* in Recall's item dialog.
The kinds are phones (India first), sites, emails, UPI ids, amounts and dates that name themselves. People, places and organisations wait for a model or the contacts gate (B5).

**Contract note.** `Entity.md` §2 gained one sentence: *a resolution that can be recomputed from sealed content is not recorded in a journal that cannot seal it.*


## DR-20 — The phone's first action: a reminder you set, through a gate that records what it stops

- **Status:** Decided and built · **Decided:** 2026-10-02, operator ("Yes, go ahead with the design") on `GATE_PHONE.md` ·
  **Bears on:** `contracts/Capability.md`, `contracts/Policy.md`, `contracts/Action.md`, DR-5, `ARCHITECTURAL_DEBT.md` AD-7/AD-18

**The ruling.** Orb's first action is **`orb.remind.local` v1** — *one notification on this phone, at a time you chose, that you asked for; nothing sent, nothing read.* It is declared once and
frozen (a test pins the declaration's text; a change is a new capability). **Your confirmation of exactly this reminder is the authorization** — a standing one, justified by the narrow ruling
(`Policy.md`, `CLAIMS.md` §5 Ruling 1) because *a reminder exists to appear when you are not looking*; that argument is written into the confirmation record. Its identity is derived from what it
authorizes (capability, version, time, item, note), never minted at use. **At the moment of release the gate asks again**, against history: still wanted, still on, the item not erased, Android's
permission still there, the note readable, and not already done. Each refusal is recorded **with its reason**.

**Android.** `POST_NOTIFICATIONS` only, asked at the first confirmation. **No exact-alarm permission**: a reminder may be minutes late while the phone dozes, and the card says so.

**Deviations from the design, recorded.** (1) The gate's pure core is **Java** (`Reminders`, `ActionFacts`, `Remind`), not Kotlin as `GATE_PHONE.md` §8 said: it is policy over the journal's own text fields, the same shape as
`Erasure` and `AllowList`, not reasoning (DR-16's Kotlin is for reasoning layers). (2) The capability is **on until the person turns it off**; creating a reminder is itself the authorization. (3) Reminders about an erased item are
stopped **at the erase** (alarm cleared, refused `itemErased`, note destroyed) *and* checked again at release. (4) The notification's text, once shown, is held by Android like any app's — stated, not hidden.

**Not done:** Orb *proposing* a reminder (next slice, through this gate); the result (that you saw it — `Capability.md` inv. 7); the package scan and the assistant's reads as declared capabilities (AD-7, slice 3).


## DR-21 — Orb proposes dates ahead as a computed view; only you confirm

- **Status:** Decided and built · **Decided:** 2026-10-02, operator ("Yes, go ahead with Coming up") on `COMING_UP_PHONE.md` ·
  **Bears on:** `ROADMAP.md` B4, DR-19 (computed, never recorded), DR-20 (the gate), `ARCHITECTURAL_DEBT.md` AD-19

**The ruling.** *Proposing is not acting.* Orb may **propose** — a **Coming up** screen listing the dates your kept words name that are today or later, each with one tap to be reminded — and **only you confirm**;
confirming is the same review card and the same gate as *Remind me…* (DR-20). A proposal is **a view computed when the screen opens from words held in memory, never stored** (the road of Mentions, DR-19): it writes nothing,
shows nothing outside its own screen, and reaches no notification, alarm or journal-append (a source guard holds that). **Declining is not recorded** — there is nothing to record — and an erased item is not in the list.
The only outward sign is a **quiet mark** (a dot) on the button when an un-reminded date is within a week: no sound, no notification, no count of times ignored.

**Dates that name themselves only**, read in the person's own time zone (today is ahead; yesterday is not). Relative days — *"I'll send it Friday"* — are not read: they need a date to be relative to and a rule for *last / every / next*,
and are a separate step after seeing how this reads on real words (the discipline that put OCR off, DR-18). Names (*"call Ravi"*) wait for the contacts gate or a model (AD-17).

**Reminder time:** nine in the morning of the date to start from, editable on the card.


## DR-22 — Orb's reads are declared capabilities, in one place: AD-7 closed on the phone

- **Status:** Decided and built · **Decided:** 2026-10-02, operator ("Yes, go ahead with the design") on `GATE_READS_PHONE.md` ·
  **Bears on:** `contracts/Capability.md` §1/§8, `ARCHITECTURAL_DEBT.md` AD-7, DR-20

**The ruling.** *Reads are capabilities too.* Four are declared in one registry (`Capabilities`), each **frozen with its words pinned by a test** (a wider read is a new capability, never an edit): **`installedPackages.read`** v1 (which apps are installed;
authorized by your recorded grant), **`orb.read.screen`** v1 (a screen's text, only when you invoke Orb, in an app you allowed, never a login screen; keeps nothing unless you tap Remember), **`orb.read.grants`** v1 (which apps hold accessibility,
notification-listener and device-admin powers; always on, because it protects you and needs no permission), and **`orb.remind.local`** v1 (DR-20). All three reads are tier *Observe*; the reminder is *Act (reversible)*.

**Nothing about how they behave changed.** Their record of use is **the event each already wrote** (`grants.packages`, `orb.assist.captured`/`declined`, `grants.observed`, `orb.action.released`) — the registry names it and reads it back, so there is no second source of truth.
*What Orb may do* now lists all four: what it says, tier, what allows it, its state (read from history), its last use (**counts and times only, never content**), and the one control that already withdraws it. The grants watch is **shown and not switchable** (operator: approved as proposed).

**Held by the source.** Every platform read in the code sits in a file a declaration names; the reads Orb does not have — contacts, calendar, location, the microphone, the camera, the clipboard, SMS, usage stats — appear **nowhere**, and the manifest asks for none of their permissions (nor the network); the package scan checks the grant
before it reads and records a refusal as *ungranted* (never an empty set); only the scan calls the package read. **A fifth read added without a declaration fails the build.**

**Not built:** a Policy language (rules as data) — *you* are the policy, as `Policy.md` allows; a switch for the grants watch (a small addition if wanted); a model call as a declared capability (when one exists, DR-9 applies).


## DR-23 — Relative days are read as guesses from when the item was kept

- **Status:** Decided and built · **Decided:** 2026-10-02, operator ("Yes, go ahead with relative days") on `RELATIVE_DAYS_PHONE.md` ·
  **Bears on:** DR-21 (Coming up), DR-19, `ARCHITECTURAL_DEBT.md` AD-19

**The ruling.** Coming up reads, besides dates that name themselves, **relative days — as guesses, marked and explained**: *tomorrow*, *day after tomorrow*, *in N days / weeks* (N a number or one…ten), and a **spelled-out weekday** (the first such day after the day
the item was kept; the same weekday means the following week's). **Not read:** *next / last / previous / past / every / each / other / any / since / following* before a weekday, plurals, abbreviations, *today*, the past, and any language but English — *not reading
is better than reading wrong*. The anchor is **when the item was kept**, in the person's zone, and is **passed in** (no clock inside the reader), so the answer is deterministic.

**On the screen:** each guess says *A guess: "friday", read from when you kept it (Tue 6 Oct)*; the tap opens the same review card with the exact date, Cancel the default. **A guess never lights the dot**, a date both written and guessed is the written one, and
within a date what was written comes before what was guessed. Still a computed view, nothing stored, confirming through the gate (DR-20).

**Built the same way as the date finder:** a TypeScript reference (`runtime/entities`) and the phone's Kotlin, both held to **54 hand-written cases worked out on a calendar** (not computed from either), shared as vectors, mutation-checked.


## DR-24 — People: your contacts, opt-in, read only while the People screen is open

- **Status:** Decided and built · **Decided:** 2026-10-02, operator ("Yes, go ahead with option A") on `PEOPLE_PHONE.md` ·
  **Bears on:** DR-19 (computed, never recorded), DR-22 (every read declared), `ARCHITECTURAL_DEBT.md` AD-17, AD-21

**The ruling.** Orb may read the phone's contacts — names, phone numbers, email addresses — through a declared capability **`orb.read.contacts` v1, tier Observe**, whose words are pinned like the other reads'. It is allowed by **two** things: a recorded grant of the
person's (`grants.granted` / `grants.revoked`, as the package scan's) **and Android's own `READ_CONTACTS`**, asked at the first grant — and only that permission; no write permission exists. The read happens **only while the People screen is open**, in memory, and is let go
when it closes.

**What People shows.** The contacts that the kept words mention, not the whole address book. Items are tied to a person by **number, then email, then name** (strongest first; once per person); *by name* is labelled as a word, never a fact. Contacts that **share a number
or an address are one person** (*Ravi Kumar (+1)*), so *his two numbers* are one person without any merge being recorded — the gap AD-17 named. Name matching is plain: the full name in any case; a first name only when **unique among the contacts**, at least three letters, and
capitalised (so *Will* the contact is not *will* the verb); whole words only. The screen says how many first names are shared and so matched by full name or number only.

**Recorded: counts only.** Each opening appends one `orb.contacts.read` event — *how many contacts were looked at, how many people were mentioned* — and never a name, number or address, so the read is never silent (`Capability.md` inv. 6) and never carries what it read.
Nothing about a person is stored, recorded or exported (DR-19); erasing an item removes it from every person; revoking empties the screen.

**Held by source tests, not by good intentions:** only `ContactsReader` may touch `ContactsContract`; no write API anywhere; no logging, files or preferences in the People files; one append, and the grant is checked before the read; the manifest allows `READ_CONTACTS` and forbids
`WRITE_CONTACTS` and everything else sensitive. The old guard's list of *reads Orb does not have* lost `ContactsContract`; every other undeclared read (calendar, location, microphone, camera, clipboard, SMS, usage stats) is still forbidden.

**Built the same way as the handle and day readers:** a TypeScript reference (`runtime/entities`) and the phone's Kotlin brain `Names`, both held to the same hand-written vectors (`names.json`), mutation-checked in both languages; the Java side (grouping, evidence priority, ranking,
the grant flow, the status line) is mutation-checked on the phone's suite.

**Not decided here:** option C (a list you type, sealed like a note) can sit beside this later; no model is involved.


## DR-25 — People separates the sure from the possible, and reads a name only inside a sentence

- **Status:** Decided and built · **Decided:** 2026-10-02, operator ("Yes, go ahead with both") after the first device run of v32 · **Amends:** DR-24 (the matching rule and the screen)

**What the device showed.** On a phone with **2537 contacts**, five invented texts and a few older ones produced **32 "people"** — every one a by-name match: a contact named like an ordinary capitalised word (*Home*, *Bank*, a one-word nickname) matched the word. In the six-contact book the
rules were tested on, this did not show; in a real book it buried everything else. The failure was in the design's assumption, not in a defect: the rules did what DR-24 said.

**The ruling.** (1) **Sure and possible are separate.** A person tied to **a number or an email address** by at least one item is *sure* and is listed first. A person **only a name ties** is *possible*: listed apart, hidden behind *Show N that only a name matches*, under *Might be — only a
word matches a contact's name*. (2) **A first name is never read as the first word of the text, of a line or of a sentence** — a capital there says nothing (*Home is where…*). It is read inside a sentence. A sentence ends at `.` `!` `?` `…` or `।`; a line break also starts one; only
blanks (space, tab, no-break space) may sit between. **A script with no case (Devanagari) is exempt**: it has no capital to be fooled by. The full name (two words or more) is unchanged: it is distinctive wherever it stands.

**Known costs, accepted:** *Priya said hello* is not read (a real name at the start of a sentence is missed); *Mr. Anil called* is not read (an abbreviation's full stop looks like a sentence's end); a one-word contact name is still matched mid-sentence and so can still be noise, but now only in the
*possible* list. Not reading is better than reading wrong.

**Recorded.** The counts-only record gains `possible` (people tied only by a name) and is version 2; `people` now means *tied by number or email*. Still never a name, number or address.


## DR-26 — The first action on a person: a reminder you set, citing no kept item

- **Status:** Decided and built · **Decided:** 2026-10-02, operator ("Remind me about them", then "Yes, go ahead with the design") on `PERSON_ACTION_PHONE.md` · **Bears on:** DR-20 (the gate), DR-24/DR-25 (People)

**The ruling.** A person's window on the People screen offers **Remind me about this person…**, which opens the existing reminder flow with the note started as *Call (name)*. It is **the same capability** (`orb.remind.local` v1, Act reversible), **the same gate**, the same sealed note, the same review card with Cancel as the default — **no new
capability, permission or event type**. The reminder **cites no kept item**: a person is not an item, it is *your* request, and erasing some old note must not silently cancel *Call Ravi*. Its intent has empty `causes`; the confirmation cites the intent. **The person is never recorded**: the name exists only in the sealed note; the journal holds
the note's hash and length.

**Consequence accepted:** a reminder about a person has no lineage to a kept item (`Capability.md`'s *show your working* is satisfied by the intent and confirmation chain, as for any request made directly). **Not in this ruling:** calling or messaging (a hand-off to another app needs its own declaration), reminders Orb proposes about people, recurring reminders.


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
answer to a question the summary raised. It was briefly marked *Proposed*, which
was wrong: its conclusion is that nothing changes, and there is no approval to
seek for continuing to do what was already decided. What *is* open — and stays
open standing, not pending — is whether the operator wants to revisit the trade
DR-6 names: a coarse envelope costs selective sync and retention by kind of
content, permanently. That is theirs to reopen at any time, not something waiting
on them now.

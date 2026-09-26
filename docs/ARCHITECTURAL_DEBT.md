# Architectural Debt Register

> Deliberately deferred architectural questions — decisions we have *chosen not to
> make yet*, recorded so they are not forgotten. Debt here is not a bug or a TODO;
> it is a known design tension whose resolution is scheduled for a later, explicit
> decision (typically a kernel version boundary). Nothing in this register blocks
> the current phase.
>
> Each item states the question, why it was deferred, the leading option, and the
> milestone at which it must be revisited. Items are resolved by an explicit
> decision recorded in version control — never silently.
>
> The companion register is `DECISIONS.md`, which records decisions that have been
> **made** and what follows from each. Nothing belongs in both: an item leaves
> this register by arriving there.

---

## AD-1 — A `Claim` layer between Evidence and Fact

- **Status:** Open · **Raised:** Phase 3b, Knowledge domain review · **Revisit at:**
  before Orb **v2** (not v1)
- **Domain:** Knowledge · **Kind (if adopted):** State

**Question.** Should the epistemic stack gain a `Claim` object between Evidence and
Fact?

```
Observation → Evidence → Claim → Fact → Belief
```

**Why it might be needed.** *Claims* are what people (and external sources) actually
assert — statements that are neither runtime Facts nor runtime Beliefs:

- "John likes Rust."
- "BTC will reach $250k."
- "The meeting was successful."

These are not Facts (the runtime has not settled them on evidence) and not Beliefs
(they are not the runtime's own contextual interpretation). They are **asserted by
someone**, and over time become **supported**, **contradicted**, or **unresolved**.
A `Claim` would let Orb *ingest the world's statements* without prematurely
classifying them as Fact or Belief — a cleaner intake path for second-hand or
disputed assertions.

**Why deferred.** v1 can represent an external assertion as an Observation (someone
said X) plus Evidence, and let interpretation form Facts/Beliefs from there. The
`Claim` abstraction is a clarity and ergonomics gain, not a correctness gap, so it
does not justify expanding the v1 kernel. Adding it later is purely additive under
Constitution Article X (v1 contracts remain valid forever).

**Leading option.** Introduce `Claim` as a Knowledge-domain State contract in v2,
depending on `Evidence` (and naming the asserting source identity, as Observation
does). It would carry a resolution status (`supported | contradicted | unresolved`)
and be referenced by Facts/Beliefs that adopt or reject it. To be evaluated against
the simpler "external assertion = Observation + Evidence" baseline before adoption.

**Decision owner:** reviewer (architecture). **Resolution:** record an explicit
accept/reject with rationale at the v2 kernel boundary.

---

## AD-2 — A durable `PlanRecord` State contract

- **Status:** Open · **Raised:** Phase 3b, Intelligence domain review · **Revisit at:**
  when multi-step plan tracking becomes concrete (no earlier than **v2**)
- **Domain:** Intelligence · **Kind (if adopted):** State

**Question.** Should a plan be a first-class durable State contract, or is it
sufficiently captured by composition?

**Why it might be needed.** A plan that spans many steps, days, or revisions may need a
durable identity to be tracked, resumed, and compared against outcomes — something a
single inference record does not obviously provide.

**Why deferred.** In v1 a plan is fully composed from existing contracts: its
**provenance** is an `InferenceRecord` (the recorded planning run) and its **executable
residue**, once acted, is `Action`s in Execution. The `Planner` produces *intent*; the
`Agent` binds and records it. No durable `Plan`/`PlanRecord` object is needed until
plan-tracking across time proves that composition insufficient. Adding it later is purely
additive under Article X.

**Leading option.** Introduce `PlanRecord` as an Intelligence-domain State contract in a
later version, referencing the `InferenceRecord`(s) that produced it and the `Goal`(s) it
serves, and linked to the `Action`s that execute it — *only if* `InferenceRecord` +
`Action` prove unable to reconstruct or track plans.

**Decision owner:** reviewer (architecture). **Resolution:** explicit accept/reject when
a concrete plan-tracking need appears.

---

## AD-3 — Re-promotion of `Reflector` to a contract

- **Status:** Open · **Raised:** Phase 3b, Intelligence domain review · **Revisit at:**
  if reflection ever needs durable first-class state (no earlier than **v2**)
- **Domain:** Intelligence · **Kind (if adopted):** Service (and possibly a companion State)

**Question.** Should reflection be a kernel contract (`Reflector`), or remain composed
behavior?

**Why it might be needed.** If reflection grows to need durable, first-class state — for
example a persistent backlog of "open questions" or "unresolved expectation gaps" that is
neither a Belief nor a Prediction — a dedicated contract may earn its place.

**Why deferred / current decision.** The Intelligence review **removed** `Reflector`:
reflection is composed behavior, not a new kind of thinking. The `Scheduler` triggers the
`Reasoner` over a `Prediction`↔`Observation` gap, producing belief revisions and an
`InferenceRecord` like any other reasoning (`RUNTIME_LOOP.md` §11). It owned no unique
state and was a leaf in the dependency graph, so removal cost nothing structurally.

**Leading option.** Keep reflection as composed behavior. Re-promote `Reflector` (and any
companion State) only when a concrete durable-reflection-state need appears that cannot be
modelled as a Belief/Prediction.

**Decision owner:** reviewer (architecture). **Resolution:** explicit accept/reject if a
durable reflection-state need materializes.


---

## AD-5 — `KERNEL.md` lists two State→Service dependency edges

- **Status:** Open · **Raised:** Phase 3b, Execution domain review · **Revisit at:**
  the Phase 3b gate, before any Execution implementation interface is written
- **Domain:** Execution · **Kind (if adopted):** correction to `KERNEL.md`, not a
  new contract

**The finding.** `KERNEL.md` states as ratified kernel-wide law (Constitution
Art. X §40):

> A State contract depends only on other State (or on nothing); it never depends
> on a Service.

Two of the Execution domain's dependency lines contradict it:

| Contract | Kind | `KERNEL.md` says it depends on | Problem |
| --- | --- | --- | --- |
| `Action` | **State** | Capability (Service), Policy | State → Service |
| `Policy` | **State** | Capability (Service) | State → Service |

Those same two edges also close a cycle — `Capability` → `Action` → `Capability`
— against the section's own claim that the rule "keeps the kernel a directed
acyclic graph".

**Why it is a finding and not a bug in the contracts.** The resolution is
already prescribed by the law that the edges violate, and by existing precedent
in this repository. `Observation.md` met exactly this shape with `Sensor` and
resolved it by attribution rather than dependency:

> An Observation is attributed to a **source identity** — a stable value naming
> whatever produced it… The source is a *value*, not a kernel contract. This is
> deliberate: it keeps the kernel smaller, avoids a circular dependency with
> `Sensor`.

`Action` names its Capability by **identity and declaration version**, and
`Policy` names Capabilities by **identity and tier** — values in both cases. The
specifications as drafted therefore declare:

- `Action` — depends on `Event`, `Policy`
- `Policy` — depends on `Event`
- `Capability` — depends on `Action`, `Policy` (Service → State, which is legal)

This is acyclic, satisfies Art. X §40, and has the additional merit of being
correct on its own terms: an Action must stay explainable after the Capability
that produced it has been retired, which a live dependency could not guarantee.

**What is owed.** `KERNEL.md`'s three dependency lines should be corrected to
match. That file records the *accepted* Phase 3a gate, so the correction is not
made unilaterally here; it is recorded for the reviewer. Nothing else in the
kernel is affected — no contract is added, removed or renamed.

**Decision owner:** reviewer (architecture). **Resolution:** accept the
attribution-by-value reading and correct `KERNEL.md`, or reject it and say how
the DAG is otherwise preserved.

---

## Executables built ahead of their contract specifications

**Recorded:** Phase 3, alongside the Hyperliquid trade executor.
**Extended:** Phase 3, alongside the payment policy engine.

The executor (`packages/trade-executor`, `packages/hyperliquid`,
`apps/executor`) was implemented at the operator's direction before Phase 3b
produced contract specifications for `Capability`, `Action` and `Policy`, and
before the Phase 3c gate.

**The debt.** Three kernel contracts the executor depends on are named in
`KERNEL.md` but not yet specified:

- **`Capability`** — the executor's `ExchangePort` is a Capability in all but
  name. It declares its effects (`canTrade`, reduce-only flags) and is the only
  path to the world, but it does not declare a permission tier, and financial
  actions are irreversible-tier by `CAPABILITY_MODEL.md` §5. Human confirmation
  for irreversible actions is currently satisfied by configuration (the mainnet
  interlock, the symbol allowlist, the notional cap) rather than by a
  per-action authorization gate.
- **`Action`** — lifecycle events record what was submitted and what the
  exchange confirmed, but they are a package-local schema
  (`orb.trade.lifecycle/1`), not the kernel `Action` contract.
- **`Policy`** — `RiskConfig` is a Policy in substance. It is not expressed as
  the kernel contract, and it is not itself journalled, so a configuration
  change is not currently part of replayable history.

**Why it was accepted.** The executor is self-contained, journals everything
through the Event Journal, and holds no truth of its own — so adopting the
contracts later is a re-expression of existing structure rather than a rewrite.
Nothing about the implementation forecloses any of the three specifications.

**Repayment.** When `Capability`, `Action` and `Policy` are specified:

1. Express `ExchangePort` as a `Capability` with a declared permission tier.
2. Replace the package-local lifecycle schema with the kernel `Action` record,
   keeping the existing schema readable forever (Art. X §37 — addition, never
   mutation).
3. Journal `RiskConfig` changes as events, so the threshold in force at any past
   moment is replayable rather than inferred.

### Extension — the payment policy engine, and its extraction

A spend-authorization engine was built under the same deviation, briefly wired
into the trade executor, and then **extracted** to
[Soldsoul86/allowance](https://github.com/Soldsoul86/allowance). This entry
records what that leaves behind, because an extraction that only appears in a
commit message is how a repository ends up lying about itself.

**What was learned, and still stands.** The `Capability` item above observes
that for the executor, *"human confirmation for irreversible actions is
currently satisfied by configuration … rather than by a per-action
authorization gate."* A working per-action gate was built, and briefly proved
the point: every entry authorised against a budget spanning time, reserved
before the order went out, settled against the exchange's own report of what
opened, left standing when the outcome was unknown. It also demonstrated a
control `RiskConfig` cannot express at all — fifty entries each inside every
per-trade limit, together a day nobody authorised.

**What it leaves open.** All of it. The integration was reverted with the
extraction, because keeping it would have meant either the engine living in two
repositories — Art. IX §33, and the copy that is not the source of truth is
always the one that rots — or Orb's trading code depending on an external
payments package in order to place an order. Neither is worth paying before the
`Capability` contract exists to say what the integration should look like.

So: **nothing in this repository authorises an irreversible action per action.**
That is the same position as before the experiment, now held knowingly rather
than by omission, and with a reference implementation to build against when the
contract lands.

**The journal is now forked, and this is the real cost of the split.**
`allowance` carries its own copy of the Event Journal, because the journal is
Orb's single source of truth and could not leave, and because a payments
library whose ledger is not a journal projection loses the property that makes
its receipts checkable by a stranger.

Two copies of the same code will drift. There is no version of this that does
not cost something:

- *One copy, `allowance` depends on `@orb/journal`* — couples an independent
  library to this repository's release cadence, and asks an adopter to install
  a personal-runtime package to authorise a payment.
- *One copy, Orb depends on `@allowance/journal`* — Orb's own constitutional
  core arrives from a payments package. Worse.
- *Two copies* — chosen. They diverge slowly, and the divergence is visible in
  two public repositories rather than hidden.

**Repayment.** When a `Capability` contract exists:

4. Express an authorization gate as a `Capability` with the irreversible tier
   declared, and route the executor's order submission through it. The
   extracted engine is the worked example of what that gate should do; whether
   Orb depends on it or grows its own is a decision for that contract, not for
   now.
5. Decide the journal fork deliberately — reconverge on one copy, or state in
   both repositories that they are separate lineages and stop calling them the
   same thing.


---

## AD-6 — Independence is counted but never expressed

- **Status:** Open · **Raised:** 2026-09-25, while turning the product promise
  into testable claims (`CLAIMS.md` C2c). **Widened the same day** when the same
  defect appeared a third time, in the Evidence Graph · **Revisit at:** before
  any multi-device custody claim is made publicly, before C2c is run, and before
  a corroborated Observation is treated as stronger than an uncorroborated one
- **Domain:** History / Distribution / Knowledge · **Kind (if adopted):** an
  independence concept — expressed once, used in three places

**One defect, three appearances.** Orb repeatedly counts things whose value
depends entirely on their being independent, while having no way to say whether
they are:

| | What is counted | What actually matters | Where |
| --- | --- | --- | --- |
| **Custody** | Devices holding a payload | Distinct **keys** | `retention.ts:93` |
| **Witnesses** | Keys, once the above is fixed | Unconnected **groups** — six keys in two buildings is two | `WITNESSES.md` §6a |
| **Evidence** | Signals that corroborate | Whether the sources are **independent** — two readings from one compromised sensor corroborate perfectly and mean nothing | `EVIDENCE_GRAPH.md` §5 |

In every case the count is an honest number and a misleading one, because the
property it is standing in for is not the property being measured. Fixing them
separately would encode the same mistake three times in three vocabularies.

**The finding.** `evaluatePrune` requires K≥2 holders before a payload may be
pruned, and at least one of them owned. `holders` are **device identifiers**
(`runtime/journal/src/retention.ts:93`). There is no key concept anywhere in
`runtime/` or `contracts/`: a search for signature, signing key, public key or
key id across both returns one hit, and it is the word "signature" used
metaphorically about a torn line in a file.

K≥2 is asked to carry two different properties, and counting devices is right
for one and wrong for the other:

| Property | What K≥2 is protecting against | Do shared-key devices count separately? |
| --- | --- | --- |
| **Durability** | Losing the last copy of a payload | **Yes.** Two copies are two copies. |
| **Tamper-evidence** | The key holder truncating the tail and re-signing | **No.** One key is one witness. |

A device restored from a backup, or a second install provisioned from the same
material, satisfies the quorum while adding nothing against the failure C2c
describes: whoever holds the key can make every device holding it tell the same
false story.

**Why it is debt and not a bug.** Nothing shipped is wrong for its stated
purpose — the retention rule is a durability rule, and for durability it is
correct. What is missing is the *vocabulary*: Orb cannot currently express
"independent key", so it cannot state the tamper-evidence property at all, let
alone test it. That is why `CLAIMS.md` C2c is marked not runnable rather than
unproven.

**Raised by the operator**, reviewing C2's wording: a witness only counts if it
does not hold the same signing key.

**The use case that makes it urgent** is also the operator's: *can my mother's
phone be the second device?* It can, and it is a better witness than any machine
the user owns — different key, different person, different place. But Orb cannot
currently tell that arrangement apart from one person holding two phones, and
for tamper-evidence those are opposite things. See `WITNESSES.md`, which is
blocked on this entry.

**And keys are not the last step.** `WITNESSES.md` §6a: six keys in two
buildings is two. What resists collusion is *unconnected groups*, which no
software can observe — it can count devices, and it can count keys once this
entry is paid down, but it cannot know whether two people share a home, an
employer or a jurisdiction. Whatever shape this takes must therefore leave room
for a count the **user declares**, carrying the user's confidence rather than
presented as something the system established (Art. XI §43).

**The third appearance, and it is not in this domain at all.**
`EVIDENCE_GRAPH.md` §5 records `corroborates` / `contradicts` between signals,
deliberately as structure rather than resolved truth, and `Evidence.md:134`
states plainly that Evidence may corroborate a wrong Observation. That part is
right and needs no change.

What is missing is the same thing: **two signals from one compromised source
corroborate each other perfectly.** A corroboration count without independence
is worth no more than a witness count without keys. `EVIDENCE_GRAPH.md` uses the
phrase *"independent signals"* descriptively; nothing in the model can hold or
check it.

This matters most under `THREAT_MODEL.md` §7, where an adversary upstream of a
sensor produces readings that Orb faithfully records, chains and will prove
forever. Corroboration is the main defence against that — and it only defends if
the corroborating sources could not both have been fed by the same hand.

**A likely shape, not a decision.** Independence is a claim *about* sources, and
software cannot establish it any more than it can establish that two witnesses
do not share a kitchen. It is probably one concept — an independence assertion
carrying the asserter and a confidence — applied to keys, to witness groups and
to evidence sources alike, rather than three mechanisms that happen to rhyme.

**What adopting it would touch.** A key identity as a *value* attributed to a
custody receipt — following the `Observation.md` source-identity precedent that
AD-5 also leans on, rather than a new kernel contract with a dependency edge.
`RetentionPolicy` would then distinguish a durability quorum from a witness
quorum instead of conflating them under one K.

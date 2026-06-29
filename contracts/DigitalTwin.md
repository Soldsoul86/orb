# DigitalTwin — Contract Specification

```
Contract:   DigitalTwin
Domain:     Identity
Kind:       State
Version:    v1
Status:     Draft
Depends on: Entity, Fact, Belief, Relationship, Project, Goal, Context
```

> A DigitalTwin is Orb's evolving model of the user's world — the coherent assembly of
> entities, facts, beliefs, relationships, projects, goals, and context that together
> answer "given everything Orb has learned, what should influence future decisions?"
> See `../docs/DIGITAL_TWIN.md`.

**Why a permanent kernel contract?** Because continuity needs a *whole*. The other
Identity contracts each model one strand — a connection, an endeavor, an intent, a
frame — but Orb must also hold the integrated model those strands compose into: the
user's world as currently understood. The DigitalTwin is that integration. It stores
no truth of its own and overrides none of its constituents; it is the recomputable
aggregate that gives the parts a shared surface. *Can it exist for twenty years?*
Yes: the **idea** of an evolving, replayable model of the user's world is the most
durable contract in the kernel — it is the thing that grows with the user for
decades. Every fact it cites and every belief it holds may change; the existence of
the integrated model does not. That is kernel identity in its purest form.

---

## 1. Semantics

A **DigitalTwin** is the integrated, continuously recomputed model of the user's
world: the live composition of resolved **Entities**, supported **Facts**, contextual
**Beliefs**, **Relationships**, **Projects**, **Goals**, and the salient **Context**.
It answers *"what is Orb's current understanding of the user's world?"* — never
*"what is true."* The Twin is **interpretation**: a derived aggregate, recomputable in
full from history, holding no source-of-truth state of its own (Constitution Art. II
§9).

A DigitalTwin is **not edited directly**. It is never written as a record; it is
*projected* from its constituents, which are themselves derived from observations,
evidence, and user intent. A manual correction targets a constituent and enters
history as an Event; the Twin re-derives.

### Composition (Immutable / Derived / Ephemeral)

- **Immutable** — only the **genesis / anchor event** marking the Twin's inception
  (the point from which this model of the user begins). The Twin owns no other
  immutable state; its history lives in its constituents and the journal.
- **Derived** — the **entire current model**: which Entities/Facts/Beliefs/
  Relationships/Projects/Goals are held, how they cohere, and the present salient
  Context. All of it is recomputed from history.
- **Ephemeral** — the **in-memory materialization** (the assembled, indexed,
  query-ready form held for the running session). Runtime-only; lost on replay and
  rebuilt on demand.

*Replay test:* the genesis event survives replay; the entire current model is
recomputable and so survives as derivation; the in-memory materialization does not
survive and need not.

---

## 2. Lifecycle (begin → evolve → decay → merge → split → end)

1. **Begins** at genesis — the first observations about the user establish an anchor
   event, from which the Twin starts projecting a model.
2. **Evolves** continuously as constituents change: entities resolve, facts
   accumulate, beliefs shift, relationships strengthen, projects and goals progress;
   the Twin re-derives to reflect them.
3. **Decays** only in the sense that constituents go dormant (stale beliefs, lapsed
   ties, dormant projects); the Twin reflects reduced confidence, never deletes — a
   sparse Twin is still a valid Twin.
4. **Merges** in the rare event two models of one user must be unified (e.g.
   reconciling two devices' early independent models) — a recorded re-resolution of
   constituents, never a rewrite.
5. **Splits** are not a normal operation: a single user has one Twin. Apparent
   splits are constituent re-resolutions (an Entity or Project splitting), not a
   division of the Twin itself.
6. **Ends** only with the model's retirement (the user leaves Orb); the Twin's full
   trajectory — every constituent and its history — remains in the journal.

---

## 3. State transitions

```
(genesis) ──▶ (live model, recomputed from constituents)
     │              ├── constituents evolve  ──▶ (Twin re-derived)
     │              ├── constituents go dormant  ──▶ (Twin reflects reduced confidence)
     │              └── constituents re-resolve (merge/split)  ──▶ (Twin re-derived)
     └────────────── genesis/anchor event never changes; Twin holds no truth of its own ──┘
```

---

## 4. Invariants

1. **An integrated model, not a store of truth.** The Twin composes its constituents;
   it asserts nothing they do not, and holds no source-of-truth state (Art. II §9).
2. **Grounded throughout.** Every element traces to a constituent and, beneath it, to
   evidence and events; an ungrounded element cannot enter the Twin (Art. II §8).
3. **Never edited directly.** The Twin is projected, never written; corrections target
   constituents and enter as Events (Art. XII §45).
4. **Immutable core, derived surface, ephemeral edge.** Only the genesis event is
   immutable; the entire model is derived; the in-memory materialization is ephemeral
   and does not survive replay (Art. XII §46).
5. **Fully recomputable.** The Twin can be discarded and rebuilt from the journal at
   any time and is identical in content to its derivation (Art. I §3, Art. II §9).
6. **One user, one Twin.** The Twin is the singular integration point of Identity; it
   does not split.

Upholds Constitution Articles XII (Identity and Continuity), II (Truth and
Interpretation), and I (History).

---

## 5. Versioning rules

- New **constituent kinds** may be composed into the Twin as the Identity domain grows
  (added and versioned); existing constituents never change meaning within the Twin.
- The core obligation — *integrated, grounded, recomputable, holds no truth of its
  own, never edited directly, one-per-user* — is frozen at v1.
- Assembly, indexing, and materialization are implementation; they may evolve freely,
  but never grant the Twin source-of-truth state.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- The Twin is always a projection over its constituents — never an independent source
  of fact.
- The Twin is fully recomputable from history; it may be discarded and rebuilt.
- The Twin's genesis anchor and the full trajectory of its constituents are never
  rewritten.

Not guaranteed:

- That the Twin is *complete* — it holds only what has been observed and interpreted.
- That the Twin is *correct* — it is the best current model, revisable as constituents
  are recomputed.

---

## 7. Failure modes

- **Lost materialization.** A crash loses the in-memory Twin; it is rebuilt from the
  journal and its constituents — by design, nothing of value is lost.
- **Inconsistent constituents.** Two constituents disagree (a Belief contradicts a
  Fact); the Twin surfaces the tension via confidence rather than resolving it in
  place — contradiction is handled in interpretation, never in history (Art. IV §18).
- **Constituent re-resolution.** An Entity or Project merges/splits; the Twin
  re-derives its membership; nothing in the Twin is rewritten.
- **Drift toward a profile.** A tempting "just store the current user record"
  shortcut would make the Twin a store of truth; forbidden — the Twin must remain a
  recomputable projection (Art. XII §44).

Never permitted: writing the Twin as a record; granting the Twin source-of-truth
state; editing the Twin in place; deleting a constituent's history.

---

## 8. Examples

- **Integration.** A query "how is my relationship with Acme trending?" is answered
  from the Twin by composing the Acme Entity, the works-with Relationship, the
  Project it serves, and supporting Facts — no new fact is stored.
- **Rebuild.** A device is wiped and restored from the journal; the Twin is recomputed
  in full, identical in content, with only the in-memory index rebuilt fresh.
- **Reduced confidence.** After a year of inactivity many constituents go dormant; the
  Twin reflects a sparser, lower-confidence model — still valid, never deleted.
- **Reconciliation.** Two devices that ran offline built divergent early models; on
  sync their constituents re-resolve by recorded merge, and the single Twin re-derives
  — no history is overwritten.

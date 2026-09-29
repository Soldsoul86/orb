# ModelRouter — Contract Specification

```
Contract:   ModelRouter
Domain:     Infrastructure
Kind:       Service
Version:    v1
Status:     Accepted
Depends on: Encryption
```

> The ModelRouter decides **where a thought is computed**. It never decides what
> the thought means. See `../docs/AGENT_RUNTIME.md` §4 and `../docs/SECURITY.md` §7.

> **Settled 2026-09-28 (DR-9): resolving is not emitting.** The router resolves a
> request to a concrete route and minimizes what a remote one would carry. It does
> not send. A remote route is reached through a declared `Capability` at tier
> *Act (irreversible)*, like every other effect on the world, so there is **one
> egress path and not two**. Every mention of disclosure below is read that way.

**Why a permanent kernel contract?** Because *"models are replaceable; no provider
is hardcoded"* (Art. III §11) is a claim that decays the moment any component may
reach a model directly. One direct call, and a provider is in the architecture: its
parameters leak into call sites, its absence becomes an outage, and the
local-first guarantee (Art. VIII §31) quietly stops being true. It is also **the
only Service whose ordinary operation may send the user's own history off the
device**, so *minimized, permissioned, recorded* (Art. VIII §32) has to be a
contract rather than a habit. The *providers* are replaceable and expected to churn;
the boundary is not.

---

## 1. Semantics

A **ModelRouter** is a Service that resolves a `Reasoner`'s request to a concrete
model — local or remote — enforces minimization and policy on anything disclosed,
and records what it did.

**Routing is not interpretation.** The router chooses *where*; the `Reasoner`
decides *what it means*. A router that read the content to decide how to route would
be interpreting, and interpretation that nobody recorded as an inference would be
reasoning smuggled into infrastructure.

### A remote route is a disclosure

Sending a prompt to a model that is not on this device puts the user's data in
someone else's hands. That is the event the contract exists to govern:

- **Minimized** — the least the request needs, never the convenient superset.
  This is the router's own work: route choice and minimization are one decision,
  and nothing above the router can make it, because nothing above knows the route.
- **Permissioned** — through the route's `Capability`, per Art. VIII §32 and
  Art. VII §27. The router does not authorize itself, and under DR-9 it *cannot*:
  it produces a **proposed disclosure** — concrete route plus minimized content —
  and its caller carries that through the Capability. A component that never emits
  never authorizes.
- **Recorded** — what went out, to which model, under which authorization, as
  history. The `Action` is the Capability's (`Capability.md` §4.6); the routing
  and the provenance are the router's.

**A local route discloses nothing and is therefore not exempt from recording.** The
route is recorded either way, because *which* model produced an interpretation is
part of that interpretation's provenance, and a record that only mentioned the
remote calls would misrepresent where thinking happened.

### An output is an observation, never truth

Art. III §12: every model-generated artifact is recorded immutably **with full
provenance** — provider, model version, prompt template version, input references,
parameters, timestamp, execution environment — and is thereafter treated as an
observation. The router is where most of that provenance is known, and the only
place it can be captured honestly.

### Capability is discovered, never assumed

Model interfaces drift continuously: parameters are removed, features become
model-gated, identifiers change, and two models under one family name differ in what
they accept. **A router that assumed a capability would degrade silently** — the
request would succeed, the answer would be worse, and nothing would say so. So a
route's capabilities are established by asking, and what was established is recorded
with the interpretation that depended on it.

**The bound on "rechecked, not remembered":** every interpretation records the
capability *established for the request that produced it*, and none inherits a prior
request's. How often the wire is actually queried is an implementation's to optimise;
what the contract fixes is that no interpretation rests on a capability it did not
establish — which is the answer to "how often" that a contract can honestly give.

---

## 2. Lifecycle

1. **Registration.** Routes are registered, each declaring identity, locality
   (on-device or remote), and what it costs in disclosure.
2. **Resolution.** A `Reasoner`'s request is resolved to a concrete route, by
   suitability and by policy — never by hardcoded preference for a named provider.
3. **Proposal.** For a remote route the router emits nothing and instead yields a
   proposed disclosure. Authorization happens outside it, through that route's
   `Capability`. A denial ends the attempt; it is never retried through a
   different remote route (see §7).
4. **Invocation and recording.** A local route the router may call itself, because
   nothing leaves. A remote route is called by its `Capability`. Either way the
   routing decision and the provenance are recorded.
5. **Retirement.** A route may disappear at any time — a provider withdraws a
   model, a device loses a local one. Past interpretations remain readable and
   remain attributed to the model that produced them.

---

## 3. State transitions

```
registered ──▶ available ──resolve──▶ proposed ──▶ available
                   │                     │
                   │                     ├──authorization denied──▶ recorded, not rerouted
                   │                     └──remote unreachable──▶ re-resolve local, or refused
                   │
                   ├──(remote route unreachable)──▶ degraded  (local still available)
                   └──retire──▶ retired   (past interpretations keep their attribution)
```

**`degraded` is never `unavailable`.** A device with no network has lost remote
routes and not the ability to think — **a local route is always available**
(Art. VIII §31). A router that reported itself unavailable because a provider was
down would have made the provider load-bearing, which is the failure this contract
exists to prevent.

---

## 4. Invariants

1. **No provider is hardcoded**, anywhere, at any layer. A provider's name may
   appear in configuration and in history; never in a code path that would break
   without it.
2. **A local route is always available.** Orb remains useful with no network
   (Art. VIII §31).
3. **Never emits on a remote route, and therefore never authorizes one.** The
   route's `Capability` emits; authorization is obtained against it (DR-9).
4. **Disclosure is minimized** — the least the request needs.
5. **Every routing is recorded**, local and remote alike, with its provenance.
6. **Every disclosure is recorded** — what left, where it went, under which
   authorization. A remote route that carries no authorization reference is
   refused by the router, not merely unauthorized.
7. **Model swaps affect only future interpretation.** History is untouched by a
   route changing; a past interpretation keeps the model that produced it
   (Art. III §13).
8. **Never interprets.** The router reads no meaning from what it carries.
9. **Capability is discovered and recorded, never assumed** (§1).
10. **An output is an observation**, carrying provenance, never truth (Art. III §12,
    Art. XI §43).

Upholds Constitution Articles III (Models and Reasoning), VI §25–§26 (only the
Execution Plane acts on Reality, and it holds no truth) and VIII §30–§32 (root of
trust, local-first, minimized disclosure).

---

## 5. Versioning rules

- **New routes and new providers** are added freely. They are configuration, not
  contract changes.
- **A recorded routing names the exact model version**, because "the same model" is
  not stable over time. An interpretation attributed only to a family name is
  attributed to nothing that can be checked later.
- **Consent is scoped to the provider, not the version** (DR-12, 2026-09-29). A
  remote route's authorization names the recipient of the data; a new model
  version from the same provider discloses to no one new and needs no fresh
  consent. The record above stays exact; only the consent is per recipient.
- The core obligation — *no hardcoded provider, a local route always available,
  disclosure minimized and permissioned and recorded, history untouched by swaps* —
  is frozen at v1.
- **Replay reproduces history, not intelligence** (Art. III §13). Re-running a
  routing decision may legitimately produce a different answer; what replay
  guarantees is the record of what was asked, where it went, and what came back.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- A route exists without a network.
- Nothing leaves the device unrecorded, and nothing leaves unauthorized.
- A past interpretation stays attributed to the model that produced it, for ever.
- Swapping or retiring a provider changes no history and invalidates no record.

Not guaranteed:

- **The same answer twice.** Intelligence is not frozen; history is.
- **That a remote route is reachable.** Ever.
- **Equivalent quality between routes.** A local route is guaranteed to exist, not
  to be as good — and where that difference matters it is a fact to record, not to
  hide.
- **That a capability persists.** It is rechecked, not remembered.

---

## 7. Failure modes

- **Remote route unreachable.** Discovered by the route's `Capability`, reported,
  and the request re-resolved to a local route — a second resolution with its own
  record, never a silent substitution inside one call.
  **The fallback is provenance, not an implementation detail**:
  an interpretation produced locally because the network was down is a different
  artifact from one produced remotely, and a reader must be able to tell.
- **A disclosure is denied.** Recorded with the reason, and **the router does not
  propose a different remote route.** Under DR-9 rerouting around a denial is
  invoking a second `Capability` after the first was refused, which `Agent.md`
  §4.5 already forbids as decomposition — the denial was about the data leaving,
  not about the destination.
- **No route at all.** The request fails and says so. It never fabricates an answer,
  and it never silently returns a lower-quality one as though it were what was
  asked for.
- **A route returns something unusable.** Recorded as what it was. A malformed or
  refused response is an observation about the route, not an absence.
- **A capability turns out to be missing mid-request.** Recorded, and the request
  fails or is re-resolved explicitly. Never worked around by quietly dropping the
  part of the request that needed it.
- **A provider disappears permanently.** Past interpretations keep their
  attribution and remain readable. Nothing is re-run to "refresh" them, because
  that would replace recorded history with new intelligence.

Never permitted: an unrecorded disclosure; the router emitting on a remote route
itself; disclosure without authorization; routing around a denial; a hardcoded
provider; presenting a model's output as truth; re-running history to change it.

---

## 8. Examples

- **No network, still thinking.** The device is offline. Remote routes are
  `degraded`; a local route serves the request; the interpretation records that it
  was produced locally. Nothing about the loop stops, which is Art. VIII §31 as a
  behaviour rather than a slogan.
- **A disclosure that is asked about.** A reasoner wants a remote model to
  summarise a week of history. The router minimizes to what the request needs and
  proposes route R; the Capability for R is authorized per scope; what left the
  device is in the journal. Three months later it is answerable *exactly* what was
  disclosed.
- **A denial that is not rerouted.** The same disclosure is denied. The router
  records the denial and stops. It does not propose a second provider, split the
  content, or fall back to a route with a weaker scope — the objection was to the
  data leaving, not to where it was going.
- **A local route needs no authorization, and that is not a loophole.** Nothing
  leaves, so there is no disclosure to permit; the routing is still recorded,
  because provenance is about where thinking happened and not about who consented.
  Authorizing a local route would be authorizing nothing, which is how a gate
  becomes a formality.
- **A model retired underneath a record.** A provider withdraws the model that
  produced an interpretation last year. The interpretation is unchanged, still
  attributed, still readable. Re-running it today would produce a *new*
  observation, never a correction of the old one (Art. III §13).
- **A capability that was assumed — the failure this prevents.** A router that
  remembered "this route supports X" and stopped checking would keep sending
  requests that quietly lose X: the call succeeds, the answer is worse, and no
  record says why. Model interfaces change often enough that this is the expected
  case, not an edge one.
- **What is not routed at all.** `packages/device-watch` reads a device, folds a
  projection and applies one rule. No model is involved anywhere in it. The
  ModelRouter's absence from the first working loop is worth noticing: *intelligence
  is optional to the architecture*, which is what Art. III §11 means when it says
  models never define it.

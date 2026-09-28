# ModelRouter — Contract Specification

```
Contract:   ModelRouter
Domain:     Infrastructure
Kind:       Service
Version:    v1
Status:     Draft
Depends on: Policy, Encryption
```

> The ModelRouter decides **where a thought is computed**. It never decides what
> the thought means. See `../docs/AGENT_RUNTIME.md` §4 and `../docs/SECURITY.md` §7.

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
- **Permissioned** — `Policy` decides, per Art. VIII §32. The router does not
  authorize itself, exactly as a `Capability` may not (`Capability.md` §4.4).
- **Recorded** — what went out, to which model, under which authorization, as
  history.

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

---

## 2. Lifecycle

1. **Registration.** Routes are registered, each declaring identity, locality
   (on-device or remote), and what it costs in disclosure.
2. **Resolution.** A `Reasoner`'s request is resolved to a concrete route, by
   suitability and by policy — never by hardcoded preference for a named provider.
3. **Gating.** A remote route's disclosure is submitted to `Policy` before
   anything leaves. A denial ends the attempt; it is never retried through a
   different remote route (see §7).
4. **Invocation and recording.** The route is called, and the routing decision,
   the disclosure and the provenance are recorded.
5. **Retirement.** A route may disappear at any time — a provider withdraws a
   model, a device loses a local one. Past interpretations remain readable and
   remain attributed to the model that produced them.

---

## 3. State transitions

```
registered ──▶ available ──resolve──▶ routing ──▶ available
                   │                     │
                   │                     ├──policy denies──▶ recorded as denied, not rerouted
                   │                     └──remote unreachable──▶ local route, or refused
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
3. **Never authorizes its own disclosure.** `Policy` decides, always.
4. **Disclosure is minimized** — the least the request needs.
5. **Every routing is recorded**, local and remote alike, with its provenance.
6. **Every disclosure is recorded** — what left, where it went, under which
   authorization.
7. **Model swaps affect only future interpretation.** History is untouched by a
   route changing; a past interpretation keeps the model that produced it
   (Art. III §13).
8. **Never interprets.** The router reads no meaning from what it carries.
9. **Capability is discovered and recorded, never assumed** (§1).
10. **An output is an observation**, carrying provenance, never truth (Art. III §12,
    Art. XI §43).

Upholds Constitution Articles III (Models and Reasoning), VI §26 (the Execution
Plane holds no truth) and VIII §30–§32 (root of trust, local-first, minimized
disclosure).

---

## 5. Versioning rules

- **New routes and new providers** are added freely. They are configuration, not
  contract changes.
- **A recorded routing names the exact model version**, because "the same model" is
  not stable over time. An interpretation attributed only to a family name is
  attributed to nothing that can be checked later.
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

- **Remote route unreachable.** Fall back to a local route and record that the
  fallback happened. **The fallback is provenance, not an implementation detail**:
  an interpretation produced locally because the network was down is a different
  artifact from one produced remotely, and a reader must be able to tell.
- **Policy denies a disclosure.** Recorded with the reason, and **the router does
  not try a different remote route.** Rerouting around a denial is the same
  violation as an `Agent` decomposing a denied effect (`Agent.md` §4.5) — the
  denial was about the disclosure, not about the destination.
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

Never permitted: an unrecorded disclosure; disclosure without authorization;
routing around a denial; a hardcoded provider; presenting a model's output as truth;
re-running history to change it.

---

## 8. Examples

- **No network, still thinking.** The device is offline. Remote routes are
  `degraded`; a local route serves the request; the interpretation records that it
  was produced locally. Nothing about the loop stops, which is Art. VIII §31 as a
  behaviour rather than a slogan.
- **A disclosure that is asked about.** A reasoner wants a remote model to
  summarise a week of history. The router minimizes to what the request needs,
  `Policy` gates it, the user authorizes it, and what left the device is in the
  journal. Three months later it is answerable *exactly* what was disclosed.
- **A denial that is not rerouted.** The same disclosure is denied. The router
  records the denial and stops. It does not try a second provider, split the
  content, or fall back to a route with a weaker policy — the objection was to the
  data leaving, not to where it was going.
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

# Capability Model

> Status: Phase 1 architecture. Reviewed before implementation.
> Defines the permissioned surface through which Orb acts on the world.
> See `AGENT_RUNTIME.md`, `SECURITY.md`.

---

## 1. Purpose

A Capability is a **permissioned ability to act** — to send a message, create a
calendar event, read a sensor, call a remote model, write a file. Capabilities
are the only way the runtime touches anything outside its own derivation. They
are the boundary between Orb's reasoning and the real world.

> Constitutional law: *Capabilities are permissioned.*

---

## 2. Position in the Stack

```
Agent Runtime  →  Capability (permission gate)  →  Action  →  Observation
```

A Capability sits exactly on the boundary between the interpretation plane
(Decisions) and history (Actions become Observations). Nothing reaches the world
without passing through one.

---

## 3. Anatomy of a Capability

A Capability declares (binding interface frozen in Phase 3, `contracts/Capability`):

| Aspect | Meaning |
| --- | --- |
| `id` | Stable capability identifier. |
| `description` | Human-readable statement of what it does. |
| `permissionTier` | Authorization required to invoke (§5). |
| `inputs` | Typed inputs, all traceable to events/interpretations. |
| `effects` | Declared side effects on the world (what it changes). |
| `reversible` | Whether the effect can be undone, and how. |
| `recordsAs` | The Observation event(s) it appends after acting. |

A Capability **declares its effects honestly**. The runtime and the human reason
about a Capability by its declaration, not by inspecting its implementation.

---

## 4. Capabilities Are Sandboxed

- A Capability can do **only** what it declares. Undeclared effects are a defect.
- Capabilities are **composable** but not self-escalating: one cannot silently
  acquire another's permissions.
- Capabilities own no truth-state; any state they touch is external (the world)
  or recorded back as events.
- Read capabilities (sensors, model calls) and write capabilities (messaging,
  calendar) are distinguished, because they carry different risk.

---

## 5. Permission Tiers

Authorization scales with consequence and reversibility:

| Tier | Meaning | Example |
| --- | --- | --- |
| **Ambient** | Local, read-only, no external effect | Read the Evidence Graph. |
| **Observe** | Read external/sensor data | Read location, read calendar. |
| **Propose** | Produce a Decision/draft, no execution | Draft a follow-up message. |
| **Act (reversible)** | External effect that can be undone | Create a draft event. |
| **Act (irreversible)** | External effect that cannot be undone | Send a message, make a payment. |

- Higher tiers require explicit, **per-scope** authorization. Authorization for
  one scope is never authorization for all.
- Irreversible actions default to requiring human confirmation. *Orb extends
  human judgment; it preserves meaningful human control over important
  decisions.*
- Financial actions and anything that moves money or sends communications on the
  user's behalf are irreversible-tier by default.

---

## 6. Local-First Capabilities

- Every core capability must have a **local** implementation path. Orb must
  remain useful with no network.
- Remote capabilities (e.g. a hosted model, an external API) are **optional
  extensions**, never required for the core loop, and never introduce vendor
  lock-in (selected by configuration, behind an interface).

> Constitutional principle: *Cloud is replication, never authority* — and, by
> extension, never a hard dependency of core capability.

---

## 7. Every Action Is Recorded

When a Capability acts, it appends Observation event(s) describing:

- which Capability ran, with which inputs,
- the Decision/authorization that triggered it,
- the outcome (success/failure, external references produced),
- HLC + provenance.

This closes the loop: an Action becomes history, available to Reflection and to
future reasoning. There is no "silent" action.

---

## 8. Invariants

1. The runtime acts on the world **only** through Capabilities.
2. A Capability does only what it declares; effects are explicit.
3. Every Capability has a permission tier; higher consequence → higher tier.
4. Irreversible actions require explicit, per-scope human authorization by
   default.
5. Every core capability has a local implementation; remote ones are optional.
6. No capability self-escalates or hides effects.
7. Every Action is recorded back as an Observation.

---

## 9. Out of Scope

- Identity, key management, and the trust model behind permissions →
  `SECURITY.md`.
- The runtime that selects and invokes capabilities → `AGENT_RUNTIME.md`.
- The `Capability` and `Action` interfaces → Phase 3 contracts.

# Security

> Status: Phase 1 architecture. Reviewed before implementation.
> Defines the trust model, encryption, identity, and privacy posture.
> See `STORAGE.md`, `SYNC_PROTOCOL.md`, `CAPABILITY_MODEL.md`.

---

## 1. Purpose

Orb holds the most intimate record a person has: a continuous, decades-long
history of their life. Security is therefore not a feature but a precondition.
The trust model follows from local-first: **the user owns the data, the keys, and
the authority. Everything else is replication.**

> Constitutional law: *Cloud is replication, never authority.*

---

## 2. Trust Model

- **The user is the root of trust.** Authority over data lives with the user and
  their devices — never with any server, relay, or model provider.
- **Devices are trusted peers** of the user's own device set. A device proves
  membership cryptographically before it may replicate.
- **Relays/servers are untrusted** by design. They move ciphertext and must be
  assumed hostile/curious. They never hold keys or plaintext and never gain
  authority.
- **Model providers are untrusted** with raw history. Data sent to a remote model
  is a deliberate, permissioned, minimized disclosure — not a default.

---

## 3. Encryption

- **At rest:** the journal store and projection store are encrypted on every
  device (`STORAGE.md`). The store holds ciphertext.
- **In transit:** all replication and all remote calls use authenticated
  encryption. Relays see only ciphertext (zero-knowledge pipes).
- **Key custody:** keys are derived/held on-device and under user control. Loss
  and recovery are explicit user-facing concerns (recovery material, not a
  provider-held escrow that would create an authority).
- **Per-device keys + shared data key:** devices authenticate with their own
  identity keys; history is protected by a user-scoped data key shared only
  across the user's authenticated devices.

---

## 4. Device Identity & Enrollment

- Each device has a stable cryptographic **identity** (its lane is bound to that
  identity).
- Enrolling a new device into the user's set is an **explicit, authenticated**
  action initiated from an existing trusted device. There is no remote authority
  that can add a device.
- A device can only **write its own lane**. It cannot forge events into another
  device's lane; replicated lanes are verified by hash chain before trust
  (`SYNC_PROTOCOL.md`).

---

## 5. Integrity & Tamper-Evidence

- Per-lane **hash chaining** makes any mutation or corruption of history
  detectable.
- Events carry an integrity hash; replicated events are verified before
  acceptance.
- Because history is append-only and chained, **silent rewriting is
  cryptographically detectable**, which is the technical backbone of "history is
  never mutated."

---

## 6. Permissions & Action Safety

Security at the action boundary is the Capability permission model
(`CAPABILITY_MODEL.md`):

- Capabilities are sandboxed to their declared effects.
- Permission tiers scale with consequence; irreversible and financial actions
  require explicit, per-scope human authorization by default.
- Authorization is **scoped**, never blanket — approving one action is not
  approving a class of actions.

> Orb extends human judgment and preserves meaningful human control over
> important decisions.

---

## 7. Privacy Posture

- **Data minimization to models.** Remote reasoning receives the **least** data
  needed, by reference-resolution and redaction, never the raw journal. Each such
  disclosure is itself recorded as an event (what was sent, to whom, why).
- **Local-first reasoning is the default.** A local Reasoner must always be a
  viable path so that privacy does not require sacrificing capability
  (`AGENT_RUNTIME.md`).
- **Provenance includes disclosure.** Because model outputs and their inputs are
  recorded, the user can always audit *what left the device and what came back*.
- **No telemetry as authority.** Any operational telemetry is local-first and
  opt-in; it never becomes a source of truth or leaves without permission.

---

## 8. Threat Considerations (initial)

| Threat | Mitigation |
| --- | --- |
| Lost/stolen device | At-rest encryption; per-device keys revocable from the device set. |
| Hostile relay | Zero-knowledge transport; relay never holds keys/plaintext. |
| Tampered history | Hash-chained lanes; verification before trust. |
| Foreign event injection | Lane bound to device identity; only own lane writable. |
| Over-broad model disclosure | Minimization + per-disclosure recording + local default. |
| Capability abuse | Sandboxed effects + tiered, scoped authorization. |

A full threat model is iterated alongside implementation; this establishes the
posture, not the final catalogue.

---

## 9. Invariants

1. The user (and their devices) is the only root of trust and authority.
2. Journal and projections are encrypted at rest; transit is always encrypted.
3. Relays and model providers are untrusted and never hold keys or authority.
4. A device writes only its own identity-bound lane.
5. History is hash-chained and tamper-evident.
6. Remote disclosure is minimized, permissioned, and recorded.
7. Action authorization is tiered and scoped, never blanket.

---

## 10. Out of Scope

- Concrete cipher suites and key-derivation parameters → implementation-time
  specification, constrained by these invariants.
- Capability tier definitions → `CAPABILITY_MODEL.md`.
- Replication mechanics → `SYNC_PROTOCOL.md`.

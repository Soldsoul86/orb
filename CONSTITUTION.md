# Orb Constitution

> **Status: ratified — Phase 2.**
>
> These are the immutable laws of Orb. They change rarely and deliberately.
> Everything else in the system — architecture documents, contracts, and
> implementation — follows from them. Where a law is elaborated, the relevant
> document in `/docs` is named, but the law stands on its own.
>
> A law is amended only when a **fundamental flaw** is discovered, by explicit
> decision, recorded in version control. Convenience is never grounds for
> amendment.

---

## Preamble

Orb is a long-lived personal runtime that grows with its user over years rather
than conversations. Its intelligence comes from continuity, its foundation is
evidence, and its architecture is local-first, model-independent, and built to
evolve for decades. The laws below exist to protect those properties against the
pressure of short-term convenience.

---

## Article I — History

1. **Events are append-only.** The only write to history is an append.
2. **History is never mutated.** Events are never edited, reordered, or deleted.
3. **The Event Journal is the single source of truth.** All other state is a
   derived projection and may be discarded and rebuilt. *(`EVENT_MODEL.md`)*
4. **Every feature must be replayable from events.** Nothing of value exists that
   cannot be reconstructed from the journal.
5. **History is tamper-evident.** Lanes are hash-chained so that any corruption
   or rewriting is detectable. *(`SECURITY.md`)*

---

## Article II — Truth and Interpretation

6. **Orb never stores "truth."** It stores observations, evidence, and
   interpretations. Observations and evidence are historical records; facts,
   beliefs, and decisions are products of reasoning and may change.
7. **Separate history from interpretation.** History is immutable; interpretation
   is continuously evolving. The value of Orb comes from preserving both.
8. **Every belief must reference evidence.** No interpretation exists without a
   path back to the evidence and events that ground it. *(`EVIDENCE_GRAPH.md`,
   `DIGITAL_TWIN.md`)*
9. **Understanding is always recomputable.** The interpretation layer can be
   rebuilt from history at any time and holds no source-of-truth state.
10. **Every decision is explainable.** Any conclusion or action can be traced to
    its interpretations, evidence, and reasoning provenance.

---

## Article III — Models and Reasoning

11. **Models are replaceable.** Reasoning engines are interchangeable; they
    contribute intelligence but never define the architecture. No model provider
    is hardcoded. *(`AGENT_RUNTIME.md`)*
12. **Model outputs are historical observations.** Every model-generated artifact
    is recorded immutably with full provenance — provider, model version, prompt
    template version, input references, parameters, timestamp, and execution
    environment — and is thereafter treated as an observation, never as truth.
13. **Replay reproduces history, not intelligence.** Replay guarantees
    reconstruction of history and provenance; it does not guarantee identical
    reasoning. Orb reproduces history; it does not freeze intelligence.

---

## Article IV — Distribution

14. **Devices are equal peers.** No device is authoritative.
15. **Every device owns its own append-only lane** and writes only that lane.
16. **Cloud is replication, never authority.** Servers and relays move ciphertext
    and hold no authority and no keys. *(`SYNC_PROTOCOL.md`, `SECURITY.md`)*
17. **Global ordering is derived, never stored.** Order is computed from Hybrid
    Logical Clocks on read; persisting a global order would reintroduce an
    authority. *(`EVENT_MODEL.md`)*
18. **Merge never rewrites history.** Replication is the set union of immutable
    lanes; semantic contradictions are resolved in interpretation, never in
    history.

---

## Article V — The Runtime

19. **Orb is a continuous-observation system, not a request-response system.**
    *(`RUNTIME_LOOP.md`)*
20. **Nothing is "live."** Everything is eventually observed; everything
    eventually becomes evidence; everything eventually becomes knowledge;
    everything eventually becomes action.
21. **The runtime owns execution.** The runtime schedules work. Agents are
    workers and do not wake randomly.
22. **Agents never own state.** All state lives in events and projections; an
    agent restarted loses nothing.
23. **The loop never skips a stage.** Priority orders work; it never omits it.

---

## Article VI — The Three Planes

24. **Three planes exist:** the **Reality Plane** (the external world), the
    **Knowledge Plane** (journal, evidence, twin, beliefs), and the **Execution
    Plane** (agents, capabilities, actions, schedulers, policies).
25. **Only the Execution Plane acts on Reality**, and only through permissioned
    Capabilities. The Knowledge Plane holds no power to act.
26. **The Execution Plane holds no truth.** It reads the Knowledge Plane and
    writes back only by producing new observations.

---

## Article VII — Capabilities and Human Agency

27. **Capabilities are permissioned.** The runtime touches the world only through
    Capabilities, each declaring its effects and permission tier.
    *(`CAPABILITY_MODEL.md`)*
28. **Orb extends human judgment.** It preserves meaningful human control over
    important decisions; irreversible actions require explicit, scoped
    authorization by default.
29. **Every action is recorded.** An action, once taken, is appended to history
    as a new observation. There are no silent actions.

---

## Article VIII — Ownership and Trust

30. **The user is the root of trust.** Authority over data and keys lives with the
    user and their devices, never with any server or provider. *(`SECURITY.md`)*
31. **Local-first always.** Every core capability has a local implementation; Orb
    remains useful with no network. Remote services are optional extensions and
    never introduce vendor lock-in.
32. **Disclosure is minimized, permissioned, and recorded.** Data leaving the
    device is the least necessary, explicitly authorized, and itself recorded as
    history.

---

## Article IX — Engineering

33. **Never duplicate sources of truth.** There is one journal; everything else
    derives from it.
34. **Never bypass the Event Journal.** All history enters through it.
35. **Every module must be independently testable** and must compile
    independently.
36. **Build the simplest correct implementation** that preserves the long-term
    architecture. Never optimize prematurely.

---

## Article X — The Kernel

37. **The kernel evolves through addition, never through mutation.** New
    capability arrives as new contracts or new versions alongside the old — never
    by changing the meaning of an existing contract. *(`KERNEL.md`)*
38. **Breaking changes require a new version.** Orb v1 contracts remain valid
    forever; a contract accepted at v1 is permanent.
39. **The architecture is versioned with the discipline of an operating-system
    kernel.** Implementations are replaceable; the kernel is not.
40. **Persistent state shall never depend on a running process.** A State
    contract depends only on other State (or on nothing); it never depends on a
    Service. The derivation a Service performs is referenced through the immutable
    record it produced, never through the live Service. This guarantees that
    history is always replayable, independent of any process. *(`KERNEL.md`)*

---

## Article XI — Reality and Confidence

41. **Observations originate from reality; Events originate from runtime
    activity.** Many Observations produce Events; not every Event produces an
    Observation. A reasoning step, a plan, or the issuance of an Action are
    runtime activity recorded as Events — they are not, in themselves,
    Observations. *(`Observation.md`)*
42. **Reality is updated only through observation.** Orb never assumes an Action
    changed reality. The runtime loop closes only when a Sensor confirms that
    reality occurred as expected; an issued Action that is never confirmed never
    updates reality. *(`RUNTIME_LOOP.md`)*
43. **An Observation owns confidence, not truth.** Every Observation carries a
    Confidence of Reality in `[0, 1]` describing the reliability of its
    perception. Truth never exists inside Orb; confidence is recorded faithfully,
    never resolved into certainty and never silently upgraded. *(`Observation.md`)*

---

> The architecture is permanent. The implementation is replaceable.
> When in doubt, preserve history, preserve provenance, preserve human agency.

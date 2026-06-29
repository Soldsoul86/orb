# Orb Constitution

> **Status: placeholder — authored in Phase 2.**
>
> This document will contain the immutable laws of Orb. The constitution changes
> rarely; everything else in the system follows from it. It is intentionally left
> as a stub during Phase 0 (Foundation) and Phase 1 (Architectural Documents) so
> that the laws are ratified deliberately, not drafted in passing.

Pending laws (to be ratified in Phase 2) include, at minimum:

- Events are append-only.
- History is never mutated.
- Every belief must reference evidence.
- Cloud is replication, never authority.
- Models are replaceable.
- Capabilities are permissioned.
- Agents never own state.
- Understanding is always recomputable.
- Every decision is explainable.
- Every module must be independently testable.

### Laws decided during Phase 1 framing (carry into Phase 2 ratification)

These were resolved explicitly by the project owner before Phase 1 and must be
ratified verbatim-in-spirit when the constitution is authored:

- **Separate history from interpretation.** History is immutable; interpretation
  is continuously evolving. The value of Orb comes from preserving both.
- **Orb never stores "truth."** It stores observations, evidence, and
  interpretations. Observations and evidence are historical records; facts,
  beliefs, and decisions are products of reasoning and may change as evidence
  accumulates.
- **Replay reproduces history, not intelligence.** Replay guarantees
  reconstruction of history and provenance. It does not guarantee identical
  reasoning. Events and evidence are deterministic; understanding is not.
- **Model outputs are historical observations.** Every model-generated artifact
  is recorded immutably with full provenance (provider, model version, prompt
  template version, input references, parameters, timestamp, execution
  environment) and thereafter treated as an observation, never as ground truth.
- **Devices are equal peers.** Every device owns its own append-only event lane.
  No device is authoritative. Global ordering is derived (via Hybrid Logical
  Clocks), never stored. Merge never rewrites history.

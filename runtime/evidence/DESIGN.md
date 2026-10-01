# Design — @orb/evidence

**A view, not a structure.** `@orb/journal`'s `lineage` already reads `causes` in both directions, safely.
This package adds what the graph is for — what each node *is* and the five questions in the vocabulary of
Observations — and walks nothing itself. One definition of "built on".

**Nodes are events; the one edge is `causes`.** `EVIDENCE_GRAPH.md` inv. 1 and 2. Source and attachment are
*values* of an Observation (`Observation.md`: the source is a value, not a kernel contract), so attribution
and holding are lookups, not nodes.

**Never stored.** A graph on disk would be a copy of history outside history and would outlive an erase.

**Answers say how far to trust them.** `closed` / `unresolved` on every answer. A root not held, a cause not
held, an event whose stated lineage is unreadable, an Observation whose payload is not held: each is *named*
and makes the answer a lower bound. An empty list is only ever returned `closed` when it is true.

**Forward questions are stricter than lineage's.** An event that cannot say what it cites might cite the root,
and nothing records that it does — so `dependentsOf` / `observationsOf` name every such event.

**Time is occurrence.** `occurredAt` is the earliest *held* cited event's clock; an Observation written weeks
after the capture is placed at the capture. With no held cause it falls back to its own recording time and
is flagged `occurredAtKnown: false`.

**No content.** A node has identity, kind, clocks, `causes` and — for an Observation — source, confidence and
attachment identities. There is no field for an Observation's `data`, so none can leak; a test greps the output.

**Known limits.** A v2 envelope not presented with its payload has the coarse type `orb.content`, so it is
`other` here and cannot be seen to be an Observation (its lineage is reported as unreadable instead). Cost is
linear per question. No `Evidence` events are read — no event shape exists yet.

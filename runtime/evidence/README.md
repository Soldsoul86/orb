# @orb/evidence

The Evidence Graph (`docs/EVIDENCE_GRAPH.md`): a **typed view over the journal's lineage**, built per
question and never stored. Provenance only for now — `supports` / `contradicts` wait for a second source
(`docs/PHONE_BRAIN.md` B2b).

```ts
const g = buildGraph(await journal.readLane(lane));
g.provenance(id)            // what this rests on, typed, with `closed`
g.observationsOf(eventId)   // was it observed
g.dependentsOf(id)          // what was built on it (an erase's blast radius)
g.fromSource("orb.sensor.assist", { from, to })   // by when it HAPPENED
g.holding(attachmentIdentity)
```

Depends on `@orb/journal` (lineage) and `@orb/observation`. The phone's Kotlin port (`runtime/brain`) is
held to this by shared vectors.

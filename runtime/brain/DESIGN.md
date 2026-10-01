# Design

**Functional core, imperative shell.** The brain takes the lane's lines in and returns data out. It
writes nothing, reads nothing it was not handed, and has no clock. `Observe` (Java, in the app) is the
only shell: it reads the lines, asks, and appends.

**Idempotent by citation.** An event is *observed* when some Observation cites it in `causes`. No
marker, no table, nothing beside the journal — so nothing to drift and nothing that outlives an erase.

**Cannot check is not fine.** Any unreadable line means *no plan at all*, reported as a count. The
shell records `orb.observe.failed` (a reason and a count) so an export can tell "nothing to observe"
from "the brain did not run".

**A strict reader (`Json`).** Safe integers only; refuses fractions, exponents, duplicate keys, raw
control characters, bad escapes, trailing data and nesting past 64. The journal's encoder cannot
produce any of these, so meeting one means the line is not what the journal wrote.

**Translation never interprets.** A field of the wrong type is left out, never coerced; the sealed text
is reachable only as an identity. The same rules as `packages/device-watch/src/assist.ts` and
`share.ts`, which compute the vectors this is checked against.

**Known stricter-than-TypeScript behaviour.** A line holding a fraction or an integer past 2^53 is
refused whole here (TypeScript would read it and leave the field out). The journal cannot write either.

**The graph (`Graph.kt`).** The Kotlin twin of `@orb/evidence`: a typed view over lineage, never stored, with
the walks of `lineage.ts` step for step (BFS, visited set, unheld causes *named*, events that cannot say what
they cite *named*), so there is one meaning of "built on" and two implementations held to it by vectors.
A journal line that cannot be read is named in every answer (`line:N`) and makes it a lower bound — never skipped.
One line reader (`Lines.kt`) serves the Observer and the graph, so they cannot disagree about what a line says.

**Not here:** package-scan (`grants.*`) Observations stay translated on the laptop; no `Evidence`
events are produced; no entities, no model.

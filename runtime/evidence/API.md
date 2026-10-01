# API

`buildGraph(events): EvidenceGraph` — events as `Journal.readLane` presents them.

`EvidenceGraph`: `node(id)`, `nodes()`, `provenance(id)`, `observationsOf(id)`, `dependentsOf(id)`,
`fromSource(sensor, window?)`, `holding(identity)`.

`Answer<T> = { value, closed, unresolved, scope }`. `GraphNode = { id, kind, type, lane, device, hlc,
recordedAt, causes | undefined, source?, confidencePercent?, attachments? }`. `NodeKind = "observation" |
"device-event" | "other"`. `Occurrence = { node, occurredAt, occurredAtKnown }`. `Window = { from?, to? }`
(inclusive). `sourceMatches(source, sensor)`: the same name, or that name at an install.

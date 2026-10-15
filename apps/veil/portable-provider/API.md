# API

`Provider(database, service_origin, local=False, clock=time.time)`; `handle(path, data)` returns HTTP status and JSON. `open_verifier.state(compactJws, pinnedIdentifier, minimumRevision)` verifies signed state offline. Full wire contract: [OPEN_PROTOCOL.md](../OPEN_PROTOCOL.md). Keep independent DBs; never share a volume between providers.

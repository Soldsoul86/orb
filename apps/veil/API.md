# Interfaces

The application exposes no public Android content provider or message export endpoint. `MainActivity` is the launcher; `Messenger` coordinates local storage, Signal sessions and HTTPS transport. See `app/src/main/java/chat/veil/`.

Relay endpoints: POST `/v1/boxes` creates independently authorized read/write capabilities; PUT `/v1/boxes/{box}/messages/{id}` queues an opaque encrypted envelope with the writer capability; GET `/v1/boxes/{box}/messages` returns the oldest envelope with the reader capability; DELETE on a message acknowledges it. DELETE on a box revokes the inbox. Requests use HTTPS and bearer capabilities. The relay never receives decryption keys.

Details, bounds and failure semantics: [architecture](docs/ARCHITECTURE.md). No Orb runtime API is changed.

Purpose extension: the additive [`/v2` contract](docs/purposes/API.md) defines opt-in directory search, exact alias lookup, purpose policies, single-use contact slots, encrypted introductions and scoped grants. The Android Activity also accepts purpose invitation deep links; lookup/request still requires unlock and explicit user action. No new content provider or message export endpoint is introduced.

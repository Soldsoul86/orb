# API — @orb/observation

```ts
interface Observation<Data> {
  source: string;               // inv. 3 — always attributed
  confidencePercent: number;    // inv. 7 — integer 0–100
  data: Data;                   // an occurrence, never a verdict
  attachments?: string[];       // inv. 5 — identities, never bytes
}
```

```ts
observationDraft<Data>(observation, causes?): EventDraft<Observation<Data>>
```
Builds the Event draft, throwing `InvalidObservation` rather than recording one
that breaks an invariant: an empty `source`, a `confidencePercent` that is not an
integer 0–100, an attachment reference that is not scheme-tagged, or raw bytes
anywhere in `data` (the error names the path). `causes` is the journal's lineage
— for a connector synthesis, the id of the call event.

```ts
percentFromConfidence(confidence: number): number   // 0.97 → 97
confidenceFromPercent(percent: number): number      // 97 → 0.97
```
`percentFromConfidence` refuses anything outside `[0, 1]` and anything needing
more than two decimals. `0.947` throws rather than rounding to `95`.

```ts
isObservation(event: StoredEvent): boolean
readObservation<Data>(event: StoredEvent): Observation<Data> | null
```
`readObservation` returns `null` when the payload is not held — *cannot say*, not
*no observation*. `isObservation` still answers true for such an event, because
it is still an Observation and still history.

```ts
OBSERVATION_TYPE = "orb.observation"
OBSERVATION_SCHEMA = { id: "orb.observation", version: 1 }
class InvalidObservation extends Error {}
```

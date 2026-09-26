# API — @orb/device-watch

```ts
project(events: readonly StoredEvent[]): DeviceAuthority
```
Folds the journal into current holdings, the changes seen, which have been
raised, and how each was answered. Derived, disposable, rebuildable. An event
whose payload is not held contributes nothing and is not an error — a partial
replica sees less, which is not the same as there being less.

```ts
interface Holding { kind: string; holding?: string[]; unreadable: boolean }
```
`holding` is absent when the last reading of that kind could not be taken.
Never `[]` — *cannot check* is not *nothing is enabled*.

```ts
alertsFor(state: DeviceAuthority): readonly PendingAlert[]
```
The one rule: a change in what holds power is worth surfacing. Baselines and
unreadable kinds never reach it. Reads `state.raised`; deliberately does not read
`state.answers` (DR-8).

```ts
raiseAlerts(journal): Promise<readonly OrbEvent<AlertRaised>[]>
answerAlert(journal, alertEventId, "acknowledged" | "dismissed")
```
`raiseAlerts` is idempotent — twice raises once, and across restarts, because the
alerts are journaled. Alerts cite their Observation in `causes`; answers cite
their alert.

```ts
ALERT_RAISED_TYPE   = "orb.alert.raised"
ALERT_ANSWERED_TYPE = "orb.alert.answered"
CHANGE_RULE         = "device-watch.authority-changed"
```

```ts
parseExport(text: string): readonly StoredEvent[]
importExport(journal, text): Promise<ImportResult>
```
A pass-2 export becomes a replica of the phone's lane plus Observations in this
device's lane. `parseExport` throws `ImportError` naming the line on anything that
is not an event envelope — a partly-imported chain is a gap that looks like
history. `importExport` is idempotent: `replicate` skips by event id, translation
skips readings already cited.

The Observation's `source` is `pass2@<device>` — inv. 3 asks what *perceived* it,
which was pass 2 on the phone, not the importer that carried it.
`confidencePercent` is 100: there is no inference, the value is what the OS
returned, and a read that failed is carried as `readable: false` rather than
smeared into a lower number.

```ts
interface DeviceAuthorityReading {
  kinds: { kind, readable, holding?, baseline, gained?, lost? }[];
  because: string;
}
```
The `data` of the Observation this reads. Mirrors what `apps/pixel/pass2`
records. The transport that carries it from the phone into this runtime does not
exist yet.

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
interface DeviceAuthorityReading {
  kinds: { kind, readable, holding?, baseline, gained?, lost? }[];
  because: string;
}
```
The `data` of the Observation this reads. Mirrors what `apps/pixel/pass2`
records. The transport that carries it from the phone into this runtime does not
exist yet.

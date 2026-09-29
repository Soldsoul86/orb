# API — @orb/device-watch

```ts
project(events: readonly StoredEvent[]): DeviceAuthority
```
Folds the journal into current holdings, the changes seen, which have been
raised, and how each was answered. Derived, disposable, rebuildable. An event
whose payload is not held contributes nothing and is not an error — a partial
replica sees less, which is not the same as there being less.

```ts
interface Holding { kind: string; holding?: string[]; unreadable: boolean; scope?: string }
```
`holding` is absent when the last reading of that kind could not be taken.
Never `[]` — *cannot check* is not *nothing is enabled*.

`scope` is what kind of look produced the set, for a kind where the platform
offers more than one. Only `installedPackage` has one: `all` when pass 2 holds
`QUERY_ALL_PACKAGES`, `visible` when the list was filtered, `unknown` when the
check itself threw. Absent for the grant kinds, which are whole or unreadable with
nothing between. A reader must not compare sets across scopes, and pass 2 does not
— `Grants.previous` re-baselines instead, so a `gained` or `lost` that reaches
here was taken under one scope.

```ts
alertsFor(state: DeviceAuthority): readonly PendingAlert[]
ruleFor(kind: string): string
```
Two rules, one mechanism. A change in what holds power is
`device-watch.authority-changed`; a change in the installed-package set is
`device-watch.packages-changed`, because an app appearing is **not** an app being
granted power and an alert must not say it is. `ruleFor` is the mapping. Baselines
and unreadable kinds never reach either. Reads `state.raised`; deliberately does
not read `state.answers` (DR-8).

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
PACKAGE_RULE        = "device-watch.packages-changed"
```

```ts
parseExport(text: string): readonly StoredEvent[]
importExport(journal, text): Promise<ImportResult>
GRANTS_OBSERVED_TYPE = "grants.observed"   // the three grants, every wake
GRANTS_PACKAGES_TYPE = "grants.packages"   // the package set, on a scan
SHARED_TYPE          = "orb.shared"        // one hand-off from the phone's share sheet
SHARE_SENSOR         = "orb.sensor.share"  // the source, as `orb.sensor.share@<device>`
shareFrom(payload): ShareTranslation | null // the mapping, exposed for tests
```
A pass-2 export becomes a replica of the phone's lane plus Observations in this
device's lane. `parseExport` throws `ImportError` naming the line on anything that
is not an event envelope — a partly-imported chain is a gap that looks like
history. `importExport` is idempotent: `replicate` skips by event id, translation
skips readings already cited.

The Observation's `source` is `pass2@<device>` for a grants reading and
`orb.sensor.share@<device>` for a share — inv. 3 asks what *perceived* it, which
was the phone, not the importer that carried it. (`pass2` names the app that first
wrote grants readings; the consolidated app writes them too, so the label is
stale — recorded in `STATE.md`.)

A share's `data` keeps the phone's own field names (`references`, `resolved`, …),
its `attachments` holds the stored content's identity and never the bytes, its
`confidencePercent` is 100 for the *occurrence* and never the content, and
`references` is carried whole — it is colon-joined and never split. The full
field-by-field mapping is `docs/SENSOR_SHARE.md` §4 and §4a.
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
records. `importExport` above carries it from the phone as a file; a live sync
does not exist yet.

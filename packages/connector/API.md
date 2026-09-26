# API — @orb/connector

```ts
recordCall<Item>(
  journal: Journal,
  driver: ConnectorDriver<Item>,
  scope: FetchScope,
): Promise<CallOutcome<Item>>
```
Runs one fetch and journals it as `orb.connector.call` on every path. Never
rethrows: a failure becomes `outcome: "threw"`, a refusal `"denied"`. Returns the
fetched items (or `null`) and the `eventId` of the call, so anything derived from
the fetch can cite it.

```ts
interface FetchScope {
  connector: string;   // "gmail", "calendar", "drive"
  query: string;       // recorded — a query is an outbound disclosure
}

interface FetchResult<Item> {
  items: readonly Item[] | null;   // null means the source said nothing
}

interface ConnectorDriver<Item> {
  fetch(scope: FetchScope): Promise<FetchResult<Item>>;
}

class ConnectorDenied extends Error {}   // the other side refused
```

```ts
interface ConnectorCall {
  connector: string;
  query: string;
  outcome: ReadOutcome;
  count?: number;     // omitted where a count is not a fact
  failure?: string;   // the error's own words, under threw or denied
}
```
Content-free by construction: there is nowhere to put a fetched item.

```ts
type ReadOutcome = "value" | "empty" | "absent" | "threw" | "denied";

outcomeOf(items: readonly unknown[] | null | undefined): ReadOutcome
answered(outcome): boolean   // value | empty — the source told us its contents
unknown(outcome): boolean    // absent | threw | denied
```
`empty` and `absent` are never merged. `outcomeOf(null)` is `absent`;
`outcomeOf([])` is `empty`.

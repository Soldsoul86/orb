# Action Lock — API

## Library

```ts
import { createActionLock } from './src/lock.ts';
import { inMemoryJournal } from './src/journal.ts';
import { ruleBasedAnalyzer } from './src/severity.ts';
import { DEFAULT_POLICY } from './src/policy.ts';

const lock = createActionLock({
  clock: () => Date.now(),
  journal: inMemoryJournal(() => Date.now()),
  analyzer: ruleBasedAnalyzer,     // any SeverityAnalyzer
  executor: { execute: async (action) => ({ ref: '…' }) },
  initialPolicy: DEFAULT_POLICY,
});
```

| Method | Effect | Fails when |
|---|---|---|
| `submit(action, context)` | Analyses, decides the gate, records `ActionRequested` + `ActionGated`. Returns the held action. | Duplicate `action.id` (throws) |
| `stop(id, by?)` | Records `ActionStopped`. The action will never run. | Already released, executed or stopped ("too late") |
| `unlock(id, method?)` | Records `ActionUnlocked` for an `unlock` gate. | Gate is not `unlock`; already unlocked |
| `confirm(id, by)` | Records `SecondPersonConfirmed` for a `second_person` gate. | Gate is not `second_person`; `by` is `'user'` |
| `proposePolicy(policy)` | Records `PolicyChangeProposed`, effective after the **active** policy's `loosenDelaySeconds`. Tightening applies at once. | — |
| `tick()` | Releases every action whose buffer is over and whose unlocks are present, then runs the executor. Returns released ids. | Executor errors are recorded as `ActionFailed`, not thrown |
| `state()` | Current state, identical to `fold(initialPolicy, journal.all())`. | — |

`stop`, `unlock` and `confirm` return `{ ok: true }` or `{ ok: false, reason }`.

### Interfaces to implement

```ts
interface SeverityAnalyzer { analyze(action: Action, context: Context): Analysis }
interface Executor        { execute(action: Action): Promise<{ ref: string }> } // idempotent on action.id
interface Journal         { append(event: NewEvent): LockEvent; all(): readonly LockEvent[] }
```

### Pure functions

| Function | Module |
|---|---|
| `stricter(a, b)`, `modeRank(mode)` | `gate.ts` |
| `decide(policy, action, context, analysis)` | `policy.ts` |
| `decideAt(policyState, now, action, context, analysis)` | `policy.ts` |
| `apply(state, event)`, `fold(policy, events)`, `canRelease(held, now)`, `waitingFor(held, now)` | `state.ts` |

## Demo HTTP API (`src/server.ts`)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/` | — | Phone page |
| GET | `/api/state` | — | Presets, policy summary, all actions |
| POST | `/api/actions` | `{ "preset": "newPayee" }` | State after submitting |
| POST | `/api/actions/:id/stop` \| `unlock` \| `confirm` | — | State + `result`; 409 if refused |
| POST | `/api/policy` | `{ "change": "loosen" \| "tighten" }` | State after proposing |

The demo is for local use only: no authentication, in-memory state.

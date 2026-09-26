# Tests — @orb/connector

`npm test -w @orb/connector` — 9 tests, no network.

## What they pin

**The ladder keeps five answers apart.** `outcomeOf(null) !== outcomeOf([])` is
asserted directly rather than implied, because merging them is the failure this
package exists to prevent and it is one character away at all times.

**A call is recorded on every path.** One test runs all five outcomes in sequence
and asserts the journal holds exactly five calls in that order. It is the test
that would catch a refactor deciding a failed fetch is not worth an event.

**The record is content-free.** Asserted by searching the serialised call for a
field that only a fetched item has, rather than by reading the type — a type says
what should be there, a serialisation says what is.

**A count is omitted, not zeroed.** `"count" in call` is the assertion, because
`count === undefined` passes whether the key is missing or explicitly undefined,
and only one of those survives JSON.

## Negative controls, verified to fail

| mutation | tests that fail |
| --- | --- |
| `absent` collapsed into `empty` | 3 |
| a `count: 0` invented for `absent` | 1 |
| a failure rethrown instead of recorded | 4 |

## Not tested here

Any provider. The driver is injected, so nothing in this suite reaches a network
and no test can fail because of one. What a real Gmail driver returns is its own
concern, and its faithfulness to *never invent* is the thing to test where it is
written.

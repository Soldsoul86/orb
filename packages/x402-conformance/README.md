# @spendcap/x402-conformance

Does an x402 client do the right thing when it **cannot tell whether the money
moved**?

```bash
npm install --save-dev @spendcap/x402-conformance
```

Seven properties, one scriptable facilitator, and an adapter small enough to
put any client under. It is not a test suite for one implementation — it is
the same seven questions asked of each, side by side.

```
      reference  guarded
P1    FAIL       ok         a lost response does not become a second payment
P2    FAIL       ok         settlement_pending is not a fresh challenge
P3    n/a        ok         a response with no payment header is unresolved
P4    n/a        ok         a terminal failure frees the budget
P5    n/a        ok         a refused re-presentation stays unresolved
P6    ok         ok         different terms are a different purchase
P7    n/a        ok         an unreadable settle response is unresolved
```

`n/a` is not a failure: those properties ask about a ledger, and a client
without one has nothing to answer with.

## Three outcomes, not two

Every property here follows from one claim: a settle response resolves to
**settled**, **failed**, or **unresolved** — and the third is real.

| Outcome | May re-sign | May free budget | May record the spend |
|---|---|---|---|
| `settled` | no | no | **yes** |
| `failed` | **yes** | **yes** | no |
| `unresolved` | no | no | no |

The `unresolved` row is the whole package. Settling records money that may not
have moved; reversing frees money that may be gone. Both are wrong, and a
client that collapses the row into `failed` pays twice.

That taxonomy is not ours. Three independent efforts land on it:
`@spendcap/policy`'s reconciler answers SETTLED / NOT_SPENT / UNKNOWN,
[`scvd-defects`](https://www.npmjs.com/package/scvd-defects) answers settled /
failed / unresolved, and
[x402-foundation/x402#3325](https://github.com/x402-foundation/x402/pull/3325)
proposes six wire states whose terminal/non-terminal split is the same line
drawn finer. This harness tests against the outcome rather than any one
protocol version, so it keeps working whether or not `status` lands.

## Usage

```ts
import { runBattery, compare } from "@spendcap/x402-conformance";

const report = await runBattery("my-client", {
  // The harness owns the signing scheme so it can count authorizations --
  // signing is where a double-spend happens.
  paying: (scheme, serverFetch) => {
    const pay = buildYourClient(scheme, serverFetch);
    return (url) => pay(url);
  },
  // Optional. Without it, the four ledger properties report n/a.
  ledger: async () => ["PENDING"],
});

console.log(compare([report]));
```

The harness never asks the client what it thinks happened. It reads the
facilitator's settlement count and the client's own ledger, because a client
that is wrong about what happened will report that wrongness confidently.

## Faults you can script

`scriptedServer()` settles each nonce exactly once — the single fact every
property rests on. Arm a fault and it applies to the next signed request:

| Fault | What it models |
|---|---|
| `lose-response-after-settling` | The money moved; the response never arrived |
| `pending-402` | Settled, then a 402 carrying `settlement_pending` |
| `no-payment-header` | 200 with nothing said about the outcome |
| `unreadable-header` | 200 with bytes that are not a payment response |
| `settle-failed` | Terminal refusal; nothing moved |
| `reject-replay` | A facilitator refusing a nonce it already consumed |
| `reprice` | New terms, therefore a new purchase |

Only the network and the signature are simulated. The 402 challenge, the
headers and their codecs are the real `@x402/core` ones, so a client cannot
pass by talking to a shape we invented.

## The negative control

A battery its own author's implementation always passes is measuring nothing.
`check.mjs` therefore runs a deliberately wrong client — one that resolves
optimistically, treating anything but a clean 200 as "nothing moved" — and
asserts that **five of the seven properties fail it**.

That control has already earned its place. The first draft of P5 and P7 only
rejected a wrongly-*reversed* reservation, which let the naive client pass by
making the opposite mistake: recording a settlement on bytes it could not
read. Both errors cost money. A property that names only one of them is half a
property.

Apache-2.0.

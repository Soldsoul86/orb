# Design — `@orb/executor-app`

## 1. The composition root

`wiring.ts` is the only place that constructs anything. Nothing below it reaches
for a global — not the clock, not `fetch`, not `process.env`. That is what lets
the acceptance tests build *the same executor* with scripted ports and assert on
real behaviour rather than on mocks.

## 2. Safety is structural, not procedural

The interlock could have been a runtime check. Instead the mode decides which
*type* of port is constructed:

- `live` builds an `ExchangeClient` with a `Wallet`.
- `paper` builds a `PaperExchangePort` — no wallet, no `/exchange` path.
- `dry_run` builds a `DryRunExchangePort` that refuses every write.

A configuration error in paper mode cannot place an order, because there is no
code path from a paper port to a signed request. The three-variable interlock
then guards the one mode that *can*.

## 3. Startup order is a safety property

```
1. load the kill switch      — it may forbid everything that follows
2. reconcile with the exchange — discover what is actually open
3. attach monitoring          — before anything else can happen
4. evaluate the hard threshold on every rediscovered position
5. only then schedule, and only then open the API
```

Step 4 is the one that is easy to omit. A position that breached while the
process was down must close **now**, not on whatever tick happens to arrive
next. An acceptance test restarts into an already-breached position and asserts
it closes without any tick being delivered.

The API opens last: accepting a signal before reconciliation would mean opening
a position into an unknown state.

## 4. Secrets

`NAME_FILE` is preferred over `NAME`. A file path keeps the secret out of the
process environment, where anything that can read `/proc` or inspect a container
can see it.

`describeConfig` is built by **naming** the fields to include, not by removing
secrets from a copy. A field added later cannot leak by being forgotten, and a
test asserts the shape is closed.

## 5. The API is small on purpose

Every endpoint that exists is an authority someone can reach. So there is no
order endpoint, no threshold endpoint, no "force" flag, and no way for the
signal secret to touch the kill switch.

Authentication ordering matters: the signature is verified first, then the rate
limit is applied, then the nonce is consumed. Rate limiting after authentication
means an unauthenticated caller cannot exhaust a legitimate caller's budget.
Consuming the nonce last means a request rejected for rate limiting can be
retried with the same nonce.

A duplicate signal returns **200, not an error**. A provider retrying after a
timeout has done the right thing and must not be told it failed.

## 6. Market data: socket first, REST underneath

Both paths emit the same `MarkPriceTick`, so the sentinel cannot tell them
apart — which is the point. Losing the socket degrades *latency*, not
correctness.

Health is a judgement about **data**, not about socket state: a connected socket
delivering nothing is unhealthy. That distinction is what catches a half-open
connection.

The REST poll runs unconditionally rather than only when the socket is down,
because "the socket says it is fine" is exactly the claim we do not trust.

## 7. The paper exchange models position management, not microstructure

Fills are immediate and at the reference price. Slippage, queue position and
partial-fill dynamics are **not** modelled. A paper result is a test of the
executor's logic, never an execution estimate — and the code says so.

It does faithfully reproduce the constraints that matter for correctness:
reduce-only orders are rejected when there is nothing to reduce or when they
would increase a position, and stop orders rest rather than filling.

## 8. Trade-offs

| Decision | Cost | Why |
| --- | --- | --- |
| HMAC rather than mTLS or OAuth | Shared-secret management | No PKI to operate for a single-provider integration; the secret never leaves two processes |
| Nonce cache in memory | A restart forgets nonces | The timestamp window bounds the exposure to `maxSkewMs`; persisting it would add a failure mode to the request path |
| Rate limit per *scope*, not per caller | One noisy provider throttles itself | There is one signal provider. Per-caller identity would need caller identity, which is more surface |
| The executor starts before the API | A slow reconcile delays readiness | Correct: accepting signals into an unknown position state is worse |
| `unhandledRejection` engages the kill switch | An aggressive response to a bug | In a trading process an unhandled rejection means some path did not run. Failing closed is the only safe reading |

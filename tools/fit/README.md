# tools/fit

The **fit probe**: runs the phone's own reading rules (`MessagesFile` → `LoopFit` → normalizer → interpreter) over a
real message backup on a desktop JVM and prints **counts and nothing else**. It is the container-side twin of the
Sources screen's fit paragraph, so a rule can be iterated against the real inbox without a phone round-trip.

```
tools/fit/probe.sh <messages-backup.json|xml>
```

Needs a JDK. It compiles the app's sources through `apps/pixel/orb/tests/run.sh` (one source list, not two) and
takes about fifteen seconds.

Output: the six-way **disposition** of every service message (`LOOP` · `CLOSURE_CANDIDATE` · `LEDGER_ONLY` · `NOT_A_LOOP` · `AMBIGUOUS` · `UNMAPPABLE`, summing to the service total); the ledger the phone would show; what Keep would seal; messages / service / conversational counts; every count by name; the share unmapped; the brands (non-numeric
sender ids) and brand pairs the rules could not place; the sender-mark simulation (candidates, what quieting them
would hide); and a roles-sum check that must say `ok`.

**Not a held-out measure.** Rules tuned against one inbox and measured on the same inbox overstate how well they
generalise. The protocol's freeze bar (`docs/LOOP_PROTOCOL.md`) is judged on messages the rules have not seen.

See [DESIGN](DESIGN.md), [API](API.md), [TESTS](TESTS.md).

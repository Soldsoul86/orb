# Tests

`tests/graph.test.ts` — 28 checks over an in-memory journal whose clock the test sets.

Node kinds; provenance (closed, a real root, an id not held, a cause not held); was-it-observed (a true
empty vs. a lower bound); dependents through a chain, an unheld root, and an event that cannot say what it
cites; by-sensor (name matching, **occurrence not recording time**, a window, an unheld cause flagged, an
unreadable Observation named); holding; no content (a grep for words of the payload and the app, and an
allow-list of node fields); determinism, no mutation, a cycle, the empty history.

Mutation-checked: using recording time, dropping the cannot-say list, prefix-matching sensors, not filtering
to Observations, losing the kind of a cited event, dropping the sensor filter, and ignoring unreadable
Observations each fail named tests.

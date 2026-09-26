# Tests — @orb/device-watch

`npm test -w @orb/device-watch` — 13 tests.

## What they pin

**The projection rebuilds identically.** One line, and it is the line that keeps
the journal authoritative.

**A baseline is not news, even when it names what it found.** The `gained` field
is populated in that test on purpose. Pass 2 never emits both, so a baseline test
without it passes whether or not the guard exists — which it did, until this was
checked. The guard is for the next producer, and the test now fails when it is
removed.

**Acknowledged and dismissed end in the same state.** The whole loop is run twice,
once with each answer, and the results are compared. This is DR-8 made
mechanical: if a dismissal ever starts changing what the rule does, this fails.

**Running the watch twice raises once**, and the second run is checked against
history rather than against the return value.

## Negative controls, verified to fail

| mutation | tests that fail |
| --- | --- |
| a baseline counts as news | 1 |
| an unreadable kind projects as empty | 1 |
| the rule ignores what was already raised | 3 |
| a dismissal suppresses future alerts (learning) | 2 |

The last one is the DR-8 control, and it is the reason that decision is worth
more than a sentence in a document.

## Not tested here

Anything about the phone. The readings are constructed, because what is under
test is the loop rather than the sensor — and the sensor was tested where it
lives, on the device, five times.

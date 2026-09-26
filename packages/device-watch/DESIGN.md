# Design — @orb/device-watch

## Why an alert loop before an act loop

An act loop needs review → confirm → release, and its outcome is what the act
did. An alert loop has nothing to confirm — noticing is not irreversible.

The alert loop looks like the lesser of the two and is not, because **a rule you
cannot measure for false positives is a rule that should not be allowed to act.**
The dismissals this package collects are what would justify the act loop later.
Building them in the other order would mean granting authority to a rule on the
strength of nobody having complained.

## Alert identity, and why it is not content

An alert is identified by `observation|kind` — the reading it came from and the
kind that moved. Not by what changed.

That falls out of how the reading is produced: pass 2 reports a change in exactly
one observation, and the next observation shows the same grant in `holding` with
an empty `gained`. So one alert per `(observation, kind)` is simply the right
count, and suppression-by-content is never needed.

It matters because content-keyed identity would be indistinguishable from
learning. *"Do not raise this again because you dismissed it before"* is a rule
changing behaviour from a person's answers, which is exactly what DR-8 defers.
Keying on the observation gives idempotence with none of that.

## Why the rule reads `raised` but not `answers`

The projection folds both. The rule uses one.

That asymmetry is the decision made structural: the answers are *in the state the
rule can see*, and the rule declines to look. A future version that learns would
change one line — and the DR-8 test would fail, which is the alarm working.

## What this does not decide

Whether a grant is dangerous. Whether a publisher is trustworthy. What to do
about it. `Observation.md`: an observation owns confidence, not truth, and
interpretation is revisable and lives above this.

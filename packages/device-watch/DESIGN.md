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

## Why a package set, and why it is not a fourth grant

`docs/DEVICE_LOOP.md` §7b5. Two of pass 2's routes compare a named set against
what the journal last recorded, and one reports an event:

| route | kind | missed while the app is stopped |
| --- | --- | --- |
| `process.start` | compares a set | recovered at the next start |
| `settings.changed` | compares a set | recovered; it only ever bought promptness |
| `signal:…PACKAGE_*` | reports an event | **gone, and nothing records that it is** |

An event-shaped route has no state behind it, so what it misses cannot be
reconstructed. On 2026-09-28 an app was uninstalled while pass 2 was force-stopped,
the platform withheld the broadcast from a stopped package, and the journal holds
nothing about it and cannot say so. Carrying the installed-package set makes that
route's job recoverable: the next process start compares, and the broadcast becomes
an optimisation rather than the only witness.

**It is not a grant, and the rule says so.** `installedPackage` sits in
`Grants.KINDS` but not in `Grants.GRANT_KINDS`, and `ruleFor` routes it to
`device-watch.packages-changed`. The mechanism is shared because the mechanism is
what was worth having; the *claim* is not, because an app appearing is not an app
being given power over the device, and the rule name is the field a person reads
first. The two also differ in expected rate by orders of magnitude — a grant moves
when someone decides something, the package set moves on every system update — so
they have to be tunable apart or §7 R6 turns one into noise and takes the other
with it.

**A set carries the scope it was read under.** `getInstalledPackages` is filtered
without `QUERY_ALL_PACKAGES`, and a filtered list is not a wrong answer — it is an
answer to a different question. Comparing across that difference would report every
invisible package as uninstalled, so `Grants.previous` refuses: a scope mismatch
re-baselines, the same outcome as an unreadable prior line and for the same reason.
That is what makes the permission a decision someone can reverse without the signal
lying on either side of the change, and it is the `unreadable`-is-not-empty rule one
level along — *a change in the instrument must never read as a change in the
world.*

**What it still does not catch.** Comparison reports on endpoints, not intervals
(P21). An app installed, granted a listener and uninstalled between two
observations returns both sets to where they began, and both readings say `changed:
false` — true about the endpoints, silent about the interval. This narrows the
window; it does not close it, and nothing here should be read as claiming it does.

## What this does not decide

Whether a grant is dangerous. Whether a publisher is trustworthy. What to do
about it. `Observation.md`: an observation owns confidence, not truth, and
interpretation is revisable and lives above this.

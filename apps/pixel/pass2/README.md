# Orb pass 2 — the first signal

`DEVICE_LOOP.md` §7 R4:

> Three passes of instrumentation and no observation of the user's actual life
> would be a failure even if every prediction were answered. **Pass 2 should end
> with at least one signal that is useful to a person rather than to this
> document.**

This is that signal: **what currently holds power over this device, and what
changed.**

## Why this one

`MOBILE_SENSING.md` §4.4 — *"Is the device itself under attack?"* — is the group
that document calls *"the group most often skipped, and the one that matters
most for a system holding a decades-long record of a life"*, and it is almost
entirely free of permission cost. Within it, *a new package with Accessibility
or Device Admin* is rated **the classic stalkerware install: cheap, high-value,
low-noise**, feasible **Y**, confidence **1.00**, no permission beyond
visibility.

The occasion was measured, not imagined. On 2026-09-26 an accessibility service
was enabled on the operator's phone; a third-party payment app detected it
within hours and refused to run; **the pass-1 journal contained no record that
anything had happened.** That is `CLAIMS.md` C1 route **A6** — a path Orb does
not mediate — arriving as an event rather than a hypothesis.

*"Something just gained the ability to read every screen on your phone"* is a
fact about a day rather than about an instrument, which is what R4 asks for.

## What it is not

**It reports a fact, never a verdict.** A grant appearing is usually the owner
installing something. Art. XI §42 — the runtime never assumes reality matched an
expectation — and `Observation.md`: an observation owns confidence, not truth.
Whether a change is alarming is interpretation, and interpretation lives above
this.

## Why a separate package

Pass 1 has **not** met its exit criteria: §8 criterion 4 wants a week of real
carrying and the run is at about a day, and P6 is still untested. §7 R4 forbids
changing the instrument mid-run, and §5h recorded the cost of doing it anyway —
*"shipping it now would restart the process, upload another APK to Google, and
reset the clock."*

A second package does not touch pass 1: different app, different process, its
own lane and its own journal file. Installing it restarts nothing.

`Json` is taken from `../pass1/src` at build time rather than copied. Two copies
of the canonical encoder would be two implementations of the one thing §7 R2
says must not diverge, and a copy drifts silently.

## The design decisions worth knowing

**A baseline is not an alarm.** Whatever was installed before Orb arrived is not
news. The first observation records what it found and says `baseline: true`; only
a later change is a signal. §5j taught this on the real phone — a self-test that
reported a pre-existing break as a new failure said `FAILED` forever and meant
nothing.

**Unreadable is not empty.** `Settings.Secure` returns `null` both for *never
set* and for *could not read*. Recording that as `[]` would make the next
successful read announce that every service on the device had just been granted
— an alarm manufactured out of a failed read, which is worse than silence
because it is loud and wrong.

**The previous set comes from history, not from a side file.** Art. IX §33, no
duplicate sources of truth: a cache beside the journal would be a second one,
and would outlive an erasure that removed the events it describes.

**The recorded set is sorted and de-duplicated.** Not for noise suppression —
set difference ignores order for free — but because the holding set is written
into history and read back as the next comparison's input. If the platform's
ordering reached the record, two observations of an unchanged device would
produce different bytes and different payload hashes: a journal that looks like
it moved when nothing did.

**Counts are integers, sets are strings.** `runtime/journal/API.md` — the
canonical encoding takes safe integers only.

## Tests

```sh
./tests/run.sh        # needs a JDK; no Android SDK, no Gradle
```

27 checks over the logic that is about a set changing over time, which is where
the bugs are and none of which needs Android.

**Negative controls, run 2026-09-26.** Keeping the platform's ordering in the
record fails 2; recording an unreadable setting as an empty list fails 2;
treating a revoked grant as not worth an event fails 1. An earlier version of
these tests was weaker than it looked: the reordering case passed with sorting
removed entirely, because set difference already ignores order, so the test was
restated to pin what the sorting actually buys.

## What is still a prediction, not a result

Nothing here has run on the device. `MOBILE_SENSING.md` §4.4's ratings are
proposals, and §7 R3 stands — a finding is recorded against *this* device and
version, never generalised.

| | Prediction |
| --- | --- |
| **P12** | `Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES` is readable by a sideloaded app with no permission |
| **P13** | `ENABLED_NOTIFICATION_LISTENERS` is readable on the same terms |
| **P14** | Active device admins are enumerable without being one |
| **P15** | `ACTION_PACKAGE_ADDED` reaches a runtime-registered receiver inside a `specialUse` foreground service, as the screen signals already do (§5h) |
| **P16** | A grant enabled while the app is not running is still detected at the next process start, from the journal's own last record |

**P12–P14 are being answered first, and the Android glue waits on them.**
`apps/pixel/probe-grants` is a throwaway zero-permission APK that performs the
three reads once and prints what came back — its own package and key, no
services, nothing stored, so it cannot disturb pass 1's run. Writing the manifest
and service wiring here before those answers would be writing it against an
assumption. Its scoring rule is fixed in advance and is stricter than it looks:
an empty answer is INCONCLUSIVE, never a confirmation, because an empty list
handed to a permissionless app is byte-identical to a full list being filtered
out of it. What each possible answer changes in `Grants` is set out in that
probe's README — including the case where P12 fails and `KINDS` loses a kind
rather than gaining a permanent `"unreadable"`.

P16 is the one that decides whether this is a *signal* or a *poll*: if the
platform delivers nothing for a settings change, the design still works because
the comparison is against history rather than against a live callback — but it
becomes as coarse as the next process start, and that should be said plainly
rather than discovered.

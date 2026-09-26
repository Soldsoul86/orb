# @orb/observation

An **Observation** is a recorded statement that *something occurred in reality*
(`contracts/Observation.md`). It is the bridge from the Reality Plane to the
Knowledge Plane: a Sensor perceives, and the Observation is the historical record
that the perception happened.

It asserts **occurrence, not truth.** *"Met John at 3:02 PM"* says this was
observed — never that it is correct, complete or finally true. Whether it *means*
anything is interpretation, decided later and revisably, and never here.

## What this package is for

The contract ends its failure modes with three things **never permitted**: an
unattributed Observation, mutating or deleting a recorded one, and asserting
truth from within one. This package makes the first impossible rather than
discouraged, and enforces two more invariants at the boundary.

| | enforced how |
| --- | --- |
| inv. 3, **always attributed** | an empty `source` is refused; there is no default, because only the caller knows what perceived it |
| inv. 5, **references, never copies** | raw bytes anywhere in `data` are refused, naming the path; Attachments are cited by scheme-tagged identity |
| inv. 7, **confidence, not truth** | `confidencePercent` must be an integer 0–100 |

The third *never permitted* — asserting truth — is not a check but a shape.
There is no field in which to put a verdict.

## Why confidence is an integer

The value is in `[0, 1]` and that is unchanged; this is only how it is written
down. The journal's canonical encoding takes safe integers only, because Java and
JavaScript spell `0.95` differently enough that one disagreement inside a hash
preimage means two devices that can never agree they hold the same history —
measured, not assumed, on 2026-09-26.

So `0.95` is carried as `confidencePercent: 95`.

**`percentFromConfidence` refuses anything percent cannot hold exactly**, and
that is the point rather than a limitation. Every confidence in the contract and
in `MOBILE_SENSING.md` §4 is at most two decimals, and §4 calls them *"proposals,
not measurements"*. Silently rounding `0.947` to `95` would hide a source
claiming a third decimal it never measured; refusing makes it decide in the open.

## Supersession, never correction

An Observation is immutable. If reality is later observed differently, a **new**
Observation is recorded and both coexist — the earlier one is never edited,
never deleted, and interpretation decides which to believe. Nothing in this
package can change a recorded Observation, because nothing in the journal can.

## Reading one back

`readObservation` returns `null` for an event whose payload this device does not
hold. That is *cannot say*, not *no observation*, and a caller must not turn one
into the other. The event is still an Observation and still history —
`Observation.md` §7's missing-attachment rule, generalised: unresolved content
never invalidates the record of it.

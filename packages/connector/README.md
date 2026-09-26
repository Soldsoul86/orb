# @orb/connector

Connector Sensors: **the boundary at which an external service becomes history.**

A connector — Gmail, Calendar, Drive — is a `Sensor` (`contracts/Sensor.md` §6a).
It reaches its source over a network rather than reading the device, and it
records the same way everything else does.

## What is here, and what is deliberately not

`docs/DECISIONS.md` DR-7 sets three tiers. **Only the first is implemented**, and
the other two are blocked rather than postponed:

| tier | | state |
| --- | --- | --- |
| 1 | The call is journaled, content or not | **done** — `recordCall` |
| 2 | The synthesis is an Observation, never a Fact | **blocked on Attachments** |
| 3 | The raw is an Attachment held seven days | **blocked on Attachments** |

Tier 2 is blocked for a reason worth stating, because it changes DR-7's order.
`contracts/Observation.md` inv. 5: *"References, never copies. Raw content is
referenced as Attachments by content hash, never inlined mutably."* So an
Observation over fetched content cannot be written before Attachments exist —
tier 2 depends on tier 3's primitive, not merely on tier 3 being nice to have.
`contracts/Attachment.md` carries two operator rulings (inv. 7's blinded address,
inv. 8's per-Attachment key that dies with the last reference) and no code.

This package stops at that boundary rather than inlining content into an
Observation to keep moving. Inlining would be the cheap version that is hard to
take back: every event written that way would be a payload that cannot be erased
by releasing a key, on a record meant to last decades.

## Tier 1, and why it is not a formality

`recordCall` runs one fetch and journals it **on every path** — items, none,
nothing, a failure, a refusal.

Two reasons, either sufficient:

- **An access Orb does not record is an access nobody can audit**, the user
  included. *"Did Orb read my mail on the 12th?"* has to be answerable from
  history rather than from trust.
- **The query is an outbound disclosure.** Asking a provider for `newer_than:3d`
  tells them what was asked. `SECURITY.md` §7 makes data leaving the device
  history, and a call recording only what came back would leave the outbound half
  unwritten.

And recording every path — not only the successes — is what stops silence from
meaning two things at once. A connector that journaled its successes would leave
*nothing was there* and *nothing was tried* indistinguishable, and then history
cannot be used to say Orb did **not** read something on a given day.

The record is content-free by construction: `ConnectorCall` has nowhere to put a
fetched item, so no later edit quietly starts putting one there.

## The outcome ladder

```
value   the call answered, and returned something
empty   the call answered, and the answer is none
absent  the call answered with no answer — we were not told
threw   the call failed; we learned nothing about the contents
denied  the other side refused; a decision, not a failure
```

`empty` and `absent` are **never merged**. An empty result and a withheld one are
the same bytes to a caller and opposite facts to anyone reading the record later.
That distinction cost five runs of `apps/pixel/probe-grants` to establish on a
real device, where `getActiveAdmins()` returns `null` for *none* — and the
handoff summary that proposed this ladder listed four states and dropped
`absent`, which is how it gets lost: not by argument, but by a list with nowhere
to put it.

`denied` is separate from `threw` for a smaller but real reason: a revoked token
is a decision by the other side and a socket hanging up is the attempt falling
over. Collapsing them makes a caller parse prose to tell *stop asking* from *try
again*.

## No network in this package

The external half is a `ConnectorDriver`, injected by the caller. The recording
rules are tested without a network, so a failing test names the rule rather than
the weather.

A driver may throw or refuse. **It must never invent** — returning `null` for a
source that said nothing is correct and becomes `absent`; returning an empty
array for it is the one thing this package is arranged to prevent.

**Credentials never enter the journal** (DR-7). Tokens live in the driver.

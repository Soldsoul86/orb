# Design — @orb/observation

## A payload shape and a boundary, not a subsystem

An Observation is *the meaning of an Event whose type is observation*. There is
one Event type, `orb.observation`, and everything specific lives in the payload —
which is also what the coarse-envelope ruling (`ERASURE.md` §2b) requires, since
a content event's envelope says `orb.content` and nothing finer.

So this package is a type, a validator and two readers. The storage, ordering,
integrity and immutability are the journal's, and duplicating any of them here
would be a second source of truth for one fact.

## Refusal, not repair

`observationDraft` throws rather than correcting. The contract's *never
permitted* list is not a set of defaults: an unattributed Observation has no
honest repair, because only the caller knows what perceived it, and a confidence
that cannot be written identically by both encoders has no safe rounding.

The cost is that a caller must handle the throw. That is the right way round —
a refused Observation is a bug found at the boundary, while a repaired one is a
wrong record that looks right forever.

## Why inlined bytes are searched for rather than trusted

inv. 5 says raw content is referenced, never copied. A type cannot express that:
`data: unknown` accepts a `Buffer` happily. So `observationDraft` walks the
payload and refuses any `ArrayBuffer` or typed array, naming the path it found.

Bytes inlined here would become part of history — unerasable by releasing a key,
and copied to every device that holds the envelope. That is the one mistake in
this package that could not be undone later, so it is worth a walk.

## What is deliberately absent

- **No supersession helper.** A correction is a new Observation linked in the
  Evidence Graph as contradicting the earlier one. The Evidence Graph is not
  built, and inventing the link shape here would pre-empt it.
- **No confidence arithmetic.** Weighing confidences is interpretation
  (Evidence → Belief), which lives above this and is revisable.
- **No truth.** There is nowhere to put one.

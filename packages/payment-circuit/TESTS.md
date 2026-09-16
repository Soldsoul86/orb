# Tests — @orb/payment-circuit

`npm test -w @orb/payment-circuit`

Proving tests **skip themselves** when `artifacts/` has not been built, so a
fresh clone still runs a green suite. `npm run circuit` produces them.

## Encoding (`field.test.ts`)

Identifiers are deterministic, separate different inputs, and **always land
inside the field** — checked for the empty string, an emoji and a 5,000
character input, because a map that fails on an edge case is a map that fails
in production.

Amounts accept the whole 64-bit range and refuse anything above it, including
`FIELD_MODULUS - 1` — the value that would wrap the field and read as small
inside the circuit. Negatives and unsafe timestamps are refused.

## The tree (`tree.test.ts`)

Runs without artifacts, so it stays fast and catches the drift that matters
most: if the tree and the circuit ever disagree on leaf construction or path
ordering, the result is a valid-looking proof of the wrong statement.

The root moves for a changed total, the same total in a different bucket, a
different account, a different asset, and a different base index. The path test
**walks a path by hand using the bits of the index**, mirroring `MerklePath` in
the circuit, and checks it reaches the root.

## Proving (`prove.test.ts`)

**True statements** prove and verify — including at exactly the limit, and
against an empty ledger.

**False statements cannot be proved at all.** Not "produce an invalid proof
that a verifier rejects": the witness is unsatisfiable and `proveBudget`
throws. Tested for an overspend and for a single bucket that blows the limit.

**A valid proof is still about specific values.** The same sound proof fails
verification against a different claimed limit, a different claimed amount, a
different ledger, or a tampered public signal — otherwise the commitments bind
nothing.

**What the verifier sees, and does not.** Four field elements. The limit and
every bucket total are asserted **absent from the serialised proof** — not
redacted or omitted by convention, but absent, because they were never inputs
to anything the verifier receives. Two different ledgers under the same limit
produce the same policy commitment and different ledger commitments.

## What is *not* covered

- **The trusted setup.** Development ceremony; its security properties are
  stated in the README, not tested, because they do not hold.
- **Rules other than the window budget.** Allowlists, velocity and approvals
  are not in the circuit; each would be its own statement.
- **Proving performance.** No threshold is asserted because none has been
  agreed; asserting an arbitrary one would be theatre.

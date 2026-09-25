# Witnesses — the second key belongs to another person

**Status: PROPOSAL, 2026-09-25.** Nothing here is built. It depends on AD-6,
which is open. Raised by the operator: *can my mother's phone, or a friend's, be
the second device?*

---

## 0. The question this answers

`CLAIMS.md` C2c states a limit that no amount of work on one device removes:

> The device that holds the signing key can drop the last N events and re-sign.
> This is not detectable from that device alone.

The answer is a second witness. The open question was what a witness actually
is, and the operator's framing is better than the one this project had been
carrying. It had assumed a second machine — a home server, a laptop, something
the user owns. That is the weaker answer.

---

## 1. Why a person, and not a second device of your own

A witness is only worth what it adds in *independence*. Two devices you own
share almost every way of failing:

| | A laptop you own | Another person's phone |
| --- | --- | --- |
| Same signing key material | Likely | No |
| Same physical location | Usually | No |
| Seized together | Yes | Not without a second action |
| Compelled together | Yes | Requires compelling two people |
| Lost in one fire, one theft, one reset | Yes | No |

A second device of your own protects against disk failure. It does not protect
against **you** — which is exactly the case C2c describes, because the attacker
who can truncate a lane is by definition whoever holds the key.

A friend's phone is a different key, held by a different person, in a different
place. That is what "independent" means in practice, and AD-6 is the finding
that Orb cannot currently say it.

---

## 2. What a witness holds — and it is not your data

Every event has two halves (`PARTIAL_REPLICATION.md`): an **envelope** — hash,
predecessor, timestamp, type — and a **payload**, which is what happened.

A witness needs no payloads at all. There is a ladder here, and which rung to
stand on is the user's choice, not the design's:

| | What the witness holds | Catches | Leaks |
| --- | --- | --- | --- |
| **W0** | Signed head hash only, no count | Truncation, alteration | Almost nothing |
| **W1** | Head hash + event count, periodically | The above, plus how much was removed | Volume and timing of activity |
| **W2** | Every envelope, no payloads (`holdNothing()`) | The above, plus which event *types* went missing | Types, cadence, counts |
| **W3** | Envelopes and payloads | Everything | Your life |

**W3 is not a witness.** It is a replica, appropriate for a device you own and
nothing else. For a person, the useful rungs are W0 and W1.

W1 is a few hundred bytes a day. It says nothing about where you were, what you
did, or who you spoke to. It says: *at this moment, Hari's lane stood at this
height with this fingerprint.* If the lane later claims a lower height, someone
removed events, and there is a signed record from outside saying so.

---

## 3. The property that makes this askable of family

**A witness cannot forge. It can only withhold.**

The attestation is signed with the *subject's* key, not the witness's. A witness
therefore cannot manufacture a history you never had, cannot alter the one they
hold, and cannot produce a plausible false fingerprint. The worst a hostile or
careless witness can do is lose it, delete it, or refuse to show it.

That asymmetry is the whole reason this works between ordinary people. You are
not asking your mother to be trustworthy with your data — she never has it. You
are asking her phone to keep a few hundred bytes it cannot read. The failure
mode is *unhelpfulness*, never *fabrication*.

It follows that the trust required is narrow and stateable: **that she is not
acting together with whoever wants to rewrite your history.** For most people
and most adversaries, that is nearly free.

---

## 4. What this does not protect against

Stated plainly, because a witness scheme that oversells itself is worse than
none:

- **Collusion.** K witnesses means an attacker needs all K. Witnesses who know
  each other, live together, or answer to the same authority are closer to one
  witness than to K. Choosing unconnected people is the only defence, and it is
  a social act, not a cryptographic one.
- **Forward secrecy of the truncation.** A witness proves the lane *was* at a
  given height. It cannot prove what the removed events said. It converts a
  silent deletion into a detected one; it does not recover the content.
- **The witness never having been there.** A lane that was never witnessed in
  some period has no evidence for that period. Witnessing has to be routine and
  cheap or it will not be there when it matters.
- **The content itself.** Nothing here speaks to whether a recorded event was
  true when it was recorded. That is Art. XI's confidence problem, untouched.

---

## 5. Witness liveness is the honesty problem, one level up

Phones are replaced, reset, and cleared. A witness can vanish and nothing will
announce it — which is exactly the failure P4 exists to catch, moved up a level.

So the design cannot simply count witnesses. It has to notice one going quiet,
and record that silence the way the probe records a gap. A K of 3 that has
silently been a K of 1 for six months is worse than an honest K of 1, because
the user believes something false.

This is the same rule the device loop keeps arriving at: **a system that cannot
detect its own blindness is not trustworthy no matter how well it works when it
is working.**

---

## 6. The shape: reciprocity, not a favour

The natural arrangement is mutual. You witness for her; she witnesses for you.
Neither can read the other's history. Both become harder to erase.

This matters for adoption more than for cryptography. A thing you ask someone to
install *for you* gets uninstalled. A thing that protects them too does not.

Practical constraints that follow, and they are hard constraints:

- It must cost near nothing — no battery, no notifications, no questions.
- It must never require the witness to understand what they hold.
- It must survive the witness replacing their phone, or fail loudly.

---

## 7. Why this is not a server, and why that is the point

The ordinary solution is to put the log on a company's server. Then the company
is the witness — and the company is also the single party who could alter it
quietly, and the first party an attacker or a court approaches.

The witness design replaces one trusted operator with several untrusted people
who cannot read what they hold and cannot forge what they attest. No company, no
coordination protocol, no shared ledger. The security comes from the cost of
reaching several unconnected people at once.

This is Art. VIII §30 — the user is the root of trust, never a server — worked
out to its consequence rather than asserted.

---

## 8. What already exists, and what does not

**Exists.** `holdNothing()` in `runtime/journal/src/sync.ts` is W2: a replica
that takes every envelope and no payloads. The sync port, watermarks and the
exchange that carries them are built and tested.

**Does not exist.**

1. **A key identity.** AD-6. Orb counts device identifiers and has no concept of
   a key anywhere in `runtime/` or `contracts/`. Until it does, it cannot
   distinguish two people from one person's two phones — and for this purpose
   those are opposite things. **This is the blocker.**
2. **A witness attestation.** Distinct from `CustodyReceipt`, which answers
   *"who holds payloads"* (durability). A witness answers *"who saw this lane at
   this height"* (tamper-evidence). Same shape of thing, different question, and
   conflating them would repeat the mistake AD-6 records.
3. **W0/W1 as policies.** The ladder above stops at W2; the cheap rungs, which
   are the ones a person would actually stand on, are not expressible.
4. **Witness liveness.** §5.

---

## 9. Open questions for the operator

1. **Which rung is the default?** W1 is far more useful for diagnosis and leaks
   volume. W0 leaks almost nothing and can only say *something changed*. This is
   a privacy call, not an engineering one.
2. **What is K, and how are witnesses chosen?** The design can enforce a number.
   It cannot enforce unconnectedness, and pretending otherwise would be false
   assurance.
3. **Does a witness learn it is a witness?** A silent installation protects the
   witness from being asked what they hold. Telling them respects their
   autonomy. These pull against each other and the answer is the user's.

---

## 10. Sequencing

Not now. The pass-1 run is in progress and `DEVICE_LOOP.md` §7 R4 stands.

After it: AD-6 first, because everything here is blocked on it, and because it
is also what makes `CLAIMS.md` C2c runnable. The witness attestation is a small
addition once a key can be named; the ladder is smaller still. The social
design — who, how many, told or not — is the part that will take longest and is
not code.

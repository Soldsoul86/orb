# Decisions pending — the questions that are the operator's to answer

> Part of the engineering system (`ENGINEERING_SYSTEM.md` §3.6, DR-45). An agent that meets a decision that is the operator's writes it here and **stops that line of work**. Answered entries move to `DECISIONS.md` as a DR (or to `SETTLED.md` if they are findings) and are removed from here, so this file is only ever what is still open.

**Format** (checked by `npm run lint`): each entry is a level-2 heading `## PD-nnn — <question>`, then the fields below, in this order.

```
## PD-001 — <the question, one line>

- **Raised:** <date> · **By:** <agent or slice id> · **Slice:** <id or none>
- **Blocks:** <what cannot proceed, or "nothing">
- **Options:** A — <…> · B — <…> · C — <…>
- **Evidence:** <counts, files, links; never a person's words>
- **Recommendation:** <one option and why>
- **Needs human approval:** YES
```

## Open

## PD-001 — Is "Mark paid" a label, or does it create and close a loop?

- **Raised:** 2026-10-05 · **By:** builder, reading `MONEY_PHONE.md` §6 against the code · **Slice:** MONEY-B
- **Blocks:** the whole of slice B (what the person's answer writes, so what the scenarios prove)
- **Options:** A — **a label**: the verdicts (`paid` / `notThis` / `alreadyPaid`) are one new event `orb.candidate.judged` against blinded keys of the obligation and the payment; **no loop is opened or closed**; obligations stay proposals until a later "Track this" slice · B — "Mark paid" **opens and closes a loop** (`orb.loop.opened` then `orb.loop.closed`, `by: you`), so a bill the person never accepted becomes a loop with no words of its own · C — build "Track this" now, so a loop exists before it can be closed
- **Evidence:** §6 says *Mark paid → the existing `orb.loop.closed`* and *on the loop row*; but **no SMS-derived obligation is a loop on the phone**: the 185 distinct obligations in the fit exist only as kept observations (`ObservationStore`), and a closing event needs an opened loop. Only the person's own commitments are loops today. Kept: 327 bundles; 20 closure candidates; 185 obligations.
- **Recommendation:** A. It is the smallest thing that produces what slice B is *for* — a labelled set to measure correlation precision and recall once the statement exists — without deciding how Orb turns an inferred bill into a thing the person owns. It keeps "nothing closes without the person" (nothing is closed, only labelled), and "Track this" remains its own design. Cost: a *Mark paid* tap changes nothing on Today.
- **Needs human approval:** YES

## PD-002 — Which obligations does the review list?

- **Raised:** 2026-10-05 · **By:** builder · **Slice:** MONEY-B
- **Blocks:** the review screen's content and the meaning of *Already paid* (the measurement of missed correlations)
- **Options:** A — the **20 candidates** (a payment that looks like the end of a bill) and the **open obligations of the last 60 days** that have none, each with *Already paid* · B — candidates only (no recall measure) · C — all 185 obligations in the 24 months
- **Evidence:** 185 distinct obligations and 20 candidates over the kept window; an obligation with no candidate can only be tested for a *missed* correlation if the person can say it was paid. Older obligations are mostly long settled, so a long list would be answered "already paid" by habit and measure little.
- **Recommendation:** A, newest first, **60 days** as a policy constant (changeable without changing the data). Precision is reported from 20 answers and never gates anything; automatic closing stays off.
- **Needs human approval:** YES


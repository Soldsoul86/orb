# AGENTS.md — how any agent works on Orb

Orb is not a Claude project. The repository is the source of truth, and it may be worked on by Claude Code, GPT/Codex and other agents, one after another or side by side. This file is the part of the operating instruction that is the same for all of them. Tool-specific instructions stay separate (`CLAUDE.md` for Claude Code); where they differ, **this file and the documents it names win**, and a real conflict is surfaced, not resolved silently.

Adopted by the operator 2026-10-05 (`docs/DECISIONS.md` DR-47).

You are an implementation agent. Your job is to build safely inside this system, and to leave the next agent able to understand, challenge, reproduce and extend what you built.

## 1. Source of truth

Conversation memory is never authoritative. The order, highest first:

| # | Layer | Where it lives |
| --- | --- | --- |
| 1 | Constitution | `CONSTITUTION.md` |
| 2 | Approved contracts and protocols | `contracts/`, `docs/*_PROTOCOL.md`, `docs/OBSERVATION_SEAM.md` |
| 3 | Approved decisions | `docs/DECISIONS.md` (`DR-nn`) |
| 4 | Requirements and approved designs | `MASTER.md`, the approved design documents (`docs/MONEY_PHONE.md`, …). There is no separate requirements register; these are it |
| 5 | Scenarios | `docs/scenarios/*.json` |
| 6 | Invariants | `docs/invariants/INVARIANTS.json` |
| 7 | Existing implementation and tests | `apps/`, `packages/`, `tools/`, `tests/` |
| 8 | Agent instructions | this file, `CLAUDE.md` |
| 9 | Conversation context | — |

If layers conflict, **stop and surface the conflict**. Never silently reinterpret an approved protocol. What is known only in `docs/SETTLED.md` and `docs/STATE.md` is read before calling anything in a device export, a journal or a self-test result new, broken or in need of fixing.

## 2. Multi-agent rule

Assume another agent may review your work, implement an alternative, challenge your interpretation, touch adjacent code or reproduce your tests independently. That is wanted. Do not make an implementation *look* correct; make the behaviour **explicit, deterministic, testable, replayable and independently verifiable**. Anything that matters goes into a contract, a decision, a scenario, an invariant, a test or the implementation — never only into your reasoning.

## 3. Before coding a non-trivial slice

Read the relevant Constitution sections, protocol, decisions, design, scenarios, invariants, existing implementation and tests. Then work out: *problem · current behaviour · desired behaviour · affected contracts, scenarios and invariants · files likely to change · unknowns*.

If an unresolved **architectural decision** is needed, put the question in `docs/DECISIONS_PENDING.md` (`PD-nnn`) and **stop**.

## 4. Slice discipline

One bounded slice at a time: a **scope**, a **change budget**, **stop conditions** and **acceptance scenarios** (`docs/slices/*.json`, `tools/slice`). Do not expand scope for an adjacent improvement; **record it separately and do not implement it**.

## 5. The four boundaries

```
OBSERVE → INTERPRET → AUTHORIZE → ACT
```

Never collapse them. Evidence is not interpretation; interpretation is not authorization; authorization is not execution. A source saying something happened does not authorize Orb to do anything.

## 6. The observation seam

```
Source → Normalizer → Observation → Correlator → Interpreter → Loop effect
```

Adapters provide facts. Orb interprets them. An adapter does **not** decide loop kind, owner, origin, closure or authorization. Do not introduce a second Observation model; read `docs/OBSERVATION_SEAM.md` before changing anything.

## 7. Loop model

*Action* (`contracts/Action.md`) is reserved for Orb's own attempt to change the world; never use it for a human obligation. The Loop vocabulary (`docs/LOOP_PROTOCOL.md`): kinds **DO · GIVE · ATTEND · RESPOND · DECIDE**; `owner: ME | THEM`; `origin: stated | asked | promised`; `basis: observed | stated | inferred`. No stored *GET*. No status field that can be derived from lifecycle events. No numeric confidence where an ordinal basis suffices.

## 8. Money

Money is an adapter and a view over the observation seam (DR-44). *Payment observed* is **not** *obligation closed*: a movement is evidence that value moved. It may correlate with a loop, advance it, suggest closure, or stay ledger-only. **No automatic closing** unless an approved decision says so. Prefer *moved* to *spent* wherever the economic meaning cannot be established.

## 9. Privacy

The minimum information necessary. Raw source content must not reach the journal, an export, a probe, a log, a report, a fixture or **your own output** unless an approved design permits it. Privacy is an invariant, not a final manual check (I-005, I-018): use privacy canaries for every new data path. **No new Android permission without an explicit decision.** Real exports and backups never enter the repository.

## 10. Testing

For every feature: **happy path**; **boundary**; **adversarial** (how can this make a false loop, a false closure, a duplicate movement, an unauthorized action?); **privacy** (can forbidden data escape?); **recovery** (process death, reboot, duplicate input, interrupted import, partial input, replay); **evolution** (old data with new code, old protocol versions, replay). Unit tests before integration tests.

## 11. Scenarios are first-class

Every meaningful behaviour has a scenario. A scenario is **never proof by itself**: scenario → named test checks → passing checks → the current commit. Its state is *derived* by `tools/scenarios`; **never mark a scenario proven by hand.** If the named check disappears, is renamed or stops passing, the scenario becomes unproven.

## 12. Invariants

Before changing code ask which invariants it could threaten (`tools/scenarios impact`); afterwards, whether you added or strengthened tests for them. Do not weaken an invariant to make a test pass; if the invariant itself looks wrong, **stop and request a decision**. The standing principles include: evidence is not interpretation · an observation has provenance · duplicates are idempotent · replay equals live · unknown evidence does not become certainty · raw source data does not leak · an unauthorized action does not execute.

## 13. Mutation testing

A surviving mutant is information (`tools/mutate`). For each: decide whether it is **equivalent** (and say why, in the list); if not, name the missing test, add the smallest test that kills it, re-run. Record the learning if it shows a new failure class (`docs/LEARNINGS.md`). **Never delete or weaken the condition a mutant changes to improve the score.**

## 14. Fit testing

`tools/fit` reports **coverage** of real data. It is not accuracy. Keep coverage, precision, recall and held-out performance apart. A rule tuned on the corpus it is measured on is **not** held-out validation — say so. Never alter the real corpus to improve the numbers.

## 15. Golden and replay

Same observations → same interpretation → same ledger. When an interpreter changes, run the replay and golden suites; if behaviour changes, produce a **behavioural delta** and explain it. A golden file is never updated to hide a change.

## 16. Change report

Every meaningful slice leaves a machine-readable change report (`node tools/slice/cli.mjs report <slice> …` → `artifacts/reports/`): commit, files and file classes, contracts, scenarios, invariants, tests, mutation, fit, privacy, permission delta, open decisions, known limitations. Another agent must be able to understand the slice from it alone.

## 17. Handoff to a reviewer

Give: **what changed · why · files · design references · scenarios · invariants · test, mutation, fit and privacy results · known risks · open questions.** Do not say "everything looks good". Give the reviewer things to attack.

## 18. Independent review

Welcome a valid finding. Reproduce it, find the root cause, add regression coverage, fix it, and update the learning, scenario or invariant. Do not optimize for defending your earlier implementation. (`/review` and `/adversary` do this inside Claude Code; any agent may do the same by reading the change report and the slice file.)

## 19. Stop conditions — stop and ask for human direction

An approved protocol or the Constitution needs changing · a gated file needs changing without an approval record · a new permission is needed · a privacy boundary becomes ambiguous · an observation cannot be classified cleanly · two interpretations conflict · a behavioural delta cannot be explained · a test passes only after a requirement is weakened · a mutation survivor exposes an unresolved semantic question · the work needs a new architectural concept · repeated repairs have failed · scope is expanding materially. **Do not improvise around these.**

## 20. Roles

**The human** owns product meaning, architectural direction, privacy decisions, protocol approval, risk tolerance, usefulness and the final release judgement. **You** own implementation, investigation, tests, adversarial testing, documentation, evidence, and surfacing uncertainty. Do not make a product decision because it is convenient to implement.

## 21. Worktree discipline

Work on your own branch or worktree. Do not touch another agent's worktree, overwrite uncommitted changes, or reset unrelated work. Keep commits bounded. Do not push to a protected or main branch unless told to. Before starting: `git status`, `git branch`, `git log -n 5`, and understand the state you are in.

## 22. Code quality

Small deterministic functions, explicit data structures, pure transformations, versioned rules, replayable behaviour; a functional core and an imperative shell; dependency injection; composition over inheritance. Avoid implicit state, hidden global behaviour, magic defaults, unbounded inference and duplicated sources of truth. Do not add a dependency without checking that the repository does not deliberately avoid it. Never bypass or mutate the Event Journal.

## 23. No fake completeness

Do not say *done*, *complete*, *safe* or *verified* without the evidence. Report separately: **implemented · tested · mutation-tested · fit-tested · device-tested · reviewed.** A feature can be implemented and not device-tested; say so.

## 24. Final response format

At the end of a slice, in this order, with the limitations that matter at the top, not the bottom:

```
Changed        …
Proof          Tests · Mutation · Fit · Privacy · Typecheck/lint
Scenarios      …
Invariants     …
Device         …
Behavioural changes …
Open decisions …
Known limitations …
Commit         …
```

## 25. The most important rule

Orb is becoming an operating system for human intent. Do not optimize for the number of features. Optimize for **truth, provenance, privacy, determinism, human control and reproducibility.** The repository must be able to carry Orb's engineering memory independently of any one person or agent.

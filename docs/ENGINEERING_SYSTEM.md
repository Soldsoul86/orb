# The engineering system — how one person operates Orb with agents

> Status: **approved 2026-10-04 ("Approve DR-45 / ENGINEERING_SYSTEM.md as proposed", with the four decisions in §8); Phase 1 built — see §9.** Written in answer to the operator's ten-layer, thirty-point proposal (design → scenario → implementation → proof → device → evidence → review → release → learning). `DECISIONS.md` DR-45.
> Governed by `CLAUDE.md` (the workflow and the rule that architecture changes wait for approval) and `AGENT_TOOLING.md` (what already exists). This document changes **no product architecture, kernel contract or protocol**; it adds repository machinery around them.

## 1. What I take the proposal to be

Not "more scripts" but the layer that makes **design → scenario → proof → device → evidence** a repeatable machine, so that the judgment stays with the operator and the repetition lives in the repository. The operator's own advice is the constraint: *do not spend three weeks on infrastructure before Money.* So this document does three things only: maps the thirty points onto what already exists, picks the **smallest Phase 1** that gives the leverage, and says what is deliberately left for later phases.

## 2. Where the thirty points stand

| # | Point | Exists today | Phase |
| --- | --- | --- | --- |
| 1 | Governance: file classes, approval gates, change budget | `CLAUDE.md` rules; DR approvals in `DECISIONS.md`; lint for package docs | **1** (file classes + a diff check) · 4 (budgets) |
| 2 | Design layer: ADRs, requirements, traceability | `DECISIONS.md` (DR-1…44), design docs per slice | **1** (machine index) · 2 (split files) |
| 3 | Scenario registry | fixtures + named checks, not indexed | **1** |
| 4 | Invariants | held by source guards and tests, not named | **1** |
| 5 | `/slice` | the manual loop in `AGENT_TOOLING.md` | **1** |
| 6 | Impact analysis | none | 2 (a first form in 1: invariants ← changed files) |
| 7 | Conformance runner | `docs/fixtures/{loops,money}`, run inside the phone suite | 2 |
| 8–9 | Golden replay, differential runs | replay==live tested for the ledger | 2 |
| 10 | Mutation budgets, history | `tools/mutate`, `--verify`, 54+ lists | 2 |
| 11 | Fit history, held-out corpus, drift | `tools/fit` (coverage only) | 3–4 |
| 12–13 | Privacy scanner, permission scanner, agent capabilities | canary tests; `export-reader` restrictions | 4 |
| 14–15 | Worktrees, context packs | none | 2 |
| 16–17 | Agent roles, adversary | `mutation-reviewer`, `export-reader` | 2 (builder/reviewer/adversary) |
| 18–19 | Recovery and evolution suites | scattered tests | 3 |
| 20–21 | Device runner, prediction registry, crash → regression | `DEVICE_LOOP.md` P-numbers in prose | 3 |
| 22–24 | Artifact registry, release gate, **change report** | none | 4 (the change report in **1**) |
| 25 | Learning registry | `SETTLED.md`, AD register | **1** (a format) |
| 26–27 | Dashboard, budgets | none | 4 |
| 28 | Stop conditions | prose in `CLAUDE.md` | **1** (in `/slice`) |
| 29 | Human decision queue | none | **1** |
| 30 | `/orb` master command | `/mutate` `/fit` `/export` | 4 |

## 3. Phase 1 — the smallest thing that gives the leverage

Six pieces, each small, all dependency-free (Node, as `tools/` already is), all with the four package documents and tests, all counts-and-names-only like the tools before them.

### 3.1 Invariants — `docs/invariants/INVARIANTS.json`

Laws, not examples. Each: `id` (`I-004`), `statement`, `source` (the constitutional article or contract it comes from), `heldBy` (names of the checks or guards that hold it), `threatenedBy` (path globs: changing these files puts it at risk). Seeded with what Orb **already holds by test** — the operator's list (evidence ≠ interpretation; provenance; idempotence; replay == live; raw text never in the journal; quieting never rewrites a loop; unknown evidence never a confirmed closure; failed import leaves no partial state; export holds no forbidden field) plus the ones this work established (no automatic closing; the ledger is not a view of loops; a mis-read statement is refused whole).
**The question it answers:** *what invariants does this change threaten?* — `tools/scenarios impact --diff` reads the changed files and prints the invariants whose `threatenedBy` they match, and whether each still has a `heldBy` check that exists.

### 3.2 Scenarios — `docs/scenarios/<DOMAIN>.json`

An id (`M-001`), name, given / when / then / mustNot, category (happy · boundary · adversarial · privacy · recovery · evolution), risk, the invariants it exercises, and **`proof`**: the exact names of checks in the phone suite or tool tests (the suite already prints every check's name).
**State is derived, not typed.** `tools/scenarios check` runs against the latest suite output: `draft` (no proof), `tested` (every named check exists and passed), `regressed` (a proof that passed before now fails or vanished). `device_proven` and `export_proven` need the prediction registry (Phase 3), so until then they are a field that must cite its `DEVICE_LOOP.md` section — never a silent flag. A scenario whose proof names a check that does not exist **fails the check**: a registry that can go stale without noticing is worse than none.
**Tie to mutation:** a scenario may name the mutant lists that protect it; `tools/mutate --verify` then says whether its protection still applies.
**Seeded** retroactively with Money slice A (about twenty scenarios from what was just built), as the first test of whether the format is worth its weight.

### 3.3 The slice — `docs/slices/<ID>.json` and `/slice <ID>`

A slice file names: the design doc and its decisions; the scenarios and invariants in play; the files in scope (globs); the **budget** (max files, max lines changed, max failing runs before stop); the **gates** it may not cross without a human (design approval, protocol approval, security approval — i.e. any change to a file class that needs one); and the proof steps to run in order (suite, lint, mutation of the touched lists, fit, privacy canary).
`/slice <ID>` is a command prompt, not a framework: load those inputs, state the design and the risks, implement within the scope, run the proof steps, produce the review packet (3.4), **stop** at the first stop condition (3.6) and write the question to the decision queue. `tools/slice` (small) assembles the **context pack** — the slice's own documents and nothing else — and enforces the budget by reading `git diff`.

### 3.4 The change report (review packet) — `tools/slice report`

Generated, never hand-written, into `artifacts/reports/<slice>-<commit>.md` and **never overwritten** (a new commit is a new report). It states: what changed by **file class**; scenarios added and their derived states; invariants threatened and whether each is still held; permissions delta (the manifest's `uses-permission` before/after); privacy canary result; suite counts; mutation survivors (killed · alive · equivalent · missing); fit dispositions and their change from the last report; open decisions. This is the five-minute review interface.

### 3.5 File classes — `docs/FILE_CLASSES.json` and `tools/governance check --diff`

Each path glob has one class — `CONSTITUTIONAL`, `PROTOCOL`, `CONTRACT`, `DECISION`, `DOMAIN`, `TEST`, `TOOL`, `GENERATED`, `DEVICE` — and each class a required gate. `tools/governance` fails a diff that touches a gated class **without a matching approval record** in `docs/APPROVALS.json` (gate, paths, the `DR-n` or decision that approved, date). Enforcement is by **check** (run by `/slice`, lint, and later `/release-check`), not by blocking tools: the first goal is that an agent cannot weaken a rule *unnoticed*, and a blocking hook can be added once the checks have proved their false-positive rate. `GENERATED` files (the APKs, `build/`, derived reports) are never hand-edited — the check refuses a hand edit to them.

### 3.6 The decision queue and stop conditions — `docs/DECISIONS_PENDING.md`

An agent that meets a decision that is the operator's writes it here and **stops that line of work**: question, options, evidence, recommendation, what it blocks. Stop conditions, written into `/slice`: a design conflict; a change to a constitutional or protocol file; an unknown privacy implication; a new permission; ambiguous protocol semantics; **three consecutive failed repairs**; a behavioural change in the fit or ledger that the slice's scenarios do not explain. The queue is a plain list with a lint rule on its format. Answered entries move to `DECISIONS.md` as a DR (or to `docs/SETTLED.md` if they are findings), so the operator's work becomes *answering*, not hunting.
Learnings use the same plain format in `docs/LEARNINGS.md` (`L-017`: failure → root cause → fix → regression → invariant), seeded with the seam's origin (a payment is not a closure → OBS, I-008).

## 4. What I would change from the proposal

- **JSON, not YAML.** The repository has no dependencies and Node has no YAML parser; JSON is what the fixtures already use, and a registry the tools can read without a library is worth more than prettier syntax.
- **Scenario state is derived** (3.2). Hand-set states rot; this is the single largest risk to the whole scheme.
- **`DECISIONS.md` is not split yet.** It is 1,400+ lines with live cross-references; a machine index (`DR` ids, status, affected paths) comes first, the split can wait for Phase 2 when impact analysis needs it.
- **Enforcement by check before block** (3.5).
- **Agents: three in Phase 1, not five.** `builder`, `reviewer`, `adversary` as prompts over the same slice file; the device verifier and analyst already exist as `export-reader` and the device protocol in `DEVICE_LOOP.md`.

## 5. Risks

| Risk | Handling |
| --- | --- |
| Bureaucracy outweighs the work for one builder | Phase 1 is six small files per domain; if seeding Money A costs more than it returns, stop and say so (§6) |
| The registry becomes decoration | derived states; a stale proof fails; mutation protection is checked, not asserted |
| Scenarios written to match the code, not the design | scenarios are written from the design doc's requirements first, and a scenario with no `mustNot` is incomplete |
| An agent edits the registry to turn itself green | `docs/scenarios`, `docs/invariants`, `FILE_CLASSES.json` are `PROTOCOL`-class: changing them needs an approval record |
| Privacy of the reports | reports contain counts, names and file paths only; the canary test runs over them |

## 6. Order of work, once approved

1. `docs/invariants`, `docs/scenarios` (Money A seeded), `tools/scenarios` (`check`, `impact --diff`) with tests and a mutation list.
2. `docs/FILE_CLASSES.json`, `docs/APPROVALS.json`, `tools/governance`.
3. `docs/DECISIONS_PENDING.md` and `docs/LEARNINGS.md` with their lint rules.
4. `tools/slice` (`context`, `report`) and `/slice`, `/review`, `/adversary` as commands; the three agent prompts.
5. **Run Money B through it** — the first real slice — and keep only what proved its weight. A written account of what the system caught or missed on B is the acceptance test for Phase 1.

Money slice A (in flight) finishes as it is: it predates the system and is the seed data, not a consumer.

## 7. Questions for the operator

1. **Scope and order.** Phase 1 as above, built before Money B? *Recommendation: yes — B is the first slice with a human-answered instrument and benefits most; keep to the five steps in §6.*
2. **JSON for the registries** (§4)? *Recommendation: yes.*
3. **Enforcement.** Checks first, blocking hooks only after they have run clean through B and C? *Recommendation: yes.*
4. **Retroactive seeding.** Seed Money A's scenarios and the existing guards as invariants now (about thirty entries), or start the registries empty and fill them from B onward? *Recommendation: seed — an empty registry teaches nothing about whether the format works.*

## 8. Decisions (2026-10-04)

1. **Phase 1 before Money B — yes.** Money B is the acceptance test of the system, not a feature built after it. Sequence: finish slice A's mutation → Phase 1 → run Money B through it → fix what the system misses → Money C. *Phase 1 is not to be expanded while it is built.*
2. **JSON registries — yes.** Machine-verifiable and dependency-free matter more than the format. Scenario state is derived from the existence and passing of its named checks.
3. **Checks before blocking hooks — yes.** Detect → report → learn → stabilise; the first blocking rule only with evidence from B and C that it catches the right things without noise.
4. **Seed about thirty scenarios now — yes**, from existing proven behaviour and guards, each pointing at an exact check; no scenarios manufactured to reach a number.

**One rule made explicit.** *A scenario is never itself proof.* The chain is scenario → named checks → their passing result → the current commit → the change report. If a test is deleted, renamed, skipped or no longer exercises the behaviour, the scenario becomes unproven (derived state).

**The acceptance test.** The most important outcome of Money B is not whether Money works but whether the system **catches something the agent would otherwise have missed**. If it does, it has earned its place; if not, it is trimmed to what proved its weight.

## 9. As built — Phase 1 (2026-10-04)

| Piece | Where | State |
| --- | --- | --- |
| Invariants | `docs/invariants/INVARIANTS.json` — 16, each with the files that threaten it and the named checks that hold it | seeded from guards that already existed |
| Scenarios | `docs/scenarios/{money,observation,loop,other}.json` — 40: 37 with proof, 3 drafts that name real gaps (a keep that fails part-way; a statement whose balances do not reproduce; payee text never leaving the bundle) | `node tools/scenarios/cli.mjs check --run` |
| Scenario tooling | `tools/scenarios` — derived state (draft · tested · failing · unproven · regressed), `impact` | 18 tests |
| File classes and approvals | `docs/FILE_CLASSES.json`, `docs/APPROVALS.json`, `tools/governance` — a manifest gates only when its permissions differ; self-governing files always flagged | 12 tests |
| Slices | `docs/slices/MONEY-A.json` (written after the code, from it), `tools/slice` — context pack, budget, change report | 15 tests |
| Decision queue, learnings | `docs/DECISIONS_PENDING.md`, `docs/LEARNINGS.md` — formats held by `npm run lint` | seeded with two learnings |
| Commands and agents | `/slice` `/review` `/adversary`; `builder` `reviewer` `adversary` (with `mutation-reviewer`, `export-reader`) | prompts |

**Not built (deliberately, §6):** the impact *graph* beyond `impact`, conformance/golden/differential runners, worktrees, the device runner and prediction registry, privacy and permission scanners, the release gate, the artifact registry, the dashboard.

**What running slice A through it already showed** (the first honest account, before B). Two things were caught that a green suite had not shown: (1) trying to name a proof for *"a keep that fails part-way leaves what was there"* (M-019) found there is none — the store is written to do it and nothing tests it, so it is a draft that says so; (2) the mutation round the report requires found fifteen survivors in a ledger whose 3,277 checks all passed (`LEARNINGS.md` L-002). (3) The first change report said `BLOCKED`: a check renamed during the mutation fixes had left scenario M-018 unproven, and the slice's scope did not yet include the mutation configuration written while it ran (`LEARNINGS.md` L-003) — neither of which the green suite or I had noticed. What it did **not** catch: the three amendments to the design that slice A made (corroboration pairs across adapters, not senders; ambiguity is flagged on both sides of a pairing; `information.noted` is not kept) came from measuring the real file and from the mutation round, not from the registries.

## 10. First acceptance evidence: Money B (2026-10-05)

The question was whether the system would catch something the agent would otherwise have missed. On slice B it did, three times, none of them by the green suite:
1. **The registry caught two stale proofs** (a check renamed while fixing a mutation survivor, twice): the report said `UNPROVEN` before anything shipped.
2. **The independent `reviewer` found the build not ready** with a suite of 3,371 green checks, a clean first mutation run and 49 of 52 scenarios proven: the one function that writes the person's answer was outside the suite, the proof that "an answer changes nothing" was greps, and a design consequence (chains of reminders: 13 of 20 candidates) made the unit of a label wrong. All three are fixed and recorded (`LEARNINGS.md` L-005).
3. **The decision queue stopped a build** on a real semantic gap (`PD-001`: does *Mark paid* close a loop that does not exist?) instead of improvising.

What did **not** help: the file-class gate and the budget, which had nothing to catch (every change was approved and in scope); they have earned no blocking rule yet. The honest reading: the *registries and the independent reviewer* earned their place; *governance* has yet to.

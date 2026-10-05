# Mutant lists

Every list is a record of changes that were tried against a suite and what the suite did about them. When each
was written its survivors were turned into tests or documented as equivalent. Lists were written as the features
were; the name is the round, not a subject. Run one against the phone app:
`node tools/mutate/mutate.mjs --list tools/mutate/lists/<name>.json` (check first with `--verify`).

| Lists | Area |
|---|---|
| `par.json` `par2.json` `par3.json` | Loop protocol: lifecycle, matching, commitments as loops (`par2` is the final loop list) |
| `par4.json` `par5.json` `par6.json` | Sender marks (DR-42) |
| `par7.json` `par8.json` | Observation seam (DR-43): normalizer, interpreter, correlator, store |
| `brief*.json` | Morning brief |
| `calls*.json` | Call log reading |
| `docs*.json` `dd*.json` `dp*.json` | Document reading, dates, people in documents |
| `msg*.json` `json*.json` `mime.json` | Message backup reading (XML/JSON) |
| `safety*.json` | Safety check |
| `und*.json` | Understanding (what Orb judged and why) |
| `note*.json` `marks*.json` `sev.json` | Person notes, marks, severity |
| `c*.json` `l*.json` `h.json` `n3.json` `p*.json` | Earlier phone-app rounds (capture, links, handoff, nudge, people) |
| `money-a.json` | Money slice A: the ledger and its corroboration, the six-way dispositions, the keep capability and bundle erasing (54 mutants; 49 killed, 5 documented equivalent, 0 alive after three rounds) |
| `money-a2.json` | Switched off means off: the revocation check, the refusal on the Sources screen, the turn-on dialog (8 mutants, all killed) |
| `tools-export.json` | The export analyser (use with `--config tools/mutate/tools-export.json`) |
| `tools-engsys.json` | The engineering system's tools: scenarios, governance, slice (70 mutants, all killed; use with `--config tools/mutate/tools-engsys.json`) |

## Status against HEAD (`--verify`)

How many of each list's mutants still apply to the current source. A list at 100% can be re-run to confirm the suite still kills everything it killed then; a partial list is history — the code it targeted moved (the reading rules, for instance, now live in the normalizer, not in `LoopFit`), so regenerate rather than trust it.

| List | Applies today |
|---|---|
| `brief` | 65 of 74 |
| `brief2` | 67 of 76 |
| `brief3` | 9 of 9 |
| `brief4` | 6 of 6 |
| `c` | 31 of 44 |
| `c2` | 10 of 11 |
| `c3` | 11 of 11 |
| `calls` | 83 of 86 |
| `calls2` | 11 of 11 |
| `calls4` | 10 of 10 |
| `dd` | 62 of 64 |
| `dd2` | 18 of 18 |
| `docs` | 70 of 72 |
| `docs2` | 20 of 20 |
| `docs3` | 3 of 3 |
| `dp` | 34 of 35 |
| `dp2` | 4 of 4 |
| `h` | 28 of 30 |
| `json` | 67 of 67 |
| `json2` | 67 of 67 |
| `json3` | 67 of 67 |
| `l` | 30 of 31 |
| `l2` | 11 of 11 |
| `loop` | 51 of 80 |
| `marks` | 19 of 19 |
| `marks2` | 19 of 19 |
| `mime` | 3 of 3 |
| `msg` | 107 of 112 |
| `msg2` | 107 of 112 |
| `msg3` | 2 of 2 |
| `n3` | 26 of 26 |
| `note` | 42 of 42 |
| `note2` | 42 of 42 |
| `p` | 25 of 26 |
| `p2` | 10 of 11 |
| `p3` | 10 of 11 |
| `p4` | 7 of 7 |
| `p5` | 1 of 1 |
| `p6` | 12 of 12 |
| `p7` | 1 of 1 |
| `par` | 51 of 80 |
| `par2` | 68 of 107 |
| `par3` | 0 of 15 |
| `par4` | 47 of 53 |
| `par5` | 12 of 14 |
| `par6` | 2 of 2 |
| `par7` | 79 of 80 |
| `par8` | 9 of 9 |
| `safety` | 56 of 58 |
| `safety2` | 8 of 8 |
| `sev` | 35 of 35 |
| `tools-export` | 31 of 31 |
| `und` | 78 of 78 |
| `und2` | 78 of 78 |

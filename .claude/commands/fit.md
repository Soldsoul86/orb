---
description: Run the real-corpus fit probe on a message backup and read the counts (never the text)
argument-hint: <path to a message backup .json/.xml/.sms>
---

Run `tools/fit/probe.sh $ARGUMENTS` (`tools/fit/README.md`) and summarise the output.

* Report counts and closed-vocabulary names only. **Never print, quote or paraphrase a message body, and never repeat a
  person's name or number** — brands (non-numeric sender ids) the report lists are fine. If an id looks like a person,
  leave it out.
* Do not write the backup, or anything derived from its text, into the repository. Do not build a tool that prints bodies.
* The corpus used to tune the rules is not a held-out set: say so whenever you quote a percentage.
* Compare with the last figures in `docs/DEVICE_LOOP.md` and say what moved and why.

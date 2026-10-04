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

*(none)*


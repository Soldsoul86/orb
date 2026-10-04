# tools/export — design

`lib.mjs` is pure (text in, plain data out); `analyse.mjs` is the shell (files, arguments, exit codes).

## Decisions

* **Counts and names, never values.** Exports hold people's data. The only payloads shown whole are those of types
  on a closed list (`NUMERIC_REPORTS`: the fit report), and even then only numeric fields. A type outside the list
  is refused by name. `--keys` gives field names for noticing a new field, not what it holds.
* **Chain check = continuity + payload hashes.** Each event must name the hash of the one before; each plaintext
  payload must hash (canonical JSON, sorted keys) to the envelope's `payloadHash`. The envelope hash itself is the
  journal's to verify — an export is checked for continuity, not re-signed. Sealed payloads are counted, not judged.
* **Predictions are bounds on counts.** `docs/DEVICE_LOOP.md` numbers its predictions; the mechanical ones ("exactly
  one `orb.sender.judged` after the Record press") become `{id, type, min, max}`. Predictions about *behaviour* stay
  with the person reading the phone.
* **An export that does not begin at the start of a lane reports one link break.** That is true: its first event
  names a predecessor the file does not hold.

## Risks

* If the journal's canonical form changes, `payloadMismatches` will say so loudly on every event; fix `canon` with it.
* The analyser trusts event `type` strings it is given; it does not validate payload shapes (the journal does).

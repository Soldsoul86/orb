# tools/fit — tests

`node --test tools/fit/tests/probe.test.mjs` (also `npm run test:tools`). Skipped, with the reason, when there is no JDK.

* On a synthetic backup (a service sender with debits, a promo sender, a person) the probe exits 0, prints
  `messages 13 service 10 conversational 3`, the roles-sum and disposition-sum lines say `ok`, and the ledger line counts the six debits.
* **Privacy:** every message body carries a canary string and the person's number; neither appears in stdout or stderr.
* Two runs on the same file give byte-identical output.
* No argument → exit 64; a missing file → exit 66, before anything is compiled.

# API

`extractHandles(text: string): Handle[]` — the handles a text names, in order of appearance, each `(kind, value)` once. Never throws.

`Handle = { kind: HandleKind, value: string }`; `HandleKind = "phone" | "site" | "email" | "upi" | "amount" | "date"`.
Values: phone `+91…` / `+<country>…`; site `host`; email and UPI lower-case; amount `INR 1200` / `INR 1200.50`; date `YYYY-MM-DD`.

`MAX_CHARS = 1_000_000`, `MAX_HANDLES = 200`.

`relativeDays(text: string, anchor: string): RelativeDay[]` — the relative days a text names (*tomorrow*, *day after tomorrow*, *in N days/weeks*, a spelled-out weekday), read **from `anchor`** (`YYYY-MM-DD`, passed in — no clock inside), each date once, in order of appearance. `RelativeDay = { date, phrase }`. A guess: conservative, with *next / last / every / each / other / any / since / following*, plurals, abbreviations, *today*, the past and other languages **not read**. `RELATIVE_MAX_CHARS = 1_000_000`, `RELATIVE_MAX_DAYS = 20`.

`matchNames(text: string, contacts: NameContact[]): NameMatch[]` — which contacts a text names, in contact order, each once. `NameContact = { id, name }`; `NameMatch = { id, by: "full" | "first", word }` (`word` is what the text wrote). A **full name** is matched as a phrase in any case; a **first name** only if it is **unique among the contacts**, at least `NAME_MIN_FIRST = 3` letters, and written with a capital (or in a script without case) **and not as the first word of the text, a line or a sentence** (cased scripts only; a sentence ends at `. ! ? … ।`). Whole words only; the full name wins over the first. Never throws.
`sharedFirstNames(contacts): string[]` — the first names two or more contacts share (folded to lower case), which `matchNames` will not match on their own. `NAME_MAX_CHARS = 1_000_000`, `NAME_MAX_CONTACTS = 5000`.

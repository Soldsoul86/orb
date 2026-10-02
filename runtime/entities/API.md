# API

`extractHandles(text: string): Handle[]` — the handles a text names, in order of appearance, each `(kind, value)` once. Never throws.

`Handle = { kind: HandleKind, value: string }`; `HandleKind = "phone" | "site" | "email" | "upi" | "amount" | "date"`.
Values: phone `+91…` / `+<country>…`; site `host`; email and UPI lower-case; amount `INR 1200` / `INR 1200.50`; date `YYYY-MM-DD`.

`MAX_CHARS = 1_000_000`, `MAX_HANDLES = 200`.

`relativeDays(text: string, anchor: string): RelativeDay[]` — the relative days a text names (*tomorrow*, *day after tomorrow*, *in N days/weeks*, a spelled-out weekday), read **from `anchor`** (`YYYY-MM-DD`, passed in — no clock inside), each date once, in order of appearance. `RelativeDay = { date, phrase }`. A guess: conservative, with *next / last / every / each / other / any / since / following*, plurals, abbreviations, *today*, the past and other languages **not read**. `RELATIVE_MAX_CHARS = 1_000_000`, `RELATIVE_MAX_DAYS = 20`.


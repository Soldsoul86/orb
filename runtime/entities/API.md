# API

`extractHandles(text: string): Handle[]` — the handles a text names, in order of appearance, each `(kind, value)` once. Never throws.

`Handle = { kind: HandleKind, value: string }`; `HandleKind = "phone" | "site" | "email" | "upi" | "amount" | "date"`.
Values: phone `+91…` / `+<country>…`; site `host`; email and UPI lower-case; amount `INR 1200` / `INR 1200.50`; date `YYYY-MM-DD`.

`MAX_CHARS = 1_000_000`, `MAX_HANDLES = 200`.

# Action Lock

A lock for irreversible actions, the way a screen lock guards a phone.

Every payment, message or post — from you or from an agent acting for you —
waits for a buffer **you** choose. During the buffer the system checks how
serious the action is and tells you only when it matters. You can stop it at any
moment; serious actions need your fingerprint or a second person.

Status: working prototype. Not part of the Orb runtime (see `DESIGN.md` §12).

![Phone view](demo-phone.png)

## Run

Needs Node 22.18 or newer (runs TypeScript directly).

```bash
npm install
npm test          # 28 tests
npm run typecheck # strict TypeScript
npm start         # demo on http://localhost:8787 — open it at phone width
```

### On a phone, with no server

```bash
npm run build:phone   # writes dist/action-lock.html (lock bundled into the page)
```

The same TypeScript core the tests cover is bundled into one page
(`src/browser.ts` entry), so the phone runs the tested code, not a copy.
It is published as a private claude.ai page for opening on a Pixel.

In the demo, tap a scenario under **Simulate an agent**:

| Scenario | Level | What the lock does |
|---|---|---|
| Food order ₹200, paid before | 0 | Sends at once |
| Message to a new contact | 1 | 2 s countdown |
| ₹5,000 to a new UPI ID | 2 | 10 s countdown, "never paid this person" |
| ₹25,000 to a new UPI ID | 3 | Fingerprint + 30 s |
| Agent emails an OTP | 4 | Second person, 300 s, "can't be taken back" |
| ₹50,000 during a call from an unknown number | 4 | Second person, 300 s, scam warning |

Under **Your policy**, "Make new payees instant" shows loosening waiting (60 s
in the demo, 24 h by default) while "New payees: 30 s" applies immediately.

## Files

| File | What it is |
|---|---|
| `DESIGN.md` | Design: modes, flow, severity, policy, events, risks |
| `API.md` | The library and HTTP interfaces |
| `TESTS.md` | What the tests prove |
| `src/` | Functional core (`gate`, `severity`, `policy`, `state`) and shell (`journal`, `lock`, `server`) |
| `test/` | `node:test` suites |
| `public/index.html` | The phone page (talks to the server, or to the bundled lock) |
| `src/demo.ts`, `src/browser.ts` | Demo backend shared by the server and the phone build |
| `scripts/build-phone.mjs` | Builds the self-contained phone page |

# Declaring what Orb reads — closing AD-7 (proposed)

> Status: **proposed 2026-10-02, awaiting the operator's go-ahead.** Nothing here is built.
> Closes `ARCHITECTURAL_DEBT.md` AD-7 on the phone. Builds on `GATE_PHONE.md` (DR-20, the registry and *What Orb may do*).
> Contracts: `Capability.md` §1 (*"Reads are capabilities too"*), §8; `Policy.md`. **No contract text changes. No behaviour changes** — see §4.

## 1. Why, in plain words

Orb now has one capability that *acts* (a reminder), declared, listed on *What Orb may do*, withdrawable, and recorded. But three things Orb **reads** were decided somewhere else — in a manifest, in a setting, in a tap on another screen —
and are not in that one place: it reads which apps are installed, it reads the text of a screen when you invoke it, and it reads which apps hold powerful settings (accessibility, notification access, device admin). AD-7 is the debt of those reads
living outside the boundary. The cure is **not** to change them; it is to **declare them honestly, show them with the actions, and prove by test that each one only runs the way it says.**

## 2. The declarations

Four capabilities, tier **Observe**, each frozen with its text pinned (as the reminder's is) — a wider read is a *new* capability, never an edit:

| Capability | Says (plain words) | Authorized by | Recorded as (already) | Withdrawn by |
| --- | --- | --- | --- | --- |
| `installedPackages.read` v1 *(the id already in history)* | *Reads which launcher apps, UPI-payment apps and device-admin apps are installed — about 150 names. Nothing leaves the phone. Runs at start-up and when you ask, at most twice a day.* | **Your grant**, a recorded decision (`grants.capability.granted`) | `grants.packages` | *Package scanning: revoke* (`grants.capability.revoked`) |
| `orb.read.screen` v1 | *Reads the text on the screen you are looking at — only when you invoke Orb as the assistant, only in an app you allowed, never a login screen or a payments app (unless you named one an exception). Shows it to you first; keeps it only if you tap Remember.* | **Your allow-list** (`orb.assist.allowed`, one per app) **and** your invoking it, every time | `orb.assist.captured` (kept) / `orb.assist.declined` (not) | *Apps Orb may remember from: remove* |
| `orb.read.grants` v1 | *Reads which apps hold accessibility, notification-listener and device-admin powers — the ones that could watch you. Needs no permission. Runs at every start; this is what lets Orb alert you when one changes.* | **Always on** — it protects you; no permission is involved | `grants.observed` | not switchable in this slice (§5) |
| `orb.remind.local` v1 | *(declared in `GATE_PHONE.md`)* | Your confirmation of each reminder | `orb.action.*` | *What Orb may do → turn off* |

Receiving a share is **not** a capability — the world reaching in is the other direction (`SENSOR_SHARE.md` §3, ruled): the share *is* the authorization.

## 3. What changes on screen

*What Orb may do* lists **all four**, each with its plain-words declaration, its **state read from history** (granted / revoked; N apps allowed; always on), **its last use** — *last scan 2 Oct 09:12 · 153 apps*, *last remembered 1 Oct 18:02* (counts and times only, never content) —
and **the one control that withdraws it** (the existing one; the row links to it). One place to see, in one voice, everything Orb may do or read.

## 4. Nothing about how they behave changes

The scan, the assistant and the grants watch run exactly as they do. The record of each use is **the event that already exists** — adding a second "action" record beside it would be two sources of truth for one fact (CLAUDE.md). The declaration
makes the existing events *the* record (`recordsAs`), and the screen reads them. The only new code is the registry (declarations as data), the screen rows, and tests.

## 5. The one open question: the grants watch

`orb.read.grants` is **always on and not switchable**, because it is what notices a new accessibility service or notification listener — the signal that protects you — and gating the free thing while leaving the costly thing open would be a permission nobody reads
(`PackageAccess` says this). It is declared and shown, honestly, so the *one read that is not yours to switch off* is visible as exactly that. If you would rather be able to turn it off, that is a small addition with the same
recorded grant/revoke the package scan has.

## 6. How "only the way it says" is proven (the tests)

- **The declarations are pinned** (text hash), so a change is a visible, deliberate new capability.
- **Every read path is mapped to a declaration and guarded in the source:** the package enumeration is called only from the scan, which refuses unless granted (the existing refusal is re-tested); the screen's text accessors only inside `ScreenReader`, reached only after the allow-list
  check and your invoking (the existing `AssistGuardTest` holds this; the registry test asserts the mapping); the grants reader only from the watch.
- **Nothing reads that is not declared:** a guard that every use of the platform's enumeration, screen-text and grant APIs sits in a file the registry names — a *fifth* read added without a declaration fails the build.
- **The screen's state is the journal's:** tests build histories (granted, revoked, an app allowed and removed) and assert the rows.
- Mutation-checked as before.

## 7. Risks

| Risk | Handling |
| --- | --- |
| The words drift from the behaviour | Pinned text; the guards tie each sentence to a code path (*only when you invoke*, *never a login screen*) |
| "Last use" leaks something | Times and counts only; the same fields the existing events already carry in the clear |
| A second source of truth | None added — the screen is a projection over existing events |
| Over-explaining to the point nobody reads it | One short declaration per row; detail behind the existing screens |

## 8. What it closes, and what it does not

**Closes AD-7:** the package read and the assistant's read are declared at tier *Observe* with their privacy cost stated, authorized by a recorded decision, visible and withdrawable in one place, and held by tests. **Does not build** a Policy language
(rules as data): *you* are the policy, as with reminders (`Policy.md` allows it) — a richer Policy waits for a second person or a second device to need it.

## 9. For the operator to approve

1. **The four declarations** in §2, with the existing ids, and *what they say*.
2. **The grants watch stays always-on, shown but not switchable** (§5) — or say you want a switch.
3. **The screen** shows state and last use (counts and times only) for each.

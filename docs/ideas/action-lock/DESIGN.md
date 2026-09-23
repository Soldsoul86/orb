# Action Lock — Design

Status: prototype design, for review. Not part of the Orb runtime. See
"Relation to Orb" at the end.

---

## 1. Problem

OAuth, APIs and agents removed the moment between deciding to do something and
it becoming irreversible. A payment, a message, a post or a leaked password
takes effect the instant a button is pressed — by a person or by an agent — and
there is no way back.

The buffers that exist today belong to someone else: Gmail decides the undo
window (at most 30 s), a bank decides the cooling period, an enterprise gateway
decides which tool calls need approval. The user does not.

## 2. Idea

A lock for actions, the way a screen lock or fingerprint lock guards the phone.

- Every irreversible action — from the user or from an agent acting for them —
  passes through the lock.
- The lock holds it for a buffer. **The user decides how long**, per kind of
  action, recipient, amount and time of day.
- **During the buffer the system analyses the action's severity** and gives
  feedback only when it matters ("You've never paid this person", "This message
  contains a one-time code").
- The user can stop the action at any moment of the buffer. Serious actions need
  an unlock (fingerprint), the most serious a second person.
- The phone is the interface: pending actions appear like lock-screen
  notifications with a countdown and a Stop button.

## 3. Lock modes

Ordered from least to most strict. "Stricter" always means a higher rank, and
for the same mode, a longer hold.

| Rank | Mode | What happens | Like |
|---|---|---|---|
| 0 | `pass` | Released immediately | Unlocked phone |
| 1 | `countdown` | Released when the hold ends unless the user presses Stop | Gmail undo send |
| 2 | `unlock` | Needs a fingerprint/PIN, and not before the hold ends | Fingerprint lock |
| 3 | `second_person` | Needs confirmation from a person the user chose | Two-key locker |
| 4 | `block` | Never released; the user can only stop it | Disabled button |

A gate is `{ mode, holdSeconds }`.

## 4. Flow

```
agent / user presses send
        │
        ▼
  ActionRequested ──► analyse severity (0–4) + findings
        │
        ▼
  decide gate  =  user policy  (+ critical floor)
        │
        ▼
  ActionGated { gate, releaseAt, feedback }  ──► phone shows countdown card
        │
        ├── user presses Stop ─────────► ActionStopped        (never executed)
        ├── fingerprint ───────────────► ActionUnlocked
        ├── second person confirms ────► SecondPersonConfirmed
        │
        ▼  when hold ended AND required unlocks present
  ActionReleased ──► executor makes the real call ──► ActionExecuted / ActionFailed
```

- `ActionReleased` is appended **before** the executor is called. After that,
  Stop returns "too late". Stop and release can never both succeed.
- Nothing leaves the lock before `ActionReleased`. The hold is real, not a UI
  delay.

## 5. Severity analysis

`SeverityAnalyzer` is an interface. It returns a level 0–4 and a list of
findings, each with a short feedback sentence.

The prototype ships a deterministic, rule-based analyzer. A decision model
(e.g. Jev) or any other classifier can implement the same interface later; no
model provider is hardcoded.

| Finding | Level | Feedback shown to the user |
|---|---|---|
| Contains a one-time code, password or API key | 4 | Once sent, it can't be taken back |
| Payment while on a call with an unknown number | 4 | Scammers ask for payments during calls |
| Payment to someone you've never paid | 2 | You've never paid this person |
| Large amount (≥ 10,000) | +1 | Unusually large |
| Between midnight and 6 am | +1 | It's late — check this isn't a rushed decision |
| Message/email to someone new | 1 | — |
| Known recipient, small amount | 0 | — |

Levels combine by taking the highest base level and adding modifiers, capped at
4. Feedback is shown only for level ≥ 2 ("feedback if necessary").

## 6. User policy

The policy belongs to the user and is edited on the phone.

```
Policy {
  defaults:      gate for each severity level 0–4
  rules:         ordered list; first match wins
                   match: kinds, recipients, newRecipient, minAmount,
                          maxAmount, hours (local, may wrap midnight)
                   gate:  { mode, holdSeconds }
  criticalFloor: minimum mode for level-4 actions, whatever the rules say
  loosenDelaySeconds: how long a loosened policy waits before it applies
}
```

Decision:

1. `base` = gate of the first matching rule, else `defaults[level]`.
2. If level is 4, `gate` = stricter(`base`, `{ criticalFloor, defaults[4].hold }`).

Example rules a user might write:

| Rule | Gate |
|---|---|
| Payments to Swiggy under ₹1,000 | `pass` |
| Messages to Mom | `pass` |
| Any payment to someone new | `countdown` 600 s |
| Anything between 23:00 and 07:00 | `countdown` 28,800 s (until morning) |
| Payments over ₹50,000 | `second_person` |

Rules may later be written in plain language on the phone; an LLM converts them
into this typed form and shows it back for confirmation. **Models are used only
to write rules, never to enforce them.** Enforcement is the pure function above.

## 7. Loosening waits, tightening is instant

If the buffer could be set to zero instantly, a scammer coaching a victim, or a
hijacked agent, would say "set your buffer to 0".

- A policy change is recorded as `PolicyChangeProposed { policy, effectiveAt }`,
  with `effectiveAt = now + loosenDelaySeconds`.
- Until `effectiveAt`, every action is gated by **stricter(old decision, new
  decision)**. So the parts of the change that tighten apply immediately, and
  the parts that loosen apply only after the delay.
- After `effectiveAt` the new policy alone applies.

No classification of "is this change tighter?" is needed; taking the stricter
of both decisions gives the right answer for every mix of changes.

## 8. Events and replay

All state is derived by folding an append-only journal of immutable events:

`ActionRequested`, `ActionGated`, `ActionStopped`, `ActionUnlocked`,
`SecondPersonConfirmed`, `ActionReleased`, `ActionExecuted`, `ActionFailed`,
`PolicyChangeProposed`.

- Events are never mutated or deleted.
- Replaying the same journal gives the same state.
- The clock is injected; given the same events and times, decisions are the same.

## 9. Components

Functional core, imperative shell.

| Module | Kind | Responsibility |
|---|---|---|
| `types.ts` | types | Actions, context, gates, events |
| `gate.ts` | pure | Mode ranks, `stricter` |
| `severity.ts` | pure | `SeverityAnalyzer` interface + rule-based analyzer |
| `policy.ts` | pure | Rule matching, `decide`, policy-change handling |
| `state.ts` | pure | Fold events into state, `canRelease` |
| `journal.ts` | shell | Append-only in-memory journal |
| `lock.ts` | shell | `ActionLock`: submit, stop, unlock, confirm, tick, propose policy |
| `server.ts` | shell | HTTP API + mobile page for the demo |

Dependencies (clock, journal, analyzer, executor) are injected.

## 10. What the prototype does not do

- **No real services.** The executor is an interface; the prototype uses one
  that records calls. Gmail (hold in the lock) and Slack (native scheduled
  message) executors are the next step.
- **No credential vault.** In the real system the OAuth tokens live in the
  phone's secure hardware (Android Keystore / iOS Secure Enclave) and agents
  only hold a token for the lock. That is what makes the lock unavoidable.
- **No real biometrics.** "Unlock" is a button; on a phone it is the platform
  biometric prompt.
- **No interception of other apps.** Mobile OSes don't allow one app to hold
  another's send button. The lock covers agents and apps that route through it.
- **Single device, in memory.** No persistence or sync.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Too many holds → user turns it off | Defaults hold only level ≥ 1; target < 1% of actions needing attention |
| Coercion: user is talked into unlocking | Critical floor + second person + feedback during the buffer |
| Bypass: agent holds raw tokens | Only credentials held by the lock are protected; vault is mandatory in the real system |
| Phone offline | Nothing is released — fails safe |
| Personal data (contacts, calls, mail) leaks | Read only on the user's computer, into a git-ignored folder; nothing is uploaded; mail bodies are never saved, only receipts, bookings and masked counts |
| A payee's name matches a contact | Shown to the user, but the payee still counts as new: a UPI name is not proof of who holds the account |

## 12. Relation to Orb

This is close to Orb's own Capability Model: permission tiers by consequence
and reversibility (`CAPABILITY_MODEL.md` §5) and Article VII — irreversible
actions need scoped human authorization. Action Lock refines "confirm or not"
into a **user-owned, graded buffer with severity analysis**.

Orb is in Phase 3 (contracts, no implementation), so this prototype lives under
`docs/ideas/` and does not touch Orb's runtime or packages. Adopting it into the
Capability Model would be an architecture change and needs explicit approval.

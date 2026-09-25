# The Airwall — offline by construction, intelligent by exception

> Status: **PROPOSAL. Architectural. Not accepted, not implemented.**
> Per `CLAUDE.md`: design explained, risks identified, implementation proposed —
> **awaiting approval before any code.** It introduces one new component and
> constrains `Reasoner` behaviour, so it touches `AGENT_RUNTIME.md` §4 and
> `SECURITY.md` §7 and must be reviewed against both.
> Companion to `SOVEREIGN_STACK.md` §5 (where egress is decided).

---

## 1. The requirement, stated precisely

> *Orb stays offline. Orb is intelligent. An LLM call never makes Orb reachable.*

Three things are being asked for at once, and they are separable:

1. **Orb is never network-reachable.** Nothing on the internet can address it.
2. **Orb never initiates a network connection.** It cannot be induced to phone
   home, exfiltrate, or fetch.
3. **Orb still benefits from a frontier model.**

(1) and (2) are achievable with certainty, because they are properties of what
Orb *is*, not of what it *permits*. (3) is achievable at a stated, bounded cost.

**What is not achievable is "never hackable."** Nothing is. §7 states plainly
what remains. But the goal underneath that phrase — *the worst case should be a
wrong belief, never a compromise* — is achievable, and Orb's existing laws
already do most of the work.

---

## 2. The precedent

This is not a novel architecture. Android's **Private Compute Core** is built
this way: from Android 12 on, features inside it have **no direct network
access** and communicate over a small set of APIs to **Private Compute
Services**, a separate component that holds the only network capability. Google
open-sourced PCS specifically so the boundary could be independently reviewed.

Worth knowing, for two reasons: the shape is proven at scale, and the part that
is hard is not the isolation — it is deciding what is allowed to cross.

---

## 3. Intelligence in three tiers, in this order

`AGENT_RUNTIME.md` §4 already says a local Reasoner must always be viable and no
provider is hardcoded. The airwall is not the primary path. It is the third one.

| Tier | Where reasoning happens | What leaves the device | Airwall needed |
| --- | --- | --- | --- |
| **A — On-device model** | The Pixel or the Mac | **Nothing.** | No |
| **B — Model on your own hardware** | A machine on your LAN | Crosses your network, not the internet | No — but the same capsule discipline is worth keeping, so Tier C is a config change and not a rewrite |
| **C — Frontier model, remote** | Someone else's servers | A capsule you approved | **Yes** |

Most questions Orb asks are Tier A questions: *is this heart-rate reading
unusual for me?* does not need a frontier model, it needs your own history. The
airwall exists for the minority of questions where a large model genuinely adds
something — and making that a deliberate, recorded exception is the design, not
an inconvenience.

---

## 4. The mechanism

**Orb has no network stack.** Not firewalled — absent. No listening socket, no
outbound socket, no DNS resolver, no HTTP client linked in. This is the whole
guarantee for requirements (1) and (2), and it is a build-time property that can
be *tested*, not a runtime policy that can be misconfigured.

The **Broker** is a separate, stateless component that holds all network
capability and no history.

```
        ORB (no network stack)                    BROKER (network, no history)
        ──────────────────────                    ────────────────────────────
  journal ──▶ build capsule  ──▶  [ capsule ]  ──▶  send to model provider
   (pure function, journaled)      out-tray              │
                                                          ▼
  record as Observation  ◀── [ response ] ◀──  write reply, forget
   (Art. III §12)            in-tray, parsed
```

Four properties do the work:

1. **Orb never initiates and never accepts.** It writes a file and reads a file.
   The Broker polls. Inverting who initiates is what removes the socket
   entirely — there is nothing to connect *to* and nothing that connects *out*.
2. **The Broker is stateless and holds no history.** It sees one capsule at a
   time and forgets it. A compromised Broker learns only what you already
   approved for disclosure. It has no path to the journal.
3. **The capsule is built by a pure function** from journal references to a
   minimal prompt — deterministic, unit-testable, and replayable. The same
   inputs produce the same capsule forever, which is what makes "what did I
   disclose?" answerable years later.
4. **The capsule is journaled before it leaves.** The disclosure is history
   before it is a transmission. `SECURITY.md` §7 and Art. VIII §32 require this;
   here it is mechanical rather than aspirational.

### The two directions are not symmetric

This is the part most designs get wrong.

**Outbound is a disclosure problem.** The risk is sending too much. The controls
are minimization, explicit scoped authorization, and the journaled record. The
capsule carries the question and the least context that answers it — no lane
ids, no device identity, no keys, no raw attachments, nothing not named by the
template.

**Inbound is an untrusted-input problem.** The risk is the answer being hostile —
prompt injection reaching the model through data it read elsewhere, a
compromised Broker, or a provider having a bad day. Two controls, and the second
is the one that actually matters:

- **Format.** A fixed, size-bounded, non-executable schema, parsed by a small
  total parser into a struct. No code, no auto-followed URLs, no references that
  resolve on their own.
- **Semantics — the real guarantee.** Under Art. III §12 a model output is
  *recorded as an Observation, never as truth and never as authority*. A response
  cannot name a Capability, cannot authorize anything, cannot address the
  runtime. **The most a hostile answer can achieve is to enter history as one
  low-confidence observation, attributed to the model that produced it.**

That second point is why the airwall is tractable. Orb does not need to decide
whether a model response is trustworthy, because nothing downstream treats it as
an instruction. Acting still requires a Capability, gated by Policy, with human
authorization for anything irreversible (`CAPABILITY_MODEL.md` §5). The
injection cannot reach the world; it can only reach the Evidence Graph, where it
is weighed against everything else and contradicted by better evidence.

Per `Observation.md`, an LLM-extracted claim sits around `confidence 0.41` —
below OCR, far below a GPS fix. The system was already built to distrust it.

---

## 5. How hard to isolate — pick a tier

The logical design above is identical at every tier. Only the channel changes.

| Tier | Channel | Shared attack surface | Cost |
| --- | --- | --- | --- |
| **1 — Process** | A directory. Separate user, no network namespace for Orb. | Shared kernel | None |
| **2 — Machine** | Two machines, serial/UART. Orb's host has Wi-Fi and Bluetooth disabled in firmware. | A UART and a parser | A second small board |
| **3 — Optical** | Screen → camera (QR), both ways. **No shared electrical bus at all.** | A camera decoder | Latency, manual involvement |
| **4 — Human courier** | You carry the question and type back the answer. | You | Impractical except for rare, high-stakes queries |

Tier 1 is enough for the stated threat model and costs nothing. Tier 2 is the
sweet spot if the concern includes kernel compromise. Tier 3 is where "air gap"
becomes literal.

**A note on data diodes.** A true diode is one-way by physics, which is exactly
wrong for a request/response exchange — two diodes back to back is just a
bidirectional channel with extra steps and a false sense of security. Use a
diode for the **outbound** leg if you want, but do not claim diode semantics for
the return path. The return path's safety comes from format narrowness and
semantic non-authority (§4), not from physics — unless you are at Tier 3, where
the human is the transport.

---

## 6. Failure modes

| Failure | Consequence | Why it is contained |
| --- | --- | --- |
| Broker compromised | It can lie in responses, and leak capsules | Lies become low-confidence observations, contradicted later. Leaks are bounded by what you already approved. It has no route to the journal. |
| Provider hostile or injected | A wrong answer enters history | Art. III §12 — an observation, never authority. Cannot name a Capability. |
| Broker offline | No Tier C reasoning | Degrade to Tier A. Art. V §20 — *nothing is live*; a pending question is a normal state, not an error. |
| Response never arrives | A question with no answer | Reflect records the gap, exactly as Art. XI §42 does for unconfirmed Actions. Applies to reasoning requests too. |
| Capsule over-discloses | Real, permanent privacy loss | **The one failure with no recovery.** Mitigated only by minimization, review of templates, and the fact that every capsule is journaled and auditable after the fact. |
| Parser bug | The genuine residual risk | §7. |

Note the shape: **every row is recoverable except over-disclosure.** That should
drive where review effort goes — capsule templates deserve more scrutiny than
the transport.

---

## 7. What remains — honest accounting

"Never hackable" is not a property any system has. What this design achieves:

- **Orb is not reachable.** No listening socket exists. Remote attack requires
  first compromising the Broker *and then* getting through §4's inbound controls
  — and the reward for all of that is one low-confidence row in the journal.
- **Orb cannot exfiltrate.** No outbound socket exists. Malicious code inside Orb
  would have to write a capsule, which is journaled and (for anything beyond a
  standing template) shown to you.
- **The attack surface is a few hundred bytes of parser**, on a machine with no
  network stack.

What is left, in descending order of realism:

1. **Over-disclosure.** By far the likeliest harm, and it is a design and review
   problem, not a security one. You approve a capsule template once and it leaks
   more than you realized, every time, forever.
2. **The parser.** Small, fixed grammar, memory-safe language, fuzzed, parsed in
   a restricted process — but non-zero.
3. **Supply chain.** Orb's own dependencies. Isolation does not help if the code
   arrived compromised.
4. **Physical access.** Covered by at-rest encryption (`SECURITY.md` §3) and,
   partly, by the tamper signals in `SOVEREIGN_STACK.md` §4.1.
5. **The host OS.** Tier 1 shares a kernel. Tier 2 does not.

Four of these five are unaffected by the airwall — which is the honest reading:
**the airwall closes the network-attack class completely and does nothing for the
others.** That is still worth building, because it is the class that scales:
remote attacks are cheap and automated, the rest require you to be a target.

---

## 8. What approval would cover

Nothing here is built. Approval would be for:

1. **A `Reasoner` invariant:** a Reasoner implementation may not open a socket.
   Remote models are reached only through the Broker. This strengthens
   `AGENT_RUNTIME.md` §4 by addition — a local Reasoner is already required to be
   viable; this says a *remote* one is never directly linked in.
2. **A new component, the Broker** — stateless, history-free, network-holding,
   outside the Knowledge Plane entirely. It is not an Agent, not a Capability,
   and owns no truth. Where it belongs in `KERNEL.md`'s six domains is an open
   question and the main thing review should settle.
3. **A capsule contract** — a pure, deterministic, versioned function from
   journal references to a disclosure, journaled before transmission. This is
   arguably where the real work is, and it may deserve to be a contract of its
   own rather than an implementation detail.
4. **Recording a reasoning request that was never answered** as a first-class
   gap, extending Art. XI §42's treatment of unconfirmed Actions to unanswered
   questions.

**Open question for review, stated rather than assumed:** `SYNC_PROTOCOL.md`
replicates lanes between devices, which means every device holds the full
history — including the phone, which is the most exposed device you own. The
airwall keeps the *network* away from Orb; it says nothing about *which device
holds what*. Partial replication may be a storage policy rather than a
constitutional matter, but it is a bigger hole in the same wall and should be
settled alongside this, not after it.

---

## 9. Sources

- [Private Compute Services](https://github.com/google/private-compute-services) (Google, open source) and [Android Private Compute Core Architecture](https://arxiv.org/pdf/2209.10317) — sandbox with no direct network access, egress via a separate component
- [Unidirectional network / data diode](https://en.wikipedia.org/wiki/Unidirectional_network) and [NIST CSRC glossary](https://csrc.nist.gov/glossary/term/data_diode) — one-way enforcement and its limits
- `AGENT_RUNTIME.md` §4, `SECURITY.md` §7, `CAPABILITY_MODEL.md` §5, `Observation.md` (confidence table), Constitution Art. III §12, Art. V §20, Art. VIII §32, Art. XI §42

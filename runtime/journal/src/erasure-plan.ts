/**
 * What an erasure would do, computed before it does it.
 *
 * `docs/ERASURE.md` §4. The operator ruled that where erasure meets something
 * it cannot cleanly resolve, it **names the ambiguity and waits** rather than
 * picking a default. This module computes that, as eight findings D1–D8.
 *
 * **The single most important property.** Every finding says whether it was
 * *computed* or is *unavailable*, and an unavailable finding never degrades to a
 * reassuring one. "No disclosures found" when no disclosure record exists is not
 * a true statement made cautiously — it is a false statement that would get
 * someone hurt. Absence of evidence is reported as absence of evidence.
 *
 * **Nothing here is ever written to history.** §2b: the preview may be rich, the
 * record must be bare, and an implementation that journals its preview has built
 * the erasure oracle by accident. This is a pure function over events for that
 * reason — it has no journal, so it cannot append to one.
 */
import type { LaneId, StoredEvent } from "./types.js";
import { indexLineage, descendantsOf, type Traversal } from "./lineage.js";
import { latestCustody, type HeldCustody } from "./custody.js";
import { hashPayload } from "./integrity.js";

/** The nine points at which erasure must stop and ask. */
export type DecisionPoint =
  | "D1"
  | "D2"
  | "D3"
  | "D4"
  | "D5"
  | "D6"
  | "D7"
  | "D8"
  | "D9";

/**
 * Why a finding could not be computed.
 *
 * Carried rather than collapsed into a null, because *what is missing* is the
 * part the owner needs in order to judge how much the plan is worth.
 */
export interface Unavailable {
  readonly point: DecisionPoint;
  readonly reason: string;
}

/** What stays legible after a payload is destroyed (D7). */
export interface EnvelopeResidue {
  readonly eventId: string;
  /** Envelope field names that survive erasure, present on this event. */
  readonly fields: readonly string[];
}

export interface ErasurePlan {
  readonly targets: readonly string[];
  /** How many events the plan was computed over. */
  readonly scope: number;

  /** D2 — everything downstream whose every input is going. It will disappear. */
  readonly soleSupport: readonly string[];
  /**
   * D1 — downstream conclusions that rest on the targets **and on other things
   * that remain**. Rebuilding will very likely reproduce them: §5a, an
   * over-determined pattern survives its own evidence. Each needs a decision.
   */
  readonly partialSupport: readonly string[];
  /** D3 — the full blast radius, with its own honesty about scope. */
  readonly fallout: Traversal;
  /** D5 — peers whose custody covers a target, and who must therefore be told. */
  readonly holders: readonly HeldCustody[];
  /** D7 — what an erased event still says about itself. */
  readonly residue: readonly EnvelopeResidue[];
  /** D8 — whether witness attestations need reconciling. */
  readonly witnessesAffected: boolean;

  /** Everything that could not be computed, and why. Never silently empty. */
  readonly unavailable: readonly Unavailable[];
}

/** Envelope fields that outlive an E1 erasure, in the order they are declared. */
const ENVELOPE_FIELDS = [
  "id",
  "lane",
  "device",
  "hlc",
  "wallClock",
  "type",
  "causes",
  "schema",
  "integrity",
] as const;

export function planErasure(input: {
  readonly events: readonly StoredEvent[];
  readonly lane: LaneId;
  readonly targets: readonly string[];
  /**
   * Which events are derivations rather than observations.
   *
   * Supplied by a layer that can read payloads, because the journal cannot tell
   * the difference — a v2 envelope says only *content* (`ERASURE.md` §2b). Omit
   * it and the plan still computes, but it cannot report a derivation that
   * recorded no inputs, and D3 says so rather than implying there are none.
   */
  readonly derived?: (event: StoredEvent) => boolean;
}): ErasurePlan {
  const { events, lane, targets, derived } = input;
  const index = indexLineage(events, derived ? { derived } : undefined);
  const fallout = descendantsOf(index, targets);

  const going = new Set(targets);
  const sole = new Set<string>();

  // An event loses its whole basis when every cause it names is either a target
  // or itself losing its whole basis. Iterated to a fixpoint rather than assumed
  // to resolve in one pass: causes precede their dependents within a lane, but
  // lanes interleave and nothing guarantees the supplied order.
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of fallout.ids) {
      if (sole.has(id)) continue;
      const causes = index.causesOf(id);
      if (causes.length === 0) continue;
      if (causes.every((cause) => going.has(cause) || sole.has(cause))) {
        sole.add(id);
        changed = true;
      }
    }
  }

  const partial = fallout.ids.filter((id) => !sole.has(id));

  const byId = new Map(events.map((event) => [event.id, event]));
  const residue: EnvelopeResidue[] = [];
  for (const id of targets) {
    const event = byId.get(id);
    if (!event) continue;
    residue.push({
      eventId: id,
      // Read off the event rather than hard-coded, so that when `type`, `schema`
      // and `causes` move into the payload (`ERASURE.md` §2b), this shrinks by
      // itself and the plan stays truthful without being edited.
      fields: ENVELOPE_FIELDS.filter((field) => field in event),
    });
  }

  const targetSet = new Set(targets);
  const holders = latestCustody(events, lane).filter((held) =>
    coversAnyTarget(held, events, targetSet),
  );

  const unavailable: Unavailable[] = [
    {
      point: "D4",
      reason:
        "no disclosure record type exists, so this device cannot say what left it. " +
        "Nothing was found because nothing can be found — not because nothing left. " +
        "Art. VIII §32 requires disclosures to be recorded as history; until they are, " +
        "anything already disclosed is beyond recall and beyond report.",
    },
    {
      point: "D5",
      reason:
        "holders are listed, but no erasure-confirmation protocol exists, so none of " +
        "them can be shown as having honoured it. Treat every holder as unconfirmed.",
    },
    {
      point: "D6",
      reason:
        "requires a collection policy layer that does not exist. Erasing the past does " +
        "not stop the future re-deriving the same pattern from ongoing collection " +
        "(`ERASURE.md` §5c), and this plan cannot say whether it will.",
    },
    {
      point: "D9",
      reason:
        "attachments are not implemented, so this plan cannot say whether any photograph, " +
        "recording or voice note is attached to these events, nor whether erasing them " +
        "would destroy it. Under the ruling (`ERASURE.md` §2c) an attachment's key dies " +
        "only when no readable event still references it, so an erasure may leave the " +
        "attached content fully readable through another entry — and other devices may " +
        "hold entries this one cannot see. Assume nothing attached is destroyed.",
    },
  ];

  // Two different ways the radius can be untrustworthy, and only one of them is
  // visible in the traversal itself.
  //
  // A forward walk reports `closed` when it ran out of dependents it holds. It
  // can close **perfectly over a fragment**: a cause named but not held is never
  // stepped through, because the walk goes the other way. So closure alone would
  // let a partial replica present a confident, short answer — the exact failure
  // `lineage.ts` exists to prevent, arriving by the one route it does not cover.
  //
  // Dangling causes are the evidence that this index was built over part of
  // history, and therefore that derivations may exist elsewhere which also cite
  // these targets and which nothing here can see.
  const fragmentary = index.unresolvedCauses.size > 0;
  // A third way, and the only one that no amount of syncing repairs: a
  // derivation that recorded no inputs. `ERASURE.md` §3 — it sits on erased
  // content forever and no walk reaches it, so the radius below is a lower
  // bound rather than an answer.
  const ungrounded = index.ungrounded.size > 0;
  // Saying nothing because nobody said what is derived is not the same as
  // saying there are none, and the plan must not let the owner read it that way.
  const cannotTell = derived === undefined;

  if (!fallout.closed || fragmentary || ungrounded || cannotTell) {
    const reasons: string[] = [];
    if (!fallout.closed) {
      reasons.push(
        `the walk could not resolve ${fallout.unresolved.length} referenced event(s)`,
      );
    }
    if (fragmentary) {
      reasons.push(
        `${index.unresolvedCauses.size} cause(s) named by events here are not held here, ` +
          "so this is part of history and derivations may exist on other devices",
      );
    }
    if (ungrounded) {
      reasons.push(
        `${index.ungrounded.size} derived event(s) here record no inputs at all, so any ` +
          "of them may rest on a target without saying so; nothing can walk to them, " +
          "and syncing does not repair it",
      );
    }
    if (cannotTell) {
      reasons.push(
        "no caller said which events are derivations, so this plan cannot check whether " +
          "any of them recorded their inputs — read the radius as a lower bound",
      );
    }
    unavailable.push({
      point: "D3",
      reason:
        `${reasons.join("; ")}. Erasing now tears down what is visible and leaves ` +
        "anything beyond this device standing.",
    });
  }

  return {
    targets,
    scope: index.scope,
    soleSupport: [...sole],
    partialSupport: partial,
    fallout,
    holders,
    residue,
    // E1 changes no hash, no height and no count, so an attestation taken before
    // the erasure still reconciles against the lane afterwards. This is a
    // property of the ruling rather than a measurement, and it stops being true
    // at E2 or E3 — which are forbidden.
    witnessesAffected: false,
    unavailable,
  };
}

/**
 * Whether a holder's custody watermark covers any event being erased.
 *
 * A receipt claims payloads up to an envelope hash, so "covers" means the target
 * sits at or before that point in the lane.
 */
function coversAnyTarget(
  held: HeldCustody,
  events: readonly StoredEvent[],
  targets: ReadonlySet<string>,
): boolean {
  for (const event of events) {
    if (targets.has(event.id)) return true;
    if (event.integrity.hash === held.receipt.throughHash) return false;
  }
  return false;
}

/** Which decision points the owner must answer before this erasure may proceed. */
export function decisionsRequired(plan: ErasurePlan): readonly DecisionPoint[] {
  const required = new Set<DecisionPoint>();

  if (plan.partialSupport.length > 0) required.add("D1");
  if (plan.soleSupport.length > 0) required.add("D2");
  if (plan.fallout.ids.length > 0) required.add("D3");
  if (plan.holders.length > 0) required.add("D5");
  if (plan.residue.length > 0) required.add("D7");
  // Anything that could not be computed is a decision the owner takes without
  // the facts, which is exactly when they most need telling.
  for (const gap of plan.unavailable) required.add(gap.point);

  const order: readonly DecisionPoint[] = [
    "D1",
    "D2",
    "D3",
    "D4",
    "D5",
    "D6",
    "D7",
    "D8",
    "D9",
  ];
  return order.filter((point) => required.has(point));
}

/**
 * An authorization bound to one exact plan.
 *
 * `CLAIMS.md` C1 route **A4** — *get approval for a dry run, then change an
 * argument* — and the answer it names: **the grant must bind to the argument
 * hash.** For erasure the argument is not a target list, it is the whole plan
 * the owner was shown: what is torn down, what loses its sole support, who must
 * be told, what the residue says, and which decision points could not be
 * computed. Approving that is approving a picture, and a grant that survives the
 * picture changing is not consent to what actually happens.
 *
 * Deliberately **not** an authorization *system*. There is no Capability plane
 * in this repository — `Capability.md`, `Action.md` and `Policy.md` are Draft
 * and `CAPABILITY_MODEL.md` is Phase-1 architecture — and two rulings in
 * `CLAIMS.md` §5 block C1. This is the one piece that needs neither: whatever
 * gate is built later, it has to bind to something, and this is what erasure
 * gives it to bind to.
 */
export interface ErasureGrant {
  /** The plan this grant was given for. */
  readonly planDigest: string;
  /** Carried for a legible refusal, never as the thing checked. */
  readonly targets: readonly string[];
  /** When the owner gave it. Wall clock, because this is a human fact. */
  readonly grantedAt: number;
}

/**
 * Why a grant does not cover a plan, or that it does.
 *
 * The two refusals are kept apart because they tell the owner different things
 * and have different remedies: *the plan changed, look at it again* is not *you
 * took too long, confirm again*. Collapsing them would make the second read as
 * the first and teach people that erasure is flaky.
 */
export type GrantCheck =
  | { readonly ok: true; readonly ageMs: number }
  | { readonly ok: false; readonly why: "plan-changed" | "expired"; readonly reason: string; readonly ageMs: number };

/**
 * How long "contemporaneously" lasts, recommended rather than imposed.
 *
 * Ruled 2026-09-26 (`ERASURE.md` §4a): erasure is authorized contemporaneously,
 * bound to the plan shown, or not at all. The ruling settles that a window
 * exists and is short; it does not pick a number, so this is a constant with its
 * reasoning attached and `grantCovers` still requires the caller to pass one.
 *
 * **Both directions are a real harm.** Too long and a grant sits around waiting
 * to be spent on a quiet device, where the plan digest does not change and the
 * binding alone would let it through — which is route A5 arriving by patience
 * rather than by trickery. Too short and a careful reader working through eight
 * decision points, several of which say *this cannot be computed*, is refused
 * mid-decision; that trains people to hurry through the one screen in this
 * system that most deserves to be read slowly.
 *
 * Five minutes is generous to the careful reader and short enough that a
 * forgotten grant is gone.
 */
export const CONTEMPORANEOUS_MS = 5 * 60 * 1000;

/**
 * A hash over exactly what the owner decided on.
 *
 * **What it covers and what it deliberately does not** is the whole design.
 *
 * Covered: the targets, the blast radius and its three honesty flags, what
 * loses its sole or partial support, the residue, the holders who must be told,
 * whether witnesses are affected, and *which* decision points could not be
 * computed. Any of these changing means the owner is being asked to have
 * consented to a different act.
 *
 * Not covered, and each for a reason:
 *
 * - **`scope`** — the number of events the plan was computed over. Including it
 *   would void a grant on every unrelated append, and on a device writing a
 *   heartbeat a minute that is every sixty seconds. It protects nothing that
 *   `fallout` does not already protect: a new derivation that cites a target
 *   changes the radius, and that is covered.
 * - **The prose of `unavailable`** — the `reason` strings. Editing the wording
 *   of an explanation must not invalidate a live grant; the *set of points* is
 *   what the owner answered, and that is covered.
 */
export function planDigest(plan: ErasurePlan): string {
  return hashPayload({
    targets: [...plan.targets].sort(),
    fallout: {
      ids: [...plan.fallout.ids].sort(),
      closed: plan.fallout.closed,
      unresolved: [...plan.fallout.unresolved].sort(),
      ungrounded: [...plan.fallout.ungrounded].sort(),
    },
    soleSupport: [...plan.soleSupport].sort(),
    partialSupport: [...plan.partialSupport].sort(),
    residue: [...plan.residue]
      .map((entry) => ({ eventId: entry.eventId, fields: [...entry.fields].sort() }))
      .sort((a, b) => (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)),
    holders: [...plan.holders]
      .map((held) => ({ holder: held.holder, through: held.receipt.throughHash }))
      .sort((a, b) => (a.holder < b.holder ? -1 : a.holder > b.holder ? 1 : 0)),
    witnessesAffected: plan.witnessesAffected,
    unavailable: [...plan.unavailable.map((gap) => gap.point)].sort(),
  });
}

/** The grant an owner's approval of `plan` produces. */
export function grantFor(plan: ErasurePlan, grantedAt: number): ErasureGrant {
  return { planDigest: planDigest(plan), targets: [...plan.targets], grantedAt };
}

/**
 * Whether `grant` authorizes `plan` as it stands now.
 *
 * Re-derives the digest rather than trusting the one carried, so history moving
 * between the preview and the act voids the grant — which is the case A4 exists
 * for, arriving from the world rather than from an adversary.
 *
 * **It does not decide staleness**, and that is not an omission. Whether an
 * authorization is valid only at the moment of issue or persists for a declared
 * window is `CLAIMS.md` §5 Ruling 1, reserved for the operator and not settled.
 * So this returns `ageMs` and lets the caller apply whatever the ruling says,
 * rather than baking in an answer and making the ruling look already made.
 */
export function grantCovers(
  plan: ErasurePlan,
  grant: ErasureGrant,
  now: number,
  maxAgeMs: number,
): GrantCheck {
  const ageMs = now - grant.grantedAt;

  if (planDigest(plan) !== grant.planDigest) {
    return {
      ok: false,
      why: "plan-changed",
      ageMs,
      reason:
        "this authorization was given for a different plan: what would be torn down, " +
        "who must be told, or which questions could not be answered has changed since " +
        "it was shown. Ask again with the plan as it stands.",
    };
  }

  // Checked second on purpose. A grant that is both stale and for a changed
  // plan is reported as changed, because that is the fact the owner needs: the
  // remedy is to look again, not merely to confirm faster.
  if (ageMs < 0 || ageMs > maxAgeMs) {
    return {
      ok: false,
      why: "expired",
      ageMs,
      reason:
        "this authorization is no longer contemporaneous with the decision it was " +
        "given for. Erasure is irreversible and is authorized in the moment or not " +
        "at all (`ERASURE.md` §4a). Show the plan again and ask.",
    };
  }

  return { ok: true, ageMs };
}

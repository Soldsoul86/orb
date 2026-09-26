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

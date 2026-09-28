/**
 * The two events that make the loop close: something was surfaced, and answered.
 *
 * `DECISIONS.md` DR-5 in miniature — *a gate that records only what passed
 * cannot demonstrate what it stopped.* Here nothing is gated; what is recorded
 * instead is whether the person cared. A dismissal is the most valuable event in
 * this package, because §7 R6 says *false positives cost trust, and trust is the
 * product*, and a rule nobody can measure for false positives is a rule nobody
 * can improve.
 */
import { createHash } from "node:crypto";

export const ALERT_RAISED_TYPE = "orb.alert.raised";
export const ALERT_RAISED_SCHEMA = { id: ALERT_RAISED_TYPE, version: 1 } as const;
export const ALERT_ANSWERED_TYPE = "orb.alert.answered";
export const ALERT_ANSWERED_SCHEMA = { id: ALERT_ANSWERED_TYPE, version: 1 } as const;

/**
 * The identity of an alert: derived from what it is about, never minted.
 *
 * **`DEVICE_LOOP.md` §7b28, measured rather than reasoned.** Alert *events* were
 * identified by the journal's minted ULID, so the same export folded into a
 * fresh journal produced four alerts with four different identities for four
 * identical changes — and an answer citing one of them dangled. An alert loop
 * that asks a person the same question twice has failed at the only job it has.
 *
 * **The event id is not the alert id, and conflating them was the defect.** The
 * event identifies *this journal recording this alert*; two devices folding the
 * same lane genuinely do append two events. The alert identifies *this rule
 * firing on this change*, which is one thing however many journals notice it.
 * Same fact, two sides — the same shape as `AlertRaised.observation` below.
 *
 * Derived from the three things that fix what an alert is about: the **rule**
 * that fired, the **Observation** it fired on, and the **kind** within that
 * reading. `gained` and `lost` are deliberately **not** inputs: they are what
 * the rule concluded, and an identity that moved when a rule's output changed
 * would defeat the purpose — the answer is about *that change on that reading*,
 * not about how it was described.
 *
 * The Observation id is stable across replication because `replicate` copies
 * events rather than re-minting them, so this is stable wherever the lane is.
 */
export function deriveAlertId(rule: string, observation: string, kind: string): string {
  // Length-prefixed so no separator can be forged into a different triple:
  // ("a:b", "c") and ("a", "b:c") must not collide.
  const preimage = [rule, observation, kind].map((part) => `${part.length}:${part}`).join("");
  return `sha256:${createHash("sha256").update(preimage, "utf8").digest("hex")}`;
}

/** What was surfaced, and about which reading. */
export interface AlertRaised {
  /**
   * This alert's own identity, derived (see `deriveAlertId`).
   *
   * What an answer cites. Stable across journals, devices and replays, so an
   * answer given once is never asked for again.
   */
  readonly alertId: string;
  /**
   * The phone's own id for the reading this came from — what `alertId` is
   * derived from, recorded so a reader can recompute it rather than trust it.
   */
  readonly reading: string;
  /** The rule that raised it, so a reader can find out what it was watching for. */
  readonly rule: string;
  readonly kind: string;
  readonly gained: readonly string[];
  readonly lost: readonly string[];
  /**
   * The Observation this came from.
   *
   * Also carried in the event's `causes`, and duplicated here for one reason:
   * `causes` is lineage the journal owns and can be absent on an envelope whose
   * payload is not held, while this is the alert's own account of itself. They
   * are the same fact seen from two sides, not two facts.
   */
  readonly observation: string;
}

/**
 * How a person answered.
 *
 * `acknowledged` and `dismissed` are recorded identically and **treated
 * identically** by everything downstream — DR-8. The difference is preserved for
 * a reader, and deliberately does nothing yet.
 */
export type AlertAnswer = "acknowledged" | "dismissed";

export interface AlertAnswered {
  /**
   * The **derived** alert identity this answers (`deriveAlertId`).
   *
   * Not the alert event's id. That was the defect §7b28 measured: an answer
   * citing a minted event id is readable only in the journal that minted it.
   */
  readonly alert: string;
  readonly answer: AlertAnswer;
  /**
   * The alert *event* in this journal, when one was in hand at answer time.
   *
   * Optional and never load-bearing: a convenience for a reader of this journal,
   * and absent when answering an alert whose raising event lives elsewhere —
   * which is now possible, and is the point.
   */
  readonly alertEvent?: string;
}

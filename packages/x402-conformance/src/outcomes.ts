/**
 * What a reader may conclude from a settle response.
 *
 * Three outcomes, not two. The third is the whole point: a response can fail
 * to say whether money moved, and a reader that collapses that into "failed"
 * pays twice — it frees the budget and re-signs while the first authorization
 * may still settle.
 *
 * The taxonomy is not ours. It is what independent implementations arrive at
 * when they take the question seriously:
 *
 * - `@spendcap/policy`'s reconciler answers SETTLED / NOT_SPENT / UNKNOWN.
 * - `scvd-defects`'s standalone reader answers settled / failed / unresolved.
 * - x402-foundation/x402#3325 proposes six wire states whose terminal/
 *   non-terminal split is the same line drawn finer.
 *
 * Three codebases, no shared code, same three answers. That convergence is
 * why this harness tests against the outcome rather than against any one
 * protocol version: `status` may or may not land, but the third state is real
 * either way.
 */

export type Outcome =
  /** The money moved. Terminal. */
  | "settled"
  /** The money provably did not move. Terminal, and the budget is free again. */
  | "failed"
  /**
   * It cannot be said which. Not terminal, and **not** an excuse to do either
   * thing: settling records money that may not have moved, reversing frees
   * money that may be gone.
   */
  | "unresolved";

/**
 * What a client is required to do, per outcome.
 *
 * Stated as obligations rather than suggestions, because each one is a thing
 * a real client gets wrong and pays for.
 */
export interface Obligations {
  /** May the client mint a new authorization for this purchase? */
  readonly mayReSign: boolean;
  /** May it release the budget it reserved? */
  readonly mayRelease: boolean;
  /** May it record the spend as complete? */
  readonly maySettle: boolean;
}

export const OBLIGATIONS: Readonly<Record<Outcome, Obligations>> = Object.freeze({
  settled: { mayReSign: false, mayRelease: false, maySettle: true },
  failed: { mayReSign: true, mayRelease: true, maySettle: false },
  // The interesting row. Everything is forbidden; the only legal moves are to
  // re-present what was already signed, or to go and ask the chain.
  unresolved: { mayReSign: false, mayRelease: false, maySettle: false },
});

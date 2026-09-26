/**
 * How a read of an external source went.
 *
 * `docs/DECISIONS.md` DR-6 fixed this ladder, and DR-7 put it on every connector
 * call. It is the TypeScript counterpart of the ladder that `apps/pixel/probe-
 * grants` scored device reads with, and it exists because five runs of that
 * probe were spent on one distinction:
 *
 * - `value`  — the call answered, and returned something.
 * - `empty`  — the call answered, and the answer is *nothing*.
 * - `absent` — the call answered with **no answer**: a null, a source that has
 *   never been set. *We were not told.*
 * - `threw`  — the call failed. We learned nothing about the contents.
 * - `denied` — the call was refused. Different from `threw`: a refusal is a
 *   decision by the other side, not a failure of the attempt.
 *
 * **`empty` and `absent` are never merged.** An empty result handed to a caller
 * looks exactly like a full one being withheld, so the two mean opposite things
 * to anyone reading the record later. The handoff summary that proposed this
 * ladder listed four states and dropped `absent`, which is how the distinction
 * gets lost: not by argument, but by a list that has nowhere to put it.
 */
export type ReadOutcome = "value" | "empty" | "absent" | "threw" | "denied";

/** Whether an outcome means the source actually told us its contents. */
export function answered(outcome: ReadOutcome): boolean {
  return outcome === "value" || outcome === "empty";
}

/** Whether an outcome means the contents are unknown, for any of its three reasons. */
export function unknown(outcome: ReadOutcome): boolean {
  return !answered(outcome);
}

/**
 * The outcome of a fetch that completed, from what it returned.
 *
 * `null` and `undefined` are `absent` — the source said nothing — and an empty
 * list is `empty`, because the source said *none*. Inventing `empty` for a null
 * would report "you have no mail" when the truth is "we were not told".
 */
export function outcomeOf(items: readonly unknown[] | null | undefined): ReadOutcome {
  if (items === null || items === undefined) return "absent";
  return items.length === 0 ? "empty" : "value";
}

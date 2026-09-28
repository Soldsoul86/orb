/**
 * The rules, and what they deliberately do not do.
 *
 * The first: **a change in what holds power over this device is worth telling
 * you about.** Not *a suspicious change* — that would be a verdict, and
 * `MOBILE_SENSING.md` §4.4's signal *reports a fact, never a verdict*. A grant
 * appearing is usually the owner installing something; whether it is alarming is
 * interpretation, and interpretation lives above this.
 *
 * It refuses to judge by publisher. *"A non-Google name appeared"* was the
 * obvious heuristic and is the wrong one: it bakes in an opinion about who is
 * safe, it is wrong the moment a legitimate third-party service is granted
 * access, and it is exactly the kind of judgement that belongs to the person
 * being told rather than to the thing telling them.
 *
 * **It does not learn — DR-8.** An answered alert is not raised again, and that
 * is idempotence rather than learning: pass 2 reports a change in exactly one
 * reading, so one alert per change is simply the right count. Whether the person
 * *acknowledged* or *dismissed* changes nothing here, and there is a test that
 * says so.
 */
import { changeKey, type AuthorityChange, type DeviceAuthority } from "./projection.js";

export const CHANGE_RULE = "device-watch.authority-changed";

/**
 * The second rule, and why it is a second rule rather than a fourth kind under
 * the first.
 *
 * An app appearing is **not** an app being granted power over the device. Both
 * are a named set changing, so both use the same mechanism — but an alert that
 * said `authority-changed: installedPackage gained com.foo` would be telling a
 * person something false about what happened, in the one field they would read
 * to decide whether to care. The mechanism is shared; the claim is not.
 *
 * They also differ in expected rate by orders of magnitude. A grant changes when
 * someone decides something; the package set changes on every system update. A
 * reader who wants to tune one without silencing the other needs them named
 * apart, and §7 R6 makes that the difference between a signal and noise.
 */
export const PACKAGE_RULE = "device-watch.packages-changed";

/** Which rule speaks for a kind. Unknown kinds are authority changes, as before. */
export function ruleFor(kind: string): string {
  return kind === "installedPackage" ? PACKAGE_RULE : CHANGE_RULE;
}

/** A change that should be surfaced and has not been. */
export interface PendingAlert {
  readonly rule: string;
  readonly change: AuthorityChange;
}

/**
 * Which changes are worth raising now.
 *
 * Two things never reach here, and both are filtered in the projection rather
 * than being special cases:
 *
 * - **A baseline is not news.** §5j's lesson from the device: a self-test that
 *   reported a pre-existing state as a new failure said FAILED for ever and
 *   meant nothing. Whatever was already there when Orb arrived is not a change.
 * - **An unreadable kind is not an empty one.** A failed read would otherwise
 *   look like every grant being revoked at once — loud, and wrong.
 */
export function alertsFor(state: DeviceAuthority): readonly PendingAlert[] {
  return state.changes
    .filter((change) => !state.raised.has(changeKey(change.observation, change.kind)))
    .map((change) => ({ rule: ruleFor(change.kind), change }));
}

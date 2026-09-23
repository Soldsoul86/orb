import { decideAt, settle } from './policy.ts';
import type { SeverityAnalyzer } from './severity.ts';
import { apply, canRelease, initialState, type HeldAction, type LockState } from './state.ts';
import type { Clock, Journal } from './journal.ts';
import type { Action, Context, LockEvent, NewEvent, Policy } from './types.ts';

/** Makes the real call once an action is released. Must be idempotent on action.id. */
export interface Executor {
  execute(action: Action): Promise<{ ref: string }>;
}

export interface LockDeps {
  readonly clock: Clock;
  readonly journal: Journal;
  readonly analyzer: SeverityAnalyzer;
  readonly executor: Executor;
  readonly initialPolicy: Policy;
  /**
   * What to do with actions that were released but never finished when the
   * lock last stopped (app killed mid-payment). The default never runs them
   * again: re-sending a payment whose outcome is unknown could pay twice.
   */
  readonly interrupted?: 'mark_unknown' | 'execute';
}

export const OUTCOME_UNKNOWN = 'Outcome unknown: the app stopped during this action. Check your payment app before trying again.';

export type Outcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface ActionLock {
  /** Hold an action and decide its gate. */
  submit(action: Action, context: Context): HeldAction;
  stop(id: string, by?: string): Outcome;
  unlock(id: string, method?: 'biometric' | 'pin'): Outcome;
  confirm(id: string, by: string): Outcome;
  /** Propose a new policy. Tightening applies now; loosening after the active policy's delay. */
  proposePolicy(policy: Policy): LockEvent;
  /** Release every action whose buffer is over, then execute them. */
  tick(): Promise<readonly string[]>;
  state(): LockState;
}

const ok: Outcome = { ok: true };
const fail = (reason: string): Outcome => ({ ok: false, reason });

export function createActionLock(deps: LockDeps): ActionLock {
  const { clock, journal, analyzer, executor } = deps;
  let state = journal.all().reduce(apply, initialState(deps.initialPolicy));
  const inFlight = new Set<string>();

  const record = (event: NewEvent): LockEvent => {
    const stored = journal.append(event);
    state = apply(state, stored);
    return stored;
  };

  if ((deps.interrupted ?? 'mark_unknown') === 'mark_unknown') {
    for (const id of state.order) {
      if (state.actions.get(id)?.status === 'released') record({ type: 'ActionFailed', id, error: OUTCOME_UNKNOWN });
    }
  }

  const held = (id: string): HeldAction | undefined => {
    const h = state.actions.get(id);
    return h !== undefined && h.status === 'held' ? h : undefined;
  };

  return {
    submit(action, context) {
      if (state.actions.has(action.id)) throw new Error(`Duplicate action id ${action.id}`);
      const now = clock();
      const analysis = analyzer.analyze(action, context);
      const gate = decideAt(state.policy, now, action, context, analysis);
      record({ type: 'ActionRequested', action, context });
      record({ type: 'ActionGated', id: action.id, analysis, gate, releaseAt: now + gate.holdSeconds * 1000 });
      return state.actions.get(action.id) as HeldAction;
    },

    stop(id, by = 'user') {
      const h = state.actions.get(id);
      if (h === undefined) return fail('unknown action');
      if (h.status !== 'held') return fail(`too late: action is ${h.status}`);
      record({ type: 'ActionStopped', id, by });
      return ok;
    },

    unlock(id, method = 'biometric') {
      const h = held(id);
      if (h === undefined) return fail('action is not held');
      if (h.gate?.mode !== 'unlock') return fail(`unlock does not apply to ${h.gate?.mode ?? 'no'} gate`);
      if (h.unlocked) return fail('already unlocked');
      record({ type: 'ActionUnlocked', id, method });
      return ok;
    },

    confirm(id, by) {
      const h = held(id);
      if (h === undefined) return fail('action is not held');
      if (h.gate?.mode !== 'second_person') return fail('no second person needed');
      if (by === 'user') return fail('the second person cannot be the user');
      if (h.confirmedBy !== undefined) return fail('already confirmed');
      record({ type: 'SecondPersonConfirmed', id, by });
      return ok;
    },

    proposePolicy(policy) {
      // The delay comes from the policy in force, never from the proposal,
      // so a proposal cannot shorten its own wait.
      const delay = settle(state.policy, clock()).active.loosenDelaySeconds;
      return record({ type: 'PolicyChangeProposed', policy, effectiveAt: clock() + delay * 1000 });
    },

    async tick() {
      const now = clock();
      const due = state.order.filter((id) => {
        const h = state.actions.get(id);
        return h !== undefined && canRelease(h, now);
      });
      // Release is recorded before any external call: after this, stop() is "too late".
      for (const id of due) record({ type: 'ActionReleased', id });

      const toRun = state.order.filter((id) => state.actions.get(id)?.status === 'released' && !inFlight.has(id));
      await Promise.all(
        toRun.map(async (id) => {
          inFlight.add(id);
          const h = state.actions.get(id) as HeldAction;
          try {
            const { ref } = await executor.execute(h.action);
            record({ type: 'ActionExecuted', id, ref });
          } catch (e) {
            record({ type: 'ActionFailed', id, error: e instanceof Error ? e.message : String(e) });
          } finally {
            inFlight.delete(id);
          }
        }),
      );
      return due;
    },

    state: () => state,
  };
}

import { settle, type PolicyState } from './policy.ts';
import type { Action, Analysis, Context, Gate, LockEvent, Policy } from './types.ts';

export type Status = 'requested' | 'held' | 'stopped' | 'released' | 'executed' | 'failed';

export interface HeldAction {
  readonly action: Action;
  readonly context: Context;
  readonly requestedAt: number;
  readonly status: Status;
  readonly analysis?: Analysis;
  readonly gate?: Gate;
  readonly releaseAt?: number;
  readonly unlocked: boolean;
  readonly confirmedBy?: string;
  readonly stoppedBy?: string;
  readonly ref?: string;
  readonly error?: string;
}

export interface LockState {
  readonly actions: ReadonlyMap<string, HeldAction>;
  /** Action ids in request order. */
  readonly order: readonly string[];
  readonly policy: PolicyState;
}

export function initialState(policy: Policy): LockState {
  return { actions: new Map(), order: [], policy: { active: policy } };
}

function update(state: LockState, id: string, change: (h: HeldAction) => HeldAction): LockState {
  const current = state.actions.get(id);
  if (current === undefined) throw new Error(`Unknown action ${id}`);
  const actions = new Map(state.actions);
  actions.set(id, change(current));
  return { ...state, actions };
}

/** Apply one event. Pure: returns a new state, never mutates. */
export function apply(state: LockState, event: LockEvent): LockState {
  switch (event.type) {
    case 'ActionRequested': {
      const actions = new Map(state.actions);
      actions.set(event.action.id, {
        action: event.action,
        context: event.context,
        requestedAt: event.at,
        status: 'requested',
        unlocked: false,
      });
      return { ...state, actions, order: [...state.order, event.action.id] };
    }
    case 'ActionGated':
      return update(state, event.id, (h) => ({
        ...h,
        status: 'held',
        analysis: event.analysis,
        gate: event.gate,
        releaseAt: event.releaseAt,
      }));
    case 'ActionStopped':
      return update(state, event.id, (h) => ({ ...h, status: 'stopped', stoppedBy: event.by }));
    case 'ActionUnlocked':
      return update(state, event.id, (h) => ({ ...h, unlocked: true }));
    case 'SecondPersonConfirmed':
      return update(state, event.id, (h) => ({ ...h, confirmedBy: event.by }));
    case 'ActionReleased':
      return update(state, event.id, (h) => ({ ...h, status: 'released' }));
    case 'ActionExecuted':
      return update(state, event.id, (h) => ({ ...h, status: 'executed', ref: event.ref }));
    case 'ActionFailed':
      return update(state, event.id, (h) => ({ ...h, status: 'failed', error: event.error }));
    case 'PolicyChangeProposed':
      return {
        ...state,
        policy: {
          active: settle(state.policy, event.at).active,
          pending: { policy: event.policy, effectiveAt: event.effectiveAt },
        },
      };
  }
}

/** Rebuild state from history. Same events, same state. */
export function fold(initialPolicy: Policy, events: readonly LockEvent[]): LockState {
  return events.reduce(apply, initialState(initialPolicy));
}

export type Waiting = 'time' | 'unlock' | 'second_person' | 'blocked' | 'nothing';

/** What a held action is still waiting for at time `now`. */
export function waitingFor(h: HeldAction, now: number): Waiting {
  if (h.status !== 'held' || h.gate === undefined || h.releaseAt === undefined) return 'nothing';
  if (h.gate.mode === 'block') return 'blocked';
  if (h.gate.mode === 'unlock' && !h.unlocked) return 'unlock';
  if (h.gate.mode === 'second_person' && h.confirmedBy === undefined) return 'second_person';
  if (now < h.releaseAt) return 'time';
  return 'nothing';
}

export function canRelease(h: HeldAction, now: number): boolean {
  return h.status === 'held' && waitingFor(h, now) === 'nothing';
}

/** Key for "have I sent this kind of action to this destination before?". */
export function destinationKey(kind: string, recipient: string): string {
  return `${kind}:${recipient.trim().toLowerCase()}`;
}

/**
 * Destinations that have received a completed action. Derived from history,
 * not stored separately: replaying the journal rebuilds it.
 */
export function knownDestinations(state: LockState): ReadonlySet<string> {
  const known = new Set<string>();
  for (const h of state.actions.values()) {
    if (h.status === 'executed') known.add(destinationKey(h.action.kind, h.action.recipient));
  }
  return known;
}

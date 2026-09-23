// Core types for Action Lock. No behaviour here.

export type ActionKind = 'payment' | 'message' | 'email' | 'post' | 'delete' | 'other';

/** An irreversible action requested by the user or by an agent acting for them. */
export interface Action {
  readonly id: string;
  readonly agentId: string;
  readonly kind: ActionKind;
  readonly recipient: string;
  readonly amount?: number;
  readonly text?: string;
}

/** Device signals at the moment of the request. Supplied by the shell. */
export interface Context {
  /** Local hour 0–23. */
  readonly localHour: number;
  /** True if the user has never sent this kind of action to this recipient. */
  readonly newRecipient: boolean;
  /** True if the phone is on a call with a number not in contacts. */
  readonly onCallWithUnknown: boolean;
}

export type Severity = 0 | 1 | 2 | 3 | 4;

export interface Finding {
  readonly code: string;
  readonly level: Severity;
  /** Added on top of the highest base level instead of competing with it. */
  readonly modifier: boolean;
  readonly feedback: string;
}

export interface Analysis {
  readonly level: Severity;
  readonly findings: readonly Finding[];
  /** Feedback sentences to show the user; empty when not necessary. */
  readonly feedback: readonly string[];
}

export type LockMode = 'pass' | 'countdown' | 'unlock' | 'second_person' | 'block';

export interface Gate {
  readonly mode: LockMode;
  readonly holdSeconds: number;
}

export interface RuleMatch {
  readonly kinds?: readonly ActionKind[];
  readonly recipients?: readonly string[];
  readonly newRecipient?: boolean;
  readonly minAmount?: number;
  readonly maxAmount?: number;
  /** Local hours [from, to); wraps midnight when from > to. */
  readonly hours?: { readonly from: number; readonly to: number };
}

export interface Rule {
  readonly name: string;
  readonly match: RuleMatch;
  readonly gate: Gate;
}

export interface Policy {
  readonly defaults: Readonly<Record<Severity, Gate>>;
  readonly rules: readonly Rule[];
  readonly criticalFloor: LockMode;
  readonly loosenDelaySeconds: number;
}

// ── Events ──────────────────────────────────────────────────────────────────

interface EventBase {
  readonly seq: number;
  /** Milliseconds since epoch, from the injected clock. */
  readonly at: number;
}

export type LockEvent =
  | (EventBase & { readonly type: 'ActionRequested'; readonly action: Action; readonly context: Context })
  | (EventBase & {
      readonly type: 'ActionGated';
      readonly id: string;
      readonly analysis: Analysis;
      readonly gate: Gate;
      readonly releaseAt: number;
    })
  | (EventBase & { readonly type: 'ActionStopped'; readonly id: string; readonly by: string })
  | (EventBase & { readonly type: 'ActionUnlocked'; readonly id: string; readonly method: 'biometric' | 'pin' })
  | (EventBase & { readonly type: 'SecondPersonConfirmed'; readonly id: string; readonly by: string })
  | (EventBase & { readonly type: 'ActionReleased'; readonly id: string })
  | (EventBase & { readonly type: 'ActionExecuted'; readonly id: string; readonly ref: string })
  | (EventBase & { readonly type: 'ActionFailed'; readonly id: string; readonly error: string })
  | (EventBase & { readonly type: 'PolicyChangeProposed'; readonly policy: Policy; readonly effectiveAt: number });

/** An event before the journal assigns seq and at. */
export type NewEvent = LockEvent extends infer E
  ? E extends LockEvent
    ? Omit<E, 'seq' | 'at'>
    : never
  : never;

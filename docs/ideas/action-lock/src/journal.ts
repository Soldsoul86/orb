import type { LockEvent, NewEvent } from './types.ts';

export type Clock = () => number;

/** Append-only history. Events are immutable once appended. */
export interface Journal {
  append(event: NewEvent): LockEvent;
  all(): readonly LockEvent[];
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export function inMemoryJournal(clock: Clock): Journal {
  const events: LockEvent[] = [];
  return {
    append(event) {
      const stored = deepFreeze(
        structuredClone({ ...event, seq: events.length + 1, at: clock() }) as LockEvent,
      );
      events.push(stored);
      return stored;
    },
    all: () => events.slice(),
  };
}

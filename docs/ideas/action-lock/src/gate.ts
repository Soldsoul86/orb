import type { Gate, LockMode } from './types.ts';

const RANK: Readonly<Record<LockMode, number>> = {
  pass: 0,
  countdown: 1,
  unlock: 2,
  second_person: 3,
  block: 4,
};

export function modeRank(mode: LockMode): number {
  return RANK[mode];
}

export function stricterMode(a: LockMode, b: LockMode): LockMode {
  return RANK[a] >= RANK[b] ? a : b;
}

/** The stricter of two gates: higher mode, and the longer hold. */
export function stricter(a: Gate, b: Gate): Gate {
  return {
    mode: stricterMode(a.mode, b.mode),
    holdSeconds: Math.max(a.holdSeconds, b.holdSeconds),
  };
}

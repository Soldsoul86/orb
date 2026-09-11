/**
 * The position registry, the state machine, and the single exit transition.
 *
 * The concurrency suite at the bottom is the one that proves the executor's
 * central safety claim: however many triggers fire at once, exactly one closing
 * lifecycle exists.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { PositionRegistry, newPosition } from "../src/position/registry.js";
import {
  nextState,
  canTransition,
  allowedTransitions,
  requireNextState,
  IllegalTransitionError,
  type PositionTransition,
} from "../src/position/state-machine.js";
import {
  EXIT_PRIORITY,
  outranks,
  byExitAuthority,
  isLive,
  isTerminal,
  isExiting,
  requiresMonitoring,
  type ExitReason,
  type PositionState,
} from "../src/position/model.js";

const AT = 1_700_000_000_000;

function registryWithPosition(state: PositionState = "MONITORING"): PositionRegistry {
  const registry = new PositionRegistry();
  registry.open(
    newPosition({
      tradeId: "trade_1",
      symbol: "ETH",
      side: "LONG",
      state,
      openedAt: AT,
      leverage: 10,
      size: "1",
      entryPrice: "2000",
    }),
  );
  return registry;
}

describe("state machine", () => {
  test("entry confirmation and monitoring follow the documented path", () => {
    assert.equal(nextState("PENDING_ENTRY", "ENTRY_CONFIRMED"), "OPEN");
    assert.equal(nextState("OPEN", "MONITORING_ATTACHED"), "MONITORING");
    assert.equal(nextState("MONITORING", "EXIT_CLAIMED"), "EXIT_TRIGGERED");
    assert.equal(nextState("EXIT_TRIGGERED", "CLOSE_SUBMITTED"), "CLOSING");
    assert.equal(nextState("CLOSING", "VERIFIED_FLAT"), "CLOSED");
  });

  test("CLOSED and ENTRY_FAILED are terminal — nothing leads out of them", () => {
    assert.deepEqual([...allowedTransitions("CLOSED")], []);
    assert.deepEqual([...allowedTransitions("ENTRY_FAILED")], []);
    assert.equal(nextState("CLOSED", "EXIT_CLAIMED"), null);
    assert.equal(nextState("CLOSED", "RECONCILED_OPEN"), null);
  });

  test("an exit can be claimed from every state where a position might exist", () => {
    for (const state of ["PENDING_ENTRY", "OPEN", "MONITORING", "RECONCILIATION_REQUIRED", "UNKNOWN"] as const) {
      assert.equal(
        canTransition(state, "EXIT_CLAIMED"),
        true,
        `${state} must be able to reach an exit`,
      );
    }
  });

  test("UNKNOWN never resolves to flat by assumption", () => {
    // Only an explicit reconciliation against the exchange closes it.
    assert.equal(nextState("UNKNOWN", "RECONCILED_FLAT"), "CLOSED");
    assert.equal(nextState("UNKNOWN", "CLOSE_ATTEMPT_FAILED"), null);
    assert.equal(nextState("UNKNOWN", "VERIFIED_FLAT"), null);
  });

  test("a failed exit remains an open position that can be retried", () => {
    assert.equal(isTerminal("EXIT_FAILED"), false);
    assert.equal(requiresMonitoring("EXIT_FAILED"), true);
    assert.equal(nextState("EXIT_FAILED", "CLOSE_SUBMITTED"), "CLOSING");
    assert.equal(nextState("EXIT_FAILED", "VERIFIED_FLAT"), "CLOSED");
  });

  test("a close that fills instantly can be verified before the ack arrives", () => {
    assert.equal(nextState("EXIT_TRIGGERED", "VERIFIED_FLAT"), "CLOSED");
  });

  test("illegal transitions are refused, not applied", () => {
    assert.equal(nextState("CLOSED", "CLOSE_SUBMITTED"), null);
    assert.equal(nextState("MONITORING", "ENTRY_CONFIRMED"), null);
    assert.throws(() => requireNextState("CLOSED", "EXIT_CLAIMED"), IllegalTransitionError);
  });

  test("every state classifies consistently", () => {
    const states: PositionState[] = [
      "PENDING_ENTRY", "OPEN", "MONITORING", "EXIT_TRIGGERED", "CLOSING",
      "CLOSED", "ENTRY_FAILED", "EXIT_FAILED", "RECONCILIATION_REQUIRED", "UNKNOWN",
    ];
    for (const state of states) {
      // A state is either live or terminal, never both and never neither.
      assert.notEqual(isLive(state), isTerminal(state), state);
    }
    assert.equal(isExiting("EXIT_TRIGGERED"), true);
    assert.equal(isExiting("CLOSING"), true);
    assert.equal(isExiting("MONITORING"), false);
  });
});

describe("exit priority", () => {
  test("orders authority: kill switch and liquidation first, provider last", () => {
    const reasons: ExitReason[] = [
      "SIGNAL_EXIT", "STRATEGY_EXIT", "HARD_RISK_EXIT", "KILL_SWITCH", "MANUAL_EXIT",
    ];
    assert.deepEqual([...reasons].sort(byExitAuthority), [
      "KILL_SWITCH", "HARD_RISK_EXIT", "MANUAL_EXIT", "STRATEGY_EXIT", "SIGNAL_EXIT",
    ]);
  });

  test("a hard risk exit outranks every discretionary reason", () => {
    assert.equal(outranks("HARD_RISK_EXIT", "STRATEGY_EXIT"), true);
    assert.equal(outranks("HARD_RISK_EXIT", "SIGNAL_EXIT"), true);
    assert.equal(outranks("HARD_RISK_EXIT", "MANUAL_EXIT"), true);
  });

  test("no discretionary reason outranks a hard risk exit", () => {
    assert.equal(outranks("STRATEGY_EXIT", "HARD_RISK_EXIT"), false);
    assert.equal(outranks("SIGNAL_EXIT", "HARD_RISK_EXIT"), false);
  });

  test("the kill switch outranks the hard risk exit", () => {
    assert.equal(outranks("KILL_SWITCH", "HARD_RISK_EXIT"), true);
    assert.equal(outranks("HARD_RISK_EXIT", "KILL_SWITCH"), false);
  });

  test("the priority table matches the documented ordering", () => {
    assert.equal(EXIT_PRIORITY.KILL_SWITCH, 1);
    assert.equal(EXIT_PRIORITY.LIQUIDATION, 1);
    assert.equal(EXIT_PRIORITY.HARD_RISK_EXIT, 2);
    assert.ok(EXIT_PRIORITY.STRATEGY_EXIT > EXIT_PRIORITY.HARD_RISK_EXIT);
    assert.ok(EXIT_PRIORITY.SIGNAL_EXIT > EXIT_PRIORITY.STRATEGY_EXIT);
  });
});

describe("signal reservation", () => {
  test("a signal id can be reserved exactly once", () => {
    const registry = new PositionRegistry();
    assert.equal(registry.reserveSignal("sig-1"), true);
    assert.equal(registry.reserveSignal("sig-1"), false);
    assert.equal(registry.hasProcessed("sig-1"), true);
  });

  test("many concurrent reservations of one id yield exactly one winner", () => {
    const registry = new PositionRegistry();
    const results = Array.from({ length: 1000 }, () => registry.reserveSignal("sig-storm"));
    assert.equal(results.filter(Boolean).length, 1);
  });

  test("a released reservation can be retried", () => {
    const registry = new PositionRegistry();
    registry.reserveSignal("sig-1");
    registry.releaseSignal("sig-1");
    assert.equal(registry.reserveSignal("sig-1"), true);
  });
});

describe("position bookkeeping", () => {
  test("refuses to replace a live position", () => {
    const registry = registryWithPosition();
    assert.throws(
      () =>
        registry.open(
          newPosition({
            tradeId: "trade_2", symbol: "ETH", side: "SHORT",
            state: "PENDING_ENTRY", openedAt: AT, leverage: 1,
          }),
        ),
      /refusing to replace live position/,
    );
  });

  test("allows a new position once the previous one is closed", () => {
    const registry = registryWithPosition();
    registry.claimExit("ETH", "HARD_RISK_EXIT", AT);
    registry.transition("ETH", "VERIFIED_FLAT");
    assert.doesNotThrow(() =>
      registry.open(
        newPosition({
          tradeId: "trade_2", symbol: "ETH", side: "SHORT",
          state: "PENDING_ENTRY", openedAt: AT, leverage: 1,
        }),
      ),
    );
  });

  test("discrepancies accumulate and are never overwritten", () => {
    const registry = registryWithPosition();
    registry.recordDiscrepancy("ETH", "size mismatch");
    registry.recordDiscrepancy("ETH", "unknown fill");
    assert.deepEqual([...registry.get("ETH")!.discrepancies], ["size mismatch", "unknown fill"]);
  });

  test("close attempts accumulate as an audit trail", () => {
    const registry = registryWithPosition();
    registry.recordCloseAttempt("ETH", { attempt: 1, at: AT, requestedSize: "1", outcome: "partial", filledSize: "0.4" });
    registry.recordCloseAttempt("ETH", { attempt: 2, at: AT + 1, requestedSize: "0.6", outcome: "filled", filledSize: "0.6" });
    assert.equal(registry.get("ETH")!.closeAttempts.length, 2);
  });

  test("subscribers see every change and cannot destabilise the registry", () => {
    const registry = registryWithPosition();
    const seen: string[] = [];
    registry.subscribe(() => {
      throw new Error("a listener blew up");
    });
    registry.subscribe((position) => seen.push(position.state));

    registry.claimExit("ETH", "HARD_RISK_EXIT", AT);
    registry.transition("ETH", "CLOSE_SUBMITTED");
    assert.deepEqual(seen, ["EXIT_TRIGGERED", "CLOSING"]);
  });
});

/* ================================================================== *
 * The safety claim
 * ================================================================== */

describe("exactly one authoritative exit", () => {
  test("a single trigger claims the position", () => {
    const registry = registryWithPosition();
    const claim = registry.claimExit("ETH", "HARD_RISK_EXIT", AT);

    assert.equal(claim.kind, "claimed");
    assert.equal(registry.get("ETH")!.state, "EXIT_TRIGGERED");
    assert.equal(registry.get("ETH")!.exitReason, "HARD_RISK_EXIT");
    assert.equal(registry.totalClaims, 1);
  });

  test("a thousand simultaneous identical triggers produce exactly one claim", () => {
    const registry = registryWithPosition();

    // `claimExit` contains no `await`, so this loop is the same thing a burst of
    // concurrent event-loop tasks would do: each runs to completion in turn.
    const outcomes = Array.from({ length: 1000 }, () =>
      registry.claimExit("ETH", "HARD_RISK_EXIT", AT),
    );

    assert.equal(outcomes.filter((o) => o.kind === "claimed").length, 1);
    assert.equal(outcomes.filter((o) => o.kind === "already_exiting").length, 999);
    assert.equal(registry.totalClaims, 1);
  });

  test("concurrent async triggers produce exactly one claim", async () => {
    const registry = registryWithPosition();
    const claimed: string[] = [];

    await Promise.all(
      Array.from({ length: 200 }, async (_, index) => {
        // Interleave real microtask boundaries before the claim.
        await Promise.resolve();
        if (index % 3 === 0) await new Promise((resolve) => setImmediate(resolve));
        const outcome = registry.claimExit("ETH", "HARD_RISK_EXIT", AT + index);
        if (outcome.kind === "claimed") claimed.push(`claim-${outcome.token.claim}`);
      }),
    );

    assert.deepEqual(claimed, ["claim-1"]);
    assert.equal(registry.totalClaims, 1);
  });

  test("a mix of reasons arriving at once still yields one claim", () => {
    const registry = registryWithPosition();
    const reasons: ExitReason[] = [
      "HARD_RISK_EXIT", "SIGNAL_EXIT", "STRATEGY_EXIT", "MANUAL_EXIT", "KILL_SWITCH",
    ];
    const outcomes = reasons.flatMap((reason) =>
      Array.from({ length: 20 }, () => registry.claimExit("ETH", reason, AT)),
    );

    assert.equal(outcomes.filter((o) => o.kind === "claimed").length, 1);
    assert.equal(registry.totalClaims, 1);
  });

  test("a higher-authority reason escalates without starting a second lifecycle", () => {
    const registry = registryWithPosition();
    registry.claimExit("ETH", "HARD_RISK_EXIT", AT);

    const escalation = registry.claimExit("ETH", "KILL_SWITCH", AT + 1);
    assert.deepEqual(escalation, { kind: "escalated", from: "HARD_RISK_EXIT", to: "KILL_SWITCH" });
    assert.equal(registry.get("ETH")!.exitReason, "KILL_SWITCH");
    assert.equal(registry.totalClaims, 1, "still one claim");
  });

  test("a lower-authority reason never overrides a higher one", () => {
    const registry = registryWithPosition();
    registry.claimExit("ETH", "HARD_RISK_EXIT", AT);

    // The provider says hold, or asks to exit for its own reasons. Neither
    // touches the reason the executor is closing for.
    for (const reason of ["SIGNAL_EXIT", "STRATEGY_EXIT", "MANUAL_EXIT"] as const) {
      const outcome = registry.claimExit("ETH", reason, AT + 1);
      assert.deepEqual(outcome, { kind: "already_exiting", reason: "HARD_RISK_EXIT" });
      assert.equal(registry.get("ETH")!.exitReason, "HARD_RISK_EXIT");
    }
    assert.equal(registry.totalClaims, 1);
  });

  test("escalation only ever moves upward, never back down", () => {
    const registry = registryWithPosition();
    registry.claimExit("ETH", "SIGNAL_EXIT", AT);
    registry.claimExit("ETH", "HARD_RISK_EXIT", AT + 1);
    registry.claimExit("ETH", "KILL_SWITCH", AT + 2);
    registry.claimExit("ETH", "SIGNAL_EXIT", AT + 3);
    registry.claimExit("ETH", "STRATEGY_EXIT", AT + 4);

    assert.equal(registry.get("ETH")!.exitReason, "KILL_SWITCH");
    assert.equal(registry.totalClaims, 1);
  });

  test("a closed position cannot be claimed again", () => {
    const registry = registryWithPosition();
    registry.claimExit("ETH", "HARD_RISK_EXIT", AT);
    registry.transition("ETH", "VERIFIED_FLAT");

    assert.deepEqual(registry.claimExit("ETH", "KILL_SWITCH", AT + 1), {
      kind: "not_exitable",
      state: "CLOSED",
    });
    assert.equal(registry.totalClaims, 1);
  });

  test("an absent position cannot be claimed", () => {
    const registry = new PositionRegistry();
    assert.deepEqual(registry.claimExit("ETH", "HARD_RISK_EXIT", AT), {
      kind: "not_exitable",
      state: "absent",
    });
  });

  test("positions in different symbols claim independently", () => {
    const registry = registryWithPosition();
    registry.open(
      newPosition({
        tradeId: "trade_2", symbol: "BTC", side: "SHORT",
        state: "MONITORING", openedAt: AT, leverage: 5, size: "0.1", entryPrice: "60000",
      }),
    );

    assert.equal(registry.claimExit("ETH", "HARD_RISK_EXIT", AT).kind, "claimed");
    assert.equal(registry.claimExit("BTC", "HARD_RISK_EXIT", AT).kind, "claimed");
    assert.equal(registry.totalClaims, 2);
  });

  test("a claim from PENDING_ENTRY is allowed — the entry may have filled unseen", () => {
    const registry = registryWithPosition("PENDING_ENTRY");
    assert.equal(registry.claimExit("ETH", "HARD_RISK_EXIT", AT).kind, "claimed");
    assert.equal(registry.get("ETH")!.state, "EXIT_TRIGGERED");
  });

  test("the claim token identifies the lifecycle it owns", () => {
    const registry = registryWithPosition();
    const claim = registry.claimExit("ETH", "HARD_RISK_EXIT", AT);
    assert.ok(claim.kind === "claimed");
    if (claim.kind !== "claimed") return;
    assert.equal(claim.token.tradeId, "trade_1");
    assert.equal(claim.token.symbol, "ETH");
    assert.equal(claim.token.reason, "HARD_RISK_EXIT");
    assert.equal(claim.token.claimedAt, AT);
    assert.equal(claim.token.claim, 1);
  });

  test("claimExit is synchronous, which is the whole concurrency argument", () => {
    const registry = registryWithPosition();
    const result = registry.claimExit("ETH", "HARD_RISK_EXIT", AT);
    // If it ever became async this would be a Promise, and the atomicity
    // guarantee would silently disappear.
    assert.ok(!(result instanceof Promise));
    assert.equal(typeof (result as { kind: string }).kind, "string");
  });
});

describe("transition coverage", () => {
  test("every transition in the table is reachable and well-formed", () => {
    const states: PositionState[] = [
      "PENDING_ENTRY", "OPEN", "MONITORING", "EXIT_TRIGGERED", "CLOSING",
      "CLOSED", "ENTRY_FAILED", "EXIT_FAILED", "RECONCILIATION_REQUIRED", "UNKNOWN",
    ];
    const seen = new Set<PositionTransition>();
    for (const state of states) {
      for (const transition of allowedTransitions(state)) {
        seen.add(transition);
        const target = nextState(state, transition);
        assert.ok(target !== null, `${state} --${transition}--> must resolve`);
        assert.ok(states.includes(target), `${target} must be a real state`);
      }
    }
    // Every declared transition is used somewhere; an unused one is dead code.
    const declared: PositionTransition[] = [
      "ENTRY_CONFIRMED", "ENTRY_REJECTED", "MONITORING_ATTACHED", "MONITORING_LOST",
      "EXIT_CLAIMED", "CLOSE_SUBMITTED", "VERIFIED_FLAT", "CLOSE_ATTEMPT_FAILED",
      "CLOSE_EXHAUSTED", "DISCREPANCY_FOUND", "RECONCILED_OPEN", "RECONCILED_FLAT",
      "CONFIDENCE_LOST",
    ];
    for (const transition of declared) {
      assert.ok(seen.has(transition), `${transition} is declared but unreachable`);
    }
  });
});

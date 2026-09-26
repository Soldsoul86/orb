/**
 * Connector Sensors — `contracts/Sensor.md` §6a, `docs/DECISIONS.md` DR-7 tier 1.
 *
 * What is under test is the *recording* rule, not any provider: a driver is
 * injected, so a failure here names the rule rather than the network.
 *
 * The property that matters most is the one a plausible implementation gets
 * wrong: that a call is recorded on **every** path, including the ones where
 * nothing came back and the ones that failed. A connector journaling only its
 * successes makes silence mean *nothing was there* and *nothing was tried* at
 * once, and then history cannot be used to say Orb did not read something.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { Journal, MemoryJournalStore, unwrapPayload } from "@orb/journal";
import {
  CONNECTOR_CALL_TYPE,
  ConnectorDenied,
  answered,
  outcomeOf,
  recordCall,
  unknown,
  type ConnectorCall,
  type ConnectorDriver,
  type FetchResult,
} from "../src/index.js";

const scope = { connector: "gmail", query: "newer_than:3d" } as const;

const driverReturning = <T>(items: readonly T[] | null): ConnectorDriver<T> => ({
  async fetch(): Promise<FetchResult<T>> {
    return { items };
  },
});

const driverThrowing = (error: unknown): ConnectorDriver<never> => ({
  async fetch(): Promise<never> {
    throw error;
  },
});

async function journal() {
  return Journal.open({ lane: "mac", device: "mac-01", store: new MemoryJournalStore() });
}

async function callsIn(j: Journal): Promise<readonly ConnectorCall[]> {
  const lane = await j.readLane("mac");
  return lane
    .filter((event) => event.type === CONNECTOR_CALL_TYPE)
    .map((event) => unwrapPayload((event as { payload: unknown }).payload) as ConnectorCall);
}

describe("the outcome ladder keeps five answers apart", () => {
  test("nothing returned is absent; none returned is empty", () => {
    // The distinction five runs of the device probe were spent on. An empty
    // result and a withheld one are the same bytes to a caller, and opposite
    // facts to anyone reading the record later.
    assert.equal(outcomeOf(null), "absent");
    assert.equal(outcomeOf(undefined), "absent");
    assert.equal(outcomeOf([]), "empty");
    assert.equal(outcomeOf(["a"]), "value");
    assert.notEqual(outcomeOf(null), outcomeOf([]));
  });

  test("only two of the five mean the source told us its contents", () => {
    assert.equal(answered("value"), true);
    assert.equal(answered("empty"), true);
    for (const outcome of ["absent", "threw", "denied"] as const) {
      assert.equal(answered(outcome), false, `${outcome} is not an answer`);
      assert.equal(unknown(outcome), true);
    }
  });
});

describe("a call is history whether or not its content is", () => {
  test("a fetch that returned items is recorded, with a count and no content", async () => {
    const j = await journal();
    const result = await recordCall(j, driverReturning([{ subject: "a" }, { subject: "b" }]), scope);

    const [call] = await callsIn(j);
    assert.ok(call);
    assert.equal(call.outcome, "value");
    assert.equal(call.count, 2);
    assert.equal(call.connector, "gmail");
    // The query is recorded because it *left the device*: asking a provider for
    // `newer_than:3d` tells them what was asked (`SECURITY.md` §7).
    assert.equal(call.query, "newer_than:3d");
    // And nothing fetched is in it. There is nowhere in the record to put an
    // item, so no later edit can quietly start putting one there.
    assert.equal(JSON.stringify(call).includes("subject"), false);

    // The items reach the caller, they just do not reach the journal.
    assert.equal(result.items?.length, 2);
    assert.ok(result.eventId.length > 0, "and the call is citable by whatever derives from it");
  });

  test("a fetch that returned none is recorded as empty, with a count of zero", async () => {
    const j = await journal();
    await recordCall(j, driverReturning([]), scope);

    const [call] = await callsIn(j);
    assert.equal(call?.outcome, "empty");
    assert.equal(call?.count, 0);
  });

  test("a source that said nothing is absent, and carries no count", async () => {
    // `count: 0` here would read as "you have no mail" when the truth is "we
    // were not told" — a fact invented out of a missing one.
    const j = await journal();
    await recordCall(j, driverReturning(null), scope);

    const [call] = await callsIn(j);
    assert.equal(call?.outcome, "absent");
    assert.equal(call?.count, undefined);
    assert.equal("count" in (call as object), false, "omitted, not zero");
  });

  test("a failure is recorded rather than thrown out of the call", async () => {
    // An exception escaping before the append would leave the attempt
    // unrecorded, which is the one outcome that must not be possible.
    const j = await journal();
    const result = await recordCall(j, driverThrowing(new Error("socket hang up")), scope);

    const [call] = await callsIn(j);
    assert.equal(call?.outcome, "threw");
    assert.match(call?.failure ?? "", /socket hang up/);
    assert.equal(call?.count, undefined);
    assert.equal(result.items, null, "and no content is offered to the caller");
  });

  test("a refusal is not a failure", async () => {
    // A revoked token is a decision by the other side; a socket hanging up is
    // the attempt falling over. Reporting both as `threw` would make a caller
    // parse prose to tell "stop asking" from "try again".
    const j = await journal();
    await recordCall(j, driverThrowing(new ConnectorDenied("insufficient scope")), scope);

    const [call] = await callsIn(j);
    assert.equal(call?.outcome, "denied");
    assert.match(call?.failure ?? "", /insufficient scope/);
  });

  test("every path leaves exactly one record, so silence means nothing was tried", async () => {
    const j = await journal();
    await recordCall(j, driverReturning([{ id: 1 }]), scope);
    await recordCall(j, driverReturning([]), scope);
    await recordCall(j, driverReturning(null), scope);
    await recordCall(j, driverThrowing(new Error("boom")), scope);
    await recordCall(j, driverThrowing(new ConnectorDenied("no")), scope);

    const calls = await callsIn(j);
    assert.deepEqual(
      calls.map((call) => call.outcome),
      ["value", "empty", "absent", "threw", "denied"],
    );
  });

  test("a thrown non-Error is still recorded rather than losing the attempt", async () => {
    const j = await journal();
    await recordCall(j, driverThrowing("just a string"), scope);

    const [call] = await callsIn(j);
    assert.equal(call?.outcome, "threw");
    assert.match(call?.failure ?? "", /just a string/);
  });
});

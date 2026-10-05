/**
 * Tests for the fit probe: it runs on a synthetic backup, reports counts that add up, and never prints message text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const probe = join(here, "..", "probe.sh");
const haveJdk = spawnSync("javac", ["-version"]).status === 0;
const opts = { skip: haveJdk ? false : "no JDK on this machine" };

const CANARY = "CANARYZEBRA";
const message = (address, body, time) => ({ adress: address, body, name: "", time, type: 1 });

function synthetic() {
  const day = 86_400_000;
  const t0 = 1_790_000_000_000;
  const listSms = [];
  // A bank debit in a service sender, an unreadable service message, a promo, and a person.
  for (let i = 0; i < 6; i++) listSms.push(message("AX-TESTBK", `${CANARY} Rs 500.00 debited from a/c XX1234 on 01-Oct-26 info UPI`, t0 + i * day));
  for (let i = 0; i < 4; i++) listSms.push(message("AX-TESTPR", `${CANARY} flat 50% off use code SAVE`, t0 + i * day));
  for (let i = 0; i < 3; i++) listSms.push(message("+919800000000", `${CANARY} see you at five`, t0 + i * day));
  return { listSms };
}

test("the probe prints counts that add up and never a word of any message", opts, () => {
  const dir = mkdtempSync(join(tmpdir(), "orb-fit-"));
  try {
    const file = join(dir, "backup.sms");
    writeFileSync(file, JSON.stringify(synthetic()));
    const run = spawnSync("bash", [probe, file], { encoding: "utf8", timeout: 240_000 });
    assert.equal(run.status, 0, run.stderr.slice(-2000));
    const out = run.stdout;
    assert.match(out, /^messages 13 service 10 conversational 3 other 0$/m);
    assert.match(out, /^roles-sum 10 of 10 ok$/m);
    assert.match(out, /^dispositions LOOP=\d+  CLOSURE_CANDIDATE=\d+  LEDGER_ONLY=\d+  NOT_A_LOOP=\d+  AMBIGUOUS=\d+  UNMAPPABLE=\d+  sum 10 of 10 ok /m);
    assert.match(out, /^ledger movements 6 \(out 6, in 0\) months 1 /m);
    assert.match(out, /^unmapped% \d+/m);
    assert.ok(!out.includes(CANARY), "message text leaked into the probe's output");
    assert.ok(!run.stderr.includes(CANARY), "message text leaked into the probe's errors");
    assert.ok(!out.includes("9800000000"), "a phone number leaked into the probe's output");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the probe is deterministic: the same file gives byte-identical output", opts, () => {
  const dir = mkdtempSync(join(tmpdir(), "orb-fit-"));
  try {
    const file = join(dir, "backup.sms");
    writeFileSync(file, JSON.stringify(synthetic()));
    const a = spawnSync("bash", [probe, file], { encoding: "utf8", timeout: 240_000 });
    const b = spawnSync("bash", [probe, file], { encoding: "utf8", timeout: 240_000 });
    assert.equal(a.status, 0);
    assert.equal(a.stdout, b.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing file or no argument is refused before anything is compiled", () => {
  assert.equal(spawnSync("bash", [probe], { encoding: "utf8" }).status, 64);
  assert.equal(spawnSync("bash", [probe, "/no/such/file"], { encoding: "utf8" }).status, 66);
});

// ---------------------------------------------------------------------------- cross-sender measurement (docs/slices/FIT-XSENDER.json)

const DAY = 86_400_000;
const T0 = 1_790_000_000_000;
const bill = (sender, amount, day) => message(`VM-${sender}`, `${CANARY} Your credit card bill of Rs.${amount} is due on 05-Nov.`, T0 + day * DAY);
const credit = (sender, amount, day) => message(`VM-${sender}`, `${CANARY} Rs ${amount} credited to a/c XX1234 on 01-Oct-26 info UPI`, T0 + day * DAY);
const debit = (sender, amount, day) => message(`VM-${sender}`, `${CANARY} Rs ${amount} debited from a/c XX1234 on 01-Oct-26 info UPI`, T0 + day * DAY);

/** Ten payments and ten bills whose classification is known by construction. */
function crossSynthetic() {
  return {
    listSms: [
      // A: a bill paid from its own sender — same sender.
      bill("SAMEBK", "2,000.00", 0), debit("SAMEBK", "2,000.00", 2),
      // B: a bill from one sender, paid through another — one cross-sender candidate.
      bill("ONEBKX", "1,000.00", 0), debit("PAYBKX", "1,000.00", 3),
      // C: two senders announce the same amount; a third pays it — ambiguous.
      bill("AMBAAA", "3,000.00", 0), bill("AMBBBB", "3,000.00", 0), debit("AMBCCC", "3,000.00", 2),
      // D: a payment nobody announced; E: a bill nobody paid.
      debit("LONEBK", "4,000.00", 1), bill("LONEBL", "5,000.00", 0),
      // F: a bill already used by a same-sender payment is not a candidate for another sender's payment of the same amount.
      bill("CONSBK", "6,000.00", 0), debit("CONSBK", "6,000.00", 1), debit("OTHBKX", "6,000.00", 2),
      // G: one day past the 45-day window; H: exactly on the edge (45 days), inside it.
      bill("LATEBK", "7,000.00", 0), debit("LATEPY", "7,000.00", 46),
      bill("EDGEBK", "8,000.00", 0), debit("EDGEPY", "8,000.00", 45),
      // I: the payment is before the bill; J: a different amount.
      debit("EARLPY", "9,000.00", 0), bill("EARLBK", "9,000.00", 1),
      bill("AMTBKX", "10,000.00", 0), debit("AMTPYX", "10,500.00", 1),
      // K: the payment is on the same day as the bill — inside the window. L: money that came in is not the end of a bill you owe.
      bill("SAMEDY", "11,000.00", 0), debit("SAMEPY", "11,000.00", 0),
      bill("INBILL", "12,000.00", 0), credit("INPAYX", "12,000.00", 1),
      // M: the same pair of senders twice, so the pair counts differ and the order of the pairs is tested.
      bill("TWOBK", "14,000.00", 0), debit("TWOPY", "14,000.00", 1), bill("TWOBK", "15,000.00", 0), debit("TWOPY", "15,000.00", 1),
    ],
  };
}

function runCross() {
  const dir = mkdtempSync(join(tmpdir(), "orb-fit-"));
  try {
    const file = join(dir, "backup.sms");
    writeFileSync(file, JSON.stringify(crossSynthetic()));
    const run = spawnSync("bash", [probe, file], { encoding: "utf8", timeout: 240_000 });
    assert.equal(run.status, 0, run.stderr.slice(-2000));
    return run;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("cross-sender: payments and bills are classified as constructed, and the totals add up", opts, () => {
  const out = runCross().stdout;
  assert.match(out, /^cross-sender: payments 14 = same sender 2 \+ different sender \(one candidate\) 5 \+ ambiguous 1 \+ unmatched 6 ok$/m);
  assert.match(out, /^cross-sender: obligations 14 = with a same-sender payment 2 \+ a different-sender candidate only 7 \+ none 5 ok$/m);
  assert.match(out, /^cross-sender: of the obligations you owe 14: same sender 2, different-sender candidate only 7, none 5$/m);
});

test("cross-sender: the sender pairs are named by brand, one candidate and ambiguous apart", opts, () => {
  const out = runCross().stdout;
  assert.match(out, /^cross-sender pairs \(bill sender -> payment sender\), one candidate: TWOBK -> TWOPY 2, EDGEBK -> EDGEPY 1, ONEBKX -> PAYBKX 1, SAMEDY -> SAMEPY 1$/m);
  assert.match(out, /^cross-sender pairs inside an ambiguous payment: AMBAAA -> AMBCCC 1, AMBBBB -> AMBCCC 1$/m);
});

test("cross-sender: no message text, account number or amount is printed, and the output is deterministic", opts, () => {
  const a = runCross();
  const b = runCross();
  assert.equal(a.stdout, b.stdout);
  for (const line of a.stdout.split("\n").filter((l) => l.startsWith("cross-sender"))) {
    assert.ok(!line.includes(CANARY), "message text leaked");
    assert.ok(!line.includes("XX1234"), "an account number leaked");
    assert.ok(!/\d,\d{3}/.test(line), "an amount leaked");
  }
  assert.ok(!a.stdout.includes("drifted"), "the replicated payment definition no longer agrees with the correlator");
});

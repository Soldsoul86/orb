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

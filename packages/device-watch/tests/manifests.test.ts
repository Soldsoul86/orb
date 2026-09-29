/**
 * The phone builds' manifests, read as text.
 *
 * `android:allowBackup` defaults to **true**, and the Orb app keeps the journal,
 * the sealed attachments and their keys in private storage — so a manifest that
 * merely forgets the attribute would let a platform backup carry key and
 * ciphertext off the phone together (`ARCHITECTURAL_DEBT.md` AD-11). Nothing
 * fails at runtime when it is missing, which is why a test has to.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = async (app: string): Promise<string> =>
  (await readFile(join(here, "../../../../apps/pixel", app, "AndroidManifest.xml"), "utf8")).replace(/<!--[\s\S]*?-->/g, "");

describe("phone manifests that hold a journal", () => {
  for (const app of ["orb", "probe-assist"]) {
    test(`${app} turns platform backup off`, async () => {
      assert.match(await manifest(app), /android:allowBackup="false"/);
    });
  }
});

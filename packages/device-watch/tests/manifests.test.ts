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

const rules = async (app: string): Promise<string> =>
  (await readFile(join(here, "../../../../apps/pixel", app, "res/xml/data_extraction_rules.xml"), "utf8")).replace(/<!--[\s\S]*?-->/g, "");

describe("phone manifests that hold a journal", () => {
  for (const app of ["orb", "probe-assist"]) {
    test(`${app} turns platform backup off`, async () => {
      assert.match(await manifest(app), /android:allowBackup="false"/);
    });

    // allowBackup="false" alone stops cloud backup and, on some Android 12+
    // devices, does not stop device-to-device transfer (Android's own wording).
    test(`${app} also excludes everything from device-to-device transfer`, async () => {
      assert.match(await manifest(app), /android:dataExtractionRules="@xml\/data_extraction_rules"/);
      const xml = await rules(app);
      for (const section of ["cloud-backup", "device-transfer"]) {
        const body = xml.match(new RegExp(`<${section}>([\\s\\S]*?)</${section}>`))?.[1] ?? "";
        for (const domain of ["root", "file", "database", "sharedpref", "external"]) {
          assert.match(body, new RegExp(`<exclude domain="${domain}" path="\\." />`), `${section} must exclude ${domain}`);
        }
        assert.doesNotMatch(body, /<include/, `${section} must not include anything back`);
      }
    });
  }
});

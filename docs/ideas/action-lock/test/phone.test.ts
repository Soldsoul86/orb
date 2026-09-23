import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { checkPhone, isPhoneDump, PHONE_MARKER, PHONE_SCRIPT } from '../src/import/phone.ts';
import { detectSource, formatReport, formatSummary, runImport } from '../src/import/run.ts';

// Shaped like the output of PHONE_SCRIPT on Android 14–16.
const DUMP = `${PHONE_MARKER}
##orb packages
package:com.phonepe.app  installer=com.android.vending
package:com.whatsapp  installer=com.android.vending
package:com.pushbullet.android  installer=com.android.vending
package:com.kyc.update.helper  installer=com.google.android.packageinstaller
package:com.company.vpn  installer=null
package:org.chromium.webapk.ab259a146a4972097_v2  installer=com.android.chrome
##orb app com.phonepe.app
      android.permission.READ_SMS: granted=true, flags=[ USER_SET ]
      android.permission.READ_CONTACTS: granted=true, flags=[ USER_SET ]
    firstInstallTime=2023-02-11 09:12:44
##orb app com.whatsapp
      android.permission.READ_CONTACTS: granted=true
##orb app com.pushbullet.android
      android.permission.READ_SMS: granted=true
##orb app com.kyc.update.helper
      android.permission.RECEIVE_SMS: granted=true
      android.permission.READ_SMS: granted=true
    firstInstallTime=2026-09-20 22:01:03
##orb app com.company.vpn
##orb appop SYSTEM_ALERT_WINDOW
Package com.kyc.update.helper
Package com.whatsapp
##orb appop REQUEST_INSTALL_PACKAGES
Package com.whatsapp
##orb accessibility
com.kyc.update.helper/com.kyc.update.helper.Svc:com.google.android.marvin.talkback/.TalkBackService
##orb notification_listeners
com.pushbullet.android/com.pushbullet.android.notifications.Listener
##orb sms_app
null
##orb sms_role
com.google.android.apps.messaging
##orb device_admins
ComponentInfo{com.company.vpn
##orb apk_files
/sdcard/Download/KYC_Update.apk
`;

describe('phone check', () => {
  it('recognises the dump and the script is read-only', () => {
    assert.ok(isPhoneDump(DUMP));
    assert.equal(detectSource(DUMP), 'android_phone');
    assert.doesNotMatch(PHONE_SCRIPT, /\b(?:pm (?:install|uninstall|grant|revoke|clear)|settings put|rm |appops set)\b/);
  });

  it('reads installers, permissions and special access', () => {
    const c = checkPhone(DUMP);
    assert.equal(c.apps, 6);
    assert.equal(c.webApps, 1); // a website installed from Chrome is not "not from the Play Store"
    assert.deepEqual(c.notFromPlay.map((a) => a.id), ['com.kyc.update.helper', 'com.company.vpn']);
    assert.deepEqual(c.accessibility, ['com.kyc.update.helper']); // TalkBack is a system app: not judged
    assert.deepEqual(c.notificationReaders, ['com.pushbullet.android']);
    assert.deepEqual(c.deviceAdmins, ['com.company.vpn']);
    assert.deepEqual([...c.readSms].sort(), ['com.kyc.update.helper', 'com.phonepe.app', 'com.pushbullet.android']);
    assert.deepEqual([...c.drawOverApps].sort(), ['com.kyc.update.helper', 'com.whatsapp']);
    assert.deepEqual(c.installApps, ['com.whatsapp']);
    assert.deepEqual(c.apkFiles, ['/sdcard/Download/KYC_Update.apk']);
    assert.equal(c.smsApp, 'com.google.android.apps.messaging');
    assert.equal(c.notFromPlay[0]!.installedAt, Date.UTC(2026, 8, 20, 22, 1));
  });

  it('a sideloaded app that reads SMS or the screen is serious; the rest are to check', () => {
    const c = checkPhone(DUMP);
    const serious = c.findings.filter((f) => f.level === 'serious');
    assert.equal(serious.length, 2);
    assert.match(serious[0]!.text, /com\.kyc\.update\.helper was not installed from the Play Store and can read your screen and tap for you, reads your SMS/);
    assert.match(serious[1]!.text, /com\.company\.vpn .* device admin/);
    const checks = c.findings.filter((f) => f.level === 'check').map((f) => f.text).join('\n');
    assert.match(checks, /com\.pushbullet\.android reads all your notifications/);
    assert.match(checks, /2 apps can read all your SMS, OTPs included: PhonePe, com\.pushbullet\.android\./);
    assert.match(checks, /KYC_Update\.apk/);
    assert.doesNotMatch(checks, /com\.kyc\.update\.helper can read your screen/); // not repeated
  });

  it('a clean phone has nothing serious', () => {
    const clean = `${PHONE_MARKER}\n##orb packages\npackage:com.phonepe.app  installer=com.android.vending\n##orb accessibility\nnull\n##orb notification_listeners\nnull\n##orb apk_files\n`;
    const c = checkPhone(clean);
    assert.deepEqual(c.findings, []);
    assert.deepEqual(c.accessibility, []);
  });

  it('shows in the report and the sync summary', () => {
    const r = runImport([{ name: 'phone.txt', text: DUMP }], Date.UTC(2026, 8, 23));
    assert.match(formatReport(r), /⚠ PHONE CHECK: 2 serious/);
    assert.match(formatSummary(r), /Phone check: 2 serious · \d+ to look at · 2 apps not from the Play Store/);
    assert.match(formatSummary(r), /phone check found an app to remove/);
  });
});

// A security check of the phone, from what `npm run sync` reads over adb. Pure.
//
// The sync runs PHONE_SCRIPT on the phone; its output is sectioned with
// "##orb <section>" lines so it can be parsed without guessing. Only
// third-party apps (not system apps) are judged.

import { appName } from './apps.ts';

export const PHONE_MARKER = '##orb phone 1';

/** Runs on the phone through `adb shell`. Read-only: lists and settings. */
export const PHONE_SCRIPT = [
  `echo '${PHONE_MARKER}'`,
  `echo '##orb packages'`,
  'pm list packages -3 -i',
  'for p in $(pm list packages -3 | cut -d: -f2); do',
  '  echo "##orb app $p"',
  `  dumpsys package "$p" | grep -E 'granted=true|firstInstallTime='`,
  'done',
  'for op in SYSTEM_ALERT_WINDOW REQUEST_INSTALL_PACKAGES; do',
  '  echo "##orb appop $op"',
  '  cmd appops query-op $op allow 2>/dev/null',
  'done',
  `echo '##orb accessibility'`,
  'settings get secure enabled_accessibility_services',
  `echo '##orb notification_listeners'`,
  'settings get secure enabled_notification_listeners',
  `echo '##orb sms_app'`,
  'settings get secure sms_default_application',
  `echo '##orb sms_role'`,
  'cmd role get-role-holders android.app.role.SMS 2>/dev/null',
  `echo '##orb device_admins'`,
  `dumpsys device_policy 2>/dev/null | grep -oE 'ComponentInfo\\{[^/}]+' | sort -u`,
  `echo '##orb apk_files'`,
  `find /sdcard/Download /sdcard/Documents /sdcard/Android/media/com.whatsapp -maxdepth 5 -iname '*.apk' 2>/dev/null`,
].join('\n');

/** Permissions that matter for money: each lets an app see or act on what your bank sends you. */
const WATCHED: Readonly<Record<string, string>> = {
  'android.permission.READ_SMS': 'read your SMS (OTPs)',
  'android.permission.RECEIVE_SMS': 'read your SMS (OTPs)',
  'android.permission.SEND_SMS': 'send SMS',
  'android.permission.READ_CALL_LOG': 'read your call log',
  'android.permission.READ_CONTACTS': 'read your contacts',
  'android.permission.CALL_PHONE': 'place calls',
};

const PLAY = new Set(['com.android.vending', 'com.google.android.feedback']);
/** Websites installed as apps from Chrome (PWAs): no more access than the site had. */
const isWebApp = (id: string, installer: string | null) => id.startsWith('org.chromium.webapk.') || (installer === 'com.android.chrome' && /webapk/.test(id));

/** Friendly names for common apps; others show their package ID. */
const NAMES: Readonly<Record<string, string>> = {
  'com.jio.myjio': 'MyJio',
  'com.truecaller': 'Truecaller',
  'in.amazon.mShop.android.shopping': 'Amazon',
  'com.myairtelapp': 'Airtel Thanks',
  'com.flipkart.android': 'Flipkart',
  'com.whatsapp': 'WhatsApp',
  'com.whatsapp.w4b': 'WhatsApp Business',
  'com.zeptoconsumerapp': 'Zepto',
  'in.swiggy.android': 'Swiggy',
  'com.application.zomato': 'Zomato',
  'in.redbus.android': 'redBus',
  'com.grofers.customerapp': 'Blinkit',
  'com.grofers.customerapp.lit': 'Blinkit Lite',
  'com.makemytrip': 'MakeMyTrip',
  'com.ubercab': 'Uber',
  'com.olacabs.customer': 'Ola',
  'com.bigbasket.mobileapp': 'BigBasket',
  'com.myntra.android': 'Myntra',
  'com.nextbillion.groww': 'Groww',
  'com.zerodha.kite3': 'Kite',
  'org.telegram.messenger': 'Telegram',
  'com.instagram.android': 'Instagram',
  'com.facebook.katana': 'Facebook',
};
const nameOf = (id: string) => NAMES[id] ?? appName(id);
const PKG = /\b[a-zA-Z][\w]*(?:\.[\w]+)+\b/g;

export interface AppInfo {
  readonly id: string;
  readonly name: string;
  /** Who installed it: the Play Store, another app, or nothing (adb, a file). */
  readonly installer: string | null;
  readonly fromPlay: boolean;
  readonly installedAt?: number;
  /** Watched permissions it holds, in words. */
  readonly can: readonly string[];
}

export interface PhoneFinding {
  readonly level: 'serious' | 'check';
  readonly text: string;
}

export interface PhoneCheck {
  readonly apps: number;
  readonly notFromPlay: readonly AppInfo[];
  /** Websites installed as apps from Chrome; not counted as "not from the Play Store". */
  readonly webApps: number;
  /** Third-party apps that can read the screen and tap for you. */
  readonly accessibility: readonly string[];
  /** Third-party apps that read every notification, OTPs included. */
  readonly notificationReaders: readonly string[];
  readonly deviceAdmins: readonly string[];
  readonly readSms: readonly string[];
  readonly drawOverApps: readonly string[];
  readonly installApps: readonly string[];
  readonly apkFiles: readonly string[];
  readonly smsApp: string | null;
  readonly findings: readonly PhoneFinding[];
}

export function isPhoneDump(text: string): boolean {
  return text.trimStart().startsWith(PHONE_MARKER);
}

function sections(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let current: string | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const head = line.match(/^##orb (.+)$/);
    if (head) {
      current = head[1]!.trim();
      out.set(current, out.get(current) ?? []);
    } else if (current !== null && line.trim() !== '') out.get(current)!.push(line);
  }
  return out;
}

/** "com.x/com.x.Svc:com.y/.S" or "null" → the packages. */
function componentPackages(lines: readonly string[]): string[] {
  const value = lines.join(':').trim();
  if (value === '' || value === 'null') return [];
  return [...new Set(value.split(':').map((c) => c.split('/')[0]!.trim()).filter((p) => /\./.test(p)))];
}

function parseInstallTime(s: string): number | undefined {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) : undefined;
}

export function checkPhone(text: string): PhoneCheck {
  const s = sections(text);
  const apps = new Map<string, AppInfo>();
  for (const line of s.get('packages') ?? []) {
    const m = line.match(/^package:([\w.]+)\s+installer=(\S+)/) ?? line.match(/^package:([\w.]+)/);
    if (!m) continue;
    const installer = m[2] === undefined || m[2] === 'null' ? null : m[2];
    apps.set(m[1]!, { id: m[1]!, name: nameOf(m[1]!), installer, fromPlay: installer !== null && PLAY.has(installer), can: [] });
  }
  for (const [key, lines] of s) {
    const id = key.match(/^app (\S+)$/)?.[1];
    const app = id === undefined ? undefined : apps.get(id);
    if (app === undefined) continue;
    const can = new Set<string>();
    let installedAt: number | undefined;
    for (const l of lines) {
      const perm = l.match(/(android\.permission\.[A-Z_]+): granted=true/)?.[1];
      if (perm !== undefined && WATCHED[perm] !== undefined) can.add(WATCHED[perm]);
      const t = l.match(/firstInstallTime=(.+)/)?.[1];
      if (t !== undefined) installedAt ??= parseInstallTime(t);
    }
    apps.set(app.id, { ...app, can: [...can], ...(installedAt !== undefined ? { installedAt } : {}) });
  }

  const third = (ids: readonly string[]) => ids.filter((p) => apps.has(p));
  const opHolders = (op: string) => third([...new Set((s.get(`appop ${op}`) ?? []).flatMap((l) => l.match(PKG) ?? []))]);
  const name = (id: string) => apps.get(id)?.name ?? nameOf(id);

  const accessibility = third(componentPackages(s.get('accessibility') ?? []));
  const notificationReaders = third(componentPackages(s.get('notification_listeners') ?? []));
  // Newer Android keeps the default SMS app as a "role"; older versions in settings.
  const fromSetting = (s.get('sms_app') ?? []).join('').trim();
  const fromRole = (s.get('sms_role') ?? []).join(' ').match(PKG)?.[0] ?? '';
  const smsApp = fromSetting !== '' && fromSetting !== 'null' ? fromSetting : fromRole;
  const deviceAdmins = third((s.get('device_admins') ?? []).map((l) => l.replace(/^ComponentInfo\{/, '').trim()));
  const readSms = [...apps.values()].filter((a) => a.can.includes(WATCHED['android.permission.READ_SMS']!) && a.id !== smsApp).map((a) => a.id);
  const drawOverApps = opHolders('SYSTEM_ALERT_WINDOW');
  const installApps = opHolders('REQUEST_INSTALL_PACKAGES');
  const apkFiles = (s.get('apk_files') ?? []).map((l) => l.trim());
  const webApps = [...apps.values()].filter((a) => isWebApp(a.id, a.installer)).length;
  const notFromPlay = [...apps.values()].filter((a) => !a.fromPlay && !isWebApp(a.id, a.installer));

  // Banking trojans in India arrive as an APK over WhatsApp, then ask for
  // SMS, notification or accessibility access to read OTPs and tap "Pay".
  const findings: PhoneFinding[] = [];
  const powers = (id: string) =>
    [
      accessibility.includes(id) ? 'can read your screen and tap for you' : '',
      notificationReaders.includes(id) ? 'reads all notifications' : '',
      readSms.includes(id) ? 'reads your SMS' : '',
      deviceAdmins.includes(id) ? 'is a device admin (hard to uninstall)' : '',
    ].filter(Boolean);
  for (const a of notFromPlay) {
    const p = powers(a.id);
    if (p.length > 0) findings.push({ level: 'serious', text: `${a.name} was not installed from the Play Store and ${p.join(', ')}. Uninstall it unless you know exactly what it is.` });
  }
  const serious = new Set(notFromPlay.filter((a) => powers(a.id).length > 0).map((a) => a.id));
  for (const id of accessibility) if (!serious.has(id)) findings.push({ level: 'check', text: `${name(id)} can read your screen and tap for you (Accessibility). Turn it off unless you need it.` });
  for (const id of notificationReaders) if (!serious.has(id)) findings.push({ level: 'check', text: `${name(id)} reads all your notifications, OTPs included.` });
  // Many Play Store apps hold SMS access for OTP autofill: one line, not one per app.
  const smsReaders = readSms.filter((id) => !serious.has(id));
  if (smsReaders.length > 0) {
    findings.push({
      level: 'check',
      text: `${smsReaders.length} app${smsReaders.length === 1 ? '' : 's'} can read all your SMS, OTPs included: ${smsReaders.map(name).join(', ')}. Most only need it to fill OTPs; remove it from any that don't (Settings → Security & privacy → Privacy → Permission manager → SMS).`,
    });
  }
  for (const id of deviceAdmins) if (!serious.has(id)) findings.push({ level: 'check', text: `${name(id)} is a device admin, so it is hard to uninstall.` });
  const others = notFromPlay.filter((a) => !serious.has(a.id));
  const how = (a: AppInfo) =>
    a.installer === null ? 'installed over a cable or by an unknown app' : a.installer === 'com.google.android.packageinstaller' ? 'installed from an .apk file' : `installed by ${nameOf(a.installer)}`;
  if (others.length > 0) findings.push({ level: 'check', text: `Not from the Play Store: ${others.map((a) => `${a.name} (${how(a)})`).join(', ')}. Fine if you know where it came from.` });
  if (apkFiles.length > 0) findings.push({ level: 'check', text: `${apkFiles.length} app installer file${apkFiles.length === 1 ? '' : 's'} (.apk) on the phone: ${apkFiles.map((f) => f.split('/').pop()).join(', ')}. Delete any you didn't mean to keep; never open one sent on WhatsApp.` });
  if (installApps.length > 0) findings.push({ level: 'check', text: `Allowed to install other apps: ${installApps.map(name).join(', ')}.` });

  return {
    apps: apps.size,
    notFromPlay,
    webApps,
    accessibility,
    notificationReaders,
    deviceAdmins,
    readSms,
    drawOverApps,
    installApps,
    apkFiles,
    smsApp: smsApp === '' || smsApp === 'null' ? null : smsApp,
    findings,
  };
}

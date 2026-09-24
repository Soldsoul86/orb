// The data map: for each kind of personal data on the phone, which of your
// apps can read it, what Orb itself reads it for, and where to take access
// away. Pure; built from the phone check (every permission granted to every
// app you installed). System apps are not listed.

import type { AppInfo, PhoneCheck } from '../import/phone.ts';

export type Sensitivity = 'money' | 'high' | 'medium';

export interface DataKind {
  readonly id: string;
  readonly label: string;
  /** Why it matters, in one line. */
  readonly why: string;
  readonly sensitivity: Sensitivity;
  /** Any of these permissions gives access. */
  readonly permissions: readonly string[];
  /** Where in Settings to review who has it. */
  readonly settings: string;
  /** What Orb reads it for, if it does. */
  readonly orb?: string;
}

const PM = 'Settings → Security & privacy → Privacy → Permission manager';

export const KINDS: readonly DataKind[] = [
  { id: 'sms', label: 'Messages (SMS)', why: 'Bank alerts and every OTP: enough to take over accounts.', sensitivity: 'money', permissions: ['android.permission.READ_SMS', 'android.permission.RECEIVE_SMS', 'android.permission.RECEIVE_MMS'], settings: `${PM} → SMS`, orb: 'bank alerts, autopays, scam messages, passwords sitting in SMS' },
  { id: 'notifications', label: 'All notifications', why: 'Every OTP and message preview, from every app.', sensitivity: 'money', permissions: [], settings: 'Settings → Notifications → Device & app notifications' },
  { id: 'screen', label: 'Your screen, and taps for you (Accessibility)', why: 'Can read anything shown and act as you, including in bank apps.', sensitivity: 'money', permissions: [], settings: 'Settings → Accessibility', orb: 'the pay and message guards: UPI pay/PIN screens, and the WhatsApp message box if you turn it on' },
  { id: 'install', label: 'Install other apps', why: 'How fake "KYC" and "support" APKs get in.', sensitivity: 'money', permissions: [], settings: 'Settings → Apps → Special app access → Install unknown apps' },
  { id: 'overlay', label: 'Draw over other apps', why: 'Can put a fake screen on top of your bank app.', sensitivity: 'money', permissions: [], settings: 'Settings → Apps → Special app access → Display over other apps' },
  { id: 'contacts', label: 'Contacts', why: 'Names and numbers of everyone you know.', sensitivity: 'high', permissions: ['android.permission.READ_CONTACTS'], settings: `${PM} → Contacts`, orb: 'who is who: matching payees and callers to people you know' },
  { id: 'calls', label: 'Call log and calls', why: 'Who you talk to, and when.', sensitivity: 'high', permissions: ['android.permission.READ_CALL_LOG', 'android.permission.PROCESS_OUTGOING_CALLS', 'android.permission.CALL_PHONE', 'android.permission.ANSWER_PHONE_CALLS'], settings: `${PM} → Call logs / Phone`, orb: 'unknown numbers that keep calling' },
  { id: 'location_always', label: 'Location, all the time', why: 'Where you live, work and go, even when the app is closed.', sensitivity: 'high', permissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'], settings: `${PM} → Location` },
  { id: 'location', label: 'Location, while in use', why: 'Where you are when you use the app.', sensitivity: 'medium', permissions: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'], settings: `${PM} → Location` },
  { id: 'microphone', label: 'Microphone', why: 'Can record what is said near the phone.', sensitivity: 'high', permissions: ['android.permission.RECORD_AUDIO'], settings: `${PM} → Microphone` },
  { id: 'camera', label: 'Camera', why: 'Photos and video, including of documents.', sensitivity: 'high', permissions: ['android.permission.CAMERA'], settings: `${PM} → Camera` },
  { id: 'photos', label: 'Photos and videos', why: 'Often includes photos of ID cards, cheques and screenshots of OTPs.', sensitivity: 'high', permissions: ['android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.READ_MEDIA_VISUAL_USER_SELECTED'], settings: `${PM} → Photos & videos` },
  { id: 'files', label: 'All files', why: 'Every document on the phone: statements, PDFs, backups.', sensitivity: 'high', permissions: ['android.permission.MANAGE_EXTERNAL_STORAGE'], settings: 'Settings → Apps → Special app access → All files access' },
  { id: 'calendar', label: 'Calendar', why: 'Your meetings, travel and routine.', sensitivity: 'medium', permissions: ['android.permission.READ_CALENDAR'], settings: `${PM} → Calendar` },
  { id: 'health', label: 'Body, fitness and health', why: 'Activity, sleep and health records.', sensitivity: 'medium', permissions: ['android.permission.BODY_SENSORS', 'android.permission.ACTIVITY_RECOGNITION'], settings: `${PM} → Physical activity / Body sensors` },
  { id: 'nearby', label: 'Nearby devices', why: 'Bluetooth and Wi-Fi devices around you (also used for location).', sensitivity: 'medium', permissions: ['android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_CONNECT', 'android.permission.NEARBY_WIFI_DEVICES'], settings: `${PM} → Nearby devices` },
  { id: 'identity', label: 'Phone number and accounts', why: 'Your number and the accounts on the phone.', sensitivity: 'medium', permissions: ['android.permission.READ_PHONE_NUMBERS', 'android.permission.GET_ACCOUNTS'], settings: `${PM} → Phone` },
];

export interface DataRow {
  readonly kind: DataKind;
  readonly apps: readonly string[];
  /** Of those, installed from outside the Play Store. */
  readonly sideloaded: readonly string[];
}

export interface DataMap {
  readonly rows: readonly DataRow[];
  /** Apps that can reach the most kinds of sensitive data, most first. */
  readonly widest: readonly { readonly app: string; readonly kinds: number; readonly money: number }[];
}

const has = (a: AppInfo, perms: readonly string[]) => perms.some((p) => a.granted.includes(p));

export function dataMap(phone: PhoneCheck): DataMap {
  const byId = new Map(phone.all.map((a) => [a.id, a]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const special: Readonly<Record<string, readonly string[]>> = {
    notifications: phone.notificationReaders,
    screen: phone.accessibility,
    install: phone.installApps,
    overlay: phone.drawOverApps,
  };
  const rows = KINDS.map((kind): DataRow => {
    const ids =
      special[kind.id] ??
      phone.all
        .filter((a) => has(a, kind.permissions) || (kind.id === 'health' && a.granted.some((g) => g.startsWith('android.permission.health.'))))
        .map((a) => a.id);
    return {
      kind,
      apps: ids.map(name).sort((x, y) => x.localeCompare(y)),
      sideloaded: ids.filter((id) => byId.get(id)?.fromPlay === false).map(name),
    };
  });
  const count = new Map<string, { kinds: number; money: number }>();
  for (const r of rows) {
    if (r.kind.sensitivity === 'medium') continue;
    for (const app of r.apps) {
      const c = count.get(app) ?? { kinds: 0, money: 0 };
      count.set(app, { kinds: c.kinds + 1, money: c.money + (r.kind.sensitivity === 'money' ? 1 : 0) });
    }
  }
  const widest = [...count.entries()]
    .map(([app, c]) => ({ app, ...c }))
    .sort((a, b) => b.money - a.money || b.kinds - a.kinds || a.app.localeCompare(b.app))
    .slice(0, 8);
  return { rows, widest };
}

// Installed apps, from `adb shell pm list packages`. Pure.
//
// Only a known list is classified; anything else is ignored. Package names
// below are the apps' public Play Store IDs; the list is best-effort and
// meant to grow.

export type AppKind = 'payment' | 'bank' | 'crypto' | 'remote_access';

const KNOWN: readonly [string, string, AppKind][] = [
  ['com.google.android.apps.nbu.paisa.user', 'Google Pay', 'payment'],
  ['com.phonepe.app', 'PhonePe', 'payment'],
  ['net.one97.paytm', 'Paytm', 'payment'],
  ['in.org.npci.upiapp', 'BHIM', 'payment'],
  ['com.dreamplug.androidapp', 'CRED', 'payment'],
  ['com.mobikwik_new', 'MobiKwik', 'payment'],
  ['com.snapwork.hdfc', 'HDFC Bank', 'bank'],
  ['com.csam.icici.bank.imobile', 'ICICI iMobile', 'bank'],
  ['com.sbi.lotusintouch', 'SBI YONO', 'bank'],
  ['com.axis.mobile', 'Axis Mobile', 'bank'],
  ['com.msf.kbank.mobile', 'Kotak', 'bank'],
  ['com.canarabank.mobility', 'Canara ai1', 'bank'],
  ['com.wazirx', 'WazirX', 'crypto'],
  ['com.coindcx.btc', 'CoinDCX', 'crypto'],
  ['com.binance.dev', 'Binance', 'crypto'],
  ['io.metamask', 'MetaMask', 'crypto'],
  ['com.wallet.crypto.trustapp', 'Trust Wallet', 'crypto'],
  ['com.coinbase.android', 'Coinbase', 'crypto'],
  ['com.anydesk.anydeskandroid', 'AnyDesk', 'remote_access'],
  ['com.teamviewer.quicksupport.market', 'TeamViewer QuickSupport', 'remote_access'],
  ['com.teamviewer.teamviewer.market.mobile', 'TeamViewer', 'remote_access'],
  ['com.rustdesk.rustdesk', 'RustDesk', 'remote_access'],
];

/** Name fragments for apps not in the list above (e.g. an exchange you use). */
const BY_NAME: readonly [RegExp, AppKind][] = [
  [/giottus|zebpay|bitbns|mudrex|kucoin|okx|bybit|crypto|wallet\.crypto/i, 'crypto'],
  [/anydesk|teamviewer|quicksupport|rustdesk|airdroid\.remote|screenshare/i, 'remote_access'],
];

export interface InstalledApps {
  readonly total: number;
  readonly payment: readonly string[];
  readonly bank: readonly string[];
  readonly crypto: readonly string[];
  /** Screen-sharing / remote-control apps: the tool of "support" scams. */
  readonly remote_access: readonly string[];
}

export function isPackageList(text: string): boolean {
  return /^package:[\w.]+/m.test(text.trimStart().slice(0, 200));
}

export function classifyPackages(text: string): InstalledApps {
  const ids = [...text.matchAll(/^package:([\w.]+)/gm)].map((m) => m[1]!);
  const out: Record<AppKind, string[]> = { payment: [], bank: [], crypto: [], remote_access: [] };
  for (const id of ids) {
    const known = KNOWN.find(([pkg]) => pkg === id);
    if (known) {
      out[known[2]].push(known[1]);
      continue;
    }
    const byName = BY_NAME.find(([re]) => re.test(id));
    if (byName) out[byName[1]].push(id);
  }
  return { total: ids.length, ...out };
}

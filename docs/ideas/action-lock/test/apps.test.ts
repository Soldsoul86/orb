import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { classifyPackages, isPackageList } from '../src/import/apps.ts';
import { detectSource, formatReport, formatSummary, runImport } from '../src/import/run.ts';

const LIST = [
  'package:com.google.android.apps.nbu.paisa.user',
  'package:com.phonepe.app',
  'package:com.csam.icici.bank.imobile',
  'package:com.giottus.app',
  'package:io.metamask',
  'package:com.anydesk.anydeskandroid',
  'package:com.android.chrome',
].join('\n');

describe('installed apps', () => {
  it('recognises a package list', () => {
    assert.ok(isPackageList(LIST));
    assert.equal(detectSource(LIST), 'android_packages');
    assert.ok(!isPackageList('Row: 0 address=x, date=1, body=y'));
  });

  it('sorts known apps into payment, bank, crypto and screen-sharing', () => {
    const a = classifyPackages(LIST);
    assert.equal(a.total, 7);
    assert.deepEqual(a.payment, ['Google Pay', 'PhonePe']);
    assert.deepEqual(a.bank, ['ICICI iMobile']);
    assert.deepEqual(a.crypto, ['com.giottus.app', 'MetaMask']);
    assert.deepEqual(a.remote_access, ['AnyDesk']);
  });

  it('adds apps to the profile and warns about screen-sharing apps', () => {
    const at = Date.UTC(2026, 8, 23);
    const sms = `Row: 0 address=VM-HDFCBK-S, date=${at}, body=Sent Rs.500.00\nFrom HDFC Bank A/C *1234\nTo RAVI KUMAR\nRef 526512345678`;
    const r = runImport([{ name: 'sms.txt', text: sms }, { name: 'apps.txt', text: LIST }], at);
    assert.deepEqual(r.profile.apps?.remote_access, ['AnyDesk']);
    assert.equal(r.txns.length, 1);
    assert.match(formatReport(r), /SCREEN-SHARING APP INSTALLED: AnyDesk/);
    const summary = formatSummary(r);
    assert.match(summary, /Synced: 1 transactions from 1 messages/);
    assert.match(summary, /screen-sharing app installed \(AnyDesk\)/);
  });
});

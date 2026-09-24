// Invented sample data so the Orb page can be previewed in a browser, where
// there is no phone to read. Shaped like the real readers' output.

const DAY = 86_400_000;

export function demoSources(now: number): Record<string, string> {
  let row = 0;
  const sms = (at: number, body: string, address = 'JM-HDFCBK-S') => `Row: ${row++} address=${address}, date=${at}, body=${body}`;
  const lines: string[] = [];
  for (let m = 0; m < 6; m++) {
    const at = now - (m * 30 + 23) * DAY;
    lines.push(sms(at, `Update! INR 2,40,000.00 deposited in HDFC Bank A/c XX1234 on 01-SEP-26 for NEFT Cr-ICIC0000001-NORTHWIND LABS PVT LTD-You-REF6244027013${m}.Avl bal INR 2,48,000.00.`));
    lines.push(sms(at + 3 * DAY, `Sent Rs.25000.00\nFrom HDFC Bank A/C *1234\nTo RAMESH IYER\nOn 04/09/26\nRef 50489344000${m}\nNot You?`));
  }
  for (let i = 0; i < 9; i++) {
    lines.push(sms(now - (i * 11 + 2) * DAY, `Received!\nINR 2,000.00 in HDFC Bank A/c xx1234\nOn 18-09-26\nFor IMPS -MEERA NAIR- F6261104013${i}\nAvl bal INR 1,024.52`));
    lines.push(sms(now - (i * 11 + 5) * DAY, `Sent Rs.1500.00\nFrom HDFC Bank A/C *1234\nTo MEERA NAIR\nOn 04/09/26\nRef 60489344000${i}\nNot You?`));
  }
  lines.push(sms(now - 50 * DAY, 'IMPS INR 45,000.00\nsent from HDFC Bank A/c XX1234 on 02-08-26\nTo A/c xxxxxxxxxx7788\nRef-621454202605\nNot you?'));
  for (let i = 0; i < 40; i++) {
    const shop = ['SWIGGY LIMITED', 'ZEPTO MARKETPLACE', 'UBER INDIA', 'BLUE TOKAI COFFEE'][i % 4]!;
    lines.push(sms(now - (i * 1.5 + 0.3) * DAY, `Sent Rs.${180 + (i % 7) * 60}.00\nFrom HDFC Bank A/C *1234\nTo ${shop}\nOn 21/08/26\nRef 3048934492${String(i).padStart(2, '0')}\nNot You?`));
  }
  for (let m = 0; m < 5; m++) {
    lines.push(sms(now - (m * 30 + 6) * DAY, `Rs.649.00 spent on HDFC Bank Card x1234 at NETFLIX ENTERTAINMENT on 2026-09-01. Not you? Call 18002586161`));
  }
  lines.push(sms(now - 3 * DAY, 'Your KYC is pending. Rs 4,50,000 loan is ready to be credited. Complete now: http://bit.ly/x1', '+919812345678'));

  const contacts = ['Row: 0 data1=+91 98450 11111, display_name=Meera Nair', 'Row: 1 data1=+91 98450 22222, display_name=Amma'].join('\n');
  const calls = [0, 1, 2, 3].map((i) => `Row: ${i} number=+918888800001, date=${now - (i + 1) * DAY}, duration=0, type=3`).join('\n');
  const phone = [
    '##orb phone 1',
    '##orb packages',
    'package:com.phonepe.app  installer=com.android.vending',
    'package:com.example.foodscan  installer=com.google.android.packageinstaller',
    '##orb app com.phonepe.app',
    '      android.permission.READ_SMS: granted=true',
    '##orb accessibility',
    'null',
    '##orb notification_listeners',
    'null',
    '##orb sms_app',
    'com.google.android.apps.messaging',
  ].join('\n');
  return { sms: lines.join('\n'), contacts, calls, phone, apps: 'package:com.phonepe.app\npackage:com.example.foodscan', usage: '' };
}

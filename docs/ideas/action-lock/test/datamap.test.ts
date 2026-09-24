import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { checkPhone, PHONE_MARKER } from '../src/import/phone.ts';
import { dataMap } from '../src/orb/datamap.ts';

const DUMP = `${PHONE_MARKER}
##orb packages
package:com.phonepe.app  installer=com.android.vending
package:com.whatsapp  installer=com.android.vending
package:com.fitness.app  installer=com.android.vending
package:com.kyc.helper  installer=com.google.android.packageinstaller
##orb app com.phonepe.app
      android.permission.READ_SMS: granted=true
      android.permission.READ_CONTACTS: granted=true
      android.permission.CAMERA: granted=true
      android.permission.ACCESS_FINE_LOCATION: granted=true
##orb app com.whatsapp
      android.permission.READ_CONTACTS: granted=true
      android.permission.RECORD_AUDIO: granted=true
      android.permission.CAMERA: granted=true
      android.permission.READ_MEDIA_IMAGES: granted=true
##orb app com.fitness.app
      android.permission.ACCESS_BACKGROUND_LOCATION: granted=true
      android.permission.ACCESS_FINE_LOCATION: granted=true
      android.permission.health.READ_STEPS: granted=true
##orb app com.kyc.helper
      android.permission.READ_SMS: granted=true
##orb appop SYSTEM_ALERT_WINDOW
Package com.kyc.helper
##orb accessibility
com.kyc.helper/com.kyc.helper.Svc
##orb notification_listeners
null
`;

describe('data map', () => {
  const m = dataMap(checkPhone(DUMP));
  const row = (id: string) => m.rows.find((r) => r.kind.id === id)!;

  it('lists, for each kind of data, the apps that can read it', () => {
    assert.deepEqual(row('sms').apps, ['com.kyc.helper', 'PhonePe']);
    assert.deepEqual(row('sms').sideloaded, ['com.kyc.helper']);
    assert.deepEqual(row('contacts').apps, ['PhonePe', 'WhatsApp']);
    assert.deepEqual(row('microphone').apps, ['WhatsApp']);
    assert.deepEqual(row('location_always').apps, ['com.fitness.app']);
    assert.deepEqual(row('health').apps, ['com.fitness.app']);
    assert.deepEqual(row('screen').apps, ['com.kyc.helper']);
    assert.deepEqual(row('overlay').apps, ['com.kyc.helper']);
    assert.deepEqual(row('notifications').apps, []);
  });

  it('ranks the apps that reach the most money-related data first', () => {
    assert.equal(m.widest[0]!.app, 'com.kyc.helper');
    assert.equal(m.widest[0]!.money, 3); // SMS, screen, draw over
  });

  it('says where to take access away and what Orb itself reads', () => {
    assert.match(row('sms').kind.settings, /Permission manager → SMS/);
    assert.match(row('sms').kind.orb!, /bank alerts/);
    assert.equal(row('microphone').kind.orb, undefined);
  });
});

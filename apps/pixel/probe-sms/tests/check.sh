#!/usr/bin/env bash
# What the Calls Probe must be, checked from its own sources and its built APK (no device needed).
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }
M=AndroidManifest.xml
S=src/MainActivity.java.in
check "the manifest declares exactly one permission" '[ "$(grep -c "<uses-permission" $M)" = 1 ]'
check "and it is READ_SMS" 'grep -q "android.permission.READ_SMS" $M'
check "no service, receiver, provider or query" '! grep -Eq "<(service|receiver|provider|queries)" $M'
check "no network, storage or write API in the source" '! grep -Eq "INTERNET|HttpURLConnection|Socket|FileOutputStream|openOutputStream|getSharedPreferences|(^|[^A-Za-z])Log\.|System\.out|WRITE_SMS|SEND_SMS|SmsManager|RECEIVE_SMS|\.insert\(|\.delete\(|\.update\(" $S'
check "it never reads a number or a name from the inbox" '! grep -Eq "Sms\.ADDRESS|Sms\.BODY|Sms\.PERSON|Sms\.TYPE|Sms\.THREAD_ID|Sms\.SUBJECT" $S'
check "the only column it reads is the date" 'grep -q "new String\[\] {Telephony.Sms.DATE}" $S'
check "the screen is secure" 'grep -q FLAG_SECURE $S'
if [ -f build/probesms/probesms.apk ]; then
  check "the built APK declares the one permission" '[ "$(/root/android-sdk/build-tools/36.0.0/aapt2 dump permissions build/probesms/probesms.apk 2>/dev/null | grep -c "uses-permission")" = 1 ]'
fi
exit $fail

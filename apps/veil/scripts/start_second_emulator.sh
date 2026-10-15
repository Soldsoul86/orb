#!/usr/bin/env bash
set -euo pipefail
# First AVD is started by android-emulator-runner on 5554. Separate userdata for 5556.
printf 'no\n' | avdmanager create avd --force --name portable-peer --package 'system-images;android-35;default;x86_64' --device pixel_6
"$ANDROID_HOME/emulator/emulator" -avd portable-peer -port 5556 -no-window -gpu swiftshader_indirect -noaudio -no-boot-anim -no-snapshot -memory 1536 -cores 2 > "$RUNNER_TEMP/portable-peer-emulator.log" 2>&1 &
for attempt in $(seq 1 180); do
  if [ "$(adb -s emulator-5556 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; then
    adb -s emulator-5556 shell input keyevent KEYCODE_WAKEUP
    adb -s emulator-5556 shell wm dismiss-keyguard
    exit 0
  fi
  sleep 2
done
printf 'Second emulator did not boot\n' >&2
exit 1

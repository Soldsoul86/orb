#!/usr/bin/env python3
"""Opt-in live service test; two freshly installed disposable emulators, no user accounts."""
import subprocess
import time
import urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
pkg='chat.veil.purposes.preview'
def adb(device,*args,data=None):
    assert device in ('emulator-5554','emulator-5556')
    return subprocess.run(['adb','-s',device,*args],input=data,capture_output=True,check=True).stdout
# Wait for free hosted service startup without modifying its settings.
for attempt in range(6):
    try:
        with urllib.request.urlopen('https://veil-relay-soldsoul86.onrender.com/v3/capabilities',timeout=50) as response:
            assert b'"invitations":1' in response.read();break
    except Exception:
        if attempt==5:raise
        time.sleep(5)
def clear_launcher_anr(device):
    # Disposable AOSP launcher occasionally ANRs under two-emulator CI load.
    # Only clear that confirmed system-launcher dialog, never a Veil failure.
    focus=adb(device,'shell','dumpsys','window').decode(errors='replace')
    current=next((line for line in focus.splitlines() if 'mCurrentFocus=' in line),'')
    if 'Application Not Responding: com.android.launcher3' in current:
        print('Emulator preparation: close confirmed Launcher3 ANR on',device,flush=True)
        adb(device,'shell','am','force-stop','com.android.launcher3')

for device in ('emulator-5554','emulator-5556'):
    # Reduce software-rendering load; security flags and focus assertions stay unchanged.
    adb(device,'shell','wm','size','720x1280')
    adb(device,'shell','wm','density','320')
    for setting in ('window_animation_scale','transition_animation_scale','animator_duration_scale'):
        adb(device,'shell','settings','put','global',setting,'0')
    clear_launcher_anr(device)
    adb(device,'install','-r',str(root/'app/build/outputs/apk/debug/app-debug.apk'))
    adb(device,'install','-r',str(root/'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'))
    adb(device,'shell','input','keyevent','KEYCODE_WAKEUP');adb(device,'shell','wm','dismiss-keyguard')
    adb(device,'shell','settings','put','system','screen_off_timeout','1800000')
    adb(device,'shell','run-as',pkg,'mkdir','-p','files/contact-live-fixture')
def stage(device,name):
    clear_launcher_anr(device)
    output=adb(device,'shell','am','instrument','-w','-r','-e','class','chat.veil.ContactLiveUiTest','-e','liveStage',name,'-e','disposableFixture','true',pkg+'.test/androidx.test.runner.AndroidJUnitRunner').decode()
    if 'OK (1 test)' not in output:raise RuntimeError('Live stage '+name+' failed:\n'+output)
    for line in output.splitlines():
        if 'MEASURED:' in line:print(line,flush=True)
    print('PASS live UI:',name,flush=True)
owner='emulator-5554';peer='emulator-5556'
try:
    stage(owner,'share')
    timing=adb(owner,'exec-out','run-as',pkg,'cat','files/contact-live-fixture/timing').decode()
    print('MEASURED: 3 taps from unlocked Chats to visible invitation QR; elapsed_ms='+timing+' including HTTPS publication',flush=True)
    link=adb(owner,'exec-out','run-as',pkg,'cat','files/contact-live-fixture/link')
    adb(peer,'shell','run-as',pkg,'sh','-c','"cat > files/contact-live-fixture/link"',data=link)
    stage(peer,'request');stage(owner,'accept');stage(peer,'send');stage(owner,'reply');stage(peer,'receive');stage(owner,'end');stage(peer,'blocked')
    dest=root/'ux-evidence';dest.mkdir(exist_ok=True)
    for device,label in [(owner,'owner'),(peer,'peer')]:
        (dest/f'live-{label}.tar').write_bytes(adb(device,'exec-out','run-as',pkg,'tar','-C','files/ux-evidence','-cf','-','.'))
finally:
    dest=root/'ux-evidence';dest.mkdir(exist_ok=True)
    for device,label in [(owner,'owner'),(peer,'peer')]:
        result=subprocess.run(['adb','-s',device,'exec-out','run-as',pkg,'tar','-C','files/ux-evidence','-cf','-','.'],capture_output=True)
        if result.returncode==0 and len(result.stdout)>512:(dest/f'live-{label}.tar').write_bytes(result.stdout)
    # Ephemeral test-only fixtures, never upload capabilities, identity snapshots or recovery material.
    for device in (owner,peer):adb(device,'shell','run-as',pkg,'rm','-rf','files/contact-live-fixture')

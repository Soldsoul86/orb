#!/usr/bin/env python3
"""Real ADB devices only. Does not label emulator runs as physical-device verification."""
import argparse
import pathlib
import subprocess
import shlex
import time

p = argparse.ArgumentParser()
p.add_argument('--a', required=True, help='Sender adb serial (fresh Veil test installation)')
p.add_argument('--b', required=True, help='Receiver adb serial (fresh Veil test installation)')
p.add_argument('--relay', required=True, help='Publicly trusted HTTPS origin')
p.add_argument('--relay-db', type=pathlib.Path, help='Optional local relay database to inspect before receiving')
p.add_argument('--video', type=pathlib.Path, help='Optional MP4 <=5 MiB and <=15 seconds')
a = p.parse_args()
if a.a == a.b: p.error('Two distinct devices required')
if not a.relay.startswith('https://'): p.error('HTTPS required')

def adb(serial, *args, payload=None):
    if args and args[0] in ('shell', 'exec-out'):
        args = (args[0], shlex.join(args[1:]))
    return subprocess.run(['adb', '-s', serial, *args], input=payload, capture_output=True, check=True).stdout

def step(serial, action, *extra):
    result = adb(serial, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
                 'chat.veil.TwoPhoneHarness', '-e', 'veilStep', action, *extra,
                 'chat.veil.test/androidx.test.runner.AndroidJUnitRunner').decode()
    if 'OK (1 test)' not in result or 'FAILURES' in result:
        raise RuntimeError(f'{serial}: {action} failed. Inspect local instrumentation output; do not publish keys or content.')

def write_private(serial, name, data):
    adb(serial, 'shell', 'run-as', 'chat.veil', 'mkdir', '-p', 'files/harness')
    # adb shell arguments are fixed strings; input bytes are never interpolated into shell code.
    adb(serial, 'shell', 'run-as', 'chat.veil', 'sh', '-c', f"cat > files/harness/{name}", payload=data)

for serial in [a.a, a.b]:
    adb(serial, 'get-state')
    kind = adb(serial, 'shell', 'getprop', 'ro.kernel.qemu').decode().strip()
    print(f'{serial}: {"EMULATOR" if kind == "1" else "DEVICE (physical status must be confirmed by tester)"}')
    step(serial, 'setup', '-e', 'relay', a.relay)
invites = [adb(s, 'exec-out', 'run-as', 'chat.veil', 'cat', 'files/harness/invite.txt') for s in [a.a, a.b]]
for serial, invite in [(a.a, invites[1]), (a.b, invites[0])]:
    write_private(serial, 'peer.txt', invite)
    if a.video:
        data = a.video.read_bytes()
        if len(data) > 5*1024*1024: p.error('Video too large')
        write_private(serial, 'fixture.mp4', data)
    step(serial, 'pair')
step(a.a, 'send')
if a.relay_db:
    from inspect_relay import inspect
    inspect(a.relay_db, 'VEIL_E2E_CANARY_5738')
step(a.b, 'receive')
print('PASS: real-device encrypted text and exact photo bytes round trip')
print('PASS: exact video bytes round trip' if a.video else 'NOT TESTED: video (supply --video)')
step(a.a, 'send-expiring'); step(a.b, 'receive-expiring')
print('Waiting 65 seconds for the real expiration deadline…', flush=True)
time.sleep(65)
step(a.a, 'expired'); step(a.b, 'expired')
print('PASS: honest-client disappearing-message behavior')
for serial in [a.a, a.b]: step(serial, 'clean')
print('DEVICE REQUIRED: capture, recording, casting, hold/release latency and second-camera watermark evaluation. See docs/TESTING.md.')

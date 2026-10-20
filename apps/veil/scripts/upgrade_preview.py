#!/usr/bin/env python3
"""Only run in a fresh disposable CI emulator. Evidence survives an actual install -r."""
import subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
pkg='chat.veil.purposes.preview'
def run(*cmd):return subprocess.run(cmd,check=True,capture_output=True,text=True).stdout
run('adb','install','-r',str(root/'previous/veil-purposes-preview.apk'))
run('adb','install','-r',str(root/'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'))
def stage(name):
    output=run('adb','shell','am','instrument','-w','-r','-e','class','chat.veil.UpgradeIdentityTest','-e','upgradeStage',name,'-e','disposableFixture','true',pkg+'.test/androidx.test.runner.AndroidJUnitRunner')
    if 'OK (1 test)' not in output:raise RuntimeError(output)
    print('PASS preview upgrade:',name,flush=True)
stage('seed')
for apk,label in [(root/'previous-v6/veil-purposes-preview.apk','actual distributed v6'),(root/'previous-v7/veil-purposes-preview.apk','actual distributed v7'),(root/'app/build/outputs/apk/debug/app-debug.apk','v8')]:
    run('adb','install','-r',str(apk))
    stage('check')
    print('PASS upgrade to',label,flush=True)
print('PASS v5 -> v6 -> v7 -> v8 updates without uninstall; keys, three encrypted vaults and continuing Signal ratchet preserved')

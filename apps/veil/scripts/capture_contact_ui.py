#!/usr/bin/env python3
import subprocess
# UTP already ran these tests. Re-run for collecting in-app renders before uninstall.
for name in ['temporaryNeedsNoIdentityOrProviderForm','workAndSettingsHavePlainLabels']:
    result=subprocess.run(['adb','shell','am','instrument','-w','-r','-e','class','chat.veil.ContactUiTest#'+name,'chat.veil.purposes.preview.test/androidx.test.runner.AndroidJUnitRunner'],capture_output=True,text=True,check=True)
    if 'OK (1 test)' not in result.stdout:raise RuntimeError(result.stdout)
    print('PASS UI capture:',name)

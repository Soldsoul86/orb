#!/usr/bin/env python3
import subprocess
import json
from pathlib import Path
# Actual in-process screen renders; OS secure flag remains set throughout.
for theme,scale in [('dark','1.0'),('light','1.0'),('large','1.5'),('compact','1.0')]:
    if theme=='compact':
        subprocess.run(['adb','shell','wm','size','720x1280'],check=True)
        subprocess.run(['adb','shell','wm','density','320'],check=True)
    subprocess.run(['adb','shell','cmd','uimode','night','yes' if theme=='dark' else 'no'],check=True)
    subprocess.run(['adb','shell','settings','put','system','font_scale',scale],check=True)
    for name in ['temporaryNeedsNoIdentityOrProviderForm','workAndSettingsHavePlainLabels']:
        result=subprocess.run(['adb','shell','am','instrument','-w','-r','-e','class','chat.veil.ContactUiTest#'+name,'-e','theme',theme,'chat.veil.purposes.preview.test/androidx.test.runner.AndroidJUnitRunner'],capture_output=True,text=True,check=True)
        if 'OK (1 test)' not in result.stdout:raise RuntimeError(result.stdout)
        print('PASS UI capture:',theme,name)
subprocess.run(['adb','shell','settings','put','system','font_scale','1.0'],check=True)
subprocess.run(['adb','shell','wm','size','reset'],check=True)
subprocess.run(['adb','shell','wm','density','reset'],check=True)

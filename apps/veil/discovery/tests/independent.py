"""Offline verification of Kotlin/Nimbus and actual PortableSession public exports."""
import json
import os
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from profile import verify_profile
for name in ('VEIL_DISCOVERY_FIXTURE','VEIL_DISCOVERY_OWNER_FIXTURE'):
    if not os.getenv(name):raise SystemExit('Required public cross-language fixture missing: '+name)
    card=json.loads(Path(os.environ[name]).read_text())
    d,s=verify_profile(card['publication'],card['controller'])
    assert d['profile']['alias'].startswith('TEST')
    print('PASS: independent Python verifies',name,'without a network identity lookup or private key')

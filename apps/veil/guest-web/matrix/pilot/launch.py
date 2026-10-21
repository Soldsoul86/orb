"""Container supervisor; preserves keys and admission state across ordinary restarts."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[1] / 'integration'
runtime = Path(os.environ['VEIL_PILOT_RUNTIME'])
os.umask(0o077)
pids = []


def stop(*_):
    for pid in reversed(pids):
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    raise SystemExit(0)


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
if not runtime.exists():
    subprocess.run([sys.executable, str(root/'start.py'), '--pilot'], check=True)
    pids.extend(json.loads((runtime/'pids.json').read_text()))
else:
    # No automatic deletion, reprovisioning or identity reset on incomplete storage.
    assert all((runtime / f).is_file() for f in ('homeserver.yaml', 'accounts.json', 'policy.sqlite'))
    synapse = subprocess.Popen([sys.executable, '-m', 'synapse.app.homeserver', '--config-path', str(runtime/'homeserver.yaml')], cwd=runtime, stdout=(runtime/'startup.log').open('a'), stderr=subprocess.STDOUT)
    pids.append(synapse.pid)
    gateway = subprocess.Popen([sys.executable, str(root.parent/'pilot'/'pilot_provider.py'), str(runtime)], stdout=(runtime/'boundary.log').open('a'), stderr=subprocess.STDOUT)
    pids.append(gateway.pid)
web = subprocess.Popen(['node', str(root.parent/'pilot'/'serve.mjs')], stdout=(runtime/'web.log').open('a'), stderr=subprocess.STDOUT)
pids.append(web.pid)
(runtime/'pids.json').write_text(json.dumps(pids))
while True:
    time.sleep(2)
    for pid in pids:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            stop()
    if web.poll() is not None:
        stop()

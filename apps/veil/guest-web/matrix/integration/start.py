"""Create a fresh private Synapse and technical accounts; emit no credentials."""
import asyncio
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

import aiohttp
import yaml

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / 'runtime'


async def main():
    os.umask(0o077)
    RUNTIME.mkdir(exist_ok=False)
    config = RUNTIME / 'homeserver.yaml'
    subprocess.run([sys.executable, '-m', 'synapse.app.homeserver', '--server-name', 'veil.test',
                    '--config-path', str(config), '--generate-config', '--report-stats=no'], cwd=RUNTIME, check=True, stdout=subprocess.DEVNULL)
    secret = secrets.token_hex(32)
    cfg = yaml.safe_load(config.read_text())
    cfg.update(listeners=[{'path': str(RUNTIME / 'synapse.sock'), 'type': 'http', 'x_forwarded': True, 'resources': [{'names': ['client'], 'compress': False}]}],
               registration_shared_secret=secret, enable_registration=False, report_stats=False,
               federation_domain_whitelist=[], trusted_key_servers=[], suppress_key_server_warning=True,
               send_federation=False, enable_media_repo=False,
               rc_message={'per_second': 100, 'burst_count': 1000},
               rc_login={'address': {'per_second': 100, 'burst_count': 1000}, 'account': {'per_second': 100, 'burst_count': 1000}})
    config.write_text(yaml.safe_dump(cfg))
    log_config = RUNTIME / 'quiet.yaml'
    log_config.write_text(yaml.safe_dump({'version': 1, 'handlers': {'null': {'class': 'logging.NullHandler'}}, 'root': {'level': 'WARNING', 'handlers': ['null']}}))
    cfg['log_config'] = str(log_config)
    config.write_text(yaml.safe_dump(cfg))
    hs = subprocess.Popen([sys.executable, '-m', 'synapse.app.homeserver', '--config-path', str(config)], cwd=RUNTIME, stdout=(RUNTIME / 'startup.log').open('w'), stderr=subprocess.STDOUT)
    for _ in range(120):
        if hs.poll() is not None:
            # This is before account creation or message exchange.
            print((RUNTIME / 'startup.log').read_text()[-6000:])
            raise RuntimeError('Synapse startup failed')
        if (RUNTIME / 'synapse.sock').exists():
            break
        await asyncio.sleep(1)
    accounts = []
    async with aiohttp.ClientSession(connector=aiohttp.UnixConnector(path=str(RUNTIME / 'synapse.sock'))) as session:
        for i in range(6):
            username = 't_' + secrets.token_hex(12)
            password = secrets.token_urlsafe(32)
            url = 'http://localhost/_synapse/admin/v1/register'
            async with session.get(url) as response:
                nonce = (await response.json())['nonce']
            mac = hmac.new(secret.encode(), '\0'.join([nonce, username, password, 'notadmin']).encode(), hashlib.sha1).hexdigest()
            async with session.post(url, json={'nonce': nonce, 'username': username, 'password': password, 'admin': False, 'mac': mac}) as response:
                assert response.status == 200, 'private registration failed'
            accounts.append({'username': username, 'password': password, 'device': 'TEST' + str(i)})
    (RUNTIME / 'accounts.json').write_text(json.dumps(accounts))
    gateway = subprocess.Popen([sys.executable, str(ROOT.parent / 'pilot' / 'provider.py') if '--pilot' in sys.argv else str(ROOT / 'provider.py'), str(RUNTIME)], stdout=(RUNTIME / 'boundary.log').open('w'), stderr=subprocess.STDOUT)
    (RUNTIME / 'pids.json').write_text(json.dumps([hs.pid, gateway.pid]))
    async with aiohttp.ClientSession() as session:
        for _ in range(30):
            try:
                async with session.get('http://127.0.0.1:8765/health') as response:
                    assert response.status == 200
                    break
            except aiohttp.ClientError:
                await asyncio.sleep(1)
        else:
            raise RuntimeError('boundary startup failed')
    print('PASS disposable private homeserver: Unix upstream, loopback boundary, registration/federation disabled')


asyncio.run(main())

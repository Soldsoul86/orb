import importlib.util
from pathlib import Path
import subprocess
import unittest
spec=importlib.util.spec_from_file_location('guest_server',Path(__file__).resolve().parents[1]/'serve.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
class GuestGateTests(unittest.TestCase):
    def test_mutations_never_reach_message_body_processing(self):
        for method in ['POST','PUT','DELETE','PATCH','OPTIONS']:
            for path in ['/','/guest/send','/v3/command','/guest-capabilities']:
                status,_,body=server.reply_for(method,path)
                self.assertEqual(503,status);self.assertNotIn(b'secret',body)
    def test_exact_allowlist_no_traversal_query_or_other_origins(self):
        for path in ['/../serve.py','/%2e%2e/serve.py','/src/../index.html','//style.css','/?enable=true','/src/gate.mjs?enable=true','https://evil.example/']:
            self.assertEqual(404,server.reply_for('GET',path)[0])
        self.assertEqual(200,server.reply_for('GET','/')[0])
    def test_capability_and_network_policy_cannot_pretend_crypto(self):
        self.assertIn(b'"guestMessaging":false',server.reply_for('GET','/guest-capabilities')[2])
        self.assertIn("connect-src 'none'",server.CSP);self.assertNotIn('unsafe-inline',server.CSP)
    def test_release_gate_cannot_be_enabled_by_environment(self):
        import os
        result=subprocess.run(['python',str(Path(server.ROOT)/'release_gate.py')],env={**os.environ,'VEIL_GUEST_ENABLED':'true'},capture_output=True,text=True)
        self.assertEqual(2,result.returncode);self.assertIn('BLOCKED',result.stdout)
if __name__=='__main__':unittest.main()

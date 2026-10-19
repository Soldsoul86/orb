#!/usr/bin/env python3
"""Disposable emulators only. Two isolated TLS processes/DBs; A killed before restore.
No fixture secrets or plaintext are printed or retained as CI artifacts.
"""
import argparse
import datetime
import ipaddress
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

ROOT=Path(__file__).resolve().parents[1]
PACKAGE='chat.veil.purposes.preview'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--owner',default='emulator-5554');parser.add_argument('--peer',default='emulator-5556');args=parser.parse_args()
    if not all(x.startswith('emulator-') for x in (args.owner,args.peer)): raise SystemExit('Disposable emulators required')
    def adb(device,*cmd,data=None):
        return subprocess.run(['adb','-s',device,*cmd],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True).stdout
    def put(device,name,raw):
        adb(device,'shell','run-as',PACKAGE,'mkdir','-p','files/portable-fixture')
        adb(device,'shell','run-as',PACKAGE,'sh','-c',f'"cat > files/portable-fixture/{name}"',data=raw)
    def get(device,name): return adb(device,'exec-out','run-as',PACKAGE,'cat',f'files/portable-fixture/{name}')
    def stage(device,name):
        output=adb(device,'shell','am','instrument','-w','-r','-e','class','chat.veil.PortableTwoDeviceTest','-e','stage',name,'-e','disposableFixture','true',PACKAGE+'.test/androidx.test.runner.AndroidJUnitRunner').decode()
        if 'FAILURES' in output or 'OK (1 test)' not in output: raise RuntimeError('Stage '+name+' failed:\n'+output)
        print('PASS Android stage:',name,flush=True)
    with tempfile.TemporaryDirectory(prefix='portable-proof-') as temp:
        tmp=Path(temp);key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        subject=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Disposable portability fixture')])
        now=datetime.datetime.now(datetime.timezone.utc)
        cert=(x509.CertificateBuilder().subject_name(subject).issuer_name(subject).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(minutes=1)).not_valid_after(now+datetime.timedelta(days=1))
            .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]),critical=False)
            .add_extension(x509.BasicConstraints(ca=True,path_length=None),critical=True).sign(key,hashes.SHA256()))
        (tmp/'ca.pem').write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        (tmp/'tls.key').write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()));os.chmod(tmp/'tls.key',0o600)
        processes=[]
        try:
            for port,label in [(18443,'a'),(18444,'b')]:
                p=subprocess.Popen(['python3',str(ROOT/'portable-provider/fixture.py'),'--db',str(tmp/(label+'.sqlite')),'--port',str(port),'--cert',str(tmp/'ca.pem'),'--key',str(tmp/'tls.key')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);processes.append(p)
                for _ in range(100):
                    try:
                        with socket.create_connection(('127.0.0.1',port),timeout=.5): break
                    except OSError: time.sleep(.1)
                else: raise RuntimeError('Provider did not start')
            for device in (args.owner,args.peer):
                # Never uninstall an existing installation. CI uses freshly created disposable AVDs.
                adb(device,'install','-r',str(ROOT/'app/build/outputs/apk/debug/app-debug.apk'))
                adb(device,'install','-r',str(ROOT/'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'))
                adb(device,'reverse','tcp:18443','tcp:18443');adb(device,'reverse','tcp:18444','tcp:18444')
                put(device,'ca.pem',(tmp/'ca.pem').read_bytes())
            stage(args.owner,'contact-owner');put(args.peer,'link',get(args.owner,'link'))
            stage(args.peer,'contact-peer');stage(args.owner,'contact-approve')
            stage(args.peer,'contact-send');stage(args.owner,'contact-reply');stage(args.peer,'contact-receive')
            stage(args.owner,'contact-end');stage(args.peer,'contact-blocked')
            # Real ciphertext reaches the relay; synthetic test text must not occur in database bytes.
            for path in tmp.glob('a.sqlite*'):
                for plaintext in (b'Contact invitation introduction',b'Real encrypted invitation chat',b'Real encrypted contact reply'):
                    if plaintext in path.read_bytes():raise RuntimeError('Plaintext found in relay storage')
            print('PASS contact invitation preview/request/approval/Signal message and reply/end-access on two emulators',flush=True)
            stage(args.owner,'owner');put(args.peer,'card',get(args.owner,'card'));stage(args.peer,'peer')
            stage(args.owner,'approve');stage(args.peer,'send-original');stage(args.owner,'export')
            processes[0].terminate();processes[0].wait(timeout=10)
            for path in tmp.glob('a.sqlite*'): path.unlink()
            try:
                with socket.create_connection(('127.0.0.1',18443),timeout=.5): raise RuntimeError('A is still reachable')
            except ConnectionRefusedError: pass
            print('PASS Provider A offline: process stopped, database removed, TCP port refused',flush=True)
            stage(args.owner,'restore')
            card=get(args.owner,'new-card');(tmp/'new-card.json').write_bytes(card)
            subprocess.run(['python3',str(ROOT/'portable-provider/open_verifier.py'),str(tmp/'new-card.json'),get(args.owner,'facet').decode()],check=True)
            put(args.peer,'new-card',card);stage(args.peer,'accept');stage(args.owner,'receive-new');stage(args.peer,'receive-reply')
            stage(args.owner,'revoke');stage(args.peer,'revoked')
            print('PASS two Android emulators, separate TLS providers/databases, independent verifier, fresh restore, new Signal message and reply with A offline. NOT physical-device verification.',flush=True)
        finally:
            for p in processes:
                if p.poll() is None:p.terminate();p.wait(timeout=10)
            for device in (args.owner,args.peer):
                subprocess.run(['adb','-s',device,'shell','run-as',PACKAGE,'rm','-rf','files/portable-fixture'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

if __name__=='__main__': main()

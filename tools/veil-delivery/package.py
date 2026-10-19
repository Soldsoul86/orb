"""Validate and assemble a delivery from immutable, already tested CI artifacts."""
import hashlib
import io
import json
from pathlib import Path
import shutil
import struct
import tarfile
import zipfile
import zlib
import re
from apk_metadata import manifest_metadata

root=Path.cwd();incoming=root/'delivery-input';out=root/'veil-contact-preview'
if out.exists():shutil.rmtree(out)
out.mkdir()
apk=next((incoming/'apk').rglob('veil-purposes-preview.apk'))
expected=next((incoming/'apk').rglob('veil-purposes-preview.apk.sha256')).read_text().split()[0]
sha=lambda data:hashlib.sha256(data).hexdigest()
assert sha(apk.read_bytes())==expected
pin=(root/'apps/veil/preview-signing.sha256').read_text().strip()
assert next((incoming/'apk').rglob('veil-purposes-preview.certificate.sha256')).read_text().strip()==pin
# Inspect the actual APK v2/v3 signing block, not only its companion checksum file.
def signing_certificates(path):
    data=path.read_bytes();eocd=data.rfind(b'PK\x05\x06')
    assert eocd>=0
    central=struct.unpack_from('<I',data,eocd+16)[0]
    assert data[central-16:central]==b'APK Sig Block 42'
    size=struct.unpack_from('<Q',data,central-24)[0];start=central-size-8
    assert struct.unpack_from('<Q',data,start)[0]==size
    def field(buf,offset=0):
        length=struct.unpack_from('<I',buf,offset)[0]
        return buf[offset+4:offset+4+length],offset+4+length
    certificates=[];pos=start+8
    while pos<central-24:
        length=struct.unpack_from('<Q',data,pos)[0];kind=struct.unpack_from('<I',data,pos+8)[0]
        if kind in (0x7109871a,0xf05368c0):
            signers,_=field(data[pos+12:pos+8+length]);signer,_=field(signers)
            signed,_=field(signer);digests,offset=field(signed);certs,_=field(signed,offset)
            cert,_=field(certs);certificates.append(sha(cert))
        pos+=8+length
    assert certificates
    return certificates
assert set(signing_certificates(apk))=={pin}
metadata=manifest_metadata(apk)
build=(root/'apps/veil/app/build.gradle.kts').read_text()
assert metadata=={'package':'chat.veil.purposes.preview','versionCode':int(re.search(r'versionCode = (\d+)',build).group(1)),'versionName':re.search(r'versionName = "([^"]+)"',build).group(1)}
with zipfile.ZipFile(apk) as z:
    assert z.testzip() is None
    assert {'AndroidManifest.xml','classes.dex'}.issubset(z.namelist())
shutil.copyfile(apk,out/'veil-contact-preview.apk')

def valid_png(data):
    assert data[:8]==b'\x89PNG\r\n\x1a\n';offset=8;image=b'';dimensions=None
    while offset<len(data):
        length=struct.unpack('>I',data[offset:offset+4])[0];kind=data[offset+4:offset+8]
        body=data[offset+8:offset+8+length];checksum=struct.unpack('>I',data[offset+8+length:offset+12+length])[0]
        assert zlib.crc32(kind+body)&0xffffffff==checksum
        if kind==b'IHDR':dimensions=struct.unpack('>II',body[:8]);assert min(dimensions)>200
        if kind==b'IDAT':image+=body
        offset+=length+12
        if kind==b'IEND':break
    assert dimensions and len(zlib.decompress(image))>1000
    return dimensions

screens=out/'screenshots';screens.mkdir(exist_ok=True)
for archive in sorted(incoming.rglob('*.tar')):
    if archive.name.startswith('live-') and 'screens' in archive.parts:continue
    with tarfile.open(archive) as t:
        for member in t.getmembers():
            if member.isfile() and member.name.endswith('.png'):
                data=t.extractfile(member).read();valid_png(data)
                name=Path(member.name).name
                destination=screens/name
                if destination.exists():assert destination.read_bytes()==data
                destination.write_bytes(data)
assert list(screens.glob('before-*.png'))
assert list(screens.glob('dark-after-*.png')) and list(screens.glob('light-after-*.png'))
assert list(screens.glob('live-*.png'))
shutil.copyfile(root/'VEIL_UX_CHANGELOG.md',out/'CHANGELOG.md')
report=(root/'VEIL_UX_REPORT.md').read_text()
assert '_PENDING' not in report and '| PENDING |' not in report, 'Finalize observed test results before publishing'
shutil.copyfile(root/'VEIL_UX_REPORT.md',out/'TEST_REPORT.md')
shutil.copyfile(root/'apps/veil/docs/ux/ARCHITECTURE.md',out/'ARCHITECTURE.md')
shutil.copyfile(root/'apps/veil/docs/ux/TEST_PLAN.md',out/'DEVICE_AND_USER_TESTS.md')
(out/'MANIFEST.json').write_text(json.dumps({'package':'chat.veil.purposes.preview','versionCode':7,'versionName':'0.3.2-contact-preview','apk_sha256':expected,'certificate_sha256':pin,'signed_source':'62c5ce0a74b748c6a4ec1b20a6368da6119b861e','signed_build_run':39200435127,'screenshots':len(list(screens.glob('*.png')))},indent=2)+'\n')
files=sorted(p for p in out.rglob('*') if p.is_file())
assert all(p.suffix in ('.apk','.png','.md','.json') for p in files)
(out/'SHA256SUMS').write_text(''.join(sha(p.read_bytes())+'  '+str(p.relative_to(out))+'\n' for p in files))
archive=root/'veil-contact-preview.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(out.rglob('*')):
        if p.is_file():z.write(p,str(p.relative_to(out)))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for n in z.namelist():
        assert z.read(n)==(out/n).read_bytes()
        if n.endswith('.png'):valid_png(z.read(n))
(root/'veil-contact-preview.zip.sha256').write_text(sha(archive.read_bytes())+'  '+archive.name+'\n')
print('PASS: APK hash and pinned certificate match; APK ZIP and every PNG open; delivery ZIP CRCs/readback match; no key or backup files packaged')
print('APK SHA256',expected)
print('ZIP SHA256',sha(archive.read_bytes()))
print('ZIP bytes',archive.stat().st_size,'screenshots',len(list(screens.glob('*.png'))))

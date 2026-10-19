"""Read public package/version fields from Android's compiled XML manifest."""
import struct
import zipfile

def manifest_metadata(apk):
    with zipfile.ZipFile(apk) as z:
        data=z.read('AndroidManifest.xml')
    strings=[];offset=8
    def u32(at):return struct.unpack_from('<I',data,at)[0]
    while offset<len(data):
        kind,header,size=struct.unpack_from('<HHI',data,offset)
        assert size>=header>=8 and offset+size<=len(data)
        if kind==1:
            count=u32(offset+8);utf8=bool(u32(offset+16)&0x100);start=u32(offset+20)
            def length(at,wide):
                if wide:
                    n=struct.unpack_from('<H',data,at)[0];at+=2
                    if n&0x8000:n=((n&0x7fff)<<16)|struct.unpack_from('<H',data,at)[0];at+=2
                else:
                    n=data[at];at+=1
                    if n&0x80:n=((n&0x7f)<<8)|data[at];at+=1
                return n,at
            for i in range(count):
                at=offset+start+u32(offset+header+4*i)
                n,at=length(at,not utf8)
                if utf8:n,at=length(at,False)
                strings.append(data[at:at+n*(1 if utf8 else 2)].decode('utf-8' if utf8 else 'utf-16le'))
        elif kind==0x102 and strings[u32(offset+20)]=='manifest':
            start,stride,count=struct.unpack_from('<HHH',data,offset+24);values={}
            for i in range(count):
                at=offset+16+start+i*stride;name=strings[u32(at+4)];raw=u32(at+8);typed=u32(at+16)
                values[name]=strings[raw] if raw!=0xffffffff else strings[typed] if data[at+15]==3 else typed
            return {'package':values['package'],'versionCode':int(values['versionCode']),'versionName':values['versionName']}
        offset+=size
    raise ValueError('Compiled APK manifest missing')

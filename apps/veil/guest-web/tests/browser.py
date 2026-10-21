"""Actual browser rendering / signature checks, NOT encrypted guest messaging."""
import json
import os
import sys
import threading
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from serve import Handler,HTTPServer
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
server=HTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
try:
    with sync_playwright() as p:
        browser=p.chromium.launch()
        context=browser.new_context(viewport={'width':360,'height':640},device_scale_factor=2,reduced_motion='reduce')
        page=context.new_page();requests=[];errors=[]
        page.on('request',lambda r:requests.append(r));page.on('pageerror',lambda e:errors.append(str(e)))
        response=page.goto(origin,wait_until='networkidle')
        assert response.headers['cache-control']=='no-store'
        assert "connect-src 'none'" in response.headers['content-security-policy']
        assert response.headers['referrer-policy']=='no-referrer'
        assert page.get_by_label('Your name (optional)',exact=True).is_disabled()
        assert page.get_by_role('button',name='Send',exact=True).is_disabled()
        assert 'Nothing has been sent' in page.get_by_role('status').inner_text()
        assert page.get_by_role('link').count()==0
        assert page.evaluate('localStorage.length')==0
        # Removing disabled in DevTools cannot send plaintext; form handler stays closed.
        page.evaluate("document.querySelector('textarea').disabled=false")
        page.get_by_label('Your message',exact=True).fill('SECRET-MUST-NOT-LEAVE')
        page.evaluate("document.querySelector('form').requestSubmit()")
        page.wait_for_timeout(100)
        assert all(r.method=='GET' and 'SECRET' not in r.url for r in requests)
        assert page.evaluate('localStorage.length')==0
        page.reload(wait_until='networkidle');assert page.get_by_label('Your message',exact=True).input_value()==''
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        evidence=root/'evidence';evidence.mkdir(exist_ok=True)
        page.screenshot(path=str(evidence/'disabled-entry.png'),full_page=True)
        # Optional cross-language fixture: signed by the unchanged Nimbus identity core in CI.
        fixture=os.getenv('VEIL_PUBLIC_FIXTURE')
        if fixture:
            f=json.loads(Path(fixture).read_text())
            result=page.evaluate('''async f=>{const {verifyState}=await import('/src/identity.mjs');const s=await verifyState(f.state,{controller:f.id,origin:f.origin,kind:'unlisted'});return s.id;}''',f)
            assert result==f['id'];print('PASS Chromium verifies Nimbus public identity signature (NOT message E2EE)')
        else:print('NOT TESTED Nimbus/browser signature fixture: VEIL_PUBLIC_FIXTURE not configured')
        # Synthetic state-copy evidence is deliberately labeled; no fake transport or encryption.
        for phase in ['pending','accepted','declined','expired','revoked','lost']:
            page.evaluate('''async phase=>{
              const {renderGuest}=await import('/src/view.mjs');
              renderGuest(document.querySelector('main'),{state:{phase,hasReply:phase==='accepted',dismissed:false},displayName:'Home repairs',available:true,onDismiss:()=>document.querySelector('aside')?.remove()});
              const label=document.createElement('p');label.textContent='SYNTHETIC UI ONLY — no message sent';document.querySelector('main').prepend(label);
            }''',phase)
            if phase=='accepted':
                assert page.get_by_role('complementary').count()==1
                page.get_by_role('button',name='Continue here').click()
                assert page.get_by_role('complementary').count()==0
            else:assert page.get_by_role('complementary').count()==0
            page.screenshot(path=str(evidence/(phase+'-ui-only.png')),full_page=True)
        # Injection is literal text; direction and zoom are handled by semantic HTML/CSS.
        page.evaluate('''async()=>{const {renderGuest}=await import('/src/view.mjs');renderGuest(document.querySelector('main'),{state:{phase:'first'},displayName:'<img src=x onerror=alert(1)> مرحبا'});document.documentElement.dir='rtl';document.documentElement.style.fontSize='200%';}''')
        assert page.locator('img').count()==0
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(evidence/'rtl-large-text.png'),full_page=True)
        assert not errors,errors
        assert all(r.method=='GET' for r in requests)
        # A direct HTTP POST is denied independently of UI or CSP; no body parser is present.
        result=context.request.post(origin+'/guest/send',data={'text':'SYNTHETIC-DENIED'})
        assert result.status==503
        assert context.request.get(origin,headers={'Host':'evil.example'}).status==421
        browser.close()
    print('PASS browser disabled transport, CSP, no local plaintext persistence, literal text, state-copy presentation, RTL/200% layout')
    print('BLOCKED: real guest request/reply E2EE, owner/guest journey, session restore and app handoff. PHYSICAL TEST REQUIRED: stock camera / Android phone.')
finally:
    server.shutdown();server.server_close()

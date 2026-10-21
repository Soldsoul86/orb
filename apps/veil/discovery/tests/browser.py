"""Real mobile Chromium + PostgreSQL journey; synthetic TEST supply, no E2EE claim."""
import json
import os
import sys
import threading
import time
from pathlib import Path
from fixtures import make
from directory import Directory
from profile import PREFIX
from serve import PreviewServer
from playwright.sync_api import sync_playwright, expect

root=Path(__file__).resolve().parents[1];evidence=root/'evidence';evidence.mkdir(exist_ok=True)
directory=Directory(__import__('fixtures').test_database_url())
directory.db.execute('TRUNCATE veil_discovery.profiles,veil_discovery.blocks,veil_discovery.reports')
now=int(time.time());identifier,private,_,_=make('interface',now,visibility='PRIVATE');directory.publish(identifier,private)
identifier,publication,_,_=make('interface',now,revision=2)
server=PreviewServer(('127.0.0.1',0),directory,True);threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or None)
  context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,reduced_motion='reduce')
  page=context.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append((r.method,r.url)))
  page.goto(base,wait_until='networkidle')
  page.get_by_label('Tell us what you need help with.').fill('Android app redesign')
  page.get_by_role('button',name='Find help',exact=True).click();page.get_by_text('No matching profiles yet.',exact=True).wait_for()
  page.screenshot(path=str(evidence/'mobile-empty.png'),full_page=True)
  searches_before=sum(method=='POST' and url.endswith('/api/search') for method,url in requests)
  page.get_by_role('button',name='I want to be found').click()
  page.get_by_label('What should people find you for?').fill('Redesign Android app interfaces')
  page.get_by_label('Public display alias').fill('TEST interface')
  assert page.get_by_label('Visibility',exact=True).input_value()=='PRIVATE'
  page.get_by_role('button',name='Suggest category & services').click()
  expect(page.get_by_label('Review the suggested category')).to_have_value('DESIGN & CREATE')
  page.get_by_role('button',name='Review exact preview').click()
  page.get_by_text('Private draft — nothing has been sent or published.').wait_for()
  assert directory.get(identifier) is None
  assert sum(method=='POST' and url.endswith('/api/search') for method,url in requests)==searches_before, 'Private draft suggestion must stay local'
  page.screenshot(path=str(evidence/'mobile-owner-private.png'),full_page=True)
  page.get_by_label('Signed profile exported by Veil',exact=True).fill(json.dumps({'publication':publication}))
  page.get_by_role('button',name='Verify & preview signed export').click()
  page.get_by_text('All signed contact rules',exact=True).wait_for()
  assert page.get_by_role('button',name='Publish approved profile').is_disabled()
  page.get_by_text('I approve every displayed field, contact rule and route for this publication or removal.',exact=True).click()
  page.get_by_role('button',name='Publish approved profile').click()
  page.get_by_text('Published. Your opted-in profile is now searchable.',exact=True).wait_for()
  assert directory.get(identifier)['publication']==publication
  page.get_by_role('link',name='Find help',exact=True).click()
  page.get_by_label('Tell us what you need help with.').fill('Android app redesign')
  page.get_by_role('button',name='Find help',exact=True).click()
  page.get_by_role('link',name='View profile & contact rules').wait_for()
  page.screenshot(path=str(evidence/'mobile-search.png'),full_page=True)
  page.get_by_role('link',name='View profile & contact rules').click()
  page.get_by_text('Secure messaging is not available yet',exact=True).wait_for()
  page.screenshot(path=str(evidence/'mobile-profile.png'),full_page=True)
  page.get_by_role('link',name='Review authenticated contact address').click()
  page.get_by_role('button',name='Send unavailable').wait_for()
  assert page.get_by_role('button',name='Send unavailable').is_disabled()
  page.get_by_text('Purpose address & verification',exact=True).click()
  assert page.locator('code').inner_text()=='https://test-provider.example/g/'+identifier[len(PREFIX):]
  page.screenshot(path=str(evidence/'mobile-contact-disabled.png'),full_page=True)
  assert context.request.post(base+'/guest/send',data={'text':'NEVER-SEND'}).status==503
  assert page.evaluate("async()=>{const {sendGuestMessage}=await import('/guest/src/gate.mjs');try{await sendGuestMessage();return false;}catch{return true;}}")
  # URL pin and tampered signatures cannot authenticate a substituted purpose.
  other=make('mobile',now)[0]
  outcome=page.evaluate('''async ({token,wrong})=>{const {verifyPublication}=await import('/verify.mjs');const config=await (await fetch('/api/config')).json();try{await verifyPublication(token,wrong,config);return false;}catch{return true;}}''',{'token':publication,'wrong':other})
  assert outcome
  for fixture_name in ('VEIL_DISCOVERY_FIXTURE','VEIL_DISCOVERY_OWNER_FIXTURE'):
   if os.getenv(fixture_name):
    fixture=json.loads(Path(os.environ[fixture_name]).read_text())
    result=page.evaluate('''async f=>{const {verifyPublication}=await import('/verify.mjs');const config=await (await fetch('/api/config')).json();return (await verifyPublication(f.publication,f.controller,config)).document.controller;}''',fixture)
    assert result==fixture['controller']
    print('PASS: Chromium verifies '+fixture_name)
  # Actual keyboard and 200% text layout; no fixed-size text clipping or overflow.
  page.keyboard.press('Tab');assert page.evaluate('document.activeElement!==document.body')
  page.evaluate("document.documentElement.style.fontSize='200%'")
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(evidence/'mobile-large-text.png'),full_page=False)
  page.evaluate("document.documentElement.style.fontSize='100%'")
  page.get_by_role('link',name='Find help',exact=True).click()
  page.route('**/api/search',lambda route:route.abort())
  page.get_by_label('Tell us what you need help with.').fill('Build a website')
  page.get_by_role('button',name='Find help',exact=True).click()
  page.locator('[role=status].error').wait_for()
  page.screenshot(path=str(evidence/'mobile-network-error.png'),full_page=True)
  assert page.evaluate('localStorage.length')==0
  assert not errors,errors
  browser.close()
 print('PASS: real Chromium private → authorize fixture → publish → PostgreSQL search → verify profile → pinned contact address; keyboard, 200% text, offline error, disabled send.')
 print('BLOCKED: browser-to-Android E2EE; NOT TESTED: physical Android owner handoff and two-minute usability target.')
finally:
 server.shutdown();server.server_close();directory.close()

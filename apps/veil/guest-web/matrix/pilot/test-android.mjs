import {chromium} from '../integration/node_modules/playwright/index.mjs';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const pkg='chat.veil.guest.pilot',component=pkg+'.test/androidx.test.runner.AndroidJUnitRunner';
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']});
async function readPublic(file){const deadline=Date.now()+180000;while(Date.now()<deadline){try{return JSON.parse(adb('shell','run-as',pkg,'cat','files/'+file));}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Timed out waiting for '+file);}
function instrument(method){const child=spawn('adb',['shell','am','instrument','-w','-r','-e','class','chat.veil.GuestJourneyTest#'+method,component],{stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',()=>{});return new Promise((resolve,reject)=>child.on('exit',code=>code===0 && /OK \(1 test\)/.test(output)?resolve():reject(Error('Native instrumentation failed: '+output.slice(-4500)))));}
const browser=await chromium.launch({headless:true,...(process.env.VEIL_TEST_CHROMIUM?{executablePath:process.env.VEIL_TEST_CHROMIUM}:{})});
const profile=new URL('browser-profile/',new URL('../integration/runtime/',import.meta.url)).pathname;
let context;
try {
 const phase1=instrument('requestApprovalReply');phase1.catch(()=>{});
 const {link}=await readPublic('pilot-public.json');
 context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},...(process.env.VEIL_TEST_CHROMIUM?{executablePath:process.env.VEIL_TEST_CHROMIUM}:{})});
 const page=await context.newPage();const start=performance.now();await page.goto(link);await page.waitForFunction(()=>!document.getElementById('send').disabled);const usableMs=performance.now()-start;
 await page.locator('#message').fill('PILOT_REQUEST_CANARY_91f7');const sending=performance.now();await page.locator('#send').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Received by service'),{},{timeout:60000});const requestMs=performance.now()-sending;
 await page.waitForFunction(()=>document.getElementById('messages').textContent.includes('PILOT_REPLY_CANARY_39a2'),{},{timeout:180000});const replyMs=performance.now()-sending;
 const saved=page.url();const first=await readPublic('pilot-replied.json');await phase1;
 await context.close();context=null;
 adb('shell','am','force-stop',pkg);
 const phase2=instrument('processRestartContinuationAndRevoke');phase2.catch(()=>{});
 context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},...(process.env.VEIL_TEST_CHROMIUM?{executablePath:process.env.VEIL_TEST_CHROMIUM}:{})});
 const reopened=await context.newPage();await reopened.goto(saved);await reopened.waitForFunction(()=>document.getElementById('messages').textContent.includes('PILOT_REPLY_CANARY_39a2'));await reopened.waitForFunction(()=>!document.getElementById('send').disabled);
 await reopened.locator('#message').fill('PILOT_CONTINUE_CANARY_c3bf');await reopened.locator('#send').click();const second=await readPublic('pilot-result.json');await phase2;
 await reopened.locator('#refresh').click();await reopened.waitForFunction(()=>document.getElementById('status').textContent.includes('revoked'));assert(await reopened.locator('#send').isDisabled());
 const runtime=new URL('../integration/runtime/',import.meta.url);
 for(const file of (await readdir(runtime)).filter(n=>/\.(db|sqlite)(-wal|-shm)?$|\.(log|jsonl)$/.test(n))){const b=await readFile(new URL(file,runtime));for(const canary of ['PILOT_REQUEST_CANARY_91f7','PILOT_REPLY_CANARY_39a2','PILOT_CONTINUE_CANARY_c3bf'])assert(!b.includes(Buffer.from(canary)));}
 await mkdir(new URL('evidence/',import.meta.url),{recursive:true});
 await writeFile(new URL('evidence/android.json',import.meta.url),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),browser:browser.version(),androidApi:adb('shell','getprop','ro.build.version.sdk').trim(),...first,...second,plaintextAbsent:true,usableMs,requestMs,requestThroughReplyMs:replyMs,measurement:'Loopback/emulator automated interaction. Human comprehension, camera and mobile data NOT TESTED.'},null,2));
 console.log('PASS actual Veil Android inbox, UI approval/reply, browser process restart, Android process restart, continuation, revocation, plaintext absence');
}finally{await context?.close();await browser.close();}

// Private staging only. No wildcard listener or public-send switch.
import {build} from '../integration/node_modules/esbuild/lib/main.js';
import {createServer} from 'node:http';
import {readFile, mkdir, readdir, copyFile, rm} from 'node:fs/promises';
import {resolve,basename,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const test=process.argv.includes('--test');
const root=dirname(fileURLToPath(import.meta.url)), out=resolve(root,'web');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
await build({entryPoints:[resolve(root,'app.mjs'),...(test?[resolve(root,'fixture.mjs')]:[])],bundle:true,format:'esm',splitting:true,outdir:out,nodePaths:[resolve(root,'../integration/node_modules')],loader:{'.wasm':'file'},logLevel:'warning'});
async function wasm(dir){for(const e of await readdir(dir,{withFileTypes:true})){const f=resolve(dir,e.name);if(e.isDirectory())await wasm(f);else if(e.name.endsWith('.wasm'))await copyFile(f,resolve(out,e.name));}}
await wasm(resolve(root,'../integration/node_modules/@matrix-org/matrix-sdk-crypto-wasm'));
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  try {
    if(req.url.startsWith('/pilot/') || req.url.startsWith('/_matrix/') || req.url==='/veil/policy') {
      const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>65536)throw Error();chunks.push(c);}
      const r=await fetch('http://127.0.0.1:8765'+req.url,{method:req.method,headers:{'Content-Type':'application/json',...(req.headers.authorization?{Authorization:req.headers.authorization}:{})},body:['POST','PUT'].includes(req.method)?Buffer.concat(chunks):undefined,redirect:'error'});
      res.writeHead(r.status,{'Content-Type':'application/json'});res.end(Buffer.from(await r.arrayBuffer()));return;
    }
    if(test && req.url==='/fixture'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><script type="module" src="/fixture.js"></script>');return;}
    let file,type;
    if(req.url==='/' || req.url==='/contact' || /^\/g\/[A-Za-z0-9_-]{43}$/.test(req.url)){file=resolve(root,'index.html');type='text/html';}
    else if(req.url==='/style.css'){file=resolve(root,'style.css');type='text/css';}
    else {const name=basename(req.url);if(!test && name.startsWith('fixture'))throw Error();if(!/^[A-Za-z0-9_-]+\.(js|wasm)$/.test(name))throw Error();file=resolve(out,name);type=name.endsWith('.wasm')?'application/wasm':'text/javascript';}
    res.setHeader('Content-Type',type);res.end(await readFile(file));
  }catch{res.statusCode=404;res.end('Unavailable');}
});
server.listen(8766,'127.0.0.1',()=>console.log('Private pilot: loopback port 8766'));

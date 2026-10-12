import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {payload} from './payload.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Rebuild on request so the fixture always tests the current integration code.
const server=http.createServer(async(req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.url==='/payload.js'){res.setHeader('Content-Type','text/javascript;charset=utf-8');res.end(await payload(root));}
    else if(new URL(req.url,'http://localhost').pathname==='/contrast'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(await fs.readFile(path.join(root,'preview/contrast.html')));}
    else {res.writeHead(404);res.end();}
  }catch{res.writeHead(500);res.end('Preview build failed');}
});
server.listen(0,'127.0.0.1',()=>console.log('PREVIEW_URL=http://127.0.0.1:'+server.address().port+'/contrast'));
process.on('SIGTERM',()=>server.close());process.on('SIGINT',()=>server.close());

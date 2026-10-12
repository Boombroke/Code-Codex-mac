import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {payload} from './payload.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assetSource=process.argv.find(arg=>arg.startsWith('--asset-source='))?.slice(15);
const assetRoot=assetSource?path.resolve(assetSource):root;
// Rebuild the controller payload on request; restart after changing imported helpers.
const baselinePath=process.argv.find(arg=>arg.startsWith('--baseline='))?.slice(11);
const server=http.createServer(async(req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.url==='/baseline.js'&&baselinePath){res.setHeader('Content-Type','text/javascript;charset=utf-8');res.end(await fs.readFile(baselinePath));}
    else if(req.url==='/payload.js'){res.setHeader('Content-Type','text/javascript;charset=utf-8');res.end(await payload(root,assetRoot,{preview:true}));}
    else if(new URL(req.url,'http://localhost').pathname==='/settings'){res.setHeader('Content-Type','text/html;charset=utf-8');const html=await fs.readFile(path.join(root,'preview/settings.html'),'utf8');res.end(new URL(req.url,'http://localhost').searchParams.has('baseline')&&baselinePath?html.replace('src="/payload.js"','src="/baseline.js"'):html);}
    else if(new URL(req.url,'http://localhost').pathname==='/conversation'){res.setHeader('Content-Type','text/html;charset=utf-8');const html=await fs.readFile(path.join(root,'preview/conversation.html'),'utf8');res.end(new URL(req.url,'http://localhost').searchParams.has('baseline')&&baselinePath?html.replace('src="/payload.js"','src="/baseline.js"'):html);}
    else if(new URL(req.url,'http://localhost').pathname==='/performance'){
      const baseline=new URL(req.url,'http://localhost').searchParams.has('baseline');
      if(baseline&&!baselinePath){res.writeHead(400,{'Content-Type':'text/plain;charset=utf-8'});res.end('未配置旧版基线文件，请以 --baseline=<本地文件> 启动预览服务。');return;}
      const catalog=JSON.parse(await fs.readFile(path.join(assetRoot,'catalog.json'),'utf8'));
      let html=(await fs.readFile(path.join(root,'preview/performance.html'),'utf8')).replace('__PERFORMANCE_CATALOG__',JSON.stringify(catalog).replaceAll('<','\\u003c'));
      if(baseline)html=html.replace('src="/payload.js"','src="/baseline.js"');
      res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);
    }
    else if(new URL(req.url,'http://localhost').pathname==='/surface-scope'){
      const baseline=new URL(req.url,'http://localhost').searchParams.has('baseline');
      if(baseline&&!baselinePath){res.writeHead(400);res.end('A baseline file is required');return;}
      let html=await fs.readFile(path.join(root,'preview/surface-scope.html'),'utf8');
      if(baseline)html=html.replace('src="/payload.js"','src="/baseline.js"');
      res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);
    }
    else if(new URL(req.url,'http://localhost').pathname==='/home-material'){
      const baseline=new URL(req.url,'http://localhost').searchParams.has('baseline');
      if(baseline&&!baselinePath){res.writeHead(400);res.end('A baseline file is required');return;}
      let html=await fs.readFile(path.join(root,'preview/home-material.html'),'utf8');
      if(baseline)html=html.replace('src="/payload.js"','src="/baseline.js"');
      res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);
    }
    else if(new URL(req.url,'http://localhost').pathname==='/transition-materials'){
      const baseline=new URL(req.url,'http://localhost').searchParams.has('baseline');
      if(baseline&&!baselinePath){res.writeHead(400);res.end('A baseline file is required');return;}
      let html=await fs.readFile(path.join(root,'preview/transition-materials.html'),'utf8');
      if(baseline)html=html.replace('src="/payload.js"','src="/baseline.js"');
      res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);
    }
    else if(new URL(req.url,'http://localhost').pathname==='/initial-paint'){
      const baseline=new URL(req.url,'http://localhost').searchParams.has('baseline');
      if(baseline&&!baselinePath){res.writeHead(400,{'Content-Type':'text/plain;charset=utf-8'});res.end('未配置首绘制基线文件，请以 --baseline=<本地文件> 启动预览服务。');return;}
      let html=await fs.readFile(path.join(root,'preview/initial-paint.html'),'utf8');
      if(baseline)html=html.replace('src="/payload.js"','src="/baseline.js"');
      res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);
    }
    else if(new URL(req.url,'http://localhost').pathname==='/contrast'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(await fs.readFile(path.join(root,'preview/contrast.html')));}
    else {res.writeHead(404);res.end();}
  }catch{res.writeHead(500);res.end('Preview build failed');}
});
server.listen(0,'127.0.0.1',()=>console.log('PREVIEW_URL=http://127.0.0.1:'+server.address().port+'/contrast'));
process.on('SIGTERM',()=>server.close());process.on('SIGINT',()=>server.close());

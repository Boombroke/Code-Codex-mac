import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createSurfacePolicy} from '../scripts/surface-policy.mjs';

const marker='data-cc-mac-validated-surface';
function selectors(value){let depth=0,start=0,out=[];for(let i=0;i<value.length;i++){if(value[i]==='('||value[i]==='[')depth++;if(value[i]===')'||value[i]===']')depth--;if(value[i]===','&&!depth){out.push(value.slice(start,i));start=i+1;}}out.push(value.slice(start));return out.map(s=>s.trim());}
class Element {
  nodeType=1;isConnected=true;parentElement=null;children=[];writes=0;rectReads=0;css={display:'block',visibility:'visible',opacity:'1'};
  constructor(tag,attributes={},rect={left:0,top:0,right:960,bottom:640}){this.tagName=tag.toUpperCase();this.attributes=new Map(Object.entries(attributes));this.rect=rect;}
  get id(){return this.attributes.get('id')||'';}
  get style(){const node=this;return {getPropertyValue(name){const decls=(node.getAttribute('style')||'').split(';').map(decl=>decl.split(':'));return decls.find(([key])=>key.trim()===name)?.slice(1).join(':').trim()||'';},get display(){return this.getPropertyValue('display');},get visibility(){return this.getPropertyValue('visibility');},get opacity(){return this.getPropertyValue('opacity');},get cssText(){return node.getAttribute('style')||'';}};}
  getAttribute(name){return this.attributes.get(name)??null;}
  hasAttribute(name){return this.attributes.has(name);}
  setAttribute(name,value){this.writes++;this.attributes.set(name,value);}
  removeAttribute(name){this.writes++;this.attributes.delete(name);}
  append(child){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(c=>c!==child);child.parentElement=this;this.children.push(child);}
  remove(child){this.children=this.children.filter(c=>c!==child);child.parentElement=null;child.isConnected=false;}
  matches(value){return selectors(value).some(selector=>{
    if(selector==='main:is(.main-surface,[data-app-shell-main-surface="default"])')return this.tagName==='MAIN'&&(this.getAttribute('data-app-shell-main-surface')==='default'||(this.getAttribute('class')||'').split(/\s+/).includes('main-surface'));
    if(selector.startsWith('#'))return this.id===selector.slice(1);
    if(selector.startsWith('.'))return (this.getAttribute('class')||'').split(/\s+/).includes(selector.slice(1));
    const attr=/^([a-z]+)?\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);return !!attr&&(!attr[1]||this.tagName===attr[1].toUpperCase())&&this.hasAttribute(attr[2])&&(attr[3]===undefined||this.getAttribute(attr[2])===attr[3]);
  });}
  closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  contains(other){return this===other||this.children.some(child=>child.contains(other));}
  getBoundingClientRect(){this.rectReads++;return {...this.rect,width:this.rect.right-this.rect.left,height:this.rect.bottom-this.rect.top};}
}
function fixture(href='app://-/index.html',options={}){
  const html=new Element('html'),body=new Element('body'),root=new Element('div',{id:'root'}),frame=new Element('div',{'data-app-shell-frame':'true'}),main=new Element('main',{'data-app-shell-main-surface':'default'},{left:260,top:44,right:960,bottom:640});
  html.append(body);body.append(root);root.append(frame);frame.append(main);
  const effects={preferenceReads:0,elementCreates:0,rendererLoads:0,observers:0},listeners=new Map(),microtasks=[],observers=[],resizeObservers=[];
  const document={documentElement:html,body,querySelectorAll:selector=>html.querySelectorAll(selector),querySelector:selector=>html.querySelector(selector),createElement(){effects.elementCreates++;return new Element('style');}};
  const host={document,innerWidth:1000,innerHeight:700,location:{href},localStorage:{getItem(){effects.preferenceReads++;throw Error('Policy must not inspect preferences');}},getComputedStyle:node=>({...node.css,display:node.style.display||node.css.display,visibility:node.style.visibility||node.css.visibility,opacity:node.style.opacity||node.css.opacity}),queueMicrotask:fn=>microtasks.push(fn),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),__CC_MAC_LOAD_BACKGROUND__(){effects.rendererLoads++;},MutationObserver:class{constructor(fn){effects.observers++;this.fn=fn;observers.push(this);}observe(target,options){this.connected=true;this.options=options;}disconnect(){this.connected=false;}},ResizeObserver:class{nodes=new Set();constructor(fn){this.fn=fn;resizeObservers.push(this);}observe(node){this.nodes.add(node);this.disconnected=false;}unobserve(node){this.nodes.delete(node);}disconnect(){this.nodes.clear();this.disconnected=true;}}};
  host.self=host;host.top=host;
  const api=createSurfacePolicy(host,options);
  return {host,api,document,html,body,root,frame,main,effects,listeners,observers,resizeObservers,flush(){while(microtasks.length)microtasks.shift()();}};
}
function noPaint(f){assert.equal(f.root.hasAttribute(marker),false);assert.equal(f.effects.preferenceReads,0);assert.equal(f.effects.elementCreates,0);assert.equal(f.effects.rendererLoads,0);}

test('only a unique complete main app shell receives the surface marker',()=>{
  const f=fixture();assert.equal(f.api.allowedWindow(),true);assert.equal(f.api.validateRoot(f.root,f.main),true);
  f.api.refresh();assert.equal(f.root.getAttribute(marker),'');assert.equal(f.main.hasAttribute(marker),false);assert.equal(f.frame.hasAttribute(marker),false);
  assert.equal(f.api.validateRoot(f.main),false);assert.equal(f.api.validateRoot(f.body),false);assert.equal(f.api.validateRoot(f.html),false);
  assert.equal(f.effects.preferenceReads+f.effects.elementCreates+f.effects.rendererLoads,0);f.api.dispose();assert.equal(f.root.hasAttribute(marker),false);
});

test('cold bare roots, isolated main nodes and inactive shells remain unpainted',()=>{
  for(const alteration of [f=>f.root.children=[],f=>f.frame.children=[],f=>f.root.remove(f.frame),f=>f.frame.removeAttribute('data-app-shell-frame'),f=>f.frame.setAttribute('data-app-shell-frame','false'),f=>f.main.css.display='none',f=>f.root.setAttribute('hidden',''),f=>f.main.setAttribute('aria-hidden','true'),f=>f.frame.setAttribute('data-app-shell-active-page','false'),f=>f.root.isConnected=false]){
    const f=fixture();alteration(f);f.api.refresh();assert.equal(f.api.validateRoot(f.root),false);noPaint(f);f.api.dispose();
  }
});

test('offscreen, undersized and oversized full-viewport lookalikes are refused',()=>{
  for(const [which,rect]of [['root',{left:-2500,top:0,right:-1540,bottom:640}],['root',{left:0,top:0,right:2000,bottom:1500}],['root',{left:0,top:0,right:200,bottom:160}],['main',{left:1200,top:44,right:1900,bottom:640}],['main',{left:260,top:-50,right:960,bottom:640}],['main',{left:0,top:0,right:2500,bottom:1500}],['main',{left:260,top:44,right:Infinity,bottom:640}]]){
    const f=fixture();f[which].rect=rect;f.api.refresh();assert.equal(f.api.validateRoot(f.root),false);noPaint(f);f.api.dispose();
  }
});

test('a main surface must physically belong to the root bounds',()=>{
  const f=fixture();f.root.rect={left:0,top:0,right:500,bottom:640};f.main.rect={left:550,top:44,right:960,bottom:640};
  f.api.refresh();assert.equal(f.api.validateRoot(f.root),false);noPaint(f);f.api.dispose();
});

test('auxiliary renderer routes, iframe contexts and foreign URLs are rejected before side effects',()=>{
  const routes=['/avatar-overlay','/global-dictation','/screen-overlay','/spotlight','/hotkey-window','/electron-notifications','/codex-micro','/browser-comment-popup'];
  for(const href of [...routes.map(route=>'app://-/index.html?initialRoute='+encodeURIComponent(route)),'https://chatgpt.com/','app://other/index.html','app://-/auxiliary.html','file:///Applications/ChatGPT.app/index.html','app://user:secret@-/index.html']){
    const f=fixture(href);assert.equal(f.api.allowedWindow(),false,href);f.api.refresh();noPaint(f);assert.equal(f.effects.observers,0);assert.equal(f.listeners.size,0);assert.equal(f.root.rectReads+f.main.rectReads,0);f.api.dispose();
  }
  const f=fixture();f.api.dispose();f.host.top={};const api=createSurfacePolicy(f.host);assert.equal(api.allowedWindow(),false);api.refresh();noPaint(f);api.dispose();
});

test('empty, duplicate, case-confused and malformed initialRoute parameters fail closed',()=>{
  for(const query of ['initialRoute=','initialRoute','initialRoute=/&initialRoute=/settings','initialRoute=/&INITIALROUTE=/','INITIALROUTE=/','initialRoute=%GG','initialRoute=%252Fsettings','initialRoute=//settings','initialRoute=%2Fsettings%00','initialRoute=%2Fsettings%20','initialRoute=%2Flocal%5Cid','initialRoute=/thread///','initialRoute=/local/id//child']){
    const f=fixture('app://-/index.html?'+query);assert.equal(f.api.allowedWindow(),false,query);f.api.refresh();noPaint(f);assert.equal(f.effects.observers,0);f.api.dispose();
  }
});

test('native URL parity rejects encoded keys, empty query delimiters, DEL and raw plus signs',()=>{
  for(const href of ['app://-/index.html?%69nitialRoute=%2F','app://-/index.html?','app://-/index.html?initialRoute=%2Flocal%2Fid%7F','app://-/index.html\x7f','app://-/index.html?initialRoute=%2Fsettings+']){
    const f=fixture(href);assert.equal(f.api.allowedWindow(),false,JSON.stringify(href));f.api.refresh();noPaint(f);assert.equal(f.effects.observers,0);f.api.dispose();
  }
});

test('oversized route and encoded raw URL are refused independently before painting',()=>{
  const longRoute='/local/'+'a'.repeat(4090),routeURL='app://-/index.html?initialRoute='+encodeURIComponent(longRoute);
  assert(longRoute.length>4096&&routeURL.length<8192,'exercise the decoded route limit without exceeding the raw URL limit');
  const encodedURL='app://-/index.html?initialRoute=%2Flocal%2F'+'%41'.repeat(2800);
  assert(encodedURL.length>8192&&new URL(encodedURL).searchParams.get('initialRoute').length<4096,'exercise raw URL limit with a short valid decoded route');
  for(const href of [routeURL,encodedURL]){const f=fixture(href);assert.equal(f.api.allowedWindow(),false);f.api.refresh();noPaint(f);assert.equal(f.effects.observers,0);f.api.dispose();}
});

test('metadata routes with surrounding whitespace or DEL cannot be normalized into trusted routes',()=>{
  for(const content of [' /settings','/settings ','\t/','/settings\x7f']){
    const f=fixture();f.html.append(new Element('meta',{name:'initial-route',content}));assert.equal(f.api.allowedWindow(),false,JSON.stringify(content));f.api.refresh();noPaint(f);f.api.dispose();
  }
});

test('valid initial main routes and explicit localhost previews remain eligible',()=>{
  for(const route of ['/','/settings','/local/ABC-123','/remote/ABC_123','/settings/appearance']){
    const f=fixture('app://-/index.html?initialRoute='+encodeURIComponent(route));assert.equal(f.api.allowedWindow(),true,route);f.api.refresh();assert.equal(f.root.getAttribute(marker),'');f.api.dispose();
  }
  const preview=fixture('http://127.0.0.1:65418/surface-scope',{preview:true});assert.equal(preview.api.allowedWindow(),true);preview.api.refresh();assert.equal(preview.root.getAttribute(marker),'');preview.api.dispose();
  for(const href of ['http://127.0.0.1:65418/surface-scope','http://localhost:65418/surface-scope','http://127.0.0.1:65418/untrusted']){
    const f=fixture(href,{preview:href.includes('localhost')||href.includes('untrusted')});assert.equal(f.api.allowedWindow(),false);f.api.refresh();noPaint(f);f.api.dispose();
  }
});

test('visible main ambiguity is refused on cold start, while inactive main nodes do not count',()=>{
  const f=fixture(),second=new Element('main',{'data-app-shell-main-surface':'default'},{left:260,top:44,right:960,bottom:640});f.frame.append(second);
  f.api.refresh();assert.equal(f.api.validateRoot(f.root),false);noPaint(f);
  second.setAttribute('data-app-shell-active-page','false');f.api.refresh();assert.equal(f.root.getAttribute(marker),'');f.api.dispose();
});

test('only a previously validated root can retain its marker during temporary main replacement',()=>{
  const f=fixture();f.api.refresh();f.frame.remove(f.main);f.api.refresh();assert.equal(f.root.getAttribute(marker),'');assert.equal(f.api.validateRoot(f.root),false);
  const clone=new Element('div',{id:'root',[marker]:''});f.body.remove(f.root);f.body.append(clone);f.api.refresh();assert.equal(clone.hasAttribute(marker),false);assert.equal(f.root.hasAttribute(marker),false);
  f.api.dispose();
});

test('viewport and URL changes revoke unsafe markers while safe disposal restores its prior value',()=>{
  const f=fixture();f.root.setAttribute(marker,'prior');f.api.refresh();assert.equal(f.root.getAttribute(marker),'');
  f.api.dispose();assert.equal(f.root.getAttribute(marker),'prior');
  f.root.removeAttribute(marker);const api=createSurfacePolicy(f.host);api.refresh();
  f.host.innerWidth=500;api.refresh();assert.equal(f.root.hasAttribute(marker),false);
  f.host.innerWidth=1000;api.refresh();assert.equal(f.root.getAttribute(marker),'');
  f.host.location.href='app://-/index.html?initialRoute=/screen-overlay';api.refresh();assert.equal(f.root.hasAttribute(marker),false);api.dispose();
  assert(f.observers.every(o=>!o.connected));assert.equal(f.listeners.size,0);
});

test('late auxiliary metadata, conflicting metadata and unknown window parameters cannot keep a valid surface',()=>{
  const f=fixture(),meta=new Element('meta',{name:'initial-route',content:'/'});f.html.append(meta);f.api.refresh();assert.equal(f.root.getAttribute(marker),'');
  meta.setAttribute('content','/avatar-overlay');f.api.refresh();assert.equal(f.api.allowedWindow(),false);assert.equal(f.root.hasAttribute(marker),false);f.api.dispose();
  for(const href of ['app://-/index.html?initialRoute=/&appearance=screenOverlay','app://-/index.html?windowType=overlay','app://-/index.html#screen-overlay','app://-:1234/index.html']){
    const denied=fixture(href);assert.equal(denied.api.allowedWindow(),false,href);denied.api.refresh();noPaint(denied);assert.equal(denied.effects.observers,0);denied.api.dispose();
  }
  const conflict=fixture('app://-/index.html?initialRoute=/settings');conflict.html.append(new Element('meta',{name:'initial-route',content:'/'}));conflict.api.refresh();assert.equal(conflict.api.allowedWindow(),false);noPaint(conflict);conflict.api.dispose();
});

test('the serialized policy has the same safe ownership and refusal behavior',()=>{
  const factory=vm.runInNewContext('('+createSurfacePolicy.toString()+')',{URL});
  const f=fixture();f.api.dispose();const api=factory(f.host);api.refresh();assert.equal(f.root.getAttribute(marker),'');api.dispose();assert.equal(f.root.hasAttribute(marker),false);
  f.host.location.href='app://-/index.html?initialRoute=/screen-overlay';const denied=factory(f.host);denied.refresh();noPaint(f);denied.dispose();
});

test('warm frame identity loss revokes through MutationObserver and notifies the live renderer once',()=>{
  const f=fixture(),calls=[];f.host.__CCMacBackground__={revokeSurface(root){assert.equal(root.hasAttribute(marker),false,'clear the gate before stopping its renderer');calls.push(root);}};
  f.api.refresh();assert.equal(f.root.getAttribute(marker),'');const observer=f.observers[0];
  assert(observer.options.attributeFilter.includes('data-app-shell-frame'));
  f.frame.setAttribute('data-app-shell-frame','false');observer.fn([{type:'attributes',attributeName:'data-app-shell-frame',target:f.frame,oldValue:'true'}]);f.flush();
  assert.equal(f.root.hasAttribute(marker),false);assert.deepEqual(calls,[f.root]);
  observer.fn([{type:'attributes',attributeName:'data-app-shell-frame',target:f.frame,oldValue:'false'}]);f.flush();assert.deepEqual(calls,[f.root]);f.api.dispose();
});

test('warm root hidden by class or inline style is synchronously stopped after the queued observer refresh',()=>{
  for(const [attribute,value]of [['class','hidden'],['class','invisible'],['style','display:none'],['style','visibility:hidden'],['style','opacity:0']]){
    const f=fixture(),calls=[];f.host.__CCMacBackground__={revokeSurface(root){assert.equal(root.hasAttribute(marker),false);calls.push(root);}};f.api.refresh();
    assert(f.observers[0].options.attributeFilter.includes(attribute));f.root.setAttribute(attribute,value);
    f.observers[0].fn([{type:'attributes',attributeName:attribute,target:f.root,oldValue:null}]);f.flush();
    assert.equal(f.root.hasAttribute(marker),false,attribute+'='+value);assert.deepEqual(calls,[f.root]);f.api.dispose();
  }
});

test('leased root resizing past viewport bounds revokes through ResizeObserver without a window resize event',()=>{
  const f=fixture(),calls=[];f.host.__CCMacBackground__={revokeSurface(root){assert.equal(root.hasAttribute(marker),false);calls.push(root);}};f.api.refresh();
  const observer=f.resizeObservers.find(ro=>ro.nodes.has(f.root));assert(observer,'observe the leased root itself');
  f.root.rect={left:0,top:0,right:2500,bottom:1500};observer.fn([{target:f.root}]);observer.fn([{target:f.root}]);f.flush();
  assert.equal(f.root.hasAttribute(marker),false);assert.deepEqual(calls,[f.root]);f.api.dispose();
});

test('warm main moving outside its frame or viewport cannot reuse the loading-root exception',()=>{
  for(const rect of [{left:700,top:44,right:960,bottom:640},{left:260,top:44,right:2000,bottom:1500}]){
    const f=fixture(),calls=[];f.frame.rect={left:0,top:0,right:800,bottom:640};f.main.rect={left:260,top:44,right:760,bottom:640};
    f.host.__CCMacBackground__={revokeSurface(root){assert.equal(root.hasAttribute(marker),false);calls.push(root);}};
    f.api.refresh();assert.equal(f.root.getAttribute(marker),'');const observer=f.resizeObservers.find(ro=>ro.nodes.has(f.main));assert(observer,'observe the qualified main surface');
    f.main.rect=rect;observer.fn([{target:f.main}]);f.flush();
    assert.equal(f.root.hasAttribute(marker),false);assert.deepEqual(calls,[f.root]);
    observer.fn([{target:f.main}]);f.flush();assert.deepEqual(calls,[f.root]);f.api.dispose();
  }
});

test('palette, decorative background and owner markers do not trigger repeated qualification scans',()=>{
  const f=fixture();f.api.refresh();const observer=f.observers[0],initialReads=f.root.rectReads+f.main.rectReads;
  for(let i=0;i<12;i++){
    const previous=f.root.getAttribute('style');f.root.setAttribute('style','--cc-theme-fg:#fff;--cc-home-material-top:-'+i+'px;background-color:rgba(0,0,0,.25)');
    observer.fn([{type:'attributes',attributeName:'style',target:f.root,oldValue:previous}]);f.flush();
  }
  assert(!observer.options.attributeFilter.includes(marker),'native observer must not deliver its own marker writes');
  assert.equal(f.root.rectReads+f.main.rectReads,initialReads);assert.equal(f.root.getAttribute(marker),'');f.api.dispose();
});

test('cold refusals never notify a renderer; disposal disconnects mutation, resize and listener work',()=>{
  const f=fixture(),calls=[];f.host.__CCMacBackground__={revokeSurface(root){calls.push(root);}};f.frame.setAttribute('data-app-shell-frame','false');f.api.refresh();assert.deepEqual(calls,[]);
  f.frame.setAttribute('data-app-shell-frame','true');f.api.refresh();const observer=f.resizeObservers.find(ro=>ro.nodes.has(f.root));assert(observer);
  observer.fn([{target:f.root}]);f.api.dispose();const reads=f.root.rectReads+f.main.rectReads;f.flush();
  assert.equal(f.root.rectReads+f.main.rectReads,reads);assert.equal(f.root.hasAttribute(marker),false);
  assert(f.observers.every(mo=>!mo.connected));assert(f.resizeObservers.every(ro=>ro.disconnected));assert.equal(f.listeners.size,0);
});

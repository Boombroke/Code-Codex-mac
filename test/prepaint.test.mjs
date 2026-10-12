import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createPrepaint} from '../scripts/prepaint.mjs';
import {payload} from '../scripts/payload.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const gate='data-cc-mac-prepaint';
const valid={enabled:true,layoutVersion:4,effect:'black-hole',composerTransparency:75};

// This harness covers document-start ownership and lifecycle, not CSS layout
// or browser paint timing. The independent browser preview verifies those.
function harness({saved=valid,raw,hasRoot=true,hasHead=true}={}) {
  const observers=[],elements=[],listeners=new Map(),hostListeners=new Map(),microtasks=[];
  const selectorList=value=>{let depth=0,start=0,result=[];for(let index=0;index<value.length;index++){if('(['.includes(value[index]))depth++;if(')]'.includes(value[index]))depth--;if(value[index]===','&&!depth){result.push(value.slice(start,index));start=index+1;}}result.push(value.slice(start));return result.map(selector=>selector.trim());};
  class Style {
    values=new Map();
    getPropertyValue(name){return this.values.get(name)?.value||'';}
    getPropertyPriority(name){return this.values.get(name)?.priority||'';}
    setProperty(name,value,priority=''){this.values.set(name,{value:String(value),priority});}
    removeProperty(name){const previous=this.getPropertyValue(name);this.values.delete(name);return previous;}
  }
  class Element {
    constructor(tag){this.nodeType=1;this.tagName=tag.toUpperCase();this.attributes=new Map();this.children=[];this.style=new Style();this.parentNode=null;this.css={display:'block',visibility:'visible',opacity:'1'};this.rect={left:0,top:0,right:960,bottom:640};elements.push(this);}
    get id(){return this.getAttribute('id')||'';}
    set id(value){this.setAttribute('id',value);}
    get parentElement(){return this.parentNode?.nodeType===1?this.parentNode:null;}
    get isConnected(){let node=this;while(node){if(node===document)return true;node=node.parentNode;}return false;}
    hasAttribute(name){return this.attributes.has(name);}
    contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false;}
    getAttribute(name){return this.attributes.has(name)?this.attributes.get(name):null;}
    setAttribute(name,value){this.attributes.set(name,String(value));}
    removeAttribute(name){this.attributes.delete(name);}
    append(child){child.remove();this.children.push(child);child.parentNode=this;}
    remove(){if(this.parentNode?.children)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}
    matches(value){return selectorList(value).some(selector=>{
      if(selector==='main:is(.main-surface,[data-app-shell-main-surface="default"])')return this.tagName==='MAIN'&&(this.getAttribute('data-app-shell-main-surface')==='default'||(this.getAttribute('class')||'').split(/\s+/).includes('main-surface'));
      if(selector.startsWith('#'))return this.id===selector.slice(1);
      if(selector.startsWith('.'))return (this.getAttribute('class')||'').split(/\s+/).includes(selector.slice(1));
      const attribute=/^([a-z]+)?\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      return !!attribute&&(!attribute[1]||this.tagName===attribute[1].toUpperCase())&&this.hasAttribute(attribute[2])&&(attribute[3]===undefined||this.getAttribute(attribute[2])===attribute[3]);
    });}
    closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    getBoundingClientRect(){return {...this.rect,width:this.rect.right-this.rect.left,height:this.rect.bottom-this.rect.top};}
  }
  class Observer {
    constructor(callback){this.callback=callback;this.active=false;observers.push(this);}
    observe(target,options){this.target=target;this.options=options;this.active=true;}
    disconnect(){this.active=false;}
  }
  const document={
    documentElement:null,head:null,body:null,readyState:'loading',children:[],
    createElement(tag){return new Element(tag);},
    querySelectorAll(selector){return document.documentElement?.querySelectorAll(selector)||[];},
    querySelector(selector){return document.querySelectorAll(selector)[0]||null;},
    addEventListener(type,callback,options){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push({callback,once:options?.once});},
  };
  const localStorage={value:raw??JSON.stringify(saved),getItem(){return this.value;},setItem(key,value){this.value=String(value);}};
  const host={document,localStorage,MutationObserver:Observer,location:{href:'app://-/index.html'},requestAnimationFrame(){throw Error('A pending or cancelled boot must not start the renderer');},cancelAnimationFrame(){},devicePixelRatio:2,innerWidth:1000,innerHeight:700,getComputedStyle:node=>node.css,queueMicrotask:callback=>microtasks.push(callback),addEventListener(type,callback){if(!hostListeners.has(type))hostListeners.set(type,new Set());hostListeners.get(type).add(callback);},removeEventListener(type,callback){hostListeners.get(type)?.delete(callback);}};
  host.self=host;host.top=host;
  function addRoot(withHead=hasHead) {
    document.documentElement=new Element('html');document.documentElement.parentNode=document;document.children.push(document.documentElement);
    if(withHead){document.head=new Element('head');document.documentElement.append(document.head);}
    for(const observer of [...observers])if(observer.active)observer.callback([]);
    return document.documentElement;
  }
  if(hasRoot)addRoot();
  function addShell(){
    if(!document.body){document.body=new Element('body');document.documentElement.append(document.body);}
    const appRoot=new Element('div');appRoot.id='root';document.body.append(appRoot);
    const frame=new Element('div');frame.setAttribute('data-app-shell-frame','true');appRoot.append(frame);
    const main=new Element('main');main.setAttribute('data-app-shell-main-surface','default');main.rect={left:260,top:44,right:960,bottom:640};frame.append(main);
    return {appRoot,frame,main};
  }
  return {host,document,observers,elements,listeners,hostListeners,addRoot,addShell,
    styles:()=>elements.filter(element=>element.tagName==='STYLE'&&element.isConnected),
    flush(){while(microtasks.length)microtasks.shift()();},
    dispatch(type){const entries=[...(listeners.get(type)||[])];listeners.set(type,entries.filter(entry=>!entry.once));for(const entry of entries)entry.callback();},
  };
}

test('prepaint installs once when documentElement appears, without waiting for a head or DCL',()=>{
  const value=harness({hasRoot:false,hasHead:false});
  const api=createPrepaint(value.host);
  assert.equal(value.styles().length,0);
  assert.equal(value.observers.filter(observer=>observer.active).length,1);
  const html=value.addRoot(false);
  assert.equal(value.document.readyState,'loading');
  assert.equal(value.document.head,null);
  assert.equal(value.styles().length,1);
  assert.equal(value.styles()[0].parentNode,html);
  assert.equal(html.getAttribute(gate),'');
  assert.equal(html.style.getPropertyValue('--cc-mac-prepaint-composer'),'rgba(18,23,32,0.25)');
  assert.equal(value.observers.filter(observer=>observer.active).length,0);
  api.update(valid);assert.equal(value.styles().length,1);
});

test('disabled, removed, malformed and unsupported layout settings cannot activate the gate',()=>{
  for(const settings of [{...valid,enabled:false},{...valid,removed:true},{...valid,layoutVersion:1},null,{}]) {
    const value=harness({saved:settings});
    createPrepaint(value.host);
    assert.equal(value.document.documentElement.getAttribute(gate),null);
  }
  const malformed=harness({raw:'{"enabled":true,'});
  createPrepaint(malformed.host);
  assert.equal(malformed.document.documentElement.getAttribute(gate),null);
});

test('latest updates made before HTML creation determine activation and composer tint',()=>{
  const value=harness({hasRoot:false});
  const api=createPrepaint(value.host);
  api.update({...valid,enabled:false,composerTransparency:50});
  const html=value.addRoot();
  assert.equal(html.getAttribute(gate),null,'the initial saved enabled state must not override a newer disabled state');
  assert.equal(html.style.getPropertyValue('--cc-mac-prepaint-composer'),'rgba(18,23,32,0.5)');
  api.update(valid);
  assert.equal(html.getAttribute(gate),'');
  assert.equal(html.style.getPropertyValue('--cc-mac-prepaint-composer'),'rgba(18,23,32,0.25)');
});

test('pause and resume keep the enabled skin and 75% composer transparency',()=>{
  const value=harness();
  const api=createPrepaint(value.host),html=value.document.documentElement;
  const backdrop=html.style.getPropertyValue('--cc-mac-prepaint-backdrop');
  for(const paused of [true,false,true,false]) {
    api.update({...valid,paused});
    assert.equal(html.getAttribute(gate),'');
    assert.equal(html.style.getPropertyValue('--cc-mac-prepaint-backdrop'),backdrop);
    assert.equal(html.style.getPropertyValue('--cc-mac-prepaint-composer'),'rgba(18,23,32,0.25)');
  }
});

test('all eight known skins retain distinct early backdrops without changing composer tint or storage',()=>{
  const value=harness(),api=createPrepaint(value.host),html=value.document.documentElement;
  const before=value.host.localStorage.value,backdrops=new Set();
  for(const effect of ['black-hole','aurora-ionosphere','heavenly-cloud','glow-horizon','milky-way','mountain','cloud-train','blinking-squares']) {
    api.update({...valid,effect});
    backdrops.add(html.style.getPropertyValue('--cc-mac-prepaint-backdrop'));
    assert.equal(html.getAttribute(gate),'');
    assert.equal(html.style.getPropertyValue('--cc-mac-prepaint-composer'),'rgba(18,23,32,0.25)');
  }
  assert.equal(backdrops.size,8);
  assert.equal(value.styles().length,1);
  assert.equal(value.host.localStorage.value,before);
});

test('unknown and prototype-named effects use a safe fallback before the catalog loads',()=>{
  for(const effect of ['constructor','__proto__','missing','media']){
    const value=harness({saved:{...valid,effect}});createPrepaint(value.host);
    assert.equal(value.document.documentElement.getAttribute(gate),'');
    assert.match(value.document.documentElement.style.getPropertyValue('--cc-mac-prepaint-backdrop'),/^linear-gradient/);
  }
});

test('disposal restores original gate and variables including their CSS priorities',()=>{
  const value=harness(),html=value.document.documentElement;
  html.setAttribute(gate,'previous-owner');
  html.style.setProperty('--cc-mac-prepaint-backdrop','original-backdrop','important');
  html.style.setProperty('--cc-mac-prepaint-composer','original-composer','important');
  html.style.setProperty('--native-surface','#f1f3f7');
  const api=createPrepaint(value.host);
  api.dispose();api.dispose();
  assert.equal(value.styles().length,0);
  assert.equal(html.getAttribute(gate),'previous-owner');
  for(const [name,original] of [['--cc-mac-prepaint-backdrop','original-backdrop'],['--cc-mac-prepaint-composer','original-composer']]) {
    assert.equal(html.style.getPropertyValue(name),original);
    assert.equal(html.style.getPropertyPriority(name),'important');
  }
  assert.equal(html.style.getPropertyValue('--native-surface'),'#f1f3f7');
  assert.equal(value.host.__CCMacPrepaint__,undefined);
});

test('disposing before HTML exists stops the one-shot observer from installing anything later',()=>{
  const value=harness({hasRoot:false});
  const api=createPrepaint(value.host);api.dispose();
  const html=value.addRoot();
  assert.equal(value.styles().length,0);
  assert.equal(html.getAttribute(gate),null);
  assert.equal(html.style.getPropertyValue('--cc-mac-prepaint-composer'),'');
  assert.equal(value.observers.filter(observer=>observer.active).length,0);
});

test('repeated prepaint injection owns only one style and returns to native variables on dispose',()=>{
  const value=harness(),html=value.document.documentElement;
  const old=createPrepaint(value.host),current=createPrepaint(value.host);
  assert.notEqual(old,current);
  assert.equal(value.styles().length,1);
  old.dispose();assert.equal(value.host.__CCMacPrepaint__,current);
  current.dispose();
  assert.equal(value.styles().length,0);
  assert.equal(html.getAttribute(gate),null);
  assert.equal(html.style.getPropertyValue('--cc-mac-prepaint-backdrop'),'');
  assert.equal(html.style.getPropertyValue('--cc-mac-prepaint-composer'),'');
});

test('serialized prepaint remains self contained',()=>{
  const value=harness();
  const serialized=new Function('return ('+createPrepaint.toString()+')')();
  const api=serialized(value.host);
  assert.equal(value.document.documentElement.getAttribute(gate),'');
  assert.equal(value.styles().length,1);api.dispose();
  assert.equal(value.styles().length,0);
});

test('reinjecting the actual payload cancels the previous pending DCL boot',async()=>{
  const value=harness(),code=await payload(root);
  const context=vm.createContext({window:value.host,document:value.document,URL});
  vm.runInContext(code,context);
  const previousBoot=value.listeners.get('DOMContentLoaded')[0].callback;
  vm.runInContext(code,context);
  assert.equal(value.host.__CCMacBootRevision__,2);
  previousBoot();
  assert.equal(value.host.__CC_MAC_CATALOG__,undefined,'a stale boot must not reach catalog/controller setup');
  assert.equal(value.host[Symbol.for('code-codex-mac:frames:v1')],undefined);
  assert.equal(value.styles().length,1);
  value.host.__CCMacPrepaint__.dispose();
});

test('DCL-before repeated payload injection replaces surface leases and listener ownership completely',async()=>{
  const value=harness(),shell=value.addShell(),code=await payload(root),marker='data-cc-mac-validated-surface';
  const context=vm.createContext({window:value.host,document:value.document,URL});
  vm.runInContext(code,context);
  const oldPolicy=value.host.__CC_MAC_SURFACE_POLICY__,oldBoot=value.listeners.get('DOMContentLoaded')[0].callback;
  const oldListeners=new Map([...value.hostListeners].map(([type,callbacks])=>[type,[...callbacks]]));
  const oldObservers=value.observers.filter(observer=>observer.active);
  assert.equal(shell.appRoot.getAttribute(marker),'');
  vm.runInContext(code,context);
  const current=value.host.__CC_MAC_SURFACE_POLICY__;
  assert.notEqual(current,oldPolicy);
  const freshObservers=value.observers.filter(observer=>observer.active);
  assert.equal(freshObservers.length,oldObservers.length,'reinjecting must not accumulate surface or Home observers');
  assert(freshObservers.every(observer=>!oldObservers.includes(observer)),'all old observer ownership must be released');
  for(const [type,callbacks] of oldListeners) {
    assert.equal(value.hostListeners.get(type).size,callbacks.length,'listener count cannot grow for '+type);
    assert([...value.hostListeners.get(type)].every(callback=>!callbacks.includes(callback)),'old listener identity must be released for '+type);
  }
  oldBoot();assert.equal(value.host.__CC_MAC_CATALOG__,undefined);
  current.dispose();
  assert.equal(shell.appRoot.hasAttribute(marker),false,'fresh policy must own and release the visible surface lease');
  value.host.__CCMacPrepaint__.dispose();
  assert(value.observers.every(observer=>!observer.active));
  assert([...value.hostListeners.values()].every(callbacks=>callbacks.size===0));
  assert.equal(shell.appRoot.hasAttribute(marker),false,'disposing an old policy must not resurrect the validated marker');
  assert.equal(value.styles().length,0);
});

test('surface refresh may synchronously dispose prepaint without re-leasing restored HTML variables',()=>{
  const value=harness();let calls=0,homeUpdates=0;
  value.host.__CC_MAC_SURFACE_POLICY__={refresh(){calls++;},dispose(){}};
  value.host.__CC_MAC_HOME_MATERIAL__=()=>({update(){homeUpdates++;},dispose(){}});
  const api=createPrepaint(value.host);
  const beforeUpdates=homeUpdates;
  value.host.__CC_MAC_SURFACE_POLICY__.refresh=()=>api.dispose();
  api.update({...valid,composerTransparency:50});
  assert.equal(value.styles().length,0);
  assert.equal(value.document.documentElement.getAttribute(gate),null);
  for(const name of ['--cc-mac-prepaint-backdrop','--cc-mac-prepaint-composer','--cc-mac-prepaint-composer-filter'])assert.equal(value.document.documentElement.style.getPropertyValue(name),'');
  assert.equal(homeUpdates,beforeUpdates,'a disposed Home material must not receive another update');
  assert.equal(value.host.__CCMacPrepaint__,undefined);
  assert.equal(calls,1);
});

test('late auxiliary metadata before DCL removes prepaint and prevents any renderer bootstrap',async()=>{
  const value=harness(),shell=value.addShell(),code=await payload(root),marker='data-cc-mac-validated-surface';
  const context=vm.createContext({window:value.host,document:value.document,URL});
  vm.runInContext(code,context);
  assert.equal(shell.appRoot.getAttribute(marker),'');
  const meta=value.document.createElement('meta');meta.setAttribute('name','initial-route');meta.setAttribute('content','/avatar-overlay');value.document.head.append(meta);
  const surface=value.host.__CC_MAC_SURFACE_POLICY__;surface.refresh();
  assert.equal(shell.appRoot.hasAttribute(marker),false);
  assert.equal(value.styles().length,0);
  assert.equal(value.document.documentElement.getAttribute(gate),null);
  assert.equal(value.document.documentElement.style.getPropertyValue('--cc-mac-prepaint-backdrop'),'');
  value.dispatch('DOMContentLoaded');
  assert.equal(value.host.__CC_MAC_CATALOG__,undefined);
  assert.equal(value.host[Symbol.for('code-codex-mac:frames:v1')],undefined);
  assert(value.observers.every(observer=>!observer.active));
  assert([...value.hostListeners.values()].every(callbacks=>callbacks.size===0));
  meta.remove();assert.equal(surface.allowedWindow(),false,'disposed policy cannot resume merely because metadata became eligible again');
});

test('the actual native restore expression cancels a pending payload and removes its early CSS',async()=>{
  const value=harness(),code=await payload(root);
  const source=await fs.readFile(path.join(root,'native/Manager.swift'),'utf8');
  const match=/^let restoreExpression = ("(?:[^"\\]|\\.)*")$/m.exec(source);
  assert(match,'native restore expression must be available for this lifecycle regression');
  const restore=JSON.parse(match[1]);
  const context=vm.createContext({window:value.host,document:value.document,localStorage:value.host.localStorage,URL});
  vm.runInContext(code,context);
  vm.runInContext(restore,context);
  value.dispatch('DOMContentLoaded');
  assert.equal(value.host.__CC_MAC_CATALOG__,undefined);
  assert.equal(value.host[Symbol.for('code-codex-mac:frames:v1')],undefined);
  assert.equal(value.styles().length,0);
  assert.equal(value.document.documentElement.getAttribute(gate),null);
  assert.equal(value.document.documentElement.style.getPropertyValue('--cc-mac-prepaint-backdrop'),'');
  const saved=JSON.parse(value.host.localStorage.value);
  assert.equal(saved.enabled,false);assert.equal(saved.removed,true);
});

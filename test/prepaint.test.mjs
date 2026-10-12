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
  const observers=[],elements=[],listeners=new Map();
  class Style {
    values=new Map();
    getPropertyValue(name){return this.values.get(name)?.value||'';}
    getPropertyPriority(name){return this.values.get(name)?.priority||'';}
    setProperty(name,value,priority=''){this.values.set(name,{value:String(value),priority});}
    removeProperty(name){const previous=this.getPropertyValue(name);this.values.delete(name);return previous;}
  }
  class Element {
    constructor(tag){this.tagName=tag.toUpperCase();this.attributes=new Map();this.children=[];this.style=new Style();this.parentNode=null;elements.push(this);}
    get isConnected(){let node=this;while(node){if(node===document)return true;node=node.parentNode;}return false;}
    getAttribute(name){return this.attributes.has(name)?this.attributes.get(name):null;}
    setAttribute(name,value){this.attributes.set(name,String(value));}
    removeAttribute(name){this.attributes.delete(name);}
    append(child){child.remove();this.children.push(child);child.parentNode=this;}
    remove(){if(this.parentNode?.children)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}
  }
  class Observer {
    constructor(callback){this.callback=callback;this.active=false;observers.push(this);}
    observe(target,options){this.target=target;this.options=options;this.active=true;}
    disconnect(){this.active=false;}
  }
  const document={
    documentElement:null,head:null,readyState:'loading',children:[],
    createElement(tag){return new Element(tag);},
    addEventListener(type,callback,options){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push({callback,once:options?.once});},
  };
  const localStorage={value:raw??JSON.stringify(saved),getItem(){return this.value;},setItem(key,value){this.value=String(value);}};
  const host={document,localStorage,MutationObserver:Observer,requestAnimationFrame(){throw Error('A pending or cancelled boot must not start the renderer');},cancelAnimationFrame(){},devicePixelRatio:2};
  function addRoot(withHead=hasHead) {
    document.documentElement=new Element('html');document.documentElement.parentNode=document;document.children.push(document.documentElement);
    if(withHead){document.head=new Element('head');document.documentElement.append(document.head);}
    for(const observer of [...observers])if(observer.active)observer.callback([]);
    return document.documentElement;
  }
  if(hasRoot)addRoot();
  return {host,document,observers,elements,listeners,addRoot,
    styles:()=>elements.filter(element=>element.tagName==='STYLE'&&element.isConnected),
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
  const context=vm.createContext({window:value.host,document:value.document});
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

test('the actual native restore expression cancels a pending payload and removes its early CSS',async()=>{
  const value=harness(),code=await payload(root);
  const source=await fs.readFile(path.join(root,'native/Manager.swift'),'utf8');
  const match=/^let restoreExpression = ("(?:[^"\\]|\\.)*")$/m.exec(source);
  assert(match,'native restore expression must be available for this lifecycle regression');
  const restore=JSON.parse(match[1]);
  const context=vm.createContext({window:value.host,document:value.document,localStorage:value.host.localStorage});
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

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHomeMaterial} from '../scripts/home-material.mjs';

class Style {
  entries=new Map();
  getPropertyValue(key){return this.entries.get(key)?.value||'';}
  getPropertyPriority(key){return this.entries.get(key)?.priority||'';}
  setProperty(key,value,priority=''){this.entries.set(key,{value,priority});}
  removeProperty(key){this.entries.delete(key);}
  text(){return [...this.entries].map(([key,v])=>key+':'+v.value+(v.priority?' !'+v.priority:'')).join(';');}
}
class Node {
  nodeType=1;isConnected=true;style=new Style();attrs=new Map();children=[];parentElement=null;reads=0;
  constructor(kind,rect){this.kind=kind;this.rect=rect;}
  append(node){node.parentElement=this;this.children.push(node);}
  getAttribute(key){return key==='style'?this.style.text()||null:this.attrs.get(key)??null;}
  setAttribute(key,value){this.attrs.set(key,value);}
  removeAttribute(key){this.attrs.delete(key);}
  matches(selector){
    if(selector.includes('data-composer-utility-bar-variant'))return this.kind==='home'&&this.attrs.get('data-composer-utility-bar-variant')==='home';
    if(selector.includes('data-composer-rail-item'))return this.kind==='item';
    if(selector==='[data-composer-rail]')return this.kind==='rail';
    if(selector.includes('main:is'))return this.kind==='main';
    if(selector==='#root')return this.kind==='app';
    if(selector==='[data-app-shell-frame]')return this.kind==='frame';
    if(selector.includes('[hidden]'))return this.attrs.has('hidden')||this.attrs.get('aria-hidden')==='true'||this.attrs.get('data-app-shell-active-page')==='false';
    if(selector.startsWith('button,a,'))return this.kind==='popup'||this.kind==='button';
    return false;
  }
  closest(selector){for(let n=this;n;n=n.parentElement)if(n.matches(selector))return n;return null;}
  querySelectorAll(selector){const out=[];for(const child of this.children){if(child.matches(selector))out.push(child);out.push(...child.querySelectorAll(selector));}return out;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  contains(other){return other===this||this.children.some(child=>child.contains(other));}
  getBoundingClientRect(){this.reads++;return {...this.rect,width:this.rect.right-this.rect.left,height:this.rect.bottom-this.rect.top};}
}
function fixture(){
  const allObservers=[],resizeObservers=[],microtasks=[],listeners=new Map();
  const document=new Node('document'),app=new Node('app'),frame=new Node('frame'),main=new Node('main'),home=new Node('home',{top:100,right:500,bottom:300,left:200});
  home.setAttribute('data-composer-utility-bar-variant','home');document.append(app);app.append(frame);frame.append(main);main.append(home);
  const slot=new Node('slot'),rail=new Node('rail',{top:64,right:508,bottom:124,left:192}),item=new Node('item',{top:64,right:508,bottom:104,left:192});
  home.append(slot);slot.append(rail);rail.append(item);
  const bodyWrapper=new Node('body-wrapper'),body=new Node('body');home.append(bodyWrapper);bodyWrapper.append(body);
  document.addEventListener=(name,fn)=>listeners.set(name,fn);document.removeEventListener=name=>listeners.delete(name);
  const host={document,queueMicrotask:fn=>microtasks.push(fn),getComputedStyle:node=>({display:node.style.getPropertyValue('display')||'block',visibility:node.style.getPropertyValue('visibility')||'visible',opacity:node.style.getPropertyValue('opacity')||'1'}),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),MutationObserver:class{constructor(fn){this.fn=fn;allObservers.push(this);}observe(){this.connected=true;}disconnect(){this.connected=false;}},ResizeObserver:class{nodes=new Set();constructor(fn){this.fn=fn;resizeObservers.push(this);}observe(node){this.nodes.add(node);}unobserve(node){this.nodes.delete(node);}disconnect(){this.nodes.clear();this.disconnected=true;}}};
  return {host,home,rail,item,slot,body,main,app,frame,document,allObservers,resizeObservers,listeners,flush(){while(microtasks.length)microtasks.shift()();}};
}
const insets=node=>Object.fromEntries(['top','right','bottom','left'].map(edge=>[edge,node.style.getPropertyValue('--cc-home-material-'+edge)]));

test('Home plate includes the real absolute above/below rail without changing layout',()=>{
  const f=fixture(),api=createHomeMaterial(f.host);api.update({enabled:true});
  assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),'');
  assert.deepEqual(insets(f.home),{top:'-36px',right:'-8px',bottom:'0px',left:'-8px'});
  assert.equal(f.body.getAttribute('data-cc-mac-home-material-owner'),null);
  assert.equal(f.home.style.getPropertyValue('position'),'');assert.equal(f.slot.style.getPropertyValue('position'),'');
  f.rail.rect={top:276,right:500,bottom:338,left:200};f.item.rect={top:300,right:500,bottom:338,left:200};api.refresh();
  assert.deepEqual(insets(f.home),{top:'0px',right:'0px',bottom:'-38px',left:'0px'});
  api.dispose();
});

test('hidden rails do not extend the plate and missing native rails remove ownership',()=>{
  const f=fixture(),api=createHomeMaterial(f.host);f.slot.setAttribute('aria-hidden','true');api.update(true);
  assert.deepEqual(insets(f.home),{top:'0px',right:'0px',bottom:'0px',left:'0px'});
  f.home.children=f.home.children.filter(n=>n!==f.slot);f.slot.isConnected=false;api.refresh();
  assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);
  assert.deepEqual(insets(f.home),{top:'',right:'',bottom:'',left:''});api.dispose();
});

test('scaled native bounds produce CSS-unit insets without changing transforms',()=>{
  const f=fixture();f.home.offsetWidth=150;f.home.offsetHeight=100;f.home.style.setProperty('transform','scale(2)');
  const api=createHomeMaterial(f.host);api.update(true);
  assert.deepEqual(insets(f.home),{top:'-18px',right:'-4px',bottom:'0px',left:'-4px'});
  assert.equal(f.home.style.getPropertyValue('transform'),'scale(2)');api.dispose();
});

test('disabled, removed and failed states fully restore attributes and style priorities',()=>{
  for(const off of [false,{enabled:false},{enabled:true,removed:true},{enabled:true,renderFailed:true}]){
    const f=fixture();f.home.setAttribute('data-cc-mac-home-material-owner','prior-owner');f.home.style.setProperty('--cc-home-material-top','3px','important');
    const api=createHomeMaterial(f.host);api.update({enabled:true});api.update(off);
    assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),'prior-owner');
    assert.equal(f.home.style.getPropertyValue('--cc-home-material-top'),'3px');assert.equal(f.home.style.getPropertyPriority('--cc-home-material-top'),'important');
    assert.equal(f.home.style.getPropertyValue('--cc-home-material-right'),'');
    assert(f.allObservers.every(o=>!o.connected));assert(f.resizeObservers.every(o=>o.disconnected));
    assert.equal(f.listeners.size,0);api.dispose();
  }
});

test('unknown frames and popup Home lookalikes cannot claim a plate',()=>{
  const f=fixture(),popup=new Node('popup');f.main.append(popup);popup.append(f.home);
  const api=createHomeMaterial(f.host);api.update(true);assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);
  f.home.parentElement=f.main;f.main.children=[f.home];f.frame.kind='unknown';api.refresh();assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);api.dispose();
});

test('resize work is coalesced, self-writes are ignored and queued work cannot survive disable',()=>{
  const f=fixture(),api=createHomeMaterial(f.host);api.update(true);const ro=f.resizeObservers[0];
  assert(ro.nodes.has(f.home)&&ro.nodes.has(f.rail));
  const initialReads=f.home.reads;ro.fn();ro.fn();f.flush();assert.equal(f.home.reads,initialReads+1);
  f.allObservers[0].fn([{type:'attributes',attributeName:'style',target:f.home}]);f.flush();assert.equal(f.home.reads,initialReads+1);
  ro.fn();api.update(false);f.flush();assert.equal(f.home.reads,initialReads+1);assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);
  api.update(true);api.dispose();assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);
});

test('latest enabled state before native HTML insertion is respected by the serialized adapter',()=>{
  const f=fixture(),factory=vm.runInNewContext('('+createHomeMaterial.toString()+')');f.document.children=[];
  const api=factory(f.host);api.update(true);api.update({enabled:true,removed:true});f.document.append(f.app);api.refresh();
  assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);
  api.update({enabled:true});assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),'');api.dispose();
});

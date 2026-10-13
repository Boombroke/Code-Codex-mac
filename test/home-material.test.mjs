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
    // Split selector lists only outside nested :is/:not and attribute values.
    let depth=0,start=0;const parts=[];
    for(let i=0;i<selector.length;i++){if('(['.includes(selector[i]))depth++;if(')]'.includes(selector[i]))depth--;if(selector[i]===','&&depth===0){parts.push(selector.slice(start,i));start=i+1;}}
    if(parts.length){parts.push(selector.slice(start));return parts.some(part=>this.matches(part));}
    if(selector==='[data-cc-mac-validated-surface]')return this.attrs.has('data-cc-mac-validated-surface');
    if(selector.includes('data-composer-utility-bar-variant'))return this.kind==='home'&&this.attrs.get('data-composer-utility-bar-variant')==='home';
    if(selector==='[data-composer-body]')return this.attrs.has('data-composer-body');
    if(selector.includes('data-composer-rail-item'))return this.kind==='item'&&this.attrs.get('data-composer-rail-item')==='present'&&this.attrs.get('data-composer-placement')==='home';
    if(selector==='[data-composer-rail]')return this.kind==='rail';
    if(selector.includes('main:is'))return this.kind==='main';
    if(selector==='#root')return this.kind==='app';
    if(selector==='[data-app-shell-frame]'||selector==='[data-app-shell-frame="true"]')return this.kind==='frame'&&this.attrs.get('data-app-shell-frame')==='true';
    for(const attr of ['data-floating-chat-surface','data-right-panel-composer-overlay-content'])if(selector===`[${attr}="true"]`)return this.attrs.get(attr)==='true';
    if(selector==='[data-codex-composer-root]')return this.attrs.has('data-codex-composer-root');
    if(selector==='[hidden]'||selector==='[inert]')return this.attrs.has(selector.slice(1,-1));
    if(selector==='[aria-hidden="true"]')return this.attrs.get('aria-hidden')==='true';
    if(selector==='[data-app-shell-active-page="false"]')return this.attrs.get('data-app-shell-active-page')==='false';
    if(selector==='button'||selector==='a')return this.kind===selector;
    if(selector.startsWith('[role="'))return this.attrs.get('role')===selector.slice(7,-2)||this.kind==='popup'&&selector==='[role="menu"]';
    if(selector==='[data-composer-overlay-floating-ui]')return this.attrs.has('data-composer-overlay-floating-ui');
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
  const document=new Node('document'),app=new Node('app',{top:0,right:1000,bottom:700,left:0}),frame=new Node('frame',{top:0,right:1000,bottom:700,left:0}),main=new Node('main',{top:40,right:950,bottom:660,left:150}),home=new Node('home',{top:100,right:500,bottom:300,left:200});
  app.setAttribute('data-cc-mac-validated-surface','');frame.setAttribute('data-app-shell-frame','true');
  home.setAttribute('data-composer-utility-bar-variant','home');document.append(app);app.append(frame);frame.append(main);main.append(home);
  const slot=new Node('slot'),rail=new Node('rail',{top:64,right:508,bottom:124,left:192}),item=new Node('item',{top:64,right:508,bottom:104,left:192});
  item.setAttribute('data-composer-rail-item','present');item.setAttribute('data-composer-placement','home');home.append(slot);slot.append(rail);rail.append(item);
  const bodyWrapper=new Node('body-wrapper'),body=new Node('body');body.setAttribute('data-composer-body','');home.append(bodyWrapper);bodyWrapper.append(body);
  document.addEventListener=(name,fn)=>listeners.set(name,fn);document.removeEventListener=name=>listeners.delete(name);
  const host={document,innerWidth:1000,innerHeight:700,queueMicrotask:fn=>microtasks.push(fn),getComputedStyle:node=>({display:node.style.getPropertyValue('display')||'block',visibility:node.style.getPropertyValue('visibility')||'visible',opacity:node.style.getPropertyValue('opacity')||'1',position:node.style.getPropertyValue('position')||(node.kind==='home'?'relative':'static'),top:node.style.getPropertyValue('top')||'auto',right:node.style.getPropertyValue('right')||'auto',bottom:node.style.getPropertyValue('bottom')||'auto',left:node.style.getPropertyValue('left')||'auto',borderRadius:node.kind==='body'?'22px':'0px',cornerShape:'round',getPropertyValue:key=>node.style.getPropertyValue(key)}),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),MutationObserver:class{constructor(fn){this.fn=fn;allObservers.push(this);}observe(){this.connected=true;}disconnect(){this.connected=false;}},ResizeObserver:class{nodes=new Set();constructor(fn){this.fn=fn;resizeObservers.push(this);}observe(node){this.nodes.add(node);}unobserve(node){this.nodes.delete(node);}disconnect(){this.nodes.clear();this.disconnected=true;}}};
  host.__CC_MAC_SURFACE_POLICY__={validateRoot:(a,m)=>host.primaryAllowed!==false&&a===app&&m===main&&frame.kind==='frame'&&frame.getAttribute('data-app-shell-frame')==='true'&&app.contains(main)};
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

test('a copied or revoked scope marker cannot paint Home outside the validated main',()=>{
  const f=fixture(),api=createHomeMaterial(f.host);f.app.removeAttribute('data-cc-mac-validated-surface');api.update(true);
  assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);
  f.app.setAttribute('data-cc-mac-validated-surface','');api.refresh();assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),'');
  f.app.removeAttribute('data-cc-mac-validated-surface');f.allObservers[0].fn([{type:'attributes',attributeName:'data-cc-mac-validated-surface',target:f.app}]);f.flush();
  assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);assert.deepEqual(insets(f.home),{top:'',right:'',bottom:'',left:''});api.dispose();
});

test('offscreen or oversized rails never produce a giant blur plate and restore existing leases',()=>{
  for(const rect of [{top:-5000,right:508,bottom:124,left:192},{top:64,right:5000,bottom:124,left:192},{top:64,right:780,bottom:124,left:150},{top:42,right:508,bottom:650,left:192}]){
    const f=fixture(),api=createHomeMaterial(f.host);f.home.setAttribute('data-cc-mac-home-material-owner','prior');f.home.style.setProperty('--cc-home-material-top','2px','important');api.update(true);
    f.rail.rect=rect;api.refresh();assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),'prior');
    assert.equal(f.home.style.getPropertyValue('--cc-home-material-top'),'2px');assert.equal(f.home.style.getPropertyPriority('--cc-home-material-top'),'important');
    assert.equal(f.home.style.getPropertyValue('--cc-home-material-right'),'');api.dispose();
  }
});

test('extreme, zero and non-finite scale ratios fail closed while normal motion remains allowed',()=>{
  for(const scale of [.249,4.001,0,Infinity,NaN]){
    const f=fixture();f.home.offsetWidth=300*scale;f.home.offsetHeight=200;
    const api=createHomeMaterial(f.host);api.update(true);assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);api.dispose();
  }
  for(const scale of [.25,1,4]){
    const f=fixture();f.home.offsetWidth=300*scale;f.home.offsetHeight=200*scale;
    const api=createHomeMaterial(f.host);api.update(true);assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),'');api.dispose();
  }
});

test('Home root itself must remain within both main and validated app bounds',()=>{
  for(const rect of [{top:0,right:500,bottom:300,left:200},{top:100,right:1500,bottom:300,left:200},{top:100,right:200,bottom:300,left:500}]){
    const f=fixture();f.home.rect=rect;const api=createHomeMaterial(f.host);api.update(true);
    assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);api.dispose();
  }
});

test('a stale validated marker on an oversized viewport surface cannot bypass Home limits',()=>{
  const f=fixture(),api=createHomeMaterial(f.host);api.update(true);
  f.app.rect={left:0,top:0,right:2000,bottom:1500};f.main.rect={left:150,top:40,right:1900,bottom:1400};api.refresh();
  assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);assert.deepEqual(insets(f.home),{top:'',right:'',bottom:'',left:''});api.dispose();
});

function peerFixture({portal=true}={}){
  const f=fixture(),owner=new Node('owner',{top:64,right:508,bottom:300,left:192});
  f.home.children=f.home.children.filter(node=>node!==f.slot);f.slot.children=[];
  f.main.children=f.main.children.filter(node=>node!==f.home);owner.append(f.rail);owner.append(f.home);
  if(portal){
    const body=new Node('page-body'),layer=new Node('layer'),section=new Node('section'),floating=new Node('floating'),content=new Node('content');
    section.setAttribute('role','region');section.setAttribute('data-state','open');floating.setAttribute('data-floating-chat-surface','true');content.setAttribute('data-right-panel-composer-overlay-content','true');
    f.document.children=[];f.document.append(body);body.append(f.app);body.append(layer);layer.append(section);section.append(floating);floating.append(content);content.append(owner);f.document.body=body;
    Object.assign(f,{pageBody:body,layer,section,floating,content});
  }else{owner.setAttribute('data-codex-composer-root','');f.main.append(owner);}
  f.owner=owner;return f;
}

test('real body Portal peers use only their small common parent and Body radius, never the full layer',()=>{
  const f=peerFixture(),api=createHomeMaterial(f.host);api.update(true);
  assert.equal(f.owner.getAttribute('data-cc-mac-home-material-owner'),'');assert.equal(f.owner.getAttribute('data-cc-mac-home-material-surface'),'');
  assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);
  assert.equal(f.owner.style.getPropertyValue('--cc-home-material-radius'),'22px','native Root has zero radius while wrapped Body supplies 22px');
  assert.equal(f.owner.style.getPropertyValue('position'),'relative');assert.equal(f.owner.style.getPropertyValue('isolation'),'isolate');
  assert.deepEqual(insets(f.owner),{top:'0px',right:'0px',bottom:'0px',left:'0px'});
  for(const node of [f.pageBody,f.layer,f.section,f.floating,f.content,f.app,f.main])assert.equal(node.getAttribute('data-cc-mac-home-material-owner'),null);
  f.rail.rect={top:276,right:508,bottom:338,left:192};f.item.rect={top:300,right:508,bottom:338,left:192};api.refresh();assert.equal(insets(f.owner).bottom,'-38px');api.dispose();
});

test('a native widget inside the main supports peer rails without granting a Portal scope',()=>{
  const f=peerFixture({portal:false}),api=createHomeMaterial(f.host);api.update(true);
  assert.equal(f.owner.getAttribute('data-cc-mac-home-material-owner'),'');assert.equal(f.owner.getAttribute('data-cc-mac-home-material-surface'),null);
  assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);api.dispose();
});

test('Portal leases restore every attribute, priority and positioned-owner style on revoke or disable',()=>{
  for(const mode of ['revoke','disabled','removed','failed','dispose']){
    const f=peerFixture();f.owner.style.setProperty('isolation','auto','important');f.owner.style.setProperty('--cc-home-material-radius','9px','important');f.home.style.setProperty('--composer-border-radius','28px');f.home.style.setProperty('--composer-corner-shape','squircle');
    const api=createHomeMaterial(f.host);api.update(true);assert.equal(f.owner.style.getPropertyValue('--cc-home-material-radius'),'28px');assert.equal(f.owner.style.getPropertyValue('--cc-home-material-corner-shape'),'squircle');
    if(mode==='revoke'){f.app.removeAttribute('data-cc-mac-validated-surface');f.allObservers[0].fn([{type:'attributes',attributeName:'data-cc-mac-validated-surface',target:f.app}]);f.flush();}
    else if(mode==='dispose')api.dispose();else api.update(mode==='disabled'?false:{enabled:true,[mode==='removed'?'removed':'renderFailed']:true});
    assert.equal(f.owner.getAttribute('data-cc-mac-home-material-owner'),null);assert.equal(f.owner.getAttribute('data-cc-mac-home-material-surface'),null);
    assert.equal(f.owner.style.getPropertyValue('position'),'');assert.equal(f.owner.style.getPropertyValue('isolation'),'auto');assert.equal(f.owner.style.getPropertyPriority('isolation'),'important');
    assert.equal(f.owner.style.getPropertyValue('--cc-home-material-radius'),'9px');assert.equal(f.owner.style.getPropertyPriority('--cc-home-material-radius'),'important');
    assert.equal(f.owner.style.getPropertyValue('--cc-home-material-corner-shape'),'');assert.deepEqual(insets(f.owner),{top:'',right:'',bottom:'',left:''});api.dispose();
  }
});

test('Portal needs live primary authentication, both exact native anchors, and unambiguous Home ownership',()=>{
  for(const corrupt of [f=>f.host.primaryAllowed=false,f=>delete f.host.__CC_MAC_SURFACE_POLICY__,f=>f.content.removeAttribute('data-right-panel-composer-overlay-content'),f=>f.floating.removeAttribute('data-floating-chat-surface'),f=>f.app.removeAttribute('data-cc-mac-validated-surface'),f=>{const second=new Node('home',f.home.rect);second.setAttribute('data-composer-utility-bar-variant','home');f.owner.append(second);}]){
    const f=peerFixture();corrupt(f);const api=createHomeMaterial(f.host);api.update(true);assert.equal(f.owner.getAttribute('data-cc-mac-home-material-owner'),null);assert.equal(f.owner.getAttribute('data-cc-mac-home-material-surface'),null);api.dispose();
  }
});

test('Portal controls, hidden or exiting branches and inert ancestors never receive material markers',()=>{
  for(const corrupt of [f=>f.section.setAttribute('role','dialog'),f=>f.owner.setAttribute('role','button'),f=>f.floating.setAttribute('inert',''),f=>f.floating.setAttribute('aria-hidden','true'),f=>f.content.style.setProperty('display','none'),f=>f.owner.setAttribute('data-composer-overlay-floating-ui','')]){
    const f=peerFixture(),api=createHomeMaterial(f.host);api.update(true);corrupt(f);api.refresh();assert.equal(f.owner.getAttribute('data-cc-mac-home-material-owner'),null);assert.equal(f.owner.getAttribute('data-cc-mac-home-material-surface'),null);api.dispose();
  }
  const f=peerFixture(),api=createHomeMaterial(f.host);f.item.setAttribute('data-composer-rail-item','exiting');api.update(true);assert.equal(f.owner.getAttribute('data-cc-mac-home-material-owner'),null);api.dispose();
});

test('peer owner respects unchanged bounded geometry and cannot activate native static offsets',()=>{
  for(const corrupt of [f=>f.owner.rect={left:0,top:0,right:1000,bottom:700},f=>f.rail.rect={left:192,top:-3000,right:508,bottom:124},f=>f.item.rect={left:0,top:64,right:508,bottom:104},f=>f.home.offsetWidth=300*.249,f=>f.owner.offsetWidth=316*4.001,f=>f.owner.style.setProperty('left','12px')]){
    const f=peerFixture();corrupt(f);const api=createHomeMaterial(f.host);api.update(true);assert.equal(f.owner.getAttribute('data-cc-mac-home-material-owner'),null);assert.equal(f.owner.getAttribute('data-cc-mac-home-material-surface'),null);api.dispose();
  }
  const f=peerFixture();f.owner.style.setProperty('position','absolute','important');f.owner.style.setProperty('left','192px');const api=createHomeMaterial(f.host);api.update(true);
  assert.equal(f.owner.getAttribute('data-cc-mac-home-material-owner'),'');assert.equal(f.owner.style.getPropertyValue('position'),'absolute');assert.equal(f.owner.style.getPropertyPriority('position'),'important');api.dispose();
});

test('Portal observer coalesces resize and ignores its own marker and geometry leases',()=>{
  const f=peerFixture(),api=createHomeMaterial(f.host);api.update(true);const reads=f.home.reads,ro=f.resizeObservers[0];
  assert(ro.nodes.has(f.owner)&&ro.nodes.has(f.home)&&ro.nodes.has(f.rail));
  f.allObservers[0].fn([{type:'attributes',attributeName:'data-cc-mac-home-material-surface',target:f.owner},{type:'attributes',attributeName:'style',target:f.owner}]);f.flush();assert.equal(f.home.reads,reads);
  ro.fn();ro.fn();f.flush();assert.equal(f.home.reads,reads+1);api.dispose();assert(ro.disconnected);
});


test('nested Home roots and distinct Home branches in one native Portal content fail closed',()=>{
  for(const nested of [false,true]){
    const f=peerFixture(),second=new Node('home',f.home.rect);second.setAttribute('data-composer-utility-bar-variant','home');
    if(nested)f.home.append(second);else{const branch=new Node('branch',f.owner.rect);f.content.append(branch);branch.append(second);}
    const api=createHomeMaterial(f.host);api.update(true);assert.equal(f.owner.getAttribute('data-cc-mac-home-material-owner'),null);assert.equal(f.home.getAttribute('data-cc-mac-home-material-owner'),null);api.dispose();
  }
});


test('ancestor motion settles refresh the final Portal pose without per-frame transform scans',()=>{
  const f=peerFixture(),api=createHomeMaterial(f.host);api.update(true);const initialReads=f.home.reads;
  // A translate changes position, but not ResizeObserver's content-box size.
  f.floating.style.setProperty('transform','translateY(-100px)');f.owner.rect={left:192,top:-36,right:508,bottom:200};f.home.rect={left:200,top:0,right:500,bottom:200};f.rail.rect={left:192,top:-36,right:508,bottom:24};f.item.rect={left:192,top:-36,right:508,bottom:4};
  f.allObservers[0].fn([{type:'attributes',attributeName:'style',target:f.floating}]);f.flush();assert.equal(f.home.reads,initialReads,'intermediate transforms do not trigger geometry polling');
  f.listeners.get('transitionend')({target:f.floating});f.flush();assert.equal(f.owner.getAttribute('data-cc-mac-home-material-owner'),null);assert.equal(f.owner.getAttribute('data-cc-mac-home-material-surface'),null);
  const rejectedReads=f.home.reads;assert(f.resizeObservers[0].nodes.has(f.owner),'bounded native candidate remains tracked even while its final pose is rejected');
  f.owner.rect={left:192,top:64,right:508,bottom:300};f.home.rect={left:200,top:100,right:500,bottom:300};f.rail.rect={left:192,top:64,right:508,bottom:124};f.item.rect={left:192,top:64,right:508,bottom:104};
  f.listeners.get('animationend')({target:f.section});f.flush();assert.equal(f.home.reads,rejectedReads+1);assert.equal(f.owner.getAttribute('data-cc-mac-home-material-owner'),'');assert.equal(f.owner.getAttribute('data-cc-mac-home-material-surface'),'');
  const restoredReads=f.home.reads,unrelated=new Node('unrelated');f.listeners.get('animationend')({target:unrelated});f.listeners.get('animationend')({target:f.pageBody});f.flush();assert.equal(f.home.reads,restoredReads,'unrelated or whole-body events do not scan the document');
  api.dispose();
});

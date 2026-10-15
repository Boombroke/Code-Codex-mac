import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createFrameRuntime} from '../scripts/frame-runtime.mjs';

// Exercise the shipped controller functions, not a second lifecycle model.
const source=await fs.readFile(new URL('../controller.js',import.meta.url),'utf8');
const methods=source.slice(source.indexOf('  function rendererFailure('),source.indexOf('  ui=window.__CC_MAC_APPEARANCE_UI__'));
assert(methods.includes('function mount()')&&methods.includes('function setMedia('));
const disposal=source.slice(source.indexOf('  function dispose() {'),source.indexOf('  function revokeSurface('));
assert(disposal.includes('frameRuntime?.dispose()'));
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function harness(){
  const transactions=[],reads=[],databases=[],messages=[],shown=[],revoked=[],instances=[],playbacks=[],openRequests=[];
  let throwMethod,failLoad=false,lateDuringDispose=false,customOpen;
  let nativeID=0,time=0;const nativeQueue=new Map(),runtime=createFrameRuntime({requestAnimationFrame(callback){nativeQueue.set(++nativeID,callback);return nativeID;},cancelAnimationFrame(id){nativeQueue.delete(id);}});
  const setPaused=runtime.setPaused.bind(runtime);runtime.setPaused=value=>{runtime.paused=value;setPaused(value);};
  class Renderer{
    constructor(layer,canvas,settings,onError){if(throwMethod==='constructor')throw Error('constructor failed');this.onError=onError;instances.push(this);}
    setSettings(){if(throwMethod==='settings')throw Error('settings failed');if(throwMethod==='reported'){this.onError('recoverable interruption');}}
    updateSettings(){if(throwMethod==='update')throw Error('update failed');}
    replay(){if(throwMethod==='replay')throw Error('replay failed');}
    dispose(){this.disposals=(this.disposals||0)+1;if(lateDuringDispose)this.onError('late disposed renderer');if(throwMethod==='dispose')throw Error('dispose failed');}
  }
  const context=vm.createContext({AbortController,Promise,Error,console,URL:{createObjectURL:file=>'blob:'+file.name,revokeObjectURL:url=>revoked.push(url)},
    window:{__CC_MAC_LOAD_BACKGROUND__(){if(failLoad)throw Error('module failed');return {exports:{Renderer}};}},
    indexedDB:{open(){const request={};openRequests.push(request);return request;}},
    document:{hidden:false,createElement(tag){return {tagName:tag.toUpperCase(),style:{},events:new Map(),addEventListener(name,callback){this.events.set(name,callback);},removeAttribute(name){delete this[name];},pause(){this.pauses=(this.pauses||0)+1;},play(){const pending=deferred();playbacks.push(pending);return pending.promise;}};}},
    layer:{children:[],append(node){this.children.push(node);if(['IMG','VIDEO'].includes(node.tagName))shown.push(node.src);},replaceChildren(){this.children=[];},querySelector(){return null;}},
    frameRuntime:runtime,
    databases,transactions,reads,messages,instances,
  });
  vm.runInContext(`
    let renderer,rendererMount,rendererUpdating=false,canvas,media,mediaURL,mediaFile,displayedMediaFile,disposed=false,mountRevision=0,mediaSelectionRevision=0,mediaPlayRevision=0,renderFailed=false;
    let surface={},config={effect:'shader',enabled:true,paused:false,settings:{}},catalog={effects:[{id:'shader',name:'Shader',ctor:'Renderer'}]},registrations=new Map([['shader',{}]]),reduced={matches:false},background={dataset:{}},abort=new AbortController(),presentations=[],persists=0;
    const settings=()=>config.settings[config.effect]||{},normalized=(effect,values)=>values;
    const applyPresentation=()=>presentations.push(renderFailed),applyRenderPolicy=()=>{},status=message=>messages.push(message),persist=()=>persists++;
    ${methods}
    const originalMediaDB=mediaDB;
    globalThis.api={mount,refreshMotion,replayRenderer,releaseRenderer,setMedia,selectMedia,restoreMedia,originalMediaDB,
      setOpen(callback){mediaDB=callback;},effect(value){config.effect=value;},pause(){config.paused=true;},disable(){config.enabled=false;},finish(){disposed=true;++mountRevision;releaseRenderer();},
      state(){return {renderer,rendererMount,renderFailed,mountRevision,selection:mediaSelectionRevision,media,mediaFile,mediaURL,disposed,presentations:[...presentations],persists};}};
  `,context);
  const makeDB=()=>{
    const db={closed:0,close(){this.closed++;},transaction(store,mode){const tx={error:Error('transaction failed'),objectStore(){return {put(file){tx.file=file;},get(){const request={error:Error('read failed')};reads.push(request);return request;}};}};if(mode==='readwrite')transactions.push(tx);return tx;}};
    databases.push(db);return db;
  };
  context.api.setOpen(()=>customOpen?customOpen():Promise.resolve(makeDB()));
  return {api:context.api,context,nativeQueue,tick(){const callbacks=[...nativeQueue.values()];nativeQueue.clear();time+=17;for(const callback of callbacks)callback(time);},transactions,reads,databases,messages,shown,revoked,instances,playbacks,openRequests,makeDB,
    throwing(value){throwMethod=value;},failLoad(value=true){failLoad=value;},lateDispose(value=true){lateDuringDispose=value;},openWith(callback){customOpen=callback;}};
}
const image=name=>({name,type:'image/png',size:12});
const video=name=>({name,type:'video/mp4',size:12});

for(const method of ['constructor','settings','update','replay'])test('current renderer '+method+' failure restores native presentation and clears local resources',()=>{
  const h=harness();if(method==='constructor')h.throwing(method);h.api.mount();
  if(method!=='constructor'){h.throwing(method);assert.doesNotThrow(()=>method==='replay'?h.api.replayRenderer():h.api.refreshMotion());}
  const state=h.api.state();assert.equal(state.renderFailed,true);assert.equal(state.renderer,undefined);assert.equal(state.rendererMount,undefined);assert.equal(h.context.frameRuntime.onError,undefined);assert.equal(h.context.frameRuntime.paused,true);assert.equal(h.context.layer.children.length,0);assert.equal(state.presentations.at(-1),true);assert.match(h.messages.at(-1),/已恢复原生外观/);
});

test('lazy module failure is caught by the same renderer boundary',()=>{
  const h=harness();h.failLoad();assert.doesNotThrow(()=>h.api.mount());assert.equal(h.api.state().renderFailed,true);assert.equal(h.context.layer.children.length,0);
});

test('old vendor reports, old frame hooks and teardown reports cannot fail a replacement mount',()=>{
  const h=harness();h.api.mount();const old=h.instances[0],oldFrameError=h.context.frameRuntime.onError;
  h.lateDispose();h.throwing('dispose');assert.doesNotThrow(()=>h.api.mount());
  const current=h.api.state().renderer;assert.notEqual(current,old);assert.equal(old.disposals,1);assert.equal(h.api.state().renderFailed,false);
  old.onError('late report');oldFrameError(Error('late frame'));assert.equal(h.api.state().renderer,current);assert.equal(h.api.state().renderFailed,false);
  h.throwing(undefined);h.api.finish();old.onError('late after disposal');oldFrameError(Error('late after disposal'));assert.equal(h.api.state().renderer,undefined);
});

test('current frame hook fails only its active mount and cleanup cannot escape even when dispose throws',()=>{
  const h=harness();h.api.mount();const hook=h.context.frameRuntime.onError;h.throwing('dispose');assert.doesNotThrow(()=>hook(Error('draw failed')));
  assert.equal(h.instances[0].disposals,1);assert.equal(h.api.state().renderFailed,true);assert.equal(h.context.layer.children.length,0);
});

test('a synchronously reported settings interruption cannot recurse through refreshMotion',()=>{
  const h=harness();h.api.mount();h.throwing('reported');assert.doesNotThrow(()=>h.api.refreshMotion());assert.equal(h.api.state().renderFailed,true);assert.equal(h.instances[0].disposals,undefined);
  h.throwing(undefined);h.instances[0].onError(undefined);assert.equal(h.api.state().renderFailed,false);
});

test('performance remount of newest pending media cannot be overwritten by an older successful save',async()=>{
  const h=harness(),a=image('A'),b=image('B');h.api.effect('media');
  const savingA=h.api.setMedia(a,true);await flush();const savingB=h.api.setMedia(b,true);await flush();
  assert.equal(h.transactions.length,2);await h.api.setMedia(b,false);assert.deepEqual(h.shown,['blob:B']);
  h.transactions[0].oncomplete();await savingA;assert.deepEqual(h.shown,['blob:B']);assert.equal(h.api.state().mediaFile,b);
  h.transactions[1].oncomplete();await savingB;assert.deepEqual(h.shown,['blob:B'],'saving the already displayed newest file does not restart its animation');assert(h.databases.every(db=>db.closed===1));
});

test('a stale database open never writes over the newest saved media and still closes',async()=>{
  const h=harness(),openingA=deferred(),openingB=deferred();let calls=0;h.openWith(()=>++calls===1?openingA.promise:openingB.promise);h.api.effect('media');
  const savingA=h.api.setMedia(image('A')),savingB=h.api.setMedia(image('B'));const dbB=h.makeDB();openingB.resolve(dbB);await flush();assert.equal(h.transactions.length,1);h.transactions[0].oncomplete();await savingB;
  const dbA=h.makeDB();openingA.resolve(dbA);await savingA;assert.equal(h.transactions.length,1);assert.deepEqual(h.shown,['blob:B']);assert.equal(dbA.closed,1);assert.equal(dbB.closed,1);
});

test('write failure or abort closes its database; stale selection errors never overwrite the current notice',async()=>{
  for(const event of ['onerror','onabort']){
    const h=harness();h.api.selectMedia(image('A'));await flush();h.api.selectMedia(image('B'));await flush();
    h.transactions[1].oncomplete();await flush();const notice=h.messages.at(-1);h.transactions[0][event]();await flush();assert.equal(h.messages.at(-1),notice);assert.deepEqual(h.shown,['blob:B']);assert(h.databases.every(db=>db.closed===1));
  }
});

test('read failure and stale read completion close databases without resurrecting prior media',async()=>{
  const h=harness();h.api.effect('media');h.api.mount();await flush();assert.equal(h.reads.length,1);
  h.api.selectMedia(image('B'));await flush();h.transactions[0].oncomplete();await flush();const notice=h.messages.at(-1);
  h.reads[0].onerror();await flush();assert.equal(h.messages.at(-1),notice);assert.deepEqual(h.shown,['blob:B']);assert(h.databases.every(db=>db.closed===1));
  const second=harness();second.api.effect('media');second.api.mount();await flush();second.api.finish();second.reads[0].result=image('old');second.reads[0].onsuccess();await flush();assert.deepEqual(second.shown,[]);assert.equal(second.databases[0].closed,1);
});

test('old media decode events and play rejections cannot overwrite a newer mount or disposed UI',async()=>{
  const h=harness();h.api.effect('media');await h.api.setMedia(video('A'),false);const old=h.api.state().media,oldPlayback=h.playbacks[0];
  h.api.mount();await flush();const current=h.api.state().media;assert.notEqual(current,old);const notice=h.messages.at(-1);
  old.events.get('error')();oldPlayback.reject(Error('interrupted playback'));await flush();assert.equal(h.messages.at(-1),notice);
  h.api.finish();const afterDisposal=h.messages.at(-1);current.events.get('error')();h.playbacks.at(-1).reject(Error('late playback'));await flush();assert.equal(h.messages.at(-1),afterDisposal);assert.equal(h.api.state().mediaURL,undefined);assert(h.revoked.length>=2);
});

test('a blocked IndexedDB request which succeeds later closes the now-unowned connection',async()=>{
  const h=harness(),opening=h.api.originalMediaDB();const rejection=assert.rejects(opening,/媒体库被其他窗口占用/),request=h.openRequests[0];request.onblocked();await rejection;const db=h.makeDB();request.result=db;request.onsuccess();assert.equal(db.closed,1);
});


test('teardown cancels only its owned decorative callbacks even if vendor disposal throws',()=>{
  const h=harness();h.api.mount();let oldFrames=0,newFrames=0;
  h.context.frameRuntime.requestAnimationFrame(()=>oldFrames++);const oldOwner=h.api.state().rendererMount;
  h.throwing('dispose');h.api.mount();assert.notEqual(h.api.state().rendererMount,oldOwner);
  h.context.frameRuntime.requestAnimationFrame(()=>newFrames++);h.tick();assert.equal(oldFrames,0);assert.equal(newFrames,1);h.api.finish();
});

test('current failing draw cannot retain a self-rescheduled GPU callback when disposal also throws',()=>{
  const h=harness();h.api.mount();let staleFrames=0;h.throwing('dispose');
  h.context.frameRuntime.requestAnimationFrame(()=>{h.context.frameRuntime.requestAnimationFrame(()=>staleFrames++);throw Error('draw failed');});
  assert.doesNotThrow(()=>h.tick());assert.equal(h.api.state().renderFailed,true);assert.equal(h.context.frameRuntime.stats.pending,0);assert.equal(h.nativeQueue.size,0);h.tick();assert.equal(staleFrames,0);
});

test('full controller disposal finishes runtime, observers and prepaint cleanup after earlier cleanup throws',()=>{
  const calls=[];let api;
  const context=vm.createContext({calls,window:{},cancelAnimationFrame(){calls.push('cancelRAF');},clearTimeout(){calls.push('clearTimeout');},
    frameRuntime:{dispose(){calls.push('runtime');}},style:{remove(){calls.push('style');}},
    ui:{close(){calls.push('UI');throw Error('UI close failed');}},abort:{abort(){calls.push('abort');}},
    themeObserver:{disconnect(){calls.push('theme observer');}},layoutObserver:{disconnect(){calls.push('layout observer');}},resizeObserver:{disconnect(){calls.push('resize observer');}},
    background:{remove(){calls.push('background');}},controls:{remove(){calls.push('controls');}},
  });
  vm.runInContext(`let disposed=false,reconcileFrame=1,reconcileTimer=2,themeLeases=new Map([['node',{}]]);const API='__CCMacBackground__';
    function detachSurface(){calls.push('detach');throw Error('detach failed');}function releaseRenderer(){calls.push('release');}function restoreThemeVars(){calls.push('theme vars');}
    ${disposal}
    window.__CCMacPrepaint__={dispose(){calls.push('prepaint');}};window[API]={dispose};globalThis.dispose=dispose;`,context);
  assert.doesNotThrow(()=>context.dispose());for(const action of ['UI','abort','theme observer','layout observer','cancelRAF','clearTimeout','detach','release','resize observer','background','controls','theme vars','runtime','style','prepaint'])assert(calls.includes(action),'cleanup '+action);
  assert.equal(context.window.__CCMacBackground__,undefined);const count=calls.length;context.dispose();assert.equal(calls.length,count);
});


test('selecting valid media recovers a previously failed shader without retaining its failure gate',async()=>{
  const h=harness();h.throwing('constructor');h.api.mount();assert.equal(h.api.state().renderFailed,true);
  h.api.effect('media');await h.api.setMedia(image('recovery'),false);assert.equal(h.api.state().renderFailed,false);assert.equal(h.api.state().presentations.at(-1),false);assert.deepEqual(h.shown,['blob:recovery']);
});

test('an intentionally paused video ignores the rejection of its prior play request',async()=>{
  const h=harness();h.api.effect('media');await h.api.setMedia(video('A'),false);const previous=h.playbacks.at(-1);
  h.api.pause();h.api.refreshMotion();const notice=h.messages.at(-1);previous.reject(Error('play aborted by pause'));await flush();assert.equal(h.messages.at(-1),notice);assert.match(notice,/已暂停/);
});

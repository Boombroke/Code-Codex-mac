import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createLaunchPreferences,launchPreferencesScript} from '../scripts/launch-preferences.mjs';
const effects=['black-hole','glow-horizon','mountain','blinking-squares'];
function runSeed({href='app://-/index.html',meta,iframe=false,values=new Map()}={}) {
  const calls={reads:0,writes:0,observers:0,listeners:0,styles:0};
  const document={querySelector(selector){return selector==='meta[name="initial-route"]'&&meta!==undefined?{getAttribute:()=>meta}:null;},createElement(){calls.styles++;throw Error('Launch seeding must not create style or renderer nodes');}};
  const host={document,location:{href},MutationObserver:class{constructor(){calls.observers++;throw Error('Launch seeding must not register observers');}},addEventListener(){calls.listeners++;throw Error('Launch seeding must not register listeners');},removeEventListener(){}};
  host.self=host;host.top=iframe?{}:host;
  const localStorage={getItem(key){calls.reads++;return values.get(key);},setItem(key,value){calls.writes++;values.set(key,value);}};
  const result=new vm.Script(launchPreferencesScript(effects)).runInNewContext({window:host,localStorage,URL});
  return {result,calls,values,host};
}
test('one-click launch enables a default background with readable local materials',()=>{
  const result=createLaunchPreferences(undefined,effects);
  assert.equal(result.effect,'black-hole');assert.equal(result.enabled,true);assert.equal(result.removed,false);
  assert.equal(result.composerTransparency,75);assert.equal(result.transparency,100);
});
test('launch resumes the selected effect while preserving its settings and materials',()=>{
  const previous={layoutVersion:4,effect:'mountain',enabled:false,removed:true,paused:true,composerTransparency:80,transparency:70,settings:{mountain:{paused:true,speed:2},'black-hole':{speed:3}}};
  const snapshot=structuredClone(previous),result=createLaunchPreferences(previous,effects);
  assert.equal(result.effect,'mountain');assert.equal(result.enabled,true);assert.equal(result.paused,false);
  assert.equal(result.settings.mountain.paused,false);assert.equal(result.settings.mountain.speed,2);
  assert.equal(result.composerTransparency,80);assert.equal(result.transparency,70);assert.deepEqual(previous,snapshot);
});
test('missing public effects fall back safely and older layout settings migrate',()=>{
  const result=createLaunchPreferences({effect:'aurora-ionosphere',layoutVersion:1,transparency:40,blur:20},effects);
  assert.equal(result.effect,'black-hole');assert.equal(result.layoutVersion,4);assert.equal(result.blur,0);
  assert.equal(createLaunchPreferences({effect:'aurora-ionosphere'},[...effects,'aurora-ionosphere']).effect,'aurora-ionosphere');
});
test('the emitted native launch script updates only the adapter preference key',()=>{
  const values=new Map([['account-secret','unchanged'],['code-codex-mac-backgrounds:v1','invalid json']]);
  const result=runSeed({values});
  assert.equal(result.result,true);
  assert.deepEqual(result.calls,{reads:1,writes:1,observers:0,listeners:0,styles:0});
  assert.equal(values.get('account-secret'),'unchanged');
  assert.equal(JSON.parse(values.get('code-codex-mac-backgrounds:v1')).enabled,true);
});

test('auxiliary routes and iframe contexts cannot consume launch seeding or inspect preferences',()=>{
  const previous='{"enabled":false,"removed":true,"effect":"mountain"}';
  for(const route of ['/avatar-overlay','/spotlight','/screen-overlay','/hotkey-window','/global-dictation','/detached-window']) {
    const result=runSeed({href:'app://-/index.html?initialRoute='+encodeURIComponent(route),values:new Map([['code-codex-mac-backgrounds:v1',previous]])});
    assert.equal(result.result,false,route);
    assert.deepEqual(result.calls,{reads:0,writes:0,observers:0,listeners:0,styles:0});
    assert.equal(result.values.get('code-codex-mac-backgrounds:v1'),previous);
    assert.equal(result.host.__CC_MAC_SURFACE_POLICY__,undefined);
  }
  const framed=runSeed({iframe:true});assert.equal(framed.result,false);assert.equal(framed.calls.reads+framed.calls.writes,0);
});

test('auxiliary or conflicting metadata rejects launch seeding before preference access',()=>{
  for(const options of [{meta:'/avatar-overlay'},{meta:'/screen-overlay'},{href:'app://-/index.html?initialRoute=%2Fsettings',meta:'/'}]) {
    const result=runSeed(options);assert.equal(result.result,false);
    assert.deepEqual(result.calls,{reads:0,writes:0,observers:0,listeners:0,styles:0});
  }
});

test('malformed or noncanonical page URLs cannot update launch preferences',()=>{
  for(const href of ['app://%2D/index.html','app://-/index.html?initialRoute=','app://-/index.html?%69nitialRoute=%2F','app://-/index.html?initialRoute=%GG','app://-/index.html?initialRoute=%2F&initialRoute=%2Fsettings','app://-/index.html?windowType=primary','app://-/index.html#','app://-/index.html ','app://-:123/index.html']) {
    const result=runSeed({href});assert.equal(result.result,false,href);
    assert.equal(result.calls.reads+result.calls.writes+result.calls.observers+result.calls.listeners+result.calls.styles,0);
  }
});

test('a rejected candidate leaves the later eligible main page free to receive the launch seed',()=>{
  const values=new Map([['code-codex-mac-backgrounds:v1',JSON.stringify({layoutVersion:4,effect:'mountain',enabled:false,composerTransparency:75})]]);
  const rejected=runSeed({meta:'/avatar-overlay',values});assert.equal(rejected.result,false);
  const eligible=runSeed({href:'app://-/index.html?initialRoute=%2Flocal%2Fthread-123',values});
  assert.equal(eligible.result,true);
  const saved=JSON.parse(values.get('code-codex-mac-backgrounds:v1'));
  assert.equal(saved.effect,'mountain');assert.equal(saved.enabled,true);assert.equal(saved.composerTransparency,75);
  assert.deepEqual(eligible.calls,{reads:1,writes:1,observers:0,listeners:0,styles:0});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createLaunchPreferences,launchPreferencesScript} from '../scripts/launch-preferences.mjs';
const effects=['black-hole','glow-horizon','mountain','blinking-squares'];
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
  new vm.Script(launchPreferencesScript(effects)).runInNewContext({localStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}});
  assert.equal(values.get('account-secret'),'unchanged');
  assert.equal(JSON.parse(values.get('code-codex-mac-backgrounds:v1')).enabled,true);
});

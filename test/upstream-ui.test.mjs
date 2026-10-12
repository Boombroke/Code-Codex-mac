import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {payload} from '../scripts/payload.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('upstream panels have matching renderer keys and numeric bounds',async()=>{
  const context={window:{}};
  vm.runInNewContext(await fs.readFile(path.join(root,'vendor/upstream-appearance-ui.js'),'utf8'),context);
  const ui=context.window.__CC_MAC_UPSTREAM_UI__;
  const catalog=JSON.parse(await fs.readFile(path.join(root,'catalog.json'),'utf8'));
  assert.equal(ui.effects.length,catalog.effects.length);
  for(const effect of ui.effects){
    const renderer=catalog.effects.find(entry=>entry.id===effect.id);
    assert(renderer);
    assert(effect.card.includes('data-appearance-plugin="'+effect.pluginId+'"'));
    assert(effect.panel.includes('popover="manual"'));
    for(const definition of ui.definitions[effect.id]){
      const [key,min,max,step]=Array.isArray(definition)?[definition[0],definition[3],definition[4],definition[5]]:[definition.key,definition.minimum,definition.maximum,definition.step];
      const control=renderer.controls.find(entry=>entry.key===key);
      assert(control,effect.id+' missing '+key);
      assert.deepEqual([control.minimum,control.maximum,control.step],[min,max,step],effect.id+' '+key);
    }
  }
});

test('a modified appearance UI cannot be injected',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'cc-mac-ui-integrity-'));
  try {
    await fs.mkdir(path.join(temp,'vendor'));
    const catalog=JSON.parse(await fs.readFile(path.join(root,'catalog.json'),'utf8'));
    catalog.effects=catalog.effects.slice(0,1);
    await fs.writeFile(path.join(temp,'catalog.json'),JSON.stringify(catalog));
    await fs.copyFile(path.join(root,catalog.effects[0].script),path.join(temp,catalog.effects[0].script));
    await fs.copyFile(path.join(root,'upstream-ui-provenance.json'),path.join(temp,'upstream-ui-provenance.json'));
    await fs.writeFile(path.join(temp,'vendor/upstream-appearance-ui.js'),'unexpected appearance script');
    await assert.rejects(payload(temp),/Appearance UI integrity/);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});

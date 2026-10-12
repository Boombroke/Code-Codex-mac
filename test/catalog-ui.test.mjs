import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {payload} from '../scripts/payload.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
async function fixture(run){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'cc-mac-catalog-ui-'));
  try{
    await fs.copyFile(path.join(root,'catalog.json'),path.join(temp,'catalog.json'));
    await fs.cp(path.join(root,'vendor'),path.join(temp,'vendor'),{recursive:true});
    await fs.copyFile(path.join(root,'upstream-ui-provenance.json'),path.join(temp,'upstream-ui-provenance.json'));
    await run(temp);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
}
async function changeUI(temp,code){
  const script=await fs.readFile(path.join(temp,'vendor/upstream-appearance-ui.js'),'utf8')+'\n'+code;
  const metadata=JSON.parse(await fs.readFile(path.join(temp,'upstream-ui-provenance.json'),'utf8'));
  metadata.size=Buffer.byteLength(script);metadata.sha256=createHash('sha256').update(script).digest('hex');
  await fs.writeFile(path.join(temp,'vendor/upstream-appearance-ui.js'),script);
  await fs.writeFile(path.join(temp,'upstream-ui-provenance.json'),JSON.stringify(metadata));
}
test('a valid UI hash cannot hide missing, different, or duplicate choices',async t=>{
  for(const [name,code] of [
    ['missing card','window.__CC_MAC_UPSTREAM_UI__.effects.pop();'],
    ['same count with different ID','window.__CC_MAC_UPSTREAM_UI__.effects[0].id="unknown-effect";'],
    ['duplicate ID','window.__CC_MAC_UPSTREAM_UI__.effects[1].id=window.__CC_MAC_UPSTREAM_UI__.effects[0].id;'],
    ['missing panel','window.__CC_MAC_UPSTREAM_UI__.effects[0].panel="";'],
  ])await t.test(name,()=>fixture(async temp=>{
    await changeUI(temp,code);
    await assert.rejects(payload(root,temp),/catalog do not match|settings panel is missing/);
  }));
});
test('missing or tampered asset-root UI cannot silently fall back to public UI',async t=>{
  for(const [name,mutate] of [
    ['metadata absent',temp=>fs.rm(path.join(temp,'upstream-ui-provenance.json'))],
    ['script absent',temp=>fs.rm(path.join(temp,'vendor/upstream-appearance-ui.js'))],
    ['script tampered',temp=>fs.appendFile(path.join(temp,'vendor/upstream-appearance-ui.js'),'\nchanged')],
  ])await t.test(name,()=>fixture(async temp=>{
    await mutate(temp);
    await assert.rejects(payload(root,temp),/ENOENT|integrity check failed/);
  }));
});

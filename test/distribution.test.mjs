import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {payload} from '../scripts/payload.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('public catalog and shipped assets exclude unverified shader packages',async()=>{
  const catalog=JSON.parse(await fs.readFile(path.join(root,'catalog.json'),'utf8'));
  assert.deepEqual(new Set(catalog.effects.map(effect=>effect.id)),new Set(['black-hole','glow-horizon','mountain','blinking-squares']));
  const files=await fs.readdir(path.join(root,'vendor'));
  for(const id of ['aurora-ionosphere','heavenly-cloud','cloud-train','milky-way'])assert(!files.includes(id+'.js'));
  new vm.Script(await payload(root));
});
test('public manager bundle has a verified single-file renderer',async()=>{
  const renderer=await payload(root);assert(renderer.includes("__CC_MAC_MATERIALS__"));assert(renderer.includes("effect:'black-hole'"));
});
test('a separate asset root supplies its own matching UI while integration stays current',async()=>{
  const temp=await fs.mkdtemp(path.join((await import('node:os')).tmpdir(),'code-codex-assets-'));
  try{
    const catalog=JSON.parse(await fs.readFile(path.join(root,'catalog.json'),'utf8'));
    catalog.effects=catalog.effects.slice(0,3);
    await fs.writeFile(path.join(temp,'catalog.json'),JSON.stringify(catalog));
    await fs.cp(path.join(root,'vendor'),path.join(temp,'vendor'),{recursive:true});
    const ids=catalog.effects.map(effect=>effect.id);
    const script=await fs.readFile(path.join(root,'vendor/upstream-appearance-ui.js'),'utf8')+'\nwindow.__CC_MAC_UPSTREAM_UI__.effects=window.__CC_MAC_UPSTREAM_UI__.effects.filter(effect=>'+JSON.stringify(ids)+'.includes(effect.id));\n// separate-asset-root-UI-proof';
    const metadata=JSON.parse(await fs.readFile(path.join(root,'upstream-ui-provenance.json'),'utf8'));
    metadata.size=Buffer.byteLength(script);metadata.sha256=(await import('node:crypto')).createHash('sha256').update(script).digest('hex');
    await fs.writeFile(path.join(temp,'vendor/upstream-appearance-ui.js'),script);
    await fs.writeFile(path.join(temp,'upstream-ui-provenance.json'),JSON.stringify(metadata));
    await fs.writeFile(path.join(temp,'controller.js'),'throw Error("old asset controller must not load");');
    const result=await payload(root,temp);
    assert(result.includes(script));
    assert(result.includes(await fs.readFile(path.join(root,'controller.js'),'utf8')));
    assert(!result.includes('old asset controller must not load'));
    assert(result.includes('__CC_MAC_CONTRAST__'));new vm.Script(result);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});

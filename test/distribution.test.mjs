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

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pruneLog} from '../scripts/log-budget.mjs';
test('log rotation retains a recent tail and existing append descriptors work',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cc-log-'));
  const file=path.join(dir,'host.log');
  try{
    await fs.writeFile(file,'old entries\n'+'x'.repeat(1000)+'new entries\n');
    const app=await fs.open(file,'a');
    await pruneLog(file,64);assert.equal((await fs.stat(file)).size,64);
    assert((await fs.readFile(file,'utf8')).endsWith('new entries\n'));
    await app.write('still appending\n');await app.close();
    assert((await fs.readFile(file,'utf8')).endsWith('still appending\n'));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

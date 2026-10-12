import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {archiveFilename,compareVersions,commitOutputs,pruneArchives} from '../scripts/build-output.mjs';

const product='org.codecodex.mac.manager',channel='public-core';
const metadata=(version,kind=channel,bundleID=product)=>({bundleID,version,channel:kind});
const validateArchive=async file=>JSON.parse(await fs.readFile(file,'utf8')).metadata;
const validateApp=async file=>JSON.parse(await fs.readFile(path.join(file,'metadata.json'),'utf8'));
async function writeArchive(file,version,kind=channel,bundleID=product,payload='old archive') {
  await fs.writeFile(file,JSON.stringify({metadata:metadata(version,kind,bundleID),payload}));
}
async function writeApp(file,version,payload) {
  await fs.mkdir(file,{recursive:true});
  await fs.writeFile(path.join(file,'metadata.json'),JSON.stringify(metadata(version)));
  await fs.writeFile(path.join(file,'payload'),payload);
}
async function fixture(t,{previous='1.0.0-rc.6',version='1.0.0-rc.7'}={}) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'code-codex-output-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const dist=path.join(directory,'dist'),artifacts=path.join(directory,'artifacts');
  const stageDirectory=path.join(artifacts,'build-test.noindex');
  await fs.mkdir(dist,{recursive:true});await fs.mkdir(stageDirectory,{recursive:true});
  const app=path.join(artifacts,'Code-Codex Mac.app'),stagedApp=path.join(stageDirectory,'Code-Codex Mac.app');
  const archive=path.join(dist,archiveFilename(version)),oldArchive=path.join(dist,archiveFilename(previous));
  const checksums=path.join(dist,'SHA256SUMS'),stagedArchive=path.join(stageDirectory,archiveFilename(version)),stagedChecksums=path.join(stageDirectory,'SHA256SUMS');
  await writeApp(app,previous,'old app');await writeApp(stagedApp,version,'new app');
  await writeArchive(oldArchive,previous);await writeArchive(stagedArchive,version,channel,product,'new archive');
  await fs.writeFile(checksums,'old checksum content\n');
  const hash=createHash('sha256').update(await fs.readFile(stagedArchive)).digest('hex');
  await fs.writeFile(stagedChecksums,hash+'  '+path.basename(archive)+'\n');
  const options={stageDirectory,stagedApp,stagedArchive,stagedChecksums,app,archive,checksums,version,channel,validateArchive,validateApp};
  return {directory,dist,oldArchive,...options,options};
}

test('publication replaces the app and checksum before pruning only older owned archives',async t=>{
  const value=await fixture(t);
  await commitOutputs(value.options);
  assert.equal(await fs.readFile(path.join(value.app,'payload'),'utf8'),'new app');
  assert.equal((await validateArchive(value.archive)).version,value.version);
  const content=await fs.readFile(value.archive),hash=createHash('sha256').update(content).digest('hex');
  assert.equal(await fs.readFile(value.checksums,'utf8'),hash+'  '+path.basename(value.archive)+'\n');
  assert((await fs.stat(value.oldArchive)).isFile(),'old ZIP stays available until publication is complete');
  const result=await pruneArchives({directory:value.dist,version:value.version,channel,validateArchive});
  assert.deepEqual(result.removed,[value.oldArchive]);
  assert.deepEqual(result.retained,[value.archive]);
  await assert.rejects(fs.stat(value.oldArchive),{code:'ENOENT'});
  await assert.rejects(fs.stat(path.join(path.dirname(value.app),'.build-output-lock')),{code:'ENOENT'});
});

test('a failure during backup or any promotion restores the previous app, ZIP and checksum',async t=>{
  for(const failAt of [1,4,6])await t.test('rename operation '+failAt,async t=>{
    const value=await fixture(t,{version:'1.0.0-rc.6'});
    const archiveBefore=await fs.readFile(value.archive),checksumBefore=await fs.readFile(value.checksums),appBefore=await fs.readFile(path.join(value.app,'payload'));
    let calls=0;
    const rename=async(from,to)=>{if(++calls===failAt)throw Error('simulated output move failure');await fs.rename(from,to);};
    await assert.rejects(commitOutputs({...value.options,rename}),/simulated output move failure/);
    assert.deepEqual(await fs.readFile(value.archive),archiveBefore);
    assert.deepEqual(await fs.readFile(value.checksums),checksumBefore);
    assert.deepEqual(await fs.readFile(path.join(value.app,'payload')),appBefore);
    assert.deepEqual((await fs.readdir(value.stageDirectory)).filter(name=>name.startsWith('.previous-')),[]);
  });
});

test('an invalid candidate cannot disturb any existing build output',async t=>{
  const value=await fixture(t);
  const before=await fs.readFile(value.oldArchive);
  await fs.writeFile(value.stagedChecksums,'wrong checksum\n');
  await assert.rejects(commitOutputs(value.options),/checksum does not match/);
  assert.deepEqual(await fs.readFile(value.oldArchive),before);
  assert.equal(await fs.readFile(path.join(value.app,'payload'),'utf8'),'old app');
  assert.equal(await fs.readFile(value.checksums,'utf8'),'old checksum content\n');
  await assert.rejects(fs.stat(value.archive),{code:'ENOENT'});
});

test('pruning preserves foreign archives, other channels, symlinks, directories and newer versions',async t=>{
  const value=await fixture(t);
  await commitOutputs(value.options);
  const preserved=[
    ['foreign.zip','foreign bytes'],
    [archiveFilename('0.9.0'),'not even a ZIP or valid metadata'],
    ['Code-Codex-Mac-1.0.0-rc.00-arm64.zip','invalid SemVer'],
    ['Code-Codex-Mac-0.8.0-arm64.zip.backup','foreign backup'],
  ];
  for(const [name,content] of preserved)await fs.writeFile(path.join(value.dist,name),content);
  const personal=path.join(value.dist,archiveFilename('1.0.0-rc.5'));await writeArchive(personal,'1.0.0-rc.5','personal-local');
  const foreignProduct=path.join(value.dist,archiveFilename('1.0.0-rc.4'));await writeArchive(foreignProduct,'1.0.0-rc.4',channel,'org.other.app');
  const future=path.join(value.dist,archiveFilename('1.0.0-rc.9'));await writeArchive(future,'1.0.0-rc.9');
  const symlink=path.join(value.dist,archiveFilename('1.0.0-rc.3'));await fs.symlink(value.archive,symlink);
  const directory=path.join(value.dist,archiveFilename('1.0.0-rc.2'));await fs.mkdir(directory);
  const anotherChannel=path.join(value.directory,'private-dist');await fs.mkdir(anotherChannel);const anotherArchive=path.join(anotherChannel,archiveFilename('1.0.0-rc.1'));await writeArchive(anotherArchive,'1.0.0-rc.1','personal-local');
  const result=await pruneArchives({directory:value.dist,version:value.version,channel,validateArchive});
  assert.deepEqual(result.removed,[value.oldArchive]);
  for(const [name,content] of preserved)assert.equal(await fs.readFile(path.join(value.dist,name),'utf8'),content);
  assert.equal((await validateArchive(personal)).channel,'personal-local');
  assert.equal((await validateArchive(foreignProduct)).bundleID,'org.other.app');
  assert.equal((await validateArchive(future)).version,'1.0.0-rc.9');
  assert((await fs.lstat(symlink)).isSymbolicLink());assert((await fs.lstat(directory)).isDirectory());
  assert.equal((await validateArchive(anotherArchive)).channel,'personal-local');
});

test('a newer owned archive prevents downgrade before any stable output moves',async t=>{
  const value=await fixture(t);
  const future=path.join(value.dist,archiveFilename('1.0.0-rc.10'));await writeArchive(future,'1.0.0-rc.10');
  await assert.rejects(commitOutputs(value.options),/Refusing to replace newer build output/);
  assert.equal(await fs.readFile(path.join(value.app,'payload'),'utf8'),'old app');
  assert.equal(await fs.readFile(value.checksums,'utf8'),'old checksum content\n');
  assert.equal((await validateArchive(value.oldArchive)).version,'1.0.0-rc.6');
  assert.equal((await validateArchive(future)).version,'1.0.0-rc.10');
  assert((await fs.stat(value.stagedApp)).isDirectory());
  await assert.rejects(fs.stat(value.archive),{code:'ENOENT'});
});

test('a foreign file at the intended ZIP name cannot be overwritten',async t=>{
  const value=await fixture(t);
  await writeArchive(value.archive,value.version,'personal-local');
  const before=await fs.readFile(value.archive);
  await assert.rejects(commitOutputs(value.options),/another product or channel/);
  assert.deepEqual(await fs.readFile(value.archive),before);
  assert.equal(await fs.readFile(path.join(value.app,'payload'),'utf8'),'old app');
});

test('a newer stable app prevents downgrade even without a matching newer ZIP',async t=>{
  const value=await fixture(t);
  await writeApp(value.app,'1.0.0-rc.10','newer app');
  await assert.rejects(commitOutputs(value.options),/Refusing to replace newer app output/);
  assert.equal(await fs.readFile(path.join(value.app,'payload'),'utf8'),'newer app');
  assert.equal(await fs.readFile(value.checksums,'utf8'),'old checksum content\n');
  await assert.rejects(fs.stat(value.archive),{code:'ENOENT'});
});

test('a rollback failure retains the only previous app copy for recovery',async t=>{
  const value=await fixture(t,{version:'1.0.0-rc.6'});
  const previousApp=path.join(value.stageDirectory,'.previous-app');
  const archiveBefore=await fs.readFile(value.archive),checksumBefore=await fs.readFile(value.checksums);
  const rename=async(from,to)=>{
    if(from===value.stagedArchive)throw Error('simulated archive promotion failure');
    if(from===previousApp)throw Error('simulated app rollback failure');
    await fs.rename(from,to);
  };
  await assert.rejects(commitOutputs({...value.options,rename}),error=>error instanceof AggregateError&&error.preserveStage===true);
  assert.equal(await fs.readFile(path.join(previousApp,'payload'),'utf8'),'old app');
  assert.deepEqual(await fs.readFile(value.archive),archiveBefore);
  assert.deepEqual(await fs.readFile(value.checksums),checksumBefore);
});

test('backup cleanup failure reports success and preserves the remaining backup',async t=>{
  const value=await fixture(t,{version:'1.0.0-rc.6'});
  const previousApp=path.join(value.stageDirectory,'.previous-app');
  const remove=async(file,options)=>{if(file===previousApp)throw Error('simulated backup cleanup failure');await fs.rm(file,options);};
  const result=await commitOutputs({...value.options,remove});
  assert.equal(result.preserveStage,true);
  assert.equal(result.warnings.length,1);
  assert.match(result.warnings[0],/simulated backup cleanup failure/);
  assert.equal(await fs.readFile(path.join(value.app,'payload'),'utf8'),'new app');
  assert.equal(await fs.readFile(path.join(previousApp,'payload'),'utf8'),'old app');
  const archive=await fs.readFile(value.archive);
  assert.equal(JSON.parse(archive).payload,'new archive');
  assert.equal(await fs.readFile(value.checksums,'utf8'),createHash('sha256').update(archive).digest('hex')+'  '+path.basename(value.archive)+'\n');
  await assert.rejects(fs.stat(path.join(path.dirname(value.app),'.build-output-lock')),{code:'ENOENT'});
});

test('lock release failure cannot turn valid publication into a build failure',async t=>{
  const value=await fixture(t);
  const result=await commitOutputs({...value.options,rmdir:async()=>{throw Error('simulated lock release failure');}});
  assert.equal(result.preserveStage,false);
  assert.equal(result.warnings.length,1);
  assert.match(result.warnings[0],/simulated lock release failure/);
  assert.equal(await fs.readFile(path.join(value.app,'payload'),'utf8'),'new app');
  assert.equal((await validateArchive(value.archive)).version,value.version);
  const archive=await fs.readFile(value.archive);
  assert.equal(await fs.readFile(value.checksums,'utf8'),createHash('sha256').update(archive).digest('hex')+'  '+path.basename(value.archive)+'\n');
  assert((await fs.stat(path.join(path.dirname(value.app),'.build-output-lock'))).isDirectory());
  assert.deepEqual((await fs.readdir(value.stageDirectory)).filter(name=>name.startsWith('.previous-')),[]);
});

test('lock cleanup failure does not mask rollback failure or its recovery directory',async t=>{
  const value=await fixture(t,{version:'1.0.0-rc.6'});
  const previousApp=path.join(value.stageDirectory,'.previous-app');
  const archiveBefore=await fs.readFile(value.archive),checksumBefore=await fs.readFile(value.checksums);
  const rename=async(from,to)=>{
    if(from===value.stagedArchive)throw Error('simulated archive promotion failure');
    if(from===previousApp)throw Error('simulated app rollback failure');
    await fs.rename(from,to);
  };
  await assert.rejects(commitOutputs({...value.options,rename,rmdir:async()=>{throw Error('simulated lock cleanup failure');}}),error=>{
    assert(error instanceof AggregateError);
    assert.equal(error.preserveStage,true);
    assert.match(error.errors[0].message,/archive promotion failure/);
    assert.match(error.errors[1].message,/app rollback failure/);
    assert.match(error.cleanupWarnings[0],/lock cleanup failure/);
    return true;
  });
  assert.equal(await fs.readFile(path.join(previousApp,'payload'),'utf8'),'old app');
  assert.deepEqual(await fs.readFile(value.archive),archiveBefore);
  assert.deepEqual(await fs.readFile(value.checksums),checksumBefore);
});

test('release comparison treats numeric prereleases and stable versions correctly',()=>{
  assert(compareVersions('1.0.0-rc.10','1.0.0-rc.6')>0);
  assert(compareVersions('1.0.0','1.0.0-rc.999')>0);
  assert(compareVersions('1.0.1-rc.1','1.0.0')>0);
  assert(compareVersions('1.0.0-alpha.1','1.0.0-beta')<0);
  assert.equal(compareVersions('1.0.0-rc.6','1.0.0-rc.6'),0);
  for(const version of ['01.0.0','1.0','1.0.0-rc.01','1.0.0/other','../1.0.0'])assert.throws(()=>archiveFilename(version),/Invalid release version/);
});

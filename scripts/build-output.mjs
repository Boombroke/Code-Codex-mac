import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const productID='org.codecodex.mac.manager';
const channels=new Set(['public-core','personal-local']);
function parseVersion(value) {
  const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if(!match)throw Error('Invalid release version: '+value);
  const prerelease=match[4]?.split('.')||[];
  if(prerelease.some(part=>/^\d+$/.test(part)&&part.length>1&&part[0]==='0'))throw Error('Invalid release version: '+value);
  return {core:match.slice(1,4).map(BigInt),prerelease};
}

export function compareVersions(first,second) {
  const a=parseVersion(first),b=parseVersion(second);
  for(let index=0;index<3;index++)if(a.core[index]!==b.core[index])return a.core[index]>b.core[index]?1:-1;
  if(!a.prerelease.length||!b.prerelease.length)return a.prerelease.length===b.prerelease.length?0:a.prerelease.length?-1:1;
  for(let index=0;index<Math.max(a.prerelease.length,b.prerelease.length);index++) {
    const left=a.prerelease[index],right=b.prerelease[index];
    if(left===undefined||right===undefined)return left===right?0:left===undefined?-1:1;
    if(left===right)continue;
    const numericLeft=/^\d+$/.test(left),numericRight=/^\d+$/.test(right);
    if(numericLeft&&numericRight)return BigInt(left)>BigInt(right)?1:-1;
    if(numericLeft!==numericRight)return numericLeft?-1:1;
    return left>right?1:-1;
  }
  return 0;
}

export function archiveFilename(version) {
  parseVersion(version);
  return `Code-Codex-Mac-${version}-arm64.zip`;
}

function namedVersion(name) {
  const match=/^Code-Codex-Mac-(.+)-arm64\.zip$/.exec(name);
  if(!match)return;
  try {parseVersion(match[1]);return match[1];}catch{return;}
}
async function statIfPresent(file) {
  try{return await fs.lstat(file);}catch(error){if(error.code==='ENOENT')return;throw error;}
}
function matchingMetadata(metadata,version,channel) {
  return metadata?.bundleID===productID&&metadata.version===version&&metadata.channel===channel;
}
async function ownedArchives(directory,channel,validateArchive) {
  if(!channels.has(channel))throw Error('Unknown build channel');
  const result=[];
  for(const name of await fs.readdir(directory)) {
    const version=namedVersion(name),file=path.join(directory,name);
    if(!version||(await fs.lstat(file)).isFile()===false)continue;
    // lstat excludes symbolic links, even when they point to a valid ZIP.
    let metadata;try{metadata=await validateArchive(file);}catch{continue;}
    if(matchingMetadata(metadata,version,channel))result.push({file,version});
  }
  return result;
}

export async function pruneArchives({directory,version,channel,validateArchive}) {
  parseVersion(version);
  const removed=[],retained=[];
  for(const entry of await ownedArchives(directory,channel,validateArchive)) {
    if(compareVersions(entry.version,version)>=0){retained.push(entry.file);continue;}
    // Re-check after metadata inspection; never follow a substituted symlink.
    if(!(await fs.lstat(entry.file)).isFile())continue;
    await fs.unlink(entry.file);removed.push(entry.file);
  }
  return {removed,retained};
}

export async function commitOutputs({stageDirectory,stagedApp,stagedArchive,stagedChecksums,app,archive,checksums,version,channel,validateArchive,validateApp,rename=fs.rename,remove=fs.rm,rmdir=fs.rmdir}) {
  parseVersion(version);
  if(!channels.has(channel))throw Error('Unknown build channel');
  const stage=path.resolve(stageDirectory);
  for(const file of [stagedApp,stagedArchive,stagedChecksums])if(path.dirname(path.resolve(file))!==stage)throw Error('Output is outside this build staging directory');
  if(path.basename(archive)!==archiveFilename(version)||path.dirname(archive)!==path.dirname(checksums)||path.basename(checksums)!=='SHA256SUMS')throw Error('Invalid final output paths');
  if(!(await fs.lstat(stagedApp)).isDirectory()||!(await fs.lstat(stagedArchive)).isFile()||!(await fs.lstat(stagedChecksums)).isFile())throw Error('Invalid staged outputs');
  if(!matchingMetadata(await validateArchive(stagedArchive),version,channel))throw Error('Staged archive identity, version or channel does not match');
  if(validateApp&&!matchingMetadata(await validateApp(stagedApp),version,channel))throw Error('Staged app identity, version or channel does not match');
  const expected=createHash('sha256').update(await fs.readFile(stagedArchive)).digest('hex')+'  '+path.basename(archive)+'\n';
  if(await fs.readFile(stagedChecksums,'utf8')!==expected)throw Error('Staged checksum does not match archive');
  await fs.mkdir(path.dirname(app),{recursive:true});
  await fs.mkdir(path.dirname(archive),{recursive:true});
  const lock=path.join(path.dirname(app),'.build-output-lock');
  await fs.mkdir(lock);
  const entries=[
    {source:stagedApp,target:app,backup:path.join(stage,'.previous-app'),directory:true},
    {source:stagedArchive,target:archive,backup:path.join(stage,'.previous-archive')},
    {source:stagedChecksums,target:checksums,backup:path.join(stage,'.previous-checksums')},
  ];
  const warnings=[];
  let preserveStage=false,errorInFlight;
  try {
    const owned=await ownedArchives(path.dirname(archive),channel,validateArchive);
    const newer=owned.find(entry=>compareVersions(entry.version,version)>0);
    if(newer)throw Error('Refusing to replace newer build output: '+path.basename(newer.file));
    for(const entry of entries) {
      const stat=await statIfPresent(entry.target);
      if(!stat)continue;
      if(entry.directory?!stat.isDirectory():!stat.isFile())throw Error('Final output belongs to a symbolic link or other file type: '+entry.target);
      if(entry.target===archive&&!matchingMetadata(await validateArchive(archive),version,channel))throw Error('Final archive belongs to another product or channel');
      if(entry.directory&&validateApp) {
        const metadata=await validateApp(app);
        if(metadata?.bundleID!==productID||metadata.channel!==channel)throw Error('Final app belongs to another product or channel');
        if(compareVersions(metadata.version,version)>0)throw Error('Refusing to replace newer app output');
      }
    }
    try {
      for(const entry of entries)if(await statIfPresent(entry.target)){await rename(entry.target,entry.backup);entry.backedUp=true;}
      for(const entry of entries){await rename(entry.source,entry.target);entry.published=true;}
    }catch(error) {
      const rollbackErrors=[];
      for(const entry of [...entries].reverse()) {
        try {
          if(entry.published)await remove(entry.target,{recursive:!!entry.directory,force:true});
          if(entry.backedUp)await rename(entry.backup,entry.target);
        }catch(rollbackError){rollbackErrors.push(rollbackError);}
      }
      if(rollbackErrors.length) {
        const failure=new AggregateError([error,...rollbackErrors],'Output rollback failed; previous artifacts remain in '+stage);
        failure.preserveStage=true;throw failure;
      }
      throw error;
    }
    // Publication has succeeded. Backups are now redundant; historical ZIPs
    // are pruned separately so a cleanup failure cannot invalidate new output.
    for(const entry of entries)if(entry.backedUp) {
      try{await remove(entry.backup,{recursive:!!entry.directory,force:true});}
      catch(error){preserveStage=true;warnings.push('Previous output cleanup failed at '+entry.backup+': '+error.message);}
    }
    return {app,archive,checksums,warnings,preserveStage};
  }catch(error){errorInFlight=error;throw error;}
  finally {
    try{await rmdir(lock);}
    catch(error) {
      const warning='Output lock cleanup failed at '+lock+': '+error.message;
      warnings.push(warning);
      // Never hide a publication/rollback error or its preserveStage flag.
      if(errorInFlight&&typeof errorInFlight==='object')try{errorInFlight.cleanupWarnings=[...(errorInFlight.cleanupWarnings||[]),warning];}catch{}
    }
  }
}

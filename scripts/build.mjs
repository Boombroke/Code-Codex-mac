import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {payload} from './payload.mjs';
import {launchPreferencesScript} from './launch-preferences.mjs';
import {archiveFilename,commitOutputs,pruneArchives} from './build-output.mjs';
import {privacyDescriptionPlist} from './privacy-descriptions.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const bundleVersion=/^(\d+\.\d+\.\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version)?.[1];
if(!bundleVersion)throw Error('Invalid release version');
const localSource=process.argv.find(arg=>arg.startsWith('--runtime-source='))?.slice(17);
const dist=path.join(root,localSource?'private/dist':'dist');
const channel=localSource?'personal-local':'public-core';
// Keep compiler/install test bundles out of Spotlight's application results.
const channelDirectory=path.join(root,'.build/artifacts.noindex',localSource?'personal':'public');
const stableApp=path.join(channelDirectory,'Code-Codex Mac.app');
const stage=path.join(channelDirectory,'build-'+randomUUID()+'.noindex');
const app=path.join(stage,'Code-Codex Mac.app');
const archive=path.join(dist,archiveFilename(version));
const stagedArchive=path.join(stage,path.basename(archive));
const stagedChecksums=path.join(stage,'SHA256SUMS');

const metadataOptions={encoding:'utf8',timeout:10_000,maxBuffer:64*1024};
function plistMetadata(plist,channelData) {
  const info=JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-','-'],{...metadataOptions,input:plist}));
  const data=JSON.parse(channelData);
  return {bundleID:info.CFBundleIdentifier,version:info.CodeCodexVersion,channel:data.channel};
}
function validateArchive(file) {
  const plist=execFileSync('/usr/bin/unzip',['-p',file,'Code-Codex Mac.app/Contents/Info.plist'],metadataOptions);
  const channelData=execFileSync('/usr/bin/unzip',['-p',file,'Code-Codex Mac.app/Contents/Resources/channel.json'],metadataOptions);
  return plistMetadata(plist,channelData);
}
async function validateApp(file) {
  const plist=path.join(file,'Contents/Info.plist'),channelFile=path.join(file,'Contents/Resources/channel.json');
  for(const entry of [plist,channelFile])if((await fs.stat(entry)).size>64*1024)throw Error('App metadata exceeds size limit');
  return plistMetadata(await fs.readFile(plist),await fs.readFile(channelFile,'utf8'));
}

await fs.mkdir(dist,{recursive:true});
await fs.mkdir(stage,{recursive:true});
let preserveStage=false;
try {
await fs.mkdir(path.join(app,'Contents/MacOS'),{recursive:true});
await fs.mkdir(path.join(app,'Contents/Resources'),{recursive:true});
const renderer=Buffer.from(await payload(root,localSource?path.resolve(localSource):root));
await fs.writeFile(path.join(app,'Contents/Resources/renderer.js'),renderer);
await fs.writeFile(path.join(app,'Contents/Resources/renderer.sha256'),createHash('sha256').update(renderer).digest('hex')+'\n');
const catalog=JSON.parse(await fs.readFile(path.join(localSource?path.resolve(localSource):root,'catalog.json'),'utf8'));
const effectIDs=catalog.effects.map(effect=>effect.id),launch=Buffer.from(launchPreferencesScript(effectIDs));
await fs.writeFile(path.join(app,'Contents/Resources/launch.js'),launch);
await fs.writeFile(path.join(app,'Contents/Resources/launch.sha256'),createHash('sha256').update(launch).digest('hex')+'\n');
await fs.writeFile(path.join(app,'Contents/Resources/channel.json'),JSON.stringify({channel,effects:effectIDs.length,effectIDs})+'\n');
for(const name of ['LICENSE','THIRD_PARTY_NOTICES_EN.md','THIRD_PARTY_NOTICES_ZH_CN.md','THIRD_PARTY_LICENSES.md'])await fs.copyFile(path.join(root,name),path.join(app,'Contents/Resources',name));
const plugin=path.join(app,'Contents/Resources/Plugin');
await fs.mkdir(plugin,{recursive:true});
for(const name of ['plugin.json','README.md','VERIFICATION.md','CHANGELOG.md','SECURITY.md','LICENSE','LICENSE_STATUS.md','THIRD_PARTY_NOTICES_EN.md','THIRD_PARTY_NOTICES_ZH_CN.md','THIRD_PARTY_LICENSES.md'])await fs.copyFile(path.join(root,name),path.join(plugin,name));
for(const folder of ['skills','.agents','assets'])await fs.cp(path.join(root,folder),path.join(plugin,folder),{recursive:true});
const privacyPolicy=JSON.parse(await fs.readFile(path.join(root,'resources/privacy-descriptions.json'),'utf8'));
const privacyXML=privacyDescriptionPlist(privacyPolicy);
await fs.writeFile(path.join(app,'Contents/Resources/privacy-descriptions.json'),JSON.stringify(privacyPolicy)+'\n');
const info=`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>Code-Codex Mac</string><key>CFBundleDisplayName</key><string>Code-Codex Mac</string><key>CFBundleIdentifier</key><string>org.codecodex.mac.manager</string><key>CFBundleExecutable</key><string>Code-Codex Mac</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>13.0</string>${privacyXML}<key>NSHighResolutionCapable</key><true/><key>NSPrincipalClass</key><string>NSApplication</string></dict></plist>`;
await fs.writeFile(path.join(app,'Contents/Info.plist'),info.replace(`<key>CFBundleShortVersionString</key><string>${version}</string>`,`<key>CFBundleShortVersionString</key><string>${bundleVersion}</string><key>CodeCodexVersion</key><string>${version}</string>`).replace('<key>CFBundleDisplayName</key><string>Code-Codex Mac</string>','<key>CFBundleDisplayName</key><string>GPT 动态背景</string>').replace('<key>CFBundleVersion</key><string>1</string>',`<key>CFBundleVersion</key><string>${Number(/-rc\.(\d+)$/.exec(version)?.[1]||1)}</string>`).replace('</dict></plist>','<key>CFBundleIconFile</key><string>Manager.icns</string><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>'));
const iconTool=path.join(stage,'make-icon'),icons=path.join(stage,'Manager.iconset');
execFileSync('/usr/bin/swiftc',['-O',path.join(root,'native/Icon.swift'),'-o',iconTool],{stdio:'inherit'});
execFileSync(iconTool,[icons],{stdio:'inherit'});
execFileSync('/usr/bin/iconutil',['-c','icns',icons,'-o',path.join(app,'Contents/Resources/Manager.icns')],{stdio:'inherit'});
execFileSync('/usr/bin/swiftc',['-swift-version','5','-target','arm64-apple-macosx13.0','-O',...['main.swift','Manager.swift','Dock.swift','LaunchPolicy.swift','InstallIdentity.swift','Installation.swift','PrivacyPolicy.swift'].map(name=>path.join(root,'native',name)),'-o',path.join(app,'Contents/MacOS/Code-Codex Mac')],{stdio:'inherit'});
execFileSync(path.join(app,'Contents/MacOS/Code-Codex Mac'),['--self-test'],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(root,'scripts/test-native-protocol.mjs'),path.join(app,'Contents/MacOS/Code-Codex Mac')],{stdio:'inherit'});
const identity=process.env.CODE_CODEX_SIGN_IDENTITY||'-';
execFileSync('/usr/bin/codesign',['--force','--sign',identity,...(identity==='-'?[]:['--options','runtime','--timestamp']),app],{stdio:'inherit'});
execFileSync('/usr/bin/codesign',['--verify','--strict',app],{stdio:'inherit'});
execFileSync('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',app,stagedArchive],{stdio:'inherit'});
execFileSync('/usr/bin/unzip',['-tqq',stagedArchive],{stdio:'inherit',timeout:30_000});
await fs.writeFile(stagedChecksums,createHash('sha256').update(await fs.readFile(stagedArchive)).digest('hex')+'  '+path.basename(archive)+'\n');
const publication=await commitOutputs({stageDirectory:stage,stagedApp:app,stagedArchive,stagedChecksums,app:stableApp,archive,checksums:path.join(dist,'SHA256SUMS'),version,channel,validateArchive,validateApp});
preserveStage=publication.preserveStage;
for(const warning of publication.warnings)console.warn('New output is valid; '+warning);
let cleanup;
try{cleanup=await pruneArchives({directory:dist,version,channel,validateArchive});}
catch(error){console.warn('New output is valid; older archive cleanup was not completed: '+error.message);}
console.log(JSON.stringify({app:stableApp,archive,version,channel,signing:identity==='-'?'ad-hoc; not notarized':'Developer ID; notarization pending',rendererBytes:renderer.length,removedArchives:cleanup?.removed.map(file=>path.basename(file))||[],cleanupWarnings:publication.warnings,preservedStage:preserveStage?stage:undefined},null,2));
}catch(error){preserveStage=preserveStage||!!error.preserveStage;for(const warning of error.cleanupWarnings||[])console.warn(warning);throw error;}
finally{if(!preserveStage)try{await fs.rm(stage,{recursive:true,force:true});}catch(error){console.warn('Build staging cleanup was not completed at '+stage+': '+error.message);}}

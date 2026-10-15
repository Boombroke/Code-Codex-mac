import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validatePrivacyDescriptions,privacyDescriptionPlist} from '../scripts/privacy-descriptions.mjs';
const policy=JSON.parse(await fs.readFile(new URL('../resources/privacy-descriptions.json',import.meta.url),'utf8'));
test('the launcher covers the current host privacy resource families without granting access',()=>{
  const descriptions=validatePrivacyDescriptions(policy);
  for(const key of ['NSMicrophoneUsageDescription','NSCameraUsageDescription','NSAudioCaptureUsageDescription','NSAppleEventsUsageDescription','NSCalendarsUsageDescription','NSCalendarsFullAccessUsageDescription','NSRemindersUsageDescription','NSRemindersFullAccessUsageDescription','NSLocationUsageDescription','NSDesktopFolderUsageDescription'])assert(descriptions[key]?.trim());
  const copy=validatePrivacyDescriptions(policy);copy.NSMicrophoneUsageDescription='changed';assert.notEqual(policy.descriptions.NSMicrophoneUsageDescription,'changed');
});
test('purpose strings survive XML metacharacters rather than becoming plist markup',()=>{
  const xml=privacyDescriptionPlist({schemaVersion:1,descriptions:{NSCameraUsageDescription:'A & B <camera> "ask" \'consent\''}});
  assert.equal(xml,'<key>NSCameraUsageDescription</key><string>A &amp; B &lt;camera&gt; &quot;ask&quot; &apos;consent&apos;</string>');
});
test('missing, blank, non-string or non-purpose entries cannot enter a release',()=>{
  for(const descriptions of [{},[],{NSCameraUsageDescription:''},{NSCameraUsageDescription:'  \n'},{NSCameraUsageDescription:true},{NSCameraUsageDescription:'x'.repeat(1025)},{'com.apple.security.device.camera':'true'},{NSCameraUsageDescription:'ok',arbitrary:'no'}])assert.throws(()=>validatePrivacyDescriptions({schemaVersion:1,descriptions}));
  assert.throws(()=>validatePrivacyDescriptions({schemaVersion:2,descriptions:policy.descriptions}));
});

// Purpose strings describe the verified host app's existing features. They do
// not request access, set entitlements, or alter any macOS consent decision.
export function validatePrivacyDescriptions(policy) {
  if(policy?.schemaVersion!==1||!policy.descriptions||typeof policy.descriptions!=='object'||Array.isArray(policy.descriptions))throw Error('Invalid privacy description policy');
  const entries=Object.entries(policy.descriptions);
  if(!entries.length||entries.length>64)throw Error('Invalid privacy description count');
  for(const [key,value]of entries)if(!/^NS[A-Za-z]+UsageDescription$/.test(key)||typeof value!=='string'||!value.trim()||value.length>1024)throw Error('Invalid privacy description: '+key);
  return Object.fromEntries(entries);
}
export function privacyDescriptionPlist(policy) {
  const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
  return Object.entries(validatePrivacyDescriptions(policy)).map(([key,value])=>'<key>'+escape(key)+'</key><string>'+escape(value)+'</string>').join('');
}

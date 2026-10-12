export function createLaunchPreferences(saved, effectIDs, fallback='black-hole') {
  const previous=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};
  const next={...previous,enabled:true,removed:false,paused:false,layoutVersion:4};
  if(previous.layoutVersion!==4)Object.assign(next,{transparency:100,backgroundOpacity:100,tone:'auto',blur:0});
  next.effect=effectIDs.includes(previous.effect)||previous.effect==='media'?previous.effect:fallback;
  next.settings=previous.settings&&typeof previous.settings==='object'&&!Array.isArray(previous.settings)?{...previous.settings}:{};
  next.settings[next.effect]={...next.settings[next.effect],paused:false};
  next.composerTransparency=previous.composerTransparency??75;
  next.codeTransparency=previous.codeTransparency??60;
  next.codeStyle=previous.codeStyle??'frosted';
  next.materialVersion=1;
  return next;
}

export function launchPreferencesScript(effectIDs) {
  if(!effectIDs.includes('black-hole'))throw Error('Missing fallback effect');
  return `(()=>{const k='code-codex-mac-backgrounds:v1';let saved;try{saved=JSON.parse(localStorage.getItem(k)||'{}')}catch{}const next=(${createLaunchPreferences.toString()})(saved,${JSON.stringify(effectIDs)});localStorage.setItem(k,JSON.stringify(next));})()`;
}

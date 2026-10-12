import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createFrameRuntime} from './frame-runtime.mjs';
import {createTheme,clearConversationMasks} from './theme-model.mjs';
import {createAppearanceUI} from './appearance-ui.mjs';
import {createRenderPolicy} from './render-policy.mjs';
import {createMaterials} from './material-model.mjs';
import {createContrastModel} from './contrast-model.mjs';
import {createControlContrast} from './control-contrast.mjs';
export async function payload(root, assetRoot=root) {
  const catalog=JSON.parse(await fs.readFile(path.join(assetRoot,'catalog.json'),'utf8'));
  const scripts=[],loaders=[];
  for(const effect of catalog.effects) {
    if(!/^vendor\/[a-z-]+\.js$/.test(effect.script))throw Error('Invalid background path');
    const bytes=await fs.readFile(path.join(assetRoot,effect.script));
    if(bytes.length!==effect.size||createHash('sha256').update(bytes).digest('hex')!==effect.sha256)throw Error('Background integrity check failed: '+effect.id);
    let rendererCode=bytes.toString('utf8');
    if(['cloud-train','mountain','milky-way'].includes(effect.id)){
      // These pinned renderers read a bare DPI identifier in their render-size
      // calculation. Bind only that calculation; native resolution media queries
      // still track the real display. Never replace the app's global DPI property.
      const token='Math.min(devicePixelRatio||1,';
      if(rendererCode.split(token).length!==2)throw Error('Pinned DPI binding no longer matches: '+effect.id);
      rendererCode=rendererCode.replace(token,'Math.min(window.devicePixelRatio||1,');
    }
    loaders.push(`[${JSON.stringify(effect.id)},()=>{const requestAnimationFrame=frameRuntime.requestAnimationFrame;const cancelAnimationFrame=frameRuntime.cancelAnimationFrame;const bindings=new Map();const window=new Proxy(hostWindow,{get(target,key){if(key==='devicePixelRatio')return frameRuntime.renderDpr;if(key==='requestAnimationFrame')return requestAnimationFrame;if(key==='cancelAnimationFrame')return cancelAnimationFrame;const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;if(!bindings.has(key))bindings.set(key,value.bind(target));return bindings.get(key);}});\n${rendererCode}\n}]`);
  }
  scripts.unshift('window.__CC_MAC_CATALOG__='+JSON.stringify(catalog)+';window.__CC_MAC_THEME__='+createTheme.toString()+';window.__CC_MAC_CLEAR_CONVERSATION_MASKS__='+clearConversationMasks.toString()+';window.__CC_MAC_RENDER_POLICY__='+createRenderPolicy.toString()+';window.__CC_MAC_MATERIALS__='+createMaterials.toString()+';window.__CC_MAC_CONTRAST__='+createContrastModel.toString()+';window.__CC_MAC_CONTROL_CONTRAST__='+createControlContrast.toString()+';');
  scripts.push(`const loaders=new Map([${loaders.join(',')}]);const modules=hostWindow[Symbol.for('code-codex:background-modules:v1')]??(hostWindow[Symbol.for('code-codex:background-modules:v1')]=new Map());hostWindow.__CC_MAC_LOAD_BACKGROUND__=id=>{if(!modules.has(id)){const load=loaders.get(id);if(!load)throw Error('Unknown background');load();}return modules.get(id);};`);
  const ui=JSON.parse(await fs.readFile(path.join(root,'upstream-ui-provenance.json'),'utf8'));
  if(ui.script!=='vendor/upstream-appearance-ui.js'||ui.commit!==catalog.commit)throw Error('UI and rendering sources do not match');
  const uiBytes=await fs.readFile(path.join(root,ui.script));
  if(uiBytes.length!==ui.size||createHash('sha256').update(uiBytes).digest('hex')!==ui.sha256)throw Error('Appearance UI integrity check failed');
  scripts.push(uiBytes.toString('utf8'),'window.__CC_MAC_APPEARANCE_UI__='+createAppearanceUI.toString()+';');
  scripts.push(await fs.readFile(path.join(root,'controller.js'),'utf8'));
  return `(() => { const boot=()=>{const hostWindow=window;window.__CCMacBackground__?.dispose();const frameRuntime=(${createFrameRuntime.toString()})(hostWindow);hostWindow[Symbol.for('code-codex-mac:frames:v1')]=frameRuntime;\n${scripts.join('\n;\n')}\n}; if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();})();`;
}

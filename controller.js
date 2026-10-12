/* macOS adapter. Upstream rendering code remains in separately pinned vendor packages. */
(() => {
  'use strict';
  const API = '__CCMacBackground__';
  window[API]?.dispose();
  const catalog = window.__CC_MAC_CATALOG__;
  if (!catalog?.effects?.length) throw Error('Background catalog is missing');
  const ownKey = 'code-codex-mac-backgrounds:v1';
  const blank = {enabled:false,opacityEnabled:true,opacity:{},language:'zh',performance:'balanced',composerTransparency:75,codeTransparency:60,codeStyle:'frosted',layoutVersion:4,effect:'black-hole',transparency:100,backgroundOpacity:100,tone:'auto',blur:0,paused:false,settings:{}};
  let config;
  try { const saved=JSON.parse(localStorage.getItem(ownKey)||'{}');config = {...blank,...saved};if(![2,3,4].includes(saved.layoutVersion))config.enabled=false;if(saved.layoutVersion!==4){config.transparency=100;config.backgroundOpacity=100;config.tone='auto';config.blur=0;}config.layoutVersion=4; }
  catch { config = structuredClone(blank); }
  if (!catalog.effects.some(e=>e.id===config.effect)&&config.effect!=='media') config.effect=blank.effect;
  if (!config.settings||typeof config.settings!=='object') config.settings={};
  if(!['balanced','quality','economy'].includes(config.performance))config.performance='balanced';
  if (config.removed) return;
  const aurora=config.settings['aurora-ionosphere']||{};
  if(!config.clarityVersion){config.settings['aurora-ionosphere']={...aurora,quality:'high',speed:1.8,glow:.35};config.clarityVersion=1;}
  if(config.clarityVersion<2){
    for(const [id,updates] of [['black-hole',{resolution:1,maxDpr:2.5}],['cloud-train',{resolution:1}],['blinking-squares',{dpr:2.5}]])config.settings[id]={...config.settings[id],...updates};
    config.clarityVersion=2;
  }
  const registrations=window[Symbol.for('code-codex:background-modules:v1')];
  const abort=new AbortController();
  let ui;
  const upstream=window.__CC_MAC_UPSTREAM_UI__;
  if(!upstream)throw Error('Upstream appearance UI is missing');
  if(!config.opacity||typeof config.opacity!=='object')config.opacity={};
  const clearConversationMasks=window.__CC_MAC_CLEAR_CONVERSATION_MASKS__;
  const fixedTransparentRegions=Object.keys(clearConversationMasks());
  config.opacity=clearConversationMasks(config.opacity);
  if(!config.materialVersion){config.composerTransparency=75;config.codeTransparency=60;config.codeStyle='frosted';config.materialVersion=1;}
  config.opacity.composer=100-config.composerTransparency;
  let renderer, canvas, media, mediaURL, mediaFile, disposed=false, mountRevision=0;
  let surface, contentSurface, positionLease, reconcileFrame=0,reconcileTimer,renderFailed=false;
  let surfaceDirty=true,regionsDirty=true,geometryDirty=true,overlaysDirty=true,backgroundBounds;
  let lastOverlayPaint=-Infinity,overlayPaints=0,lastCounterUpdate=0,policy;
  const regions=new Map();
  const overlays=new Map(),themeLeases=new Map();
  let theme,resolvedTone='dark';const themeStyleSnapshot=new WeakMap();
  const contrast=window.__CC_MAC_CONTRAST__(),inkTones=new WeakMap();
  const sample=document.createElement('canvas');sample.width=32;sample.height=18;
  const sampleContext=sample.getContext('2d',{willReadFrequently:true});
  let samplePixels,lastSample=-Infinity,contrastSamples=0;
  const frameRuntime=window[Symbol.for('code-codex-mac:frames:v1')];
  if(frameRuntime)frameRuntime.onFrame=({count,time})=>{if(!canvas&&config.effect==='blinking-squares')canvas=layer.querySelector('canvas');if(time-lastCounterUpdate>=1000){background.dataset.frames=String(count);lastCounterUpdate=time;}updateContrast(time,false,true);if(overlays.size&&time-lastOverlayPaint>=32){paintOverlays(true);lastOverlayPaint=time;}};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const background=document.createElement('div');
  background.id='cc-mac-background';
  background.setAttribute('aria-hidden','true');
  const layer=document.createElement('div');
  layer.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  const veil=document.createElement('div');
  veil.style.cssText='position:absolute;inset:0;pointer-events:none';
  background.append(layer,veil);
  const codeSelector='[data-markdown-copy="code-block"],[class*="CodeBlock_"],.message-code-block,.bg-token-text-code-block-background';
  const style=document.createElement('style');
  style.id='cc-mac-background-style';
  style.textContent=`
    [data-cc-mac-background-surface] {isolation:isolate!important}
    [data-cc-mac-background-surface] > #cc-mac-background {position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;overflow:hidden;border-radius:inherit;background:#080911;contain:strict}
    #cc-mac-background canvas {display:block;width:100%;height:100%}
    [data-cc-mac-background-surface][data-cc-mac-active] :is([data-cc-mac-region="frame"],[data-cc-mac-region="main"],.thread-scroll-container[data-app-action-timeline-scroll],[data-thread-scroll-footer="true"]) {background-color:transparent!important;background-image:none!important}
    [data-cc-mac-background-surface][data-cc-mac-active] [class*="WorkspaceContent"]::before {background-color:transparent!important;background-image:none!important}
    [data-cc-mac-background-surface][data-cc-mac-active] [data-cc-mac-region="sidebar"] {background-color:var(--cc-mac-sidebar)!important;background-image:none!important;--color-surface:transparent;--color-surface-secondary:transparent;--color-surface-tertiary:transparent;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    [data-cc-mac-background-surface][data-cc-mac-active] [data-cc-mac-region="header"] {background-color:var(--cc-mac-header)!important;background-image:none!important;--color-surface:transparent;--color-surface-secondary:transparent;--color-surface-tertiary:transparent;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    [data-cc-mac-background-surface][data-cc-mac-active] [data-cc-mac-region="composer"] {background-color:var(--cc-mac-composer)!important;background-image:none!important;--color-composer-surface:transparent;--color-surface:transparent;--color-surface-secondary:transparent;--color-surface-tertiary:transparent;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    [data-cc-mac-background-surface][data-cc-mac-active] [data-cc-mac-region="composer"] :is([data-composer-input],[data-composer-body],[data-composer-input-layout],textarea) {background-color:transparent!important;background-image:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    [data-cc-mac-background-surface][data-cc-mac-active] :is([data-thread-scroll-footer="true"],[data-above-composer-portal]) [class*="bg-gradient-to-t"] {background-image:none!important}
    [data-cc-mac-background-surface][data-cc-mac-active] :is([role="dialog"],[role="menu"],[role="listbox"],[data-composer-overlay-floating-ui]) {--color-surface:var(--cc-mac-native);--color-surface-secondary:var(--cc-mac-native);--color-surface-tertiary:var(--cc-mac-native);background-color:var(--cc-mac-native)!important}
    #cc-mac-background-controls {position:fixed;right:16px;bottom:16px;z-index:2147483000;pointer-events:auto;-webkit-app-region:no-drag}
  `;
  style.textContent+=`
    [data-cc-mac-background-surface][data-cc-mac-active], [data-cc-mac-overlay] {
      --color-surface:var(--cc-theme-surface);--color-surface-secondary:var(--cc-theme-surface);--color-surface-tertiary:var(--cc-theme-surface);--color-surface-canvas:var(--cc-theme-surface);--color-surface-card:var(--cc-theme-surface);--color-surface-elevated:var(--cc-theme-surface);--color-surface-elevated-secondary:var(--cc-theme-surface);--color-surface-default:var(--cc-theme-surface);
      --color-text:var(--cc-theme-fg);--color-text-default:var(--cc-theme-fg);--color-text-primary:var(--cc-theme-fg);--color-text-foreground:var(--cc-theme-fg);--color-text-emphasis:var(--cc-theme-fg);--color-text-composer-primary:var(--cc-theme-fg);--color-text-secondary:var(--cc-theme-muted);--color-text-tertiary:var(--cc-theme-muted);--color-text-accent:var(--cc-theme-accent);--color-accent-blue:var(--cc-theme-accent);
      --color-border:var(--cc-theme-border);--color-border-default:var(--cc-theme-border);--color-border-light:var(--cc-theme-border);--color-border-subtle:var(--cc-theme-border);
      color:var(--cc-theme-fg);color-scheme:var(--cc-theme-scheme);text-shadow:var(--cc-theme-shadow);
    }
    [data-cc-mac-background-surface][data-cc-mac-active] :is([data-cc-mac-region="sidebar"],[data-cc-mac-region="header"],[data-cc-mac-region="composer"],[data-cc-mac-region="bubble"],[data-cc-mac-region="panel"]), [data-cc-mac-overlay] {
      background-color:var(--cc-theme-surface)!important;background-image:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border-color:var(--cc-theme-border)!important;
      --color-surface:var(--cc-theme-surface);--color-surface-secondary:var(--cc-theme-surface);--color-surface-tertiary:var(--cc-theme-surface);--color-composer-surface:var(--cc-theme-surface);
    }
    [data-cc-mac-background-surface][data-cc-mac-active] :is([role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"],[data-composer-overlay-floating-ui]) {background-color:var(--cc-theme-surface)!important;--color-surface:var(--cc-theme-surface);--color-surface-secondary:var(--cc-theme-surface);--color-surface-tertiary:var(--cc-theme-surface);color:var(--cc-theme-fg)!important}
    [data-cc-mac-overlay] {isolation:isolate!important}
    [data-cc-mac-overlay]::backdrop {background:var(--cc-theme-surface)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    [data-cc-mac-background-surface][data-cc-mac-active] :is(a,[data-cc-mac-region="bubble"] a) {color:var(--cc-theme-accent)}
    [data-cc-mac-background-surface][data-cc-mac-active] button {border-color:var(--cc-theme-border)}
    [data-cc-mac-background-surface][data-cc-mac-active] button:hover {background-color:var(--cc-theme-hover)}
    [data-cc-mac-background-surface][data-cc-mac-active] :is([aria-selected="true"],[aria-current="page"],[data-state="active"],.selected) {background-color:var(--cc-theme-hover)!important;color:var(--cc-theme-accent)!important;border-color:var(--cc-theme-border)!important}
  `;
  // Composer material is independent; retain the original masks for other panes.
  const nativeOpacityCSS=upstream.opacityCSS.replace(/[^{}]*\{[^{}]*--code-codex-mask-composer[^{}]*\}/g,'');
  style.textContent+=nativeOpacityCSS.replace(/html\[data-code-codex-ui-mask-active\](?:\[data-code-codex-ui-mask-active\])? body /g,'[data-cc-mac-background-surface][data-cc-mac-active][data-cc-mac-opacity-active] ');
  // Sidebar and conversation never paint a surface tint, even when masks are
  // disabled or an older saved configuration requests an opaque interface.
  style.textContent+=`
    [data-cc-mac-background-surface][data-cc-mac-active][data-cc-mac-active] :is(nav[data-app-navigation-rail],[data-cc-mac-region="sidebar"],[data-cc-mac-region="main"],[data-cc-mac-region="bubble"],.sidebar-navigation,.thread-scroll-container[data-app-action-timeline-scroll]) {
      background-color:transparent!important;background-image:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
      --cc-theme-surface:transparent;--color-surface:transparent;--color-surface-secondary:transparent;--color-surface-tertiary:transparent;--color-surface-canvas:transparent;--color-surface-card:transparent;
    }
  `;
  // The native project/run-location rail is outside the painted Home body.
  // Its distinct action-bar token must follow the composer's surface too.
  style.textContent+=`
    [data-cc-mac-background-surface][data-cc-mac-active] :is([data-cc-mac-region="composer"],.bg-background-composer-action-bar) {
      --composer-layout-surface-background:var(--cc-mac-composer-surface)!important;
      --composer-layout-surface-backdrop-filter:none!important;
      --composer-layout-surface-shadow:none!important;
      --color-background-composer-surface:var(--cc-mac-composer-surface)!important;
      --color-background-composer-action-bar:var(--cc-mac-composer-surface)!important;
      --color-surface-elevated-secondary:var(--cc-mac-composer-surface)!important;
    }
    [data-cc-mac-background-surface][data-cc-mac-active] .bg-background-composer-action-bar {
      background-color:var(--cc-mac-composer-surface)!important;background-image:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
    }
    [data-cc-mac-background-surface][data-cc-mac-active] [data-cc-mac-region="composer"] :is([class*="ComposerLayoutBody"],[class*="ComposerLayoutReplyContext"],[data-composer-body]) {
      background-color:var(--cc-mac-composer-surface)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
    }
  `;
  style.textContent+=`
    [data-cc-mac-background-surface][data-cc-mac-active] [data-cc-mac-region="code"] {
      background-color:var(--cc-material-code-surface)!important;background-image:none!important;
      backdrop-filter:var(--cc-material-code-filter)!important;-webkit-backdrop-filter:var(--cc-material-code-filter)!important;
      border:1px solid var(--cc-material-border)!important;border-radius:16px;
      box-shadow:inset 0 1px 0 var(--cc-material-edge),0 6px 18px rgba(0,0,0,.08);
      --codeblock-background-color:transparent!important;--color-token-text-code-block-background:transparent!important;--smoothing-background-color:transparent!important;
    }
    [data-cc-mac-background-surface][data-cc-mac-active] [data-cc-mac-region="code"] :is(pre,code,[class*="CodeBlock_"],[class*="CopyButtonContainer"],[class*="CodeCopy_"],.bg-token-text-code-block-background,[data-code-block-header]) {
      background-color:transparent!important;background-image:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
      --codeblock-background-color:transparent!important;--color-token-text-code-block-background:transparent!important;
    }
    [data-cc-mac-background-surface][data-cc-mac-active] [data-cc-mac-region="code"] :is(pre,code) {color:var(--cc-theme-fg)}
    [data-cc-mac-background-surface][data-cc-mac-active] :is([data-cc-mac-region="composer"],.bg-background-composer-action-bar) {
      background-color:var(--cc-mac-composer-surface)!important;backdrop-filter:var(--cc-material-composer-filter)!important;-webkit-backdrop-filter:var(--cc-material-composer-filter)!important;
    }
    [data-cc-mac-background-surface][data-cc-mac-active] [data-cc-mac-region="composer"][data-composer-utility-bar-variant="home"] {
      background-color:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
    }
    [data-cc-mac-background-surface][data-cc-mac-active] [data-cc-mac-region="composer"][data-composer-utility-bar-variant="home"] :is([class*="ComposerLayoutBody"],[data-composer-body]) {
      background-color:var(--cc-mac-composer-surface)!important;backdrop-filter:var(--cc-material-composer-filter)!important;-webkit-backdrop-filter:var(--cc-material-composer-filter)!important;
    }
    [data-cc-mac-background-surface][data-cc-mac-active] [data-cc-mac-region="composer"]:not([data-composer-utility-bar-variant="home"]) :is([class*="ComposerLayoutBody"],[data-composer-body]) {
      background-color:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
    }
  `;
  style.textContent+=`
    [data-cc-mac-background-surface][data-cc-mac-active] [data-cc-mac-region], [data-cc-mac-overlay] {
      color:var(--cc-theme-fg);text-shadow:var(--cc-theme-shadow);
    }
    [data-cc-mac-background-surface][data-cc-mac-active] :is([data-composer-input],.ProseMirror,textarea,input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"])) {
      caret-color:var(--cc-theme-fg)!important;color:var(--cc-theme-fg);--color-codex-editor-cursor:var(--cc-theme-fg);
    }
    [data-cc-mac-background-surface][data-cc-mac-active] :is(textarea,input)::placeholder {color:var(--cc-theme-muted);opacity:1}
    [data-cc-mac-background-surface][data-cc-mac-active] :is([data-variant="solid"],[role="switch"],.bg-background-primary-solid) {text-shadow:none}
  `;
  document.head.append(style);
  const controls=document.createElement('div');
  controls.id='cc-mac-background-controls';
  const shadow=controls.attachShadow({mode:'open'});
  function persist() { try {localStorage.setItem(ownKey,JSON.stringify(config));} catch {status('设置存储失败，请检查本机可用空间');} }
  function status(message) { if(background.dataset.status===message)return;background.dataset.status=message;ui?.render(); }
  function settings(id=config.effect) {
    const effect=catalog.effects.find(e=>e.id===id);
    return effect?{...structuredClone(effect.defaults),...config.settings[effect.id]}:{};
  }
  function normalized(effect, values) {
    const result=structuredClone(effect.defaults);
    for(const c of effect.controls) {
      const v=values[c.key];
      if(c.type==='range'&&typeof v==='number'&&Number.isFinite(v))result[c.key]=Math.min(c.maximum,Math.max(c.minimum,v));
      if(c.type==='checkbox'&&typeof v==='boolean')result[c.key]=v;
      if(c.type==='select'&&c.options.includes(v))result[c.key]=v;
      if(c.type==='color'&&/^#[\da-f]{6}$/i.test(v||''))result[c.key]=v;
      if(c.type==='palette'&&Array.isArray(v))result[c.key]=result[c.key].map((x,i)=>/^#[\da-f]{6}$/i.test(v[i]||'')?v[i]:x);
    }
    if('paused' in result)result.paused=values.paused===true;
    return result;
  }
  function applyPresentation() {
    config.opacity=clearConversationMasks(config.opacity);
    config.opacity.composer=100-config.composerTransparency;
    for(const [key,fallback,min,max] of [['transparency',100,0,100],['backgroundOpacity',100,0,100],['blur',0,0,16]]) {
      config[key]=typeof config[key]==='number'&&Number.isFinite(config[key])?Math.min(max,Math.max(min,config[key])):fallback;
    }
    background.hidden=!config.enabled||!surface||renderFailed;
    surface?.toggleAttribute('data-cc-mac-active',config.enabled&&!renderFailed);
    surface?.toggleAttribute('data-cc-mac-opacity-active',config.enabled&&config.opacityEnabled&&!renderFailed);
    const accents={'black-hole':'#ffb36a','heavenly-cloud':'#9ed8ff','mountain':'#ffcb91','cloud-train':'#bfe7ff','blinking-squares':settings().squareColor,'milky-way':settings().colors?.[0]};
    resolvedTone=['light','dark'].includes(config.tone)?config.tone:contrast.nativeTone({theme:document.documentElement.dataset.theme||document.body.dataset.theme,className:document.documentElement.className,variant:getComputedStyle(document.documentElement).getPropertyValue('--theme-variant'),prefersDark:matchMedia('(prefers-color-scheme: dark)').matches});
    theme=window.__CC_MAC_THEME__({transparency:config.transparency,backgroundOpacity:config.backgroundOpacity,tone:resolvedTone,hue:settings().hue||0,accent:accents[config.effect]});
    veil.hidden=true;veil.style.background='transparent';
    layer.style.filter=config.blur>0?`blur(${config.blur}px)`:'none';
    layer.style.opacity=String(theme.backgroundOpacity/100);
    layer.style.transform=config.effect==='glow-horizon'&&settings().variant==='top'?'scaleY(-1)':'none';
    if(!config.enabled||renderFailed)for(const node of [...themeLeases.keys()])if(node!==controls)restoreThemeVars(node);
    if(surface)applyThemeVars(surface);applyThemeVars(controls);
    for(const node of regions.keys())applyThemeVars(node);
    updateContrast(performance.now(),true);
    syncOverlays();
    ui?.render();
  }
  function applyThemeVars(node) {
    if(!node||!theme)return;
    if(node!==controls&&(!config.enabled||renderFailed)){restoreThemeVars(node);return;}
    const selected=node===controls&&(!config.enabled||renderFailed)?window.__CC_MAC_THEME__({transparency:0,tone:'dark'}):theme;
    if(!themeLeases.has(node))themeLeases.set(node,new Map());
    const lease=themeLeases.get(node);
    const material=window.__CC_MAC_MATERIALS__({composerTransparency:config.composerTransparency,codeTransparency:config.codeTransparency,codeStyle:config.codeStyle,tone:resolvedTone,performance:config.performance});
    const variables={...selected.vars,...material.vars};
    if(['frame','main','sidebar','bubble'].includes(node.getAttribute('data-cc-mac-region')))variables['--cc-theme-surface']='transparent';
    if(node===surface)for(const region of upstream.regions)variables['--code-codex-mask-'+region.key]=String((config.opacity[region.key]??100-config.transparency)/100);
    if(node===controls)Object.assign(variables,{'--cle-paper':'var(--cc-theme-surface)','--cle-paper-raised':'var(--cc-theme-surface)','--cle-subtle':'var(--cc-theme-surface)','--cle-ink':'var(--cc-theme-fg)','--cle-muted':'var(--cc-theme-muted)','--cle-rule':'var(--cc-theme-border)','--cle-rule-strong':'var(--cc-theme-border)','--cle-hover':'var(--cc-theme-hover)','--cle-focus':'var(--cc-theme-accent)'});
    for(const [key,value] of Object.entries(variables)) {
      if(!lease.has(key))lease.set(key,{value:node.style.getPropertyValue(key),priority:node.style.getPropertyPriority(key)});
      if(node.style.getPropertyValue(key)!==value)node.style.setProperty(key,value);
    }
    themeStyleSnapshot.set(node,node.getAttribute('style'));
  }
  function backdropRGB(node) {
    if(!samplePixels||!backgroundBounds)return config.effect==='mountain'?[190,168,145]:[18,25,35];
    const bounds=backgroundBounds,r=node.getBoundingClientRect(),rgb=[0,0,0];let count=0;
    const x0=Math.max(0,Math.floor((r.left-bounds.left)/bounds.width*32)),x1=Math.min(32,Math.ceil((r.right-bounds.left)/bounds.width*32));
    const y0=Math.max(0,Math.floor((r.top-bounds.top)/bounds.height*18)),y1=Math.min(18,Math.ceil((r.bottom-bounds.top)/bounds.height*18));
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*32+x)*4;rgb.forEach((_,c)=>rgb[c]+=samplePixels[i+c]);count++;}
    return count?rgb.map(v=>v/count):[18,25,35];
  }
  function applyContrast(node) {
    if(!node||!theme)return;
    const role=node.getAttribute('data-cc-mac-region');
    const alpha=role==='composer'?1-config.composerTransparency/100:role==='code'&&config.codeStyle!=='transparent'?1-config.codeTransparency/100:['sidebar','main','bubble','frame'].includes(role)?0:theme.alpha;
    const rgb=contrast.composite(backdropRGB(node),resolvedTone==='light'?[245,248,252]:[18,23,32],alpha);
    const palette=contrast.palette(rgb,inkTones.get(node));inkTones.set(node,palette.tone);
    const lease=themeLeases.get(node);if(!lease)return;
    for(const [key,value]of Object.entries(palette.vars)){
      if(!lease.has(key))lease.set(key,{value:node.style.getPropertyValue(key),priority:node.style.getPropertyPriority(key)});
      if(node.style.getPropertyValue(key)!==value)node.style.setProperty(key,value);
    }
    themeStyleSnapshot.set(node,node.getAttribute('style'));
  }
  function updateContrast(time,force=false,painted=false) {
    if(disposed||!surface||!config.enabled||renderFailed||document.hidden)return;
    const source=canvas||media;
    if(source&&sampleContext&&(source===media||painted)&&time-lastSample>=1500){
      lastSample=time;
      const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;
      const bg=backgroundBounds||background.getBoundingClientRect();
      if(sw&&sh&&bg.width&&bg.height)try {
        sampleContext.fillStyle='#080911';sampleContext.fillRect(0,0,32,18);
        sampleContext.globalAlpha=config.backgroundOpacity/100;
        if(source===media){const scale=Math.max(bg.width/sw,bg.height/sh),cw=bg.width/scale,ch=bg.height/scale;sampleContext.drawImage(source,(sw-cw)/2,(sh-ch)/2,cw,ch,0,0,32,18);}
        else sampleContext.drawImage(source,0,0,32,18);
        sampleContext.globalAlpha=1;samplePixels=sampleContext.getImageData(0,0,32,18).data;contrastSamples++;background.dataset.contrastSamples=String(contrastSamples);
      }catch{samplePixels=undefined;}
    }else if(!force)return;
    applyContrast(surface);for(const node of regions.keys())applyContrast(node);
    for(const node of overlays.keys())applyContrast(node);applyContrast(controls);
  }
  function restoreThemeVars(node) {
    const lease=themeLeases.get(node);if(!lease)return;
    for(const [key,previous] of lease)if(previous.value)node.style.setProperty(key,previous.value,previous.priority);else node.style.removeProperty(key);
    themeLeases.delete(node);
  }
  function removeOverlay(node) {
    const entry=overlays.get(node);if(!entry)return;
    resizeObserver.unobserve(node);entry.mirror.remove();
    if(entry.attribute===null)node.removeAttribute('data-cc-mac-overlay');else node.setAttribute('data-cc-mac-overlay',entry.attribute);
    if(entry.position&&node.style.getPropertyValue('position')==='relative') {
      if(entry.position.value)node.style.setProperty('position',entry.position.value,entry.position.priority);else node.style.removeProperty('position');
    }
    restoreThemeVars(node);overlays.delete(node);
  }
  function clearOverlays() {for(const node of [...overlays.keys()])removeOverlay(node);}
  function syncOverlays() {
    if(!surface||!config.enabled||renderFailed){clearOverlays();return;}
    const scope=surface.getBoundingClientRect();backgroundBounds=background.getBoundingClientRect();
    const candidates=[...document.querySelectorAll('[role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"],[data-composer-overlay-floating-ui]')];
    candidates.push(...(ui?.overlays()||[]));
    const active=new Set(candidates.filter(node=>{
      const r=node.getBoundingClientRect(),css=getComputedStyle(node);
      return !node.closest('[hidden],[aria-hidden="true"],[data-state="closed"]')&&css.display!=='none'&&css.visibility!=='hidden'&&Number(css.opacity)>0&&r.width>0&&r.height>0&&r.left>=scope.left-2&&r.top>=scope.top-2&&r.right<=scope.right+2&&r.bottom<=scope.bottom+2;
    }));
    for(const node of [...overlays.keys()])if(!active.has(node))removeOverlay(node);
    let redraw=false;
    for(const node of active) {
      if(!overlays.has(node)) {
        const mirror=document.createElement('canvas');mirror.setAttribute('aria-hidden','true');mirror.dataset.ccMacPopupMirror='';
        mirror.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;border-radius:inherit';
        const entry={mirror,ctx:mirror.getContext('2d',{alpha:false,desynchronized:true}),attribute:node.getAttribute('data-cc-mac-overlay'),position:undefined};
        if(getComputedStyle(node).position==='static'){entry.position={value:node.style.getPropertyValue('position'),priority:node.style.getPropertyPriority('position')};node.style.setProperty('position','relative');}
        overlays.set(node,entry);node.setAttribute('data-cc-mac-overlay','');node.append(mirror);resizeObserver.observe(node);
        redraw=true;
      }
      applyThemeVars(node);applyContrast(node);const rect=entryRect(node);overlays.get(node).rect=rect;
    }
    if(redraw){frameRuntime?.invalidate();refreshMotion();}
    paintOverlays();
  }
  function entryRect(node){const r=node.getBoundingClientRect(),border=parseFloat(getComputedStyle(node).borderLeftWidth)||0;return {left:r.left+border,top:r.top+border,width:Math.max(0,r.width-border*2),height:Math.max(0,r.height-border*2)};}
  function paintOverlays(fromFrame=false) {
    if(!surface||!config.enabled||renderFailed||!overlays.size)return;
    const source=canvas||media;
    const bg=backgroundBounds;if(!bg)return;
    for(const [node,entry] of overlays) {
      const mirror=entry.mirror;
      if(mirror.style.opacity!==String(config.backgroundOpacity/100))mirror.style.opacity=String(config.backgroundOpacity/100);
      if(source instanceof HTMLCanvasElement&&!fromFrame)continue;
      if(!source||!entry.rect?.width||!bg.width||!bg.height){mirror.hidden=true;continue;}
      mirror.hidden=false;const r=entry.rect;
      if(!r.width||!r.height){mirror.hidden=true;continue;}
      const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;
      if(!sw||!sh){mirror.hidden=true;continue;}
      const dpr=Math.min(frameRuntime?.renderDpr||devicePixelRatio,source instanceof HTMLCanvasElement?sw/bg.width:Infinity),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
      if(mirror.width!==w)mirror.width=w;if(mirror.height!==h)mirror.height=h;
      const ctx=entry.ctx;
      try {
        let sx=(r.left-bg.left)*sw/bg.width,sy=(r.top-bg.top)*sh/bg.height,sourceWidth=r.width*sw/bg.width,sourceHeight=r.height*sh/bg.height;
        if(source===media){const scale=Math.max(bg.width/sw,bg.height/sh);sx=(r.left-bg.left+(sw*scale-bg.width)/2)/scale;sy=(r.top-bg.top+(sh*scale-bg.height)/2)/scale;sourceWidth=r.width/scale;sourceHeight=r.height/scale;}
        ctx.fillStyle='#080911';ctx.fillRect(0,0,w,h);ctx.drawImage(source,sx,sy,sourceWidth,sourceHeight,0,0,w,h);
        mirror.hidden=false;overlayPaints++;
      }catch{mirror.hidden=true;}
    }
  }
  function releaseRenderer() {
    renderer?.dispose(); renderer=undefined;
    for(const effect of catalog.effects)registrations?.delete(effect.id);
    media?.pause?.(); media?.removeAttribute('src'); media=undefined;
    if(mediaURL)URL.revokeObjectURL(mediaURL); mediaURL=undefined;
    layer.replaceChildren(); canvas=undefined;samplePixels=undefined;lastSample=-Infinity;
  }
  async function setMedia(file,save=true) {
    if(!/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm))$/.test(file.type))throw Error('请选择 PNG、JPEG、WebP、GIF、MP4 或 WebM');
    if(file.size>64*1024*1024)throw Error('媒体文件超过 64 MiB');
    mediaFile=file;
    if(save) {
      const db=await mediaDB();
      await new Promise((resolve,reject)=>{const tx=db.transaction('media','readwrite');tx.objectStore('media').put(file,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('媒体保存中断'));});
      db.close();
    }
    if(disposed||!surface||config.effect!=='media'||!config.enabled)return;
    releaseRenderer();
    mediaURL=URL.createObjectURL(file); media=document.createElement(file.type.startsWith('video/')?'video':'img');
    media.style.cssText='width:100%;height:100%;object-fit:cover;pointer-events:none';
    media.src=mediaURL;
    if(media.tagName==='VIDEO') { media.muted=true;media.loop=true;media.playsInline=true; }
    layer.append(media);
    const current=media;
    for(const event of ['load','loadeddata','timeupdate'])current.addEventListener(event,()=>updateContrast(performance.now(),event!=='timeupdate'),{signal:abort.signal});
    current.addEventListener('error',()=>status('该媒体无法解码，请换一个文件'),{signal:abort.signal});
    refreshMotion();
    status('本地媒体：'+file.name);
  }
  function mediaDB() {
    return new Promise((resolve,reject)=>{const req=indexedDB.open('code-codex-mac-background-media',1);req.onupgradeneeded=()=>req.result.createObjectStore('media');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('媒体库被其他窗口占用'));});
  }
  function refreshMotion() {
    const paused=!surface||config.paused||settings().paused||document.hidden||reduced.matches||!config.enabled||renderFailed;
    applyRenderPolicy();frameRuntime?.setPaused(paused);
    if(!renderer&&!media)return;
    if(renderer) {
      const next={...settings(),paused};
      if(config.effect==='glow-horizon'&&next.variant==='top')next.variant='bottom';
      renderer.setSettings?.(next); renderer.updateSettings?.(next);
    }
    if(media?.tagName==='VIDEO') {
      if(paused)media.pause();else void media.play().catch(()=>status('视频待播放；点击“继续动画”'));
    }
    if(!renderFailed)status(paused?(config.paused||settings().paused?'已暂停':document.hidden?'页面隐藏，动画暂停':'系统减少动态效果，动画暂停'):config.effect==='glow-horizon'?'交互背景 · 滚动触发动画':'动画播放中 · '+(catalog.effects.find(e=>e.id===config.effect)?.name||'本地媒体'));
  }
  function mount() {
    const revision=++mountRevision;
    releaseRenderer();frameRuntime?.invalidate();renderFailed=false;applyPresentation();
    applyRenderPolicy();
    if(!surface){status('当前页面尚未匹配主内容容器，背景已停止');return;}
    if(!config.enabled){status('背景已关闭');return;}
    if(config.effect==='media') {
      if(mediaFile)void setMedia(mediaFile,false).catch(e=>status(e.message));
      else void (async()=>{const db=await mediaDB();const value=await new Promise((r,j)=>{const q=db.transaction('media').objectStore('media').get('current');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});db.close();if(revision!==mountRevision||disposed)return;if(value)await setMedia(value,false);else status('选择一张图片或一段本地视频');})().catch(e=>status(e.message));
      return;
    }
    const effect=catalog.effects.find(e=>e.id===config.effect);
    config.settings[effect.id]=normalized(effect,settings());
    const module=window.__CC_MAC_LOAD_BACKGROUND__(effect.id);
    if(!module?.exports?.[effect.ctor]){status('背景组件未加载：'+effect.name);return;}
    try {
      const values={...settings(),paused:config.paused||settings().paused||document.hidden||reduced.matches};
      const Ctor=module.exports[effect.ctor];
      const onError=message=>{renderFailed=!!message;applyPresentation();refreshMotion();status(message||'动画播放中 · '+effect.name);};
      if(effect.id==='glow-horizon') {
        const actual={...values,variant:values.variant==='top'?'bottom':values.variant};
        module.exports.populateGlowHorizonLayer(layer,actual);renderer=new Ctor(layer,actual);
      } else if(effect.id==='blinking-squares'){renderer=new Ctor(layer,values,onError);canvas=layer.querySelector('canvas');}
      else {canvas=document.createElement('canvas');layer.append(canvas);renderer=new Ctor(layer,canvas,values,onError);}
      background.dataset.effect=effect.id;
      background.dataset.loadedModules=String(registrations?.size||0);
      status('正在运行：'+effect.name+(reduced.matches?' · 系统已开启减少动态效果':''));
      refreshMotion();
    } catch(e) {releaseRenderer();renderFailed=true;applyPresentation();status('渲染失败：'+e.message);}
  }
  ui=window.__CC_MAC_APPEARANCE_UI__(shadow,upstream,{
    read:()=>({...config,fixedTransparentRegions,failed:renderFailed,notice:background.dataset.status}),
    settings,
    bounds:()=>surface?.getBoundingClientRect(),
    overlays:()=>{overlaysDirty=true;frameRuntime?.invalidate();syncOverlays();paintOverlays();},
    enable:id=>{config.enabled=!(config.enabled&&config.effect===id);config.effect=id;config.paused=false;mount();persist();},
    update:(id,key,value)=>{
      const next=settings(id);
      if(key.startsWith('colors.')){next.colors=[...next.colors];next.colors[Number(key.split('.')[1])]=value;}
      else next[key]=value;
      config.settings[id]=next;
      if(config.effect===id){applyPresentation();frameRuntime?.invalidate();refreshMotion();}
      persist();
    },
    reset:id=>{delete config.settings[id];if(config.effect===id){config.paused=false;mount();}persist();},
    preset:(id,values)=>{config.settings[id]=structuredClone(values);if(config.effect===id){applyPresentation();frameRuntime?.invalidate();refreshMotion();}persist();},
    replay:id=>{if(!id||id===config.effect){frameRuntime?.invalidate();if(renderer?.replay)renderer.replay();else mount();}},
    opacityEnabled:()=>{if(!config.enabled){status('请先启用一个背景');return;}config.opacityEnabled=!config.opacityEnabled;applyPresentation();persist();},
    opacity:(region,value)=>{config.opacity[region]=Math.max(0,Math.min(100,value));if(region==='composer')config.composerTransparency=100-config.opacity[region];applyPresentation();persist();},
    general:(key,value)=>{
      config[key]=value;
      if(key==='transparency'){config.opacityEnabled=true;for(const region of upstream.regions)if(region.key!=='composer')config.opacity[region.key]=100-value;}
      if(key==='performance'){applyRenderPolicy();mount();}else {applyPresentation();if(key==='paused')refreshMotion();}persist();
    },
    media:file=>{config.effect='media';config.enabled=true;config.paused=false;applyPresentation();void setMedia(file).then(persist).catch(error=>status(error.message));},
    diagnostics,
    restore:()=>{config.enabled=false;config.removed=true;persist();dispose();}
  },abort.signal);
  function diagnostics() {
    const rect=surface?.getBoundingClientRect();
    const report={version:'1.0.0-rc.3',upstream:catalog.commit,effect:config.effect,enabled:config.enabled,paused:config.paused||settings().paused,visibility:document.visibilityState,reduceMotion:reduced.matches,frameCallbacks:frameRuntime?.frameCount,performance:policy,resolvedTone,contrastSamples,contrastGrid:[32,18],frameStats:frameRuntime?.stats,overlayPaints,regions:JSON.parse(background.dataset.regions||'{}'),scope:surface?{tag:surface.tagName,id:surface.id,width:rect.width,height:rect.height}:null,canvas:canvas?{width:canvas.width,height:canvas.height,cssWidth:canvas.clientWidth,cssHeight:canvas.clientHeight,dpr:devicePixelRatio}:null,blur:config.blur,transparency:config.transparency,opacity:config.opacity,backgroundOpacity:config.backgroundOpacity,composerTransparency:config.composerTransparency,codeStyle:config.codeStyle,codeTransparency:config.codeTransparency};
    if(!navigator.clipboard?.writeText){status('当前应用未提供剪贴板接口');return;}
    void navigator.clipboard.writeText(JSON.stringify(report,null,2)).then(()=>status('诊断已复制（不含聊天内容）')).catch(()=>status('复制失败，请检查剪贴板权限'));
  }
  document.addEventListener('visibilitychange',refreshMotion,{signal:abort.signal});
  reduced.addEventListener('change',refreshMotion,{signal:abort.signal});
  const themeObserver=new MutationObserver(applyPresentation);
  const colorPreference=matchMedia('(prefers-color-scheme: dark)');colorPreference.addEventListener('change',applyPresentation,{signal:abort.signal});
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme','style']});
  const mainSelector='main:is(.main-surface,[data-app-shell-main-surface="default"])';
  const structuralSelector=mainSelector+', [data-app-shell-frame],[data-app-shell-active-page],aside.app-shell-left-panel,.sidebar-navigation,[data-app-shell-titlebar],[data-app-shell-page-header],[data-composer-layout],[data-composer-surface-variant]';
  const panelSelector='.bg-surface,.bg-surface-secondary,.bg-surface-tertiary,.bg-token-main-surface-primary,.bg-token-bg-primary,.bg-token-bg-secondary,.bg-background-surface,.bg-background-surface-under,.bg-background-elevated-primary,.bg-background-elevated-secondary,[class*="PanelSurface"],[class*="CardSurface"]';
  const regionSelector=codeSelector+', '+structuralSelector+', [data-message-role],[data-message-id],[class*="MessageBubble"],.message,'+panelSelector;
  const overlaySelector='[role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"],[data-composer-overlay-floating-ui]';
  const relevant=(node,selector)=>node instanceof Element&&(node.matches(selector)||!!node.querySelector(selector));
  const layoutObserver=new MutationObserver(records=>{
    for(const record of records){
      const target=record.target;
      if(target instanceof Element&&target.closest('#cc-mac-background,#cc-mac-background-controls,[data-cc-mac-popup-mirror]'))continue;
      if(record.type==='attributes'){
        if(record.attributeName==='style'&&themeStyleSnapshot.get(target)===target.getAttribute('style'))continue;
        if(contentSurface&&target.contains(contentSurface)&&['class','style','hidden','aria-hidden'].includes(record.attributeName))surfaceDirty=true;
        if(record.attributeName==='data-theme'&&target===document.body)applyPresentation();
        if(target.matches(regionSelector))regionsDirty=true;
        if(target.matches(structuralSelector)){regionsDirty=true;geometryDirty=true;surfaceDirty=true;}
        if(target.matches(overlaySelector)||target.closest(overlaySelector)){overlaysDirty=true;}
        if(['data-app-shell-active-page','hidden','aria-hidden'].includes(record.attributeName)&&relevant(target,mainSelector))surfaceDirty=true;
      }else{
        for(const node of [...record.addedNodes,...record.removedNodes]){
          if(!(node instanceof Element)||node.matches('#cc-mac-background,#cc-mac-background-controls,[data-cc-mac-popup-mirror]'))continue;
          if(relevant(node,regionSelector)||node.hasAttribute('data-cc-mac-region'))regionsDirty=true;
          if(relevant(node,mainSelector)||node===surface){surfaceDirty=true;geometryDirty=true;}
          if(relevant(node,overlaySelector))overlaysDirty=true;
        }
      }
    }
    if(surface&&!surface.isConnected)surfaceDirty=true;
    if(surfaceDirty||regionsDirty||geometryDirty||overlaysDirty)scheduleReconcile();
  });
  layoutObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-app-shell-active-page','hidden','aria-hidden','class','style','open','data-state','data-theme']});
  const resizeObserver=new ResizeObserver(entries=>{if(entries.some(entry=>entry.target===surface))surfaceDirty=true;geometryDirty=true;overlaysDirty=true;scheduleReconcile();});
  function applyRenderPolicy(){
    const bounds=surface?.getBoundingClientRect();
    policy=window.__CC_MAC_RENDER_POLICY__({mode:config.performance,dpr:devicePixelRatio,width:bounds?.width||innerWidth,height:bounds?.height||innerHeight,focused:document.hasFocus()});
    frameRuntime?.configure(policy);
  }
  window.addEventListener('focus',applyRenderPolicy,{signal:abort.signal});
  window.addEventListener('blur',applyRenderPolicy,{signal:abort.signal});
  function findSurface() {
    const matches=[...document.querySelectorAll('main:is(.main-surface,[data-app-shell-main-surface="default"])')].filter(node=>{
      if(node.closest('[data-app-shell-active-page="false"],[hidden],[aria-hidden="true"]'))return false;
      const rect=node.getBoundingClientRect(),css=getComputedStyle(node);
      return css.display!=='none'&&css.visibility!=='hidden'&&Number(css.opacity)!==0&&rect.width>=240&&rect.height>=180&&rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight;
    });
    contentSurface=matches.length===1?matches[0]:undefined;
    if(!contentSurface)return undefined;
    const root=contentSurface.closest('#root');
    const frame=contentSurface.closest('[data-app-shell-frame="true"]');
    for(const candidate of [root,frame,contentSurface])if(candidate&&candidate!==document.body&&candidate!==document.documentElement){
      const r=candidate.getBoundingClientRect();
      if(r.width>=240&&r.height>=180&&r.left>=-2&&r.top>=-2&&r.right<=innerWidth+2&&r.bottom<=innerHeight+2)return candidate;
    }
    return undefined;
  }
  function clearRegions() {for(const [node,previous] of regions){restoreThemeVars(node);if(previous===null)node.removeAttribute('data-cc-mac-region');else node.setAttribute('data-cc-mac-region',previous);}regions.clear();}
  function markRegions() {
    if(!surface)return;const seen=new Set();
    const mark=(node,role)=>{if(!node||!surface.contains(node)||node.closest('[data-app-shell-active-page="false"],[role="dialog"],[role="menu"]'))return;seen.add(node);if(!regions.has(node))regions.set(node,node.getAttribute('data-cc-mac-region'));if(node.getAttribute('data-cc-mac-region')!==role)node.setAttribute('data-cc-mac-region',role);};
    mark(contentSurface,'main');
    for(const node of surface.querySelectorAll('[data-app-shell-frame],[data-app-shell-page-surface="true"]'))mark(node,'frame');
    for(const [role,selector] of [['sidebar','aside.app-shell-left-panel,aside[data-app-shell-left-panel-appearance],.sidebar-navigation'],['header','header:has([data-app-shell-titlebar-content]),[data-app-shell-titlebar],[data-app-shell-page-header],[data-app-shell-header-edge-scroll]'],['composer','[data-composer-surface-variant],[data-composer-layout]']]) {
      const nodes=[...surface.querySelectorAll(selector)];
      for(const node of nodes)if(!nodes.some(parent=>parent!==node&&parent.contains(node)))mark(node,role);
    }
    const codeNodes=[...surface.querySelectorAll(codeSelector)];
    for(const node of codeNodes)if(!codeNodes.some(parent=>parent!==node&&parent.contains(node)))mark(node,'code');
    for(const node of surface.querySelectorAll('[data-message-role],[data-message-id],[class*="MessageBubble"],.message'))mark(node,'bubble');
    for(const node of surface.querySelectorAll(panelSelector))if(!seen.has(node)&&!node.matches('button,a,[role="button"]')&&!node.closest('[data-cc-mac-region="code"],[data-cc-mac-region="composer"]'))mark(node,'panel');
    for(const [node,previous]of regions)if(!seen.has(node)){restoreThemeVars(node);if(previous===null)node.removeAttribute('data-cc-mac-region');else node.setAttribute('data-cc-mac-region',previous);regions.delete(node);}
    if(theme&&config.enabled)for(const node of seen){applyThemeVars(node);applyContrast(node);}
    const counts={};for(const node of regions.keys()){const role=node.getAttribute('data-cc-mac-region');counts[role]=(counts[role]||0)+1;}background.dataset.regions=JSON.stringify(counts);
  }
  function detachSurface() {
    ++mountRevision;releaseRenderer();resizeObserver.disconnect();
    background.remove();controls.remove();clearRegions();clearOverlays();
    if(surface) {
      surface.removeAttribute('data-cc-mac-background-surface');
      surface.removeAttribute('data-cc-mac-active');
      surface.removeAttribute('data-cc-mac-opacity-active');
      for(const key of ['--cc-mac-sidebar','--cc-mac-header','--cc-mac-composer','--cc-mac-native'])surface.style.removeProperty(key);
      restoreThemeVars(surface);
      if(positionLease&&surface.style.getPropertyValue('position')==='relative'&&surface.style.getPropertyPriority('position')==='') {
        if(positionLease.value)surface.style.setProperty('position',positionLease.value,positionLease.priority);
        else surface.style.removeProperty('position');
      }
    }
    positionLease=undefined;surface=undefined;
  }
  function positionControls() {
    if(!surface)return;
    const rect=surface.getBoundingClientRect();
    const right=Math.max(0,innerWidth-Math.min(innerWidth,rect.right))+12;
    const bottom=Math.max(0,innerHeight-Math.min(innerHeight,rect.bottom))+12;
    const width=Math.max(180,Math.min(330,rect.width-24));
    const height=Math.max(100,Math.min(innerHeight*.7,rect.height-80));
    for(const [key,value] of [['right',right+'px'],['bottom',bottom+'px'],['--cc-mac-panel-width',width+'px'],['--cc-mac-panel-height',height+'px']]) {
      if(controls.style.getPropertyValue(key)!==value)controls.style.setProperty(key,value);
    }
    ui?.layout();
  }
  function reconcile() {
    reconcileFrame=0;if(disposed)return;
    const next=surfaceDirty?findSurface():surface;
    if(next!==surface) {
      detachSurface();surface=next;
      if(surface) {
        if(getComputedStyle(surface).position==='static') {
          positionLease={value:surface.style.getPropertyValue('position'),priority:surface.style.getPropertyPriority('position')};
          surface.style.setProperty('position','relative');
        }
        surface.setAttribute('data-cc-mac-background-surface','v3');markRegions();
        surface.prepend(background);document.body.append(controls);resizeObserver.observe(surface);
        mount();ui.render();
      }
    } else if(surface) {
      if(regionsDirty)markRegions();
      // React may replace the surface's children without replacing its outer node.
      if(background.parentElement!==surface){surface.prepend(background);mount();}
      if(!controls.isConnected)document.body.append(controls);
    }
    if(geometryDirty){positionControls();backgroundBounds=background.getBoundingClientRect();applyRenderPolicy();}
    if(overlaysDirty||geometryDirty)syncOverlays();
    if(surface)updateContrast(performance.now(),true);
    surfaceDirty=regionsDirty=geometryDirty=overlaysDirty=false;
    background.dataset.reconciles=String(Number(background.dataset.reconciles||0)+1);
  }
  function scheduleReconcile(){if(disposed||reconcileFrame||reconcileTimer)return;reconcileTimer=setTimeout(()=>{reconcileTimer=undefined;if(!disposed)reconcileFrame=requestAnimationFrame(reconcile);},100);}
  window.addEventListener('resize',()=>{geometryDirty=true;surfaceDirty=true;overlaysDirty=true;scheduleReconcile();},{signal:abort.signal});
  window.addEventListener('scroll',()=>{if(surface){geometryDirty=true;overlaysDirty=true;scheduleReconcile();}},{capture:true,passive:true,signal:abort.signal});
  for(const target of [document,shadow])target.addEventListener('animationend',event=>{if(event.target instanceof Element&&event.target.matches(overlaySelector)){overlaysDirty=true;scheduleReconcile();}},{capture:true,signal:abort.signal});
  function dispose() {if(disposed)return;disposed=true;ui?.close();abort.abort();themeObserver.disconnect();layoutObserver.disconnect();cancelAnimationFrame(reconcileFrame);clearTimeout(reconcileTimer);detachSurface();for(const node of [...themeLeases.keys()])restoreThemeVars(node);frameRuntime?.dispose();style.remove();delete window[API];}
  window[API]=Object.freeze({version:'1.0.0-rc.3',dispose});
  reconcile();persist();
})();

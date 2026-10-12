// Only the event bridge and placement are Mac-specific. Cards, effect panels,
// labels, grouped controls, icons and stylesheet come from upstream at build time.
export function createAppearanceUI(shadow, upstream, bridge, signal) {
  const bilingual=(zh,en)=>`<span class="cle-bilingual-label"><span class="cle-bilingual-label-zh" lang="zh-CN">${zh}</span><span class="cle-bilingual-label-en" lang="en">${en}</span></span>`;
  const languageSwitch='<label class="background-language-switch" title="使用英文参数标签 / Use English parameter labels"><span data-language-option="zh">中文</span><input class="background-language-toggle" type="checkbox" role="switch" aria-label="使用英文参数标签 / Use English parameter labels"><span data-language-option="en">EN</span></label>';
  const generalPanel=`<section class="particle-settings-panel" id="cle-mac-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-mac-settings-title"><header class="particle-settings-header"><div class="particle-settings-heading"><p>${bilingual('外观','Appearance')}</p><h3 id="cle-mac-settings-title">${bilingual('Mac 窗口适配','Mac window settings')}</h3></div><div class="particle-settings-header-actions">${languageSwitch}<button class="particle-settings-close" type="button" aria-label="Close settings">${upstream.icons.close}</button></div></header><div class="particle-settings-scroll">
    <fieldset class="particle-settings-group"><legend>${bilingual('整个界面','Entire interface')}</legend>
      <label class="particle-toggle-row">${bilingual('性能模式','Performance')}<select data-mac-setting="performance" aria-label="性能模式"><option value="balanced">均衡（推荐） / Balanced</option><option value="quality">画质优先 / Quality</option><option value="economy">节能 / Economy</option></select></label>
      <p class="surface-opacity-help">${bilingual('均衡让复杂背景以 30 帧运行，轻量效果最高 60 帧；失去焦点时降至 15 帧，隐藏时暂停。画质优先保留 60 帧，节能进一步降低背景像素；文字和控件保持原生清晰。','Balanced runs complex backgrounds at 30 fps and light effects at up to 60 fps. Unfocused windows use 15 fps; hidden pages pause. Quality keeps 60 fps; Economy lowers backdrop pixels. Text and controls stay sharp.')}</p>
      <div class="particle-control-row"><label for="cc-transparency">${bilingual('透明度','Transparency')}</label><input id="cc-transparency" data-mac-setting="transparency" type="range" min="0" max="100" step="1"><span class="particle-control-value"><output for="cc-transparency"></output></span></div>
      <p class="surface-opacity-help">${bilingual('侧栏和对话区固定全透明。输入框和代码块使用下面的独立材质设置，文字和图标始终不透明。','Sidebar and conversation stay transparent. Composer and code blocks use the separate material settings below; text and icons remain opaque.')}</p>
      <div class="particle-control-row"><label for="cc-background-opacity">${bilingual('背景强度','Background strength')}</label><input id="cc-background-opacity" data-mac-setting="backgroundOpacity" type="range" min="0" max="100" step="1"><span class="particle-control-value"><output for="cc-background-opacity"></output></span></div>
      <div class="particle-control-row"><label for="cc-blur">${bilingual('模糊','Blur')}</label><input id="cc-blur" data-mac-setting="blur" type="range" min="0" max="16" step="0.5"><span class="particle-control-value"><output for="cc-blur"></output></span></div>
      <p class="surface-opacity-help">${bilingual('文字固定为白色并加细黑边，不随动画背景切换颜色；状态与代码语法保留各自颜色。','Text stays white with a fine dark outline instead of changing with the animation. Status and syntax colors remain distinct.')}</p>
      <label class="particle-toggle-row">${bilingual('暂停动画','Pause animation')}<input type="checkbox" data-mac-setting="paused"></label>
    </fieldset>
    <fieldset class="particle-settings-group"><legend>${bilingual('输入框与代码块','Composer and code blocks')}</legend>
      <div class="particle-control-row"><label for="cc-composer-transparency">${bilingual('输入框透明度','Composer transparency')}</label><input id="cc-composer-transparency" data-mac-setting="composerTransparency" type="range" min="0" max="100" step="1"><span class="particle-control-value"><output for="cc-composer-transparency"></output></span></div>
      <label class="particle-toggle-row">${bilingual('代码块材质','Code material')}<select data-mac-setting="codeStyle" aria-label="代码块材质"><option value="frosted">磨砂 / Frosted</option><option value="transparent">透明 / Clear</option></select></label>
      <div class="particle-control-row"><label for="cc-code-transparency">${bilingual('代码块透明度','Code transparency')}</label><input id="cc-code-transparency" data-mac-setting="codeTransparency" type="range" min="0" max="100" step="1"><span class="particle-control-value"><output for="cc-code-transparency"></output></span></div>
      <p class="surface-opacity-help">${bilingual('输入框默认 75% 透明度、25% 底色。磨砂仅模糊局部背景，文字和复制按钮保持清晰；节能模式取消局部模糊。','Composer defaults to 75% transparency with 25% tint. Frosting blurs only the local backdrop; text and copy controls stay crisp. Economy removes backdrop blur.')}</p>
    </fieldset>
    <fieldset class="particle-settings-group"><legend>${bilingual('本地图片 / 视频','Local image / video')}</legend><input id="cc-local-media" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" aria-label="本地图片或视频"><button type="button" class="particle-library-clear" data-mac-action="media">${bilingual('使用本地媒体','Use local media')}</button></fieldset>
    <div class="glow-horizon-actions"><button type="button" data-mac-action="replay">${bilingual('重播','Replay')}</button><button type="button" data-mac-action="diagnostics">${bilingual('复制诊断','Copy diagnostics')}</button><button type="button" data-mac-action="restore">${bilingual('恢复原生外观','Restore native appearance')}</button></div>
  </div></section>`;
  shadow.innerHTML=`<style>${upstream.styles}\n${upstream.opacityPanelCSS}
    :host {display:block;width:auto;min-width:0;min-height:0;height:auto;contain:none;container-type:normal;animation:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;--cle-paper:var(--cc-theme-surface,#1f1f1f);--cle-paper-raised:var(--cc-theme-surface,#242424);--cle-subtle:var(--cc-theme-surface,#2a2a2a);--cle-ink:var(--cc-theme-fg,#f3f3f3);--cle-muted:var(--cc-theme-muted,#b7b7b7);--cle-rule:var(--cc-theme-border,#404040);--cle-rule-strong:var(--cc-theme-border,#505050);--cle-hover:var(--cc-theme-hover,#333);--cle-focus:var(--cc-theme-accent,#78b9ff);color:var(--cle-ink);color-scheme:var(--cc-theme-scheme,dark);text-shadow:var(--cc-theme-shadow,none);-webkit-text-stroke:var(--cc-theme-stroke,0);paint-order:stroke fill}
    .preview-market-button {margin:0;min-height:30px;padding:6px 9px;border:1px solid var(--cle-rule);border-radius:5px;background:var(--cle-paper-raised)}
    .preview-market-popover {position:fixed;inset:auto;left:auto;right:12px;bottom:48px;top:auto;width:min(292px,calc(100vw - 24px));max-height:calc(100vh - 72px);isolation:isolate;overflow:hidden}
    .preview-market-list {max-height:calc(100vh - 176px);overflow:auto}
    .preview-market-popover::after {display:none}
    .preview-market-popover:popover-open {display:grid}
    .preview-market-popover:not(:popover-open) {display:none}
    .preview-market-popover::backdrop {background:transparent}
    .particle-settings-panel {isolation:isolate}
    .particle-settings-panel[data-side="left"] {transform-origin:right top}
    .particle-settings-panel[data-side="left"]::before {position:absolute;top:var(--cle-particle-settings-anchor-y,24px);right:-6px;width:10px;height:10px;background:var(--cle-paper-raised);border-top:1px solid var(--cle-rule-strong);border-right:1px solid var(--cle-rule-strong);content:"";transform:translateY(-50%) rotate(45deg)}
    .particle-settings-panel[data-cc-mac-overlay],.preview-market-popover[data-cc-mac-overlay] {background:var(--cc-theme-surface)!important;color:var(--cc-theme-fg)}
    .preview-market-header,.particle-settings-header,.preview-extension,.particle-settings-group {backdrop-filter:none;-webkit-backdrop-filter:none}
    .cc-mac-footer {display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid var(--cle-rule);padding:8px 10px;color:var(--cle-muted);font-size:10px}
    .cc-mac-footer button {color:var(--cle-muted);background:transparent;border:0;cursor:pointer;font:inherit;padding:2px}
    #cc-mac-notice {max-width:220px;overflow-wrap:anywhere;margin:0;font-size:10px}
    [data-language="zh"] .cle-bilingual-label-en,[data-language="en"] .cle-bilingual-label-zh {display:none}
  </style><div class="preview-market-popover" id="cle-preview-market" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-preview-market-title"><div class="preview-market-header"><h3 id="cle-preview-market-title">Preview Market</h3><button class="preview-market-close" type="button" title="Close Preview Market" aria-label="Close Preview Market">${upstream.icons.close}</button></div><div class="preview-market-list"><div class="preview-market-categories" role="tablist" aria-label="Plugin categories"><button class="preview-market-category" type="button" role="tab" aria-selected="true" aria-controls="cle-appearance-section" data-preview-market-category="appearance">Appearance</button></div><section class="preview-market-section" id="cle-appearance-section" role="tabpanel" data-preview-market-section="appearance"><div class="preview-market-section-list">${upstream.opacityCard}${upstream.effects.map(effect=>effect.card).join('')}</div></section></div><div class="cc-mac-footer"><p id="cc-mac-notice" role="status" aria-live="polite">Code-Codex · Mac</p><button type="button" data-mac-action="settings">Mac 设置</button></div></div><button class="preview-market-button" type="button" aria-haspopup="dialog" aria-controls="cle-preview-market" aria-expanded="false">${upstream.icons.preview}<span>Preview Market</span></button>${upstream.opacityPanel}${upstream.effects.map(effect=>effect.panel).join('')}${generalPanel}`;
  const query=selector=>shadow.querySelector(selector);
  const market=query('#cle-preview-market');
  const marketButton=query('.preview-market-button');
  const panels=[...shadow.querySelectorAll('.particle-settings-panel')];
  let language=bridge.read().language==='en'?'en':'zh';
  let currentAnchor;
  const entries=upstream.effects.map(effect=>({...effect,card:query(`[data-appearance-plugin="${effect.pluginId}"]`),panel:query('#cle-'+effect.suffix+'-settings')}));
  function keyOf(input,effect){
    for(const [name,value]of Object.entries(input.dataset))if(/Setting$|Toggle$|Color$/.test(name))return name==='milkyWayColor'?'colors.'+value:value;
    if(input.type==='color'&&effect.id==='cloud-train')return input.id.replace('cle-cloudTrain-','');
    if(input.type==='checkbox'){
      if(/paused/.test(input.id+' '+input.className))return 'paused';
      if(/intro-enabled/.test(input.id+' '+input.className))return 'introEnabled';
      if(/inertial-wheel/.test(input.id))return 'inertialWheel';
    }
  }
  function valueOf(input){return input.type==='range'?Number(input.value):input.type==='checkbox'?input.checked:input.value;}
  function labelOf(input){
    const row=input.closest('.particle-control-row,.particle-toggle-row,.particle-color-row');
    return row?.querySelector('.cle-bilingual-label-'+language)?.textContent?.trim();
  }
  function syncValue(input,value){
    if(value===undefined)return;
    if(input.type==='checkbox')input.checked=Boolean(value);else if(shadow.activeElement!==input)input.value=String(value);
    const label=labelOf(input);if(label)input.setAttribute('aria-label',label);
    if(input.type!=='range')return;
    const row=input.closest('.particle-control-row');
    const output=row?.querySelector('output');
    if(!input.dataset.unit){const text=output?.textContent||'';input.dataset.unit=text.replace(/^[-+]?\d+(?:\.\d+)?/,'')||' ';input.dataset.percent=String(text.endsWith('%')&&Number(input.max)<=2);}
    const percent=input.dataset.percent==='true';
    const precision=(String(input.step).split('.')[1]||'').length;
    const text=percent?Math.round(value*100)+'%':Number(value).toFixed(precision)+input.dataset.unit.trimEnd();
    if(output)output.textContent=text;input.setAttribute('aria-valuetext',text);
    if(row?.dataset.hintZh)row.title=language==='zh'?row.dataset.hintZh:row.dataset.hintEn;
  }
  function languagePresentation(){
    for(const panel of panels){panel.dataset.language=language;panel.lang=language==='zh'?'zh-CN':'en';}
    for(const input of shadow.querySelectorAll('.background-language-toggle'))input.checked=language==='en';
  }
  function render(){
    const state=bridge.read();languagePresentation();
    for(const effect of entries){
      const enabled=state.enabled&&state.effect===effect.id;
      const action=effect.card.querySelector('.preview-extension-action');
      const status=effect.card.querySelector('.preview-extension-status');
      action.textContent=enabled?'Disable':'Enable';action.setAttribute('aria-pressed',String(enabled));action.dataset.enabled=String(enabled);
      action.setAttribute('aria-label',(enabled?'Disable ':'Enable ')+effect.card.querySelector('h4').textContent);
      status.textContent=enabled?(state.failed?'Enabled · Notice':'Enabled'):'Disabled';status.dataset.enabled=String(enabled&&!state.failed);
      if(!effect.panel.matches(':popover-open'))continue;
      const values=bridge.settings(effect.id);
      for(const input of effect.panel.querySelectorAll('input:not(.background-language-toggle)')){
        const key=keyOf(input,effect);if(!key)continue;
        const value=key==='paused'?values.paused:key.startsWith('colors.')?values.colors?.[Number(key.split('.')[1])]:values[key];syncValue(input,value);
      }
      for(const button of effect.panel.querySelectorAll('button[data-aurora-ionosphere-quality],button[data-heavenly-cloud-quality],button[data-milky-way-quality],button[data-glow-horizon-direction],button[data-blinking-squares-direction],button[data-mountain-steps]')){
        const [name,value]=Object.entries(button.dataset)[0];const key=name.endsWith('Quality')?'quality':name==='mountainSteps'?'steps':effect.id==='glow-horizon'?'variant':'direction';
        button.setAttribute('aria-pressed',String(String(values[key])===value));
      }
      for(const button of effect.panel.querySelectorAll('[data-black-hole-preset]'))button.setAttribute('aria-pressed',String(JSON.stringify(values)===JSON.stringify(upstream.blackHolePresets[button.dataset.blackHolePreset])));
      const error=effect.panel.querySelector('.particle-plugin-error');if(error){error.hidden=!(enabled&&state.failed);error.textContent=enabled&&state.failed?state.notice:'';}
    }
    const active=state.enabled&&state.opacityEnabled;
    query('.surface-opacity-enable').setAttribute('aria-pressed',String(active));query('.surface-opacity-enable').textContent=state.opacityEnabled?'Disable':'Enable';
    query('.surface-opacity-status').textContent=active?'Enabled':state.opacityEnabled?'Paused · No background':'Disabled';
    query('.surface-opacity-status').dataset.enabled=String(active);
    query('.surface-opacity-message').textContent=language==='zh'?(active?'侧栏和对话区固定全透明；其他设置实时应用并保存。':'侧栏和对话区固定全透明；先启用背景，再调节其他分区。'):(active?'Sidebar and conversation stay transparent; other changes apply live and save.':'Sidebar and conversation stay transparent. Enable a background to adjust other regions.');
    for(const input of shadow.querySelectorAll('[data-mask-region]')){const fixed=state.fixedTransparentRegions?.includes(input.dataset.maskRegion);input.value=String(state.opacity[input.dataset.maskRegion]??0);input.disabled=!active||fixed;input.setAttribute('aria-valuetext',fixed?(language==='zh'?'固定全透明':'Always fully transparent'):input.value+'%');query(`output[for="${input.id}"]`).textContent=fixed?(language==='zh'?'固定全透':'Always clear'):input.value+'%';}
    for(const input of shadow.querySelectorAll('[data-mac-setting]')){const key=input.dataset.macSetting;syncValue(input,state[key]);if(input.type==='range'){const output=input.closest('.particle-control-row').querySelector('output');output.textContent=input.value+(key==='blur'?'px':'%');}}
    query('#cc-mac-notice').textContent=state.notice||'Code-Codex · Mac';
  }
  function position(panel,anchor){
    if(!panel.matches(':popover-open'))return;
    const bounds=bridge.bounds();
    panel.style.maxHeight=Math.max(100,(bounds?.height||innerHeight)-24)+'px';
    panel.style.maxWidth=Math.max(180,(bounds?.width||innerWidth)-24)+'px';
    const box=panel.getBoundingClientRect(),rect=anchor.getBoundingClientRect();
    const leftEdge=Math.max(12,bounds?.left+12||12),rightEdge=Math.min(innerWidth-12,bounds?.right-12||innerWidth-12);
    const topEdge=Math.max(12,bounds?.top+12||12),bottomEdge=Math.min(innerHeight-12,bounds?.bottom-12||innerHeight-12);
    const marketBounds=market.getBoundingClientRect();
    let left=marketBounds.left-box.width-12,side='left';if(left<leftEdge){left=rightEdge-box.width;side='overlay';}
    panel.dataset.side=side;
    panel.style.left=Math.max(leftEdge,Math.min(rightEdge-box.width,left))+'px';
    panel.style.top=Math.max(topEdge,Math.min(bottomEdge-box.height,rect.top))+'px';
    panel.style.setProperty('--cle-particle-settings-anchor-y',Math.max(16,rect.top-parseFloat(panel.style.top)+12)+'px');
  }
  function closePanels(){for(const panel of panels)if(panel.matches(':popover-open'))panel.hidePopover();}
  function layout(){
    const bounds=bridge.bounds();if(!bounds)return;
    market.style.right=Math.max(12,innerWidth-bounds.right+12)+'px';
    market.style.bottom=Math.max(48,innerHeight-bounds.bottom+48)+'px';
    market.style.maxHeight=Math.max(100,bounds.height-60)+'px';
    query('.preview-market-list').style.maxHeight=Math.max(60,bounds.height-146)+'px';
    for(const panel of panels)if(panel.matches(':popover-open')&&currentAnchor)position(panel,currentAnchor);
  }
  function openPanel(panel,anchor){
    const open=panel.matches(':popover-open');closePanels();if(open)return;
    currentAnchor=anchor;panel.showPopover();render();layout();panel.querySelector('.particle-settings-close')?.focus();bridge.overlays();
  }
  function closeMarket(){closePanels();if(market.matches(':popover-open'))market.hidePopover();marketButton.setAttribute('aria-expanded','false');bridge.overlays();}
  marketButton.addEventListener('click',()=>{if(market.matches(':popover-open'))closeMarket();else{render();market.showPopover();layout();marketButton.setAttribute('aria-expanded','true');bridge.overlays();}},{signal});
  query('.preview-market-close').addEventListener('click',closeMarket,{signal});
  market.addEventListener('toggle',()=>{marketButton.setAttribute('aria-expanded',String(market.matches(':popover-open')));bridge.overlays();},{signal});
  for(const panel of panels){
    panel.querySelector('.particle-settings-close')?.addEventListener('click',()=>{panel.hidePopover();currentAnchor?.focus();bridge.overlays();},{signal});
    panel.addEventListener('toggle',()=>{const trigger=query(`[aria-controls="${panel.id}"]`);trigger?.setAttribute('aria-expanded',String(panel.matches(':popover-open')));bridge.overlays();},{signal});
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();panel.hidePopover();currentAnchor?.focus();bridge.overlays();}},{signal});
  }
  for(const effect of entries){
    effect.card.querySelector('.preview-extension-action').addEventListener('click',()=>{bridge.enable(effect.id);render();},{signal});
    const trigger=effect.card.querySelector('.particle-settings-trigger');trigger.addEventListener('click',()=>openPanel(effect.panel,trigger),{signal});
    effect.panel.addEventListener('input',event=>{const input=event.target;if(!(input instanceof HTMLInputElement)||input.classList.contains('background-language-toggle'))return;const key=keyOf(input,effect);if(key){bridge.update(effect.id,key,valueOf(input));render();}},{signal});
    effect.panel.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(/-reset$/.test(button.className)){bridge.reset(effect.id);render();}
      else if(/-replay$/.test(button.className))bridge.replay(effect.id);
      else if(button.dataset.blackHolePreset){bridge.preset(effect.id,upstream.blackHolePresets[button.dataset.blackHolePreset]);render();}
      else for(const [name,value]of Object.entries(button.dataset))if(/Quality$|Direction$|Steps$/.test(name)){bridge.update(effect.id,name.endsWith('Quality')?'quality':name.endsWith('Steps')?'steps':effect.id==='glow-horizon'?'variant':'direction',name.endsWith('Steps')?Number(value):value);render();}
    },{signal});
  }
  const opacityTrigger=query('.surface-opacity-settings-trigger');opacityTrigger.addEventListener('click',()=>openPanel(query('#cle-surface-opacity-settings'),opacityTrigger),{signal});
  query('.surface-opacity-enable').addEventListener('click',()=>{bridge.opacityEnabled();render();},{signal});
  query('#cle-surface-opacity-settings').addEventListener('input',event=>{const region=event.target.dataset.maskRegion;if(region){bridge.opacity(region,Number(event.target.value));render();}},{signal});
  query('#cle-surface-opacity-settings').addEventListener('click',event=>{const region=event.target.closest('[data-mask-reset]')?.dataset.maskReset;if(region){bridge.opacity(region,0);render();}},{signal});
  query('.surface-opacity-reset').addEventListener('click',()=>{for(const region of upstream.regions)bridge.opacity(region.key,0);render();},{signal});
  shadow.addEventListener('input',event=>{const input=event.target;if(input.classList.contains('background-language-toggle')){language=input.checked?'en':'zh';bridge.general('language',language);render();}else if(input.dataset.macSetting){bridge.general(input.dataset.macSetting,valueOf(input));render();}},{signal});
  query('#cc-local-media').addEventListener('change',()=>{const file=query('#cc-local-media').files[0];if(file)bridge.media(file);},{signal});
  shadow.addEventListener('click',event=>{
    const action=event.target.closest('[data-mac-action]')?.dataset.macAction;if(!action)return;
    if(action==='settings')openPanel(query('#cle-mac-settings'),event.target.closest('button'));
    else if(action==='restore'){closeMarket();bridge.restore();}
    else if(action==='diagnostics')bridge.diagnostics();
    else if(action==='replay')bridge.replay();
    else if(action==='media'){bridge.enable('media');render();}
  },{signal});
  document.addEventListener('pointerdown',event=>{const path=event.composedPath();if(!path.includes(shadow.host)&&market.matches(':popover-open'))closeMarket();},{signal});
  window.addEventListener('resize',()=>{layout();bridge.overlays();},{signal});
  render();
  return {render,layout,overlays:()=>[market,...panels].filter(panel=>panel.matches(':popover-open')),close:closeMarket};
}

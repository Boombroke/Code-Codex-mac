// Serialized into the document-start payload. Only the validated app shell is
// styled; no pixel readback, recurring timer, visibility hiding, or UI scaling.
export function createPrepaint(host) {
  const document=host.document,key='code-codex-mac-backgrounds:v1';
  host.__CCMacPrepaint__?.dispose();
  const style=document.createElement('style');style.id='cc-mac-prepaint-style';
  const gate='data-cc-mac-prepaint';
  const scope='html['+gate+'] #root';
  style.textContent=`
    ${scope} {isolation:isolate!important;background:var(--cc-mac-prepaint-backdrop)!important;--color-surface:transparent;--color-surface-secondary:transparent;--color-surface-tertiary:transparent;--color-surface-canvas:transparent;--color-surface-default:transparent;--color-background-surface:transparent;--color-background-surface-under:transparent;--color-background-elevated-primary:transparent;--color-background-elevated-secondary:transparent}
    ${scope} :is(main.main-surface,main[data-app-shell-main-surface="default"],[data-app-shell-frame],[data-app-shell-page-surface="true"],[data-thread-scroll-footer="true"],.thread-scroll-container[data-app-action-timeline-scroll],aside.app-shell-left-panel,aside[data-app-shell-left-panel-appearance],.sidebar-navigation,nav[data-app-navigation-rail],[data-app-shell-titlebar],[data-app-shell-page-header]):not([data-cc-mac-region]) {background-color:transparent!important;background-image:none!important}
    ${scope} [class~="group/settings"][data-density] [style*="--color-background-panel"]:not([data-cc-mac-region]) {background-color:transparent!important;background-image:none!important}
    ${scope},${scope} :is(.sidebar-navigation nav[role="navigation"],.sidebar-navigation .sidebar-item,[data-user-message-bubble],[class~="group/settings"][data-density]):not([data-cc-mac-region]) {
      --color-text:#fff;--color-text-default:#fff;--color-text-primary:#fff;--color-text-secondary:#e2e8f0;--color-text-tertiary:#e2e8f0;--color-text-user-message:#fff;--color-token-text-primary:#fff;--color-token-text-secondary:#fff;--color-token-text-tertiary:#e2e8f0;--color-token-editor-foreground:#fff;--color-token-input-foreground:#fff;--color-token-menu-foreground:#fff;--color-text-composer-primary:#fff;--color-codex-editor-cursor:#fff;--cc-mac-prepaint-ink:#fff;
      color:var(--cc-mac-prepaint-ink);text-shadow:0 1px 1px rgba(0,0,0,.7);-webkit-text-stroke:.55px rgba(0,0,0,.95);paint-order:stroke fill;
    }
    ${scope} [class~="group/settings"][data-density] [class~="@container/settings-row"] :is(button.bg-primary-soft-alpha,button.bg-primary-soft,button[class~="bg-text/5"],[role="combobox"],select,input[type="text"],input[type="number"]):not([data-cc-mac-region]) {
      --color-background-primary-soft-alpha:rgba(13,19,28,.64);--color-background-primary-soft:rgba(13,19,28,.64);
      background-color:rgba(13,19,28,.64)!important;color:#fff;text-shadow:none;-webkit-text-stroke:0;
    }
    ${scope} :is([data-composer-layout],[data-composer-surface-variant],.bg-background-composer-action-bar):not([data-cc-mac-region]) {
      --composer-layout-surface-background:var(--cc-mac-prepaint-composer);--color-background-composer-surface:var(--cc-mac-prepaint-composer);--color-background-composer-action-bar:var(--cc-mac-prepaint-composer);--color-composer-surface:var(--cc-mac-prepaint-composer);
      background-color:var(--cc-mac-prepaint-composer)!important;
    }
    ${scope} :is([data-composer-layout],[data-composer-surface-variant]):not([data-cc-mac-region]) :is([data-composer-input],.ProseMirror,textarea) {background-color:transparent!important;caret-color:#fff;color:#fff}
  `;
  let active=false,disposed=false,root,previousGate,observer,latestConfig;
  const leases=new Map();
  function lease(variable,value){if(!root)return;if(!leases.has(variable))leases.set(variable,{value:root.style.getPropertyValue(variable),priority:root.style.getPropertyPriority(variable)});if(root.style.getPropertyValue(variable)!==value)root.style.setProperty(variable,value);}
  function install(){
    if(disposed||!document.documentElement)return;
    if(!root){root=document.documentElement;previousGate=root.getAttribute(gate);}
    if(!style.isConnected)(document.head||root).append(style);
    if(active)root.setAttribute(gate,'');else root.removeAttribute(gate);
    observer?.disconnect();observer=undefined;
  }
  function update(config){
    if(disposed)return;
    latestConfig=config;
    active=config?.enabled===true&&!config.removed&&[2,3,4].includes(config.layoutVersion);
    install();
    const percent=Number(config?.composerTransparency),alpha=1-(Number.isFinite(percent)?Math.min(100,Math.max(0,percent)):75)/100;
    // A small CSS fallback covers only the shell before its canvas exists. The
    // actual decorative canvas paints over it; it never hides or delays content.
    const colors={
      'black-hole':['#1d1320','#81522d','#252936'],
      'aurora-ionosphere':['#173b36','#254044','#2c253e'],
      'heavenly-cloud':['#36485a','#70869b','#485366'],
      'glow-horizon':['#202d3a','#504b71','#363e4d'],
      'milky-way':['#354956','#62476f','#596764'],
      'mountain':['#70534c','#c88469','#7e635e'],
      'cloud-train':['#4b6577','#9eafba','#5b7285'],
      'blinking-squares':['#27323d','#3b4450','#27313c'],
    };
    const candidate=colors[config?.effect];
    const selected=Array.isArray(candidate)?candidate:colors['black-hole'];
    lease('--cc-mac-prepaint-backdrop',`linear-gradient(135deg,${selected.join(',')})`);
    lease('--cc-mac-prepaint-composer',`rgba(18,23,32,${alpha})`);
  }
  let saved;try{saved=JSON.parse(host.localStorage.getItem(key)||'{}');}catch{}
  update(saved);
  if(!root){observer=new host.MutationObserver(()=>{install();if(root)update(latestConfig);});observer.observe(document,{childList:true,subtree:true});}
  const api={update,dispose(){if(disposed)return;disposed=true;observer?.disconnect();style.remove();if(root){if(previousGate===null)root.removeAttribute(gate);else root.setAttribute(gate,previousGate);for(const [name,prior]of leases)if(prior.value)root.style.setProperty(name,prior.value,prior.priority);else root.style.removeProperty(name);}if(host.__CCMacPrepaint__===api)delete host.__CCMacPrepaint__;}};
  host.__CCMacPrepaint__=api;return api;
}

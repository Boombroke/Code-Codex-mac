// Event-driven Home geometry. Only an authenticated primary shell can authorize
// a small native composer, including the app's body-mounted Home portal.
export function createHomeMaterial(host) {
  const document=host.document,leases=new Map(),observed=new Set(),snapshots=new WeakMap(),styleStates=new WeakMap();
  const marker='data-cc-mac-home-material-owner',surface='data-cc-mac-home-material-surface',validated='data-cc-mac-validated-surface';
  const home='[data-composer-utility-bar-variant="home"]:is([data-composer-surface-variant],[data-composer-layout]):not([data-composer-body]):not([data-composer-input]):not([class*="ComposerLayoutBody"]):not([class*="ComposerLayoutInput"]):not([class*="ComposerLayoutFooter"])';
  const main='main:is(.main-surface,[data-app-shell-main-surface="default"])';
  const rail='[data-composer-rail]',item='[data-composer-rail-item="present"][data-composer-placement="home"]';
  const portal='[data-right-panel-composer-overlay-content="true"]',floating='[data-floating-chat-surface="true"]',widget='[data-codex-composer-root]';
  const blocked='button,a,[role="button"],[role="switch"],[role="checkbox"],[role="radio"],[role="combobox"],[role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"],[data-composer-overlay-floating-ui]';
  const hidden='[hidden],[inert],[aria-hidden="true"],[data-app-shell-active-page="false"]';
  const relevant=home+','+rail+','+item+','+main+',#root,[data-app-shell-frame],['+validated+'],'+portal+','+floating+','+widget;
  let active=false,disposed=false,queued=false,observer,resizeObserver,generation=0;
  const enqueue=typeof host.queueMicrotask==='function'?host.queueMicrotask.bind(host):callback=>Promise.resolve().then(callback);
  function inlineState(node){const style=node.style;return ['display','visibility','position','width','height','min-width','max-width','min-height','max-height','top','right','bottom','left','margin','margin-top','margin-right','margin-bottom','margin-left','padding','padding-top','padding-right','padding-bottom','padding-left'].map(key=>style?.getPropertyValue(key)||'').join('|')+'|opacity-zero:'+String(style?.getPropertyValue('opacity')!==''&&Number(style?.getPropertyValue('opacity'))===0);}
  function lease(node){if(!leases.has(node))leases.set(node,{attributes:new Map(),styles:new Map()});return leases.get(node);}
  function attribute(node,name,value){const prior=lease(node);if(!prior.attributes.has(name))prior.attributes.set(name,node.getAttribute(name));if(node.getAttribute(name)!==value)node.setAttribute(name,value);}
  function property(node,name,value){const prior=lease(node);if(!prior.styles.has(name))prior.styles.set(name,{value:node.style.getPropertyValue(name),priority:node.style.getPropertyPriority(name)});if(node.style.getPropertyValue(name)!==value||node.style.getPropertyPriority(name)!=='')node.style.setProperty(name,value);}
  function restore(node){const prior=leases.get(node);if(!prior)return;for(const [name,value]of prior.attributes)if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);for(const [name,value]of prior.styles)if(value.value)node.style.setProperty(name,value.value,value.priority);else node.style.removeProperty(name);snapshots.set(node,node.getAttribute('style'));leases.delete(node);}
  function visible(node,limit){if(!node||node.isConnected===false||node.closest(hidden)||node.closest(blocked))return false;for(let current=node;current;current=current.parentElement){const css=host.getComputedStyle(current);if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||css.opacity!==''&&Number(css.opacity)===0)return false;if(current===limit)break;}return true;}
  function rectangle(node,cache){if(cache.has(node))return cache.get(node);const r=node.getBoundingClientRect(),valid=[r.top,r.right,r.bottom,r.left,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0&&r.right>r.left&&r.bottom>r.top;const result=valid?{top:r.top,right:r.right,bottom:r.bottom,left:r.left}:null;cache.set(node,result);return result;}
  function inside(rect,bounds){return rect&&bounds&&rect.left>=bounds.left-2&&rect.top>=bounds.top-2&&rect.right<=bounds.right+2&&rect.bottom<=bounds.bottom+2;}
  function scale(node,bounds){const sx=node.offsetWidth===undefined?1:node.offsetWidth/(bounds.right-bounds.left),sy=node.offsetHeight===undefined?1:node.offsetHeight/(bounds.bottom-bounds.top);return [sx,sy].every(value=>Number.isFinite(value)&&value>=.25&&value<=4)?{sx,sy}:null;}
  function homeRails(node){return [...node.querySelectorAll(rail)].filter(r=>!r.closest(blocked)&&r.querySelector(item));}
  function localOwner(root,content){
    const inner=homeRails(root);if(inner.length)return {node:root,rails:inner};
    const nativeWidget=root.closest(widget);
    for(let candidate=root.parentElement;candidate;candidate=candidate.parentElement){
      if(candidate===document.body||candidate===document.documentElement||candidate.matches('#root')||candidate.matches(main)||candidate.matches(floating))break;
      if((candidate===nativeWidget||content&&content.contains(candidate)&&candidate!==content)&&!candidate.closest(blocked)){
        const roots=[...candidate.querySelectorAll(home)],rails=homeRails(candidate);
        if(roots.length===1&&roots[0]===root&&rails.length&&rails.every(r=>!root.contains(r)))return {node:candidate,rails};
      }
      if(candidate===content||candidate===nativeWidget)break;
    }
    return null;
  }
  function material(owner,root,insets,isPortal){
    if(owner!==root){const css=host.getComputedStyle(owner);if(!css.position||css.position==='static')property(owner,'position','relative');property(owner,'isolation','isolate');}
    const rootCSS=host.getComputedStyle(root),body=root.querySelector('[data-composer-body]'),bodyCSS=body&&host.getComputedStyle(body);
    const radius=rootCSS.getPropertyValue?.('--composer-border-radius')?.trim()||bodyCSS?.borderRadius||'22px';
    const shape=rootCSS.getPropertyValue?.('--composer-corner-shape')?.trim()||bodyCSS?.cornerShape||'round';
    property(owner,'--cc-home-material-radius',radius==='0px'||radius==='0'?'22px':radius);property(owner,'--cc-home-material-corner-shape',shape);
    for(const [edge,value]of Object.entries(insets)){const rounded=Math.round(Math.min(0,value)*100)/100;property(owner,'--cc-home-material-'+edge,(Object.is(rounded,-0)?0:rounded)+'px');}
    attribute(owner,marker,'');if(isPortal)attribute(owner,surface,'');
    snapshots.set(owner,owner.getAttribute('style'));styleStates.set(owner,inlineState(owner));
  }
  function refresh(){
    if(!active||disposed)return;
    const wanted=new Set(),watch=new Set(),cache=new Map(),policy=host.__CC_MAC_SURFACE_POLICY__;
    const apps=[...document.querySelectorAll('#root')],app=apps.length===1?apps[0]:null;
    const mains=app?[...app.querySelectorAll(main)].filter(node=>visible(node,app)):[],mainSurface=mains.length===1?mains[0]:null;
    const frame=mainSurface?.closest('[data-app-shell-frame="true"]');
    const authenticated=app&&app.getAttribute(validated)!==null&&mainSurface&&frame&&app.contains(frame)&&policy?.validateRoot?.(app,mainSurface)===true;
    const viewport={left:0,top:0,right:host.innerWidth,bottom:host.innerHeight};
    const appBounds=authenticated&&rectangle(app,cache),mainBounds=authenticated&&rectangle(mainSurface,cache),frameBounds=authenticated&&rectangle(frame,cache);
    const boundsAllowed=authenticated&&[viewport.right,viewport.bottom].every(value=>Number.isFinite(value)&&value>0)&&inside(appBounds,viewport)&&inside(frameBounds,appBounds)&&inside(mainBounds,frameBounds);
    if(boundsAllowed)for(const root of document.querySelectorAll(home)){
      if(root.parentElement?.closest(home)||root.querySelector(home)||!visible(root,app))continue;
      const content=root.closest(portal),float=content?.closest(floating);
      const isPortal=!app.contains(root)&&!!content&&!!float&&float.contains(content)&&content.querySelectorAll(home).length===1&&visible(float)&&visible(content);
      if(!app.contains(root)&&!isPortal||app.contains(root)&&root.closest(main)!==mainSurface)continue;
      const local=localOwner(root,isPortal?content:null);if(!local)continue;
      const owner=local.node,rails=local.rails;
      watch.add(root);watch.add(owner);for(const node of rails)watch.add(node);
      if(!visible(owner,app))continue;
      const rootBounds=rectangle(root,cache),ownerBounds=rectangle(owner,cache);
      const allBounds=[appBounds,frameBounds,mainBounds,viewport];
      if(allBounds.some(b=>!inside(rootBounds,b)||!inside(ownerBounds,b)))continue;
      const rootScale=scale(root,rootBounds),ownerScale=scale(owner,ownerBounds);if(!rootScale||!ownerScale)continue;
      if(owner!==root){const css=host.getComputedStyle(owner);if((!css.position||css.position==='static')&&['top','right','bottom','left'].some(edge=>css[edge]&&css[edge]!=='auto'))continue;}
      const union={...ownerBounds};union.top=Math.min(union.top,rootBounds.top);union.right=Math.max(union.right,rootBounds.right);union.bottom=Math.max(union.bottom,rootBounds.bottom);union.left=Math.min(union.left,rootBounds.left);let invalid=false;
      for(const node of rails){if(!visible(node,owner))continue;const present=[...node.querySelectorAll(item)].filter(child=>visible(child,owner));if(!present.length)continue;const r=rectangle(node,cache);if(!r||allBounds.some(b=>!inside(r,b))||present.some(child=>allBounds.some(b=>!inside(rectangle(child,cache),b)))){invalid=true;break;}union.top=Math.min(union.top,r.top);union.right=Math.max(union.right,r.right);union.bottom=Math.max(union.bottom,r.bottom);union.left=Math.min(union.left,r.left);}
      const width=rootBounds.right-rootBounds.left,height=rootBounds.bottom-rootBounds.top,limit=Math.max(256,height*rootScale.sy);
      const expansion=[(rootBounds.top-union.top)*rootScale.sy,(union.right-rootBounds.right)*rootScale.sx,(union.bottom-rootBounds.bottom)*rootScale.sy,(rootBounds.left-union.left)*rootScale.sx];
      if(invalid||allBounds.some(b=>!inside(union,b))||union.right-union.left>1.5*width||expansion.some(value=>!Number.isFinite(value)||value>limit))continue;
      const insets={top:(union.top-ownerBounds.top)*ownerScale.sy,right:(ownerBounds.right-union.right)*ownerScale.sx,bottom:(ownerBounds.bottom-union.bottom)*ownerScale.sy,left:(union.left-ownerBounds.left)*ownerScale.sx};
      wanted.add(owner);material(owner,root,insets,isPortal);
    }
    for(const node of [...leases.keys()])if(!wanted.has(node))restore(node);
    for(const node of [...observed])if(!watch.has(node)){resizeObserver?.unobserve(node);observed.delete(node);}for(const node of watch)if(!observed.has(node)){resizeObserver?.observe(node);observed.add(node);}
  }
  function schedule(){if(!active||disposed||queued)return;queued=true;const ticket=generation;enqueue(()=>{if(ticket!==generation)return;queued=false;refresh();});}
  function related(node){return node?.nodeType===1&&(leases.has(node)||node.matches(relevant)||node.querySelector(relevant));}
  function start(){
    observer=new host.MutationObserver(records=>{for(const r of records){const target=r.target;if(target.nodeType===1&&target.closest('#cc-mac-background,#cc-mac-background-controls'))continue;if(r.type==='childList'){if([...r.addedNodes,...r.removedNodes].some(related)){schedule();return;}}else if(r.type==='attributes'&&r.attributeName!==marker&&r.attributeName!==surface){if(r.attributeName==='style'){if(snapshots.get(target)===target.getAttribute('style'))continue;const next=inlineState(target),previous=styleStates.get(target);styleStates.set(target,next);if(previous===next)continue;if(previous===undefined&&!/display|visibility|opacity|position|width|height|margin|padding|(?:^|;)\s*(?:top|right|bottom|left)\s*:/.test(target.getAttribute('style')||''))continue;}if(related(target)||[...leases.keys()].some(root=>root.contains(target))){schedule();return;}}}});
    observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','inert','aria-hidden',validated,'data-app-shell-frame','data-app-shell-main-surface','data-app-shell-active-page','data-composer-utility-bar-variant','data-composer-layout','data-composer-surface-variant','data-composer-rail','data-composer-rail-placement','data-composer-rail-item','data-composer-placement','data-composer-rail-contained','data-composer-rail-overlap','data-composer-rail-framed','data-floating-chat-surface','data-right-panel-composer-overlay-content','data-codex-composer-root']});
    if(typeof host.ResizeObserver==='function')resizeObserver=new host.ResizeObserver(schedule);host.addEventListener?.('resize',schedule);document.addEventListener?.('transitionend',settled,true);document.addEventListener?.('animationend',settled,true);refresh();
  }
  function settled(event){const target=event.target;if(active&&target?.nodeType===1&&target!==document.body&&target!==document.documentElement&&[...observed].some(node=>node===target||node.contains(target)||target.contains(node)))schedule();}
  function stop(){generation++;queued=false;observer?.disconnect();observer=undefined;resizeObserver?.disconnect();resizeObserver=undefined;observed.clear();host.removeEventListener?.('resize',schedule);document.removeEventListener?.('transitionend',settled,true);document.removeEventListener?.('animationend',settled,true);for(const node of [...leases.keys()])restore(node);}
  return {update(config){if(disposed)return;const next=config===true||config?.enabled===true&&!config.removed&&!config.renderFailed;if(next!==active){active=next;if(active)start();else stop();}else if(active)refresh();},refresh,dispose(){if(disposed)return;active=false;stop();disposed=true;}};
}

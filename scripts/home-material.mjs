// Document-start and mounted code share this event-driven geometry adapter.
// It owns only one marker and four CSS insets, never layout or pixel content.
export function createHomeMaterial(host) {
  const document=host.document,owners=new Map(),observed=new Set(),snapshots=new WeakMap(),styleStates=new WeakMap();
  const marker='data-cc-mac-home-material-owner';
  const home='[data-composer-utility-bar-variant="home"]:is([data-composer-surface-variant],[data-composer-layout]):not([data-composer-body]):not([data-composer-input]):not([class*="ComposerLayoutBody"]):not([class*="ComposerLayoutInput"]):not([class*="ComposerLayoutFooter"])';
  const main='main:is(.main-surface,[data-app-shell-main-surface="default"])';
  const rail='[data-composer-rail]',item='[data-composer-rail-item][data-composer-placement="home"]';
  const blocked='button,a,[role="button"],[role="switch"],[role="combobox"],[role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"],[data-composer-overlay-floating-ui]';
  const hidden='[hidden],[aria-hidden="true"],[data-app-shell-active-page="false"]';
  const relevant=home+','+rail+','+item+','+main+',#root,[data-app-shell-frame]';
  let active=false,disposed=false,queued=false,observer,resizeObserver,generation=0;
  const enqueue=typeof host.queueMicrotask==='function'?host.queueMicrotask.bind(host):callback=>Promise.resolve().then(callback);
  function inlineState(node){
    const style=node.style;
    return ['display','visibility','width','height','min-width','max-width','min-height','max-height','top','right','bottom','left','margin','margin-top','margin-right','margin-bottom','margin-left','padding','padding-top','padding-right','padding-bottom','padding-left'].map(key=>style?.getPropertyValue(key)||'').join('|')+'|opacity-zero:'+String(style?.getPropertyValue('opacity')!==''&&Number(style?.getPropertyValue('opacity'))===0);
  }
  function restore(node){
    const prior=owners.get(node);if(!prior)return;
    if(prior.attribute===null)node.removeAttribute(marker);else node.setAttribute(marker,prior.attribute);
    for(const [name,value]of prior.styles)if(value.value)node.style.setProperty(name,value.value,value.priority);else node.style.removeProperty(name);
    snapshots.set(node,node.getAttribute('style'));owners.delete(node);
  }
  function visible(node,root){
    if(node.isConnected===false||node.closest(hidden)||node.closest(blocked))return false;
    for(let current=node;current;current=current.parentElement){
      const css=host.getComputedStyle(current);
      if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||css.opacity!==''&&Number(css.opacity)===0)return false;
      if(current===root)break;
    }
    return true;
  }
  function rectangle(node,cache){
    if(cache.has(node))return cache.get(node);
    const r=node.getBoundingClientRect(),valid=[r.top,r.right,r.bottom,r.left,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;
    const result=valid?{top:r.top,right:r.right,bottom:r.bottom,left:r.left}:null;cache.set(node,result);return result;
  }
  function setInsets(node,insets){
    if(!owners.has(node))owners.set(node,{attribute:node.getAttribute(marker),styles:new Map()});
    const prior=owners.get(node);
    for(const [edge,value]of Object.entries(insets)){
      const name='--cc-home-material-'+edge;
      if(!prior.styles.has(name))prior.styles.set(name,{value:node.style.getPropertyValue(name),priority:node.style.getPropertyPriority(name)});
      const rounded=Math.round(Math.min(0,value)*100)/100,text=(Object.is(rounded,-0)?0:rounded)+'px';
      if(node.style.getPropertyValue(name)!==text||node.style.getPropertyPriority(name)!=='')node.style.setProperty(name,text);
    }
    if(node.getAttribute(marker)!=='')node.setAttribute(marker,'');
    snapshots.set(node,node.getAttribute('style'));styleStates.set(node,inlineState(node));
  }
  function refresh(){
    if(!active||disposed)return;
    const wanted=new Set(),watch=new Set(),cache=new Map();
    for(const root of document.querySelectorAll(home)){
      const app=root.closest('#root');
      if(!app||root===app||!root.closest('[data-app-shell-frame]')||!app.querySelector(main)||root.parentElement?.closest(home)||root.closest(blocked))continue;
      const rails=[...root.querySelectorAll(rail)].filter(node=>!node.closest(blocked));
      // Do not claim an unknown Home layout that has no native action rail.
      if(!rails.length)continue;
      watch.add(root);for(const node of rails)watch.add(node);
      if(!visible(root,app))continue;
      const bounds=rectangle(root,cache);if(!bounds)continue;
      const union={...bounds};
      for(const node of rails){
        if(!visible(node,root)||![...node.querySelectorAll(item)].some(child=>visible(child,root)&&rectangle(child,cache)))continue;
        const r=rectangle(node,cache);if(!r)continue;
        union.top=Math.min(union.top,r.top);union.right=Math.max(union.right,r.right);union.bottom=Math.max(union.bottom,r.bottom);union.left=Math.min(union.left,r.left);
      }
      // Motion can scale a Home root or its ancestor. Rectangles are rendered
      // coordinates, while pseudo-element insets use the root's CSS units.
      const sx=root.offsetWidth>0?root.offsetWidth/(bounds.right-bounds.left):1,sy=root.offsetHeight>0?root.offsetHeight/(bounds.bottom-bounds.top):1;
      wanted.add(root);setInsets(root,{top:(union.top-bounds.top)*sy,right:(bounds.right-union.right)*sx,bottom:(bounds.bottom-union.bottom)*sy,left:(union.left-bounds.left)*sx});
    }
    for(const node of [...owners.keys()])if(!wanted.has(node))restore(node);
    if(resizeObserver){
      for(const node of [...observed])if(!watch.has(node)){resizeObserver.unobserve(node);observed.delete(node);}
      for(const node of watch)if(!observed.has(node)){resizeObserver.observe(node);observed.add(node);}
    }
  }
  function schedule(){
    if(!active||disposed||queued)return;
    queued=true;const ticket=generation;
    enqueue(()=>{if(ticket!==generation)return;queued=false;refresh();});
  }
  function related(node){return node?.nodeType===1&&(owners.has(node)||node.matches(relevant)||node.querySelector(relevant));}
  function start(){
    observer=new host.MutationObserver(records=>{
      for(const r of records){
        const target=r.target;
        if(target.nodeType===1&&target.closest('#cc-mac-background,#cc-mac-background-controls'))continue;
        if(r.type==='childList'){
          if([...r.addedNodes,...r.removedNodes].some(related)){schedule();return;}
        }else if(r.type==='attributes'&&r.attributeName!==marker){
          if(r.attributeName==='style'){
            if(snapshots.get(target)===target.getAttribute('style'))continue;
            const next=inlineState(target),previous=styleStates.get(target);styleStates.set(target,next);
            if(previous===next)continue;
            // Ignore palette/background writes and intermediate transforms;
            // zero-opacity visibility changes and layout styles still refresh.
            if(previous===undefined&&!/display|visibility|opacity|width|height|margin|padding|(?:^|;)\s*(?:top|right|bottom|left)\s*:/.test(target.getAttribute('style')||''))continue;
          }
          if(related(target)||[...owners.keys()].some(root=>root.contains(target))){schedule();return;}
        }
      }
    });
    observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','data-app-shell-active-page','data-composer-utility-bar-variant','data-composer-layout','data-composer-surface-variant','data-composer-rail','data-composer-rail-placement','data-composer-rail-item','data-composer-placement','data-composer-rail-contained','data-composer-rail-overlap','data-composer-rail-framed']});
    if(typeof host.ResizeObserver==='function')resizeObserver=new host.ResizeObserver(schedule);
    host.addEventListener?.('resize',schedule);
    document.addEventListener?.('transitionend',settled,true);document.addEventListener?.('animationend',settled,true);
    refresh();
  }
  function settled(event){if(active&&event.target?.nodeType===1&&[...owners.keys()].some(root=>root===event.target||root.contains(event.target)))schedule();}
  function stop(){
    generation++;queued=false;observer?.disconnect();observer=undefined;resizeObserver?.disconnect();resizeObserver=undefined;observed.clear();
    host.removeEventListener?.('resize',schedule);document.removeEventListener?.('transitionend',settled,true);document.removeEventListener?.('animationend',settled,true);
    for(const node of [...owners.keys()])restore(node);
  }
  return {update(config){if(disposed)return;const next=config===true||config?.enabled===true&&!config.removed&&!config.renderFailed;if(next!==active){active=next;if(active)start();else stop();}else if(active)refresh();},refresh,dispose(){if(disposed)return;active=false;stop();disposed=true;}};
}

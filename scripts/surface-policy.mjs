// Serialized into the payload before any preference read, style, or renderer.
export function createSurfacePolicy(host,{preview=false,observe=true}={}) {
  const doc=host.document,marker='data-cc-mac-validated-surface',leases=new Map(),observed=new Set(),styleStates=new WeakMap();
  const mainSelector='main:is(.main-surface,[data-app-shell-main-surface="default"])';
  const hidden='[hidden],[aria-hidden="true"],[data-app-shell-active-page="false"],.hidden,.invisible';
  let disposed=false,observer,resizeObserver,queued=false;
  function allowedWindow(){
    if(disposed)return false;
    try {
      if(host.top!==host.self)return false;
      const raw=host.location.href;
      if(typeof raw!=='string'||raw.length>8192||raw.trim()!==raw||/[\\\x00-\x20\x7f#]/.test(raw)||/%(?![0-9A-Fa-f]{2})/.test(raw))return false;
      const url=new URL(raw);
      const previewOrigin=preview&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&['/contrast','/settings','/conversation','/performance','/initial-paint','/transition-materials','/home-material','/surface-scope'].includes(url.pathname);
      if(!previewOrigin&&(url.protocol!=='app:'||url.hostname!=='-'||url.pathname!=='/index.html')||url.username||url.password)return false;
      if(url.hash||!previewOrigin&&url.port)return false;
      if(!previewOrigin&&(!/^app:\/\/-\/index\.html(?:\?initialRoute=[^#&]+)?$/.test(raw)||url.search.includes('+')))return false;
      const all=[...url.searchParams];
      if(!previewOrigin&&all.some(([key])=>key!=='initialRoute'))return false;
      const entries=all.filter(([key])=>key.toLowerCase()==='initialroute');
      if(entries.length>1||entries.some(([key])=>key!=='initialRoute'))return false;
      const queryRoute=entries.length?entries[0][1]:undefined;
      const metaRoute=doc.querySelector?.('meta[name="initial-route"]')?.getAttribute('content')||undefined;
      if(metaRoute&&queryRoute!==undefined&&metaRoute!==queryRoute)return false;
      const route=metaRoute??queryRoute??'/';
      if(!route||route.length>4096||/[\\\x00-\x20\x7f%?#]/.test(route)||!route.startsWith('/')||route.startsWith('//'))return false;
      if(route==='/')return true;
      const parts=route.slice(1).split('/');
      if(parts.some(part=>!part||!/^[-A-Za-z0-9_]+$/.test(part)))return false;
      if(['local','remote'].includes(parts[0]))return parts.length===2;
      if(parts[0]!=='settings')return false;
      if(parts.length===1)return true;
      const slugs=new Set('open-source-licenses general-settings notifications import profile security account age agreements parental-controls trusted-contact safety time-management appearance voice storage pets chronicle appshots git-settings connections cloud-settings codex-cloud cloud-environments code-review local-environments worktrees agent work-settings personalization keyboard-shortcuts codex-micro usage billing analytics consumer-view usage-code-review debug browser-use extension computer-use mcp-settings hooks-settings plugins-settings file-type-handlers skills-settings data-controls archived-chats ads-controls teams cloud-computer passwords'.split(' '));
      if(!slugs.has(parts[1]))return false;
      if(parts.length===2)return true;
      const extra=parts.slice(2),slug=parts[1];
      if(['plugins-settings','cloud-environments'].includes(slug))return true;
      if(slug==='browser-use')return extra[0]==='site-settings'||extra.length===1&&['extensions','downloads','history','contact-info','passwords'].includes(extra[0]);
      if(slug==='computer-use')return extra.length===1;
      if(slug==='connections')return extra.length<=2;
      if(slug==='code-review')return extra.length===2&&extra[0]==='repositories';
      if(slug==='local-environments')return extra.length===1&&extra[0]==='create';
      if(slug==='teams')return extra.length===1||extra.length===2&&extra[1]==='join';
      return false;
    } catch{return false;}
  }
  function visible(node){
    if(!node||!node.isConnected||node.closest(hidden))return false;
    for(let n=node;n&&n!==doc.documentElement;n=n.parentElement){const css=host.getComputedStyle(n);if(css.display==='none'||css.visibility==='hidden'||Number(css.opacity)===0)return false;}
    return true;
  }
  function bounded(node){const r=node.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,r.width,r.height].every(Number.isFinite)&&r.width>=240&&r.height>=180&&r.left>=-2&&r.top>=-2&&r.right<=host.innerWidth+2&&r.bottom<=host.innerHeight+2;}
  function inlineState(node){return ['display','visibility','opacity','width','height','min-width','max-width','min-height','max-height','top','right','bottom','left','position','transform','translate','scale','margin','padding'].map(key=>node.style?.getPropertyValue(key)||'').join('|');}
  function rememberStyles(root){for(const main of [root,...root.querySelectorAll(mainSelector)])for(let node=main;node;node=node.parentElement)styleStates.set(node,inlineState(node));const frame=root.querySelector('[data-app-shell-frame="true"]');if(frame)styleStates.set(frame,inlineState(frame));}
  function inside(node,parent){const outer=parent.getBoundingClientRect(),inner=node.getBoundingClientRect();return inner.left>=outer.left-2&&inner.top>=outer.top-2&&inner.right<=outer.right+2&&inner.bottom<=outer.bottom+2;}
  function base(root){
    if(!allowedWindow()||!root||root.id!=='root'||root===doc.body||root===doc.documentElement||!visible(root)||!bounded(root))return false;
    const frame=root.querySelector('[data-app-shell-frame="true"]');
    return !!frame&&visible(frame)&&bounded(frame)&&inside(frame,root);
  }
  function validateRoot(root,main){
    if(!base(root)||doc.querySelectorAll('#root').length!==1)return false;
    const nodes=[...root.querySelectorAll(mainSelector)].filter(node=>visible(node)&&bounded(node));
    if(nodes.length!==1||main&&nodes[0]!==main)return false;
    const frame=nodes[0].closest('[data-app-shell-frame="true"]');
    return !!frame&&root.contains(frame)&&inside(nodes[0],frame)&&inside(nodes[0],root);
  }
  function retainLoadingRoot(root){
    if(!base(root))return false;
    // Missing/overlapping main nodes are a known loading transition. A visible
    // main that escapes its frame or viewport is not a loading exception.
    return [...root.querySelectorAll(mainSelector)].filter(visible).every(main=>{const frame=main.closest('[data-app-shell-frame="true"]');return bounded(main)&&!!frame&&root.contains(frame)&&inside(main,frame)&&inside(main,root);});
  }
  function revoke(root,restorePrior=false){const prior=leases.get(root);if(prior===undefined&&!leases.has(root))return;if(restorePrior&&prior!==null)root.setAttribute(marker,prior);else root.removeAttribute(marker);leases.delete(root);if(!restorePrior)host.__CCMacBackground__?.revokeSurface?.(root);}
  function syncObserved(){
    if(!resizeObserver)return;const wanted=new Set();
    for(const root of leases.keys()){wanted.add(root);const frame=root.querySelector('[data-app-shell-frame="true"]');if(frame)wanted.add(frame);for(const main of root.querySelectorAll(mainSelector))if(visible(main))wanted.add(main);}
    for(const node of [...observed])if(!wanted.has(node)){resizeObserver.unobserve(node);observed.delete(node);}
    for(const node of wanted)if(!observed.has(node)){resizeObserver.observe(node);observed.add(node);}
  }
  function refresh(){
    queued=false;if(disposed)return;
    if(!allowedWindow()){for(const root of [...leases.keys()])revoke(root);host.__CCMacBackground__?.dispose();host.__CCMacPrepaint__?.dispose();dispose();return;}
    const roots=[...doc.querySelectorAll('#root')];
    for(const root of [...leases.keys()])if(!roots.includes(root)||!retainLoadingRoot(root))revoke(root);
    for(const root of roots)if(validateRoot(root)||leases.has(root)&&retainLoadingRoot(root)){
      if(!leases.has(root))leases.set(root,root.getAttribute(marker));
      if(root.getAttribute(marker)!=='')root.setAttribute(marker,'');
      rememberStyles(root);
    }else if(root.hasAttribute(marker)&&!leases.has(root))root.removeAttribute(marker);
    syncObserved();
  }
  const related=node=>node?.nodeType===1&&(observed.has(node)||leases.has(node)||node.matches('#root,meta[name="initial-route"],[data-app-shell-frame],'+mainSelector)||node.querySelector('#root,meta[name="initial-route"],[data-app-shell-frame],'+mainSelector));
  function schedule(){if(queued||disposed)return;queued=true;const enqueue=host.queueMicrotask||((fn)=>Promise.resolve().then(fn));enqueue(refresh);}
  if(observe&&allowedWindow()&&typeof host.MutationObserver==='function'){
    observer=new host.MutationObserver(records=>{for(const r of records){
      if(r.type==='attributes'&&r.attributeName==='style'){const next=inlineState(r.target),previous=styleStates.get(r.target);styleStates.set(r.target,next);if(next===previous||previous===undefined&&next.replaceAll('|','')==='')continue;}
      if(r.type==='childList'&&[...r.addedNodes,...r.removedNodes].some(related)||r.type==='attributes'&&related(r.target)){schedule();break;}
    }});
    observer.observe(doc,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-hidden','class','style','data-app-shell-frame','data-app-shell-main-surface','data-app-shell-active-page','content','name']});
    if(typeof host.ResizeObserver==='function')resizeObserver=new host.ResizeObserver(schedule);
    host.addEventListener?.('resize',schedule);host.addEventListener?.('popstate',schedule);host.addEventListener?.('hashchange',schedule);
  }
  function dispose(){if(disposed)return;disposed=true;observer?.disconnect();resizeObserver?.disconnect();observed.clear();host.removeEventListener?.('resize',schedule);host.removeEventListener?.('popstate',schedule);host.removeEventListener?.('hashchange',schedule);for(const root of [...leases.keys()])revoke(root,true);}
  return {allowedWindow,validateRoot,refresh,base,dispose};
}

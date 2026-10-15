// Scoped to the vendored renderers; never replaces the app's native RAF APIs.
export function createFrameRuntime(host) {
  let next=1_000_000_000,paused=false,painted=false,disposed=false,count=0;
  let native,timer,maxFps=60,renderDpr=host.devicePixelRatio||1,deadline=-Infinity,forced=false,totalWork=0,nativeCallbacks=0,timerWakeups=0,errors=0,reportingErrors=0;
  const pending=new Map(),stoppedOwners=new WeakSet();
  const raf=host.requestAnimationFrame.bind(host),cancel=host.cancelAnimationFrame.bind(host);
  const now=typeof host.performance?.now==='function'?host.performance.now.bind(host.performance):undefined;
  const later=now&&typeof host.setTimeout==='function'&&typeof host.clearTimeout==='function'?host.setTimeout.bind(host):undefined;
  const clearLater=later?host.clearTimeout.bind(host):undefined;
  function report(error,handler){
    errors++;
    try{if(typeof handler==='function'){handler(error);return;}}
    catch(handlerError){reportingErrors++;error=handlerError;}
    // Match native RAF error reporting when no owner handles the error. A
    // broken reporter must never strand other renderers' pending callbacks.
    try{host.reportError?.(error);}catch{reportingErrors++;}
  }
  function clearScheduled(){if(native!==undefined)cancel(native);if(timer!==undefined)clearLater(timer);native=timer=undefined;}
  function schedule() {
    if(native!==undefined||timer!==undefined||disposed||!pending.size||paused&&painted)return;
    // Wait near the next drawing deadline rather than waking on every 120 Hz
    // display frame while a 15/30 fps backdrop is idle. Leave two milliseconds
    // for the browser to register the RAF before the intended presentation.
    const delay=!forced&&later&&Number.isFinite(deadline)?deadline-now()-2:0;
    if(delay>0){timer=later(()=>{timer=undefined;timerWakeups++;if(!disposed&&pending.size&&!(paused&&painted))native=raf(paint);},delay);}
    else native=raf(paint);
  }
  function paint(time){
      native=undefined;
      nativeCallbacks++;
      if(disposed||paused&&painted)return;
      if(!forced&&time+0.1<deadline){schedule();return;}
      const period=1000/maxFps;
      deadline=forced||!Number.isFinite(deadline)||time>=deadline+period?time+period:deadline+period;
      forced=false;painted=true;
      const before=now?.()||0;
      try{
        for(const [id,item]of [...pending]){
          if(disposed||!pending.has(id))continue;
          pending.delete(id);count++;
          try{item.callback(time);}catch(error){report(error,item.onError);}
        }
        const onFrame=api.onFrame,onError=api.onError;
        if(!disposed&&typeof onFrame==='function')try{onFrame({count,time});}catch(error){report(error,onError);}
      }finally{
        totalWork+=(now?.()||0)-before;
        schedule();
      }
  }
  const api={
    requestAnimationFrame(callback,owner){
      // Omitted owner uses the active mount. Explicit undefined is unowned,
      // so an earlier loader never borrows a later mount's error handler.
      if(arguments.length<2)owner=api.onError;
      if(disposed||typeof owner==='function'&&stoppedOwners.has(owner))return 0;
      // Bind failures to the owner that scheduled this frame. A callback may
      // replace its renderer before throwing; the new owner's hook is unrelated.
      const id=next++,item={callback,onError:owner};pending.set(id,item);
      schedule();
      return id;
    },
    cancelAnimationFrame(id){
      pending.delete(id);
      if(!pending.size)clearScheduled();
    },
    cancelOwner(handler){
      if(typeof handler!=='function')return 0;
      stoppedOwners.add(handler);
      let removed=0;
      for(const [id,item]of pending)if(item.onError===handler){pending.delete(id);removed++;}
      if(!pending.size)clearScheduled();
      return removed;
    },
    setPaused(value){
      value=!!value;if(paused===value)return;
      paused=value;painted=false;forced=true;
      clearScheduled();
      schedule();
    },
    invalidate(){
      painted=false;forced=true;clearScheduled();schedule();
    },
    configure(options={}){const fps=Math.max(1,Math.min(60,options.maxFps||60));const changed=fps!==maxFps;if(changed){deadline=-Infinity;clearScheduled();}maxFps=fps;renderDpr=options.renderDpr||host.devicePixelRatio||1;if(changed)schedule();},
    dispose(){disposed=true;clearScheduled();pending.clear();api.onFrame=api.onError=undefined;},
    get frameCount(){return count;},
    get renderDpr(){return renderDpr;},
    get stats(){return {frameCallbacks:count,nativeCallbacks,timerWakeups,workMs:totalWork,maxFps,renderDpr,pending:pending.size,paused,errors,reportingErrors};},
    onFrame:undefined,
    onError:undefined,
  };
  return api;
}

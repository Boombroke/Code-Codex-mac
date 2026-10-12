// Scoped to the vendored renderers; never replaces the app's native RAF APIs.
export function createFrameRuntime(host) {
  let next=1_000_000_000,paused=false,painted=false,disposed=false,count=0;
  let native,maxFps=60,renderDpr=host.devicePixelRatio||1,deadline=-Infinity,forced=false,totalWork=0;
  const pending=new Map();
  const raf=host.requestAnimationFrame.bind(host),cancel=host.cancelAnimationFrame.bind(host);
  function schedule() {
    if(native!==undefined||disposed||!pending.size||paused&&painted)return;
    native=raf(time=>{
      native=undefined;
      if(disposed||paused&&painted)return;
      if(!forced&&time+0.1<deadline){schedule();return;}
      deadline=forced||!Number.isFinite(deadline)?time+1000/maxFps:Math.max(deadline+1000/maxFps,time);
      forced=false;painted=true;
      const before=host.performance?.now()||0;
      for(const [id,item]of [...pending]){
        if(disposed||!pending.has(id))continue;
        pending.delete(id);count++;item.callback(time);
      }
      api.onFrame?.({count,time});
      totalWork+=(host.performance?.now()||0)-before;
      schedule();
    });
  }
  const api={
    requestAnimationFrame(callback){
      if(disposed)return 0;
      const id=next++,item={callback};pending.set(id,item);
      schedule();
      return id;
    },
    cancelAnimationFrame(id){
      pending.delete(id);
      if(!pending.size&&native!==undefined){cancel(native);native=undefined;}
    },
    setPaused(value){
      value=!!value;if(paused===value)return;
      paused=value;painted=false;forced=true;
      schedule();
    },
    invalidate(){
      painted=false;forced=true;schedule();
    },
    configure(options={}){const fps=Math.max(1,Math.min(60,options.maxFps||60));if(fps!==maxFps)deadline=-Infinity;maxFps=fps;renderDpr=options.renderDpr||host.devicePixelRatio||1;},
    dispose(){disposed=true;if(native!==undefined)cancel(native);native=undefined;pending.clear();api.onFrame=undefined;},
    get frameCount(){return count;},
    get renderDpr(){return renderDpr;},
    get stats(){return {frameCallbacks:count,workMs:totalWork,maxFps,renderDpr,pending:pending.size,paused};},
    onFrame:undefined,
  };
  return api;
}

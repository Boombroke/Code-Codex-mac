import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameRuntime} from '../scripts/frame-runtime.mjs';
function harness(overrides={}){let id=0,time=0;const queue=new Map();const host={requestAnimationFrame(cb){queue.set(++id,cb);return id;},cancelAnimationFrame(i){queue.delete(i);},...overrides};return {runtime:createFrameRuntime(host),tick(ms=1000/60){time+=ms;const tasks=[...queue];queue.clear();for(const [,cb] of tasks)cb(time);},queue};}
function timedHarness(){
  let id=0,time=0;const queue=new Map(),timers=new Map();
  const host={performance:{now:()=>time},requestAnimationFrame(cb){queue.set(++id,cb);return id;},cancelAnimationFrame(i){queue.delete(i);},setTimeout(cb,delay){timers.set(++id,{cb,due:time+delay});return id;},clearTimeout(i){timers.delete(i);}};
  return {runtime:createFrameRuntime(host),queue,timers,tick(ms=1000/120){
    const end=time+ms;
    while(true){const next=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];if(!next||next[1].due>end)break;time=next[1].due;timers.delete(next[0]);next[1].cb();}
    time=end;const tasks=[...queue.values()];queue.clear();for(const cb of tasks)cb(time);
  }};
}
test('continuous frames, pause with one final frame, and resume',()=>{
  const h=harness();let frames=0;
  const draw=()=>{frames++;h.runtime.requestAnimationFrame(draw);};
  h.runtime.requestAnimationFrame(draw);h.tick();h.tick();assert.equal(frames,2);
  h.runtime.setPaused(true);h.tick();assert.equal(frames,3);h.tick();h.tick();assert.equal(frames,3);
  h.runtime.setPaused(false);h.tick();assert.equal(frames,4);h.runtime.dispose();h.tick();assert.equal(frames,4);
});
test('paused controls can redraw once without restarting the animation',()=>{
  const h=harness();let frames=0;const draw=()=>{frames++;h.runtime.requestAnimationFrame(draw);};
  h.runtime.setPaused(true);h.runtime.requestAnimationFrame(draw);h.tick();h.tick();assert.equal(frames,1);
  h.runtime.invalidate();h.tick();h.tick();assert.equal(frames,2);h.runtime.dispose();
});
test('canceled and disposed callbacks never execute',()=>{
  const h=harness();let calls=0;const id=h.runtime.requestAnimationFrame(()=>calls++);h.runtime.cancelAnimationFrame(id);h.tick();assert.equal(calls,0);
  h.runtime.requestAnimationFrame(()=>calls++);h.runtime.dispose();h.tick();assert.equal(calls,0);
});
test('120 Hz displays submit only 60 or 30 decorative frames per second',()=>{
  for(const fps of [60,30]){
    const h=harness();let draws=0;const draw=()=>{draws++;h.runtime.requestAnimationFrame(draw);};
    h.runtime.configure({maxFps:fps,renderDpr:1.5});h.runtime.requestAnimationFrame(draw);
    for(let i=0;i<120;i++)h.tick(1000/120);
    assert.equal(draws,fps);assert.equal(h.runtime.renderDpr,1.5);
    h.runtime.setPaused(true);h.tick();h.tick();assert.equal(h.queue.size,0);
  }
});
test('independent vendor callbacks share one native animation request',()=>{
  const h=harness();let calls=0;
  h.runtime.requestAnimationFrame(()=>calls++);h.runtime.requestAnimationFrame(()=>calls++);
  assert.equal(h.queue.size,1);h.tick();assert.equal(calls,2);
});
test('90 Hz displays keep the intended 60 fps average without falling to 45',()=>{
  const h=harness();let draws=0;const draw=()=>{draws++;h.runtime.requestAnimationFrame(draw);};
  h.runtime.requestAnimationFrame(draw);for(let i=0;i<450;i++)h.tick(1000/90);
  assert(Math.abs(draws-300)<=1);
});
test('timed throttling reduces native RAF wakeups on 120 Hz without losing cadence',()=>{
  for(const fps of [15,30,60]){
    const h=timedHarness();let draws=0;const draw=()=>{draws++;h.runtime.requestAnimationFrame(draw);};
    h.runtime.configure({maxFps:fps});h.runtime.requestAnimationFrame(draw);
    for(let i=0;i<1200;i++)h.tick();
    assert.equal(draws,10*fps);
    assert(h.runtime.stats.nativeCallbacks<=draws+1);
    if(fps<60)assert(h.runtime.stats.nativeCallbacks+h.runtime.stats.timerWakeups<650);
    h.runtime.dispose();assert.equal(h.queue.size,0);assert.equal(h.timers.size,0);
  }
});
test('timed throttling keeps the intended average on 90 Hz',()=>{
  const h=timedHarness();let draws=0;const draw=()=>{draws++;h.runtime.requestAnimationFrame(draw);};
  h.runtime.requestAnimationFrame(draw);for(let i=0;i<450;i++)h.tick(1000/90);
  assert(Math.abs(draws-300)<=1);assert(h.runtime.stats.nativeCallbacks<=draws+1);
});
test('pause, invalidation and faster reconfiguration do not wait for an old timer',()=>{
  const h=timedHarness();let draws=0;const draw=()=>{draws++;h.runtime.requestAnimationFrame(draw);};
  h.runtime.configure({maxFps:15});h.runtime.requestAnimationFrame(draw);h.tick();assert.equal(h.timers.size,1);
  h.runtime.setPaused(true);assert.equal(h.timers.size,0);h.tick();assert.equal(draws,2);assert.equal(h.queue.size,0);
  h.runtime.invalidate();h.tick();assert.equal(draws,3);assert.equal(h.timers.size,0);
  h.runtime.setPaused(false);h.tick();assert.equal(draws,4);assert.equal(h.timers.size,1);
  h.runtime.configure({maxFps:60});assert.equal(h.timers.size,0);h.tick();assert.equal(draws,5);
});
test('canceling the final vendor callback also cancels its delayed wakeup',()=>{
  const h=timedHarness();let pending;
  h.runtime.configure({maxFps:15});h.runtime.requestAnimationFrame(()=>{pending=h.runtime.requestAnimationFrame(()=>assert.fail('canceled draw'));});
  h.tick();assert.equal(h.timers.size,1);h.runtime.cancelAnimationFrame(pending);
  assert.equal(h.timers.size,0);assert.equal(h.queue.size,0);h.tick(1000);
});
test('a stalled frame does not trigger a burst of catch-up draws',()=>{
  const h=harness();let draws=0;const draw=()=>{draws++;h.runtime.requestAnimationFrame(draw);};
  h.runtime.configure({maxFps:30});h.runtime.requestAnimationFrame(draw);h.tick();h.tick(1000);
  const afterStall=draws;h.tick(1000/120);h.tick(1000/120);assert.equal(draws,afterStall);
});

test('one failed renderer does not strand healthy callbacks or frame accounting',()=>{
  let clock=0;const h=harness({performance:{now:()=>++clock}}),failure=Error('vendor draw failed'),reported=[];
  let draws=0,notifications=0;const draw=()=>{draws++;h.runtime.requestAnimationFrame(draw);};
  h.runtime.onError=error=>reported.push(error);h.runtime.onFrame=()=>notifications++;
  h.runtime.requestAnimationFrame(()=>{throw failure;});h.runtime.requestAnimationFrame(draw);
  h.tick();assert.deepEqual(reported,[failure]);assert.equal(draws,1);assert.equal(notifications,1);
  assert.equal(h.runtime.frameCount,2);assert.equal(h.runtime.stats.errors,1);assert(h.runtime.stats.workMs>0);assert.equal(h.queue.size,1);
  h.tick();assert.equal(draws,2);assert.equal(notifications,2);h.runtime.dispose();
});

test('a failed old callback reports to its scheduled owner after the hook changes',()=>{
  const h=harness(),oldErrors=[],newErrors=[],oldFailure=Error('old draw'),newFailure=Error('new draw');
  h.runtime.onError=error=>oldErrors.push(error);
  h.runtime.requestAnimationFrame(()=>{
    h.runtime.onError=error=>newErrors.push(error);
    h.runtime.requestAnimationFrame(()=>{throw newFailure;});
    throw oldFailure;
  });
  h.tick();assert.deepEqual(oldErrors,[oldFailure]);assert.deepEqual(newErrors,[]);
  h.tick();assert.deepEqual(newErrors,[newFailure]);h.runtime.dispose();
});

test('throwing owner and native error reporters cannot interrupt healthy work',()=>{
  const nativeErrors=[],handlerFailure=Error('owner error handler failed');
  const h=harness({reportError(error){nativeErrors.push(error);throw Error('native reporter failed');}});
  let healthy=0;h.runtime.onError=()=>{throw handlerFailure;};
  h.runtime.requestAnimationFrame(()=>{throw Error('draw failed');});h.runtime.requestAnimationFrame(()=>healthy++);
  assert.doesNotThrow(()=>h.tick());assert.equal(healthy,1);assert.deepEqual(nativeErrors,[handlerFailure]);
  assert.equal(h.runtime.stats.pending,0);assert.equal(h.runtime.stats.errors,1);assert.equal(h.runtime.stats.reportingErrors,2);h.runtime.dispose();
});

test('callbacks without an owner retain native error reporting without adopting a later hook',()=>{
  const reported=[],wrongOwner=[],failure=Error('unowned draw'),h=harness({reportError:error=>reported.push(error)});
  h.runtime.requestAnimationFrame(()=>{throw failure;});h.runtime.onError=error=>wrongOwner.push(error);
  h.tick();assert.deepEqual(reported,[failure]);assert.deepEqual(wrongOwner,[]);h.runtime.dispose();
});

test('a failing frame observer uses its original handler and cannot stall subsequent draws',()=>{
  const h=harness(),oldErrors=[],newErrors=[],failure=Error('frame observer failed');let draws=0;
  const draw=()=>{draws++;h.runtime.requestAnimationFrame(draw);};
  h.runtime.onError=error=>oldErrors.push(error);
  h.runtime.onFrame=()=>{h.runtime.onError=error=>newErrors.push(error);throw failure;};
  h.runtime.requestAnimationFrame(draw);h.tick();assert.deepEqual(oldErrors,[failure]);assert.deepEqual(newErrors,[]);
  h.tick();assert.equal(draws,2);assert.deepEqual(newErrors,[failure]);assert.equal(h.runtime.stats.errors,2);h.runtime.dispose();
});

test('disposal from an error handler cancels follow-up timers and clears both hooks',()=>{
  const h=timedHarness();let calls=0;h.runtime.configure({maxFps:15});
  h.runtime.onError=()=>h.runtime.dispose();h.runtime.onFrame=()=>assert.fail('observer ran after disposal');
  h.runtime.requestAnimationFrame(()=>{calls++;h.runtime.requestAnimationFrame(()=>assert.fail('disposed successor ran'));});
  h.runtime.requestAnimationFrame(()=>{throw Error('dispose this renderer');});
  h.tick();assert.equal(calls,1);assert.equal(h.queue.size,0);assert.equal(h.timers.size,0);assert.equal(h.runtime.stats.pending,0);
  assert.equal(h.runtime.onError,undefined);assert.equal(h.runtime.onFrame,undefined);h.tick(1000);
});

test('owner cancellation removes a failed renderer successor even when its teardown throws',()=>{
  const h=timedHarness();let failedDraws=0,teardownErrors=0,removed=0,healthy=0,newOwner=0;
  const handler=()=>{
    removed+=h.runtime.cancelOwner(handler);
    try{throw Error('vendor teardown failed before its own cancellation');}catch{teardownErrors++;}
  };
  h.runtime.onError=handler;
  const draw=()=>{failedDraws++;h.runtime.requestAnimationFrame(draw);throw Error('vendor draw failed');};
  h.runtime.requestAnimationFrame(draw);
  h.runtime.onError=()=>assert.fail('healthy owner failed');h.runtime.requestAnimationFrame(()=>healthy++);
  h.runtime.onError=()=>assert.fail('new owner failed');h.runtime.requestAnimationFrame(()=>newOwner++);
  h.runtime.onError=handler;
  h.tick();assert.equal(failedDraws,1);assert.equal(teardownErrors,1);assert.equal(removed,1);
  assert.equal(healthy,1);assert.equal(newOwner,1);assert.equal(h.runtime.stats.pending,0);
  h.tick(1000);assert.equal(failedDraws,1);assert.equal(h.queue.size,0);assert.equal(h.timers.size,0);h.runtime.dispose();
});

test('cancelOwner preserves unrelated callbacks and invalid owners never clear the queue',()=>{
  const h=harness(),owner=()=>{},otherOwner=()=>{};let otherCalls=0,unownedCalls=0;
  h.runtime.onError=owner;h.runtime.requestAnimationFrame(()=>assert.fail('canceled owner ran'));
  h.runtime.requestAnimationFrame(()=>assert.fail('second canceled owner ran'));
  h.runtime.onError=otherOwner;h.runtime.requestAnimationFrame(()=>otherCalls++);
  h.runtime.onError=undefined;h.runtime.requestAnimationFrame(()=>unownedCalls++);
  for(const invalid of [undefined,null,0,'owner',{}])assert.equal(h.runtime.cancelOwner(invalid),0);
  assert.equal(h.runtime.stats.pending,4);assert.equal(h.runtime.cancelOwner(owner),2);
  assert.equal(h.runtime.stats.pending,2);assert.equal(h.queue.size,1);
  h.tick();assert.equal(otherCalls,1);assert.equal(unownedCalls,1);h.runtime.dispose();
});

test('canceling the final owner clears both a native frame and a delayed wakeup',()=>{
  const h=timedHarness(),owner=()=>{};h.runtime.onError=owner;
  h.runtime.requestAnimationFrame(()=>assert.fail('canceled native frame ran'));
  assert.equal(h.queue.size,1);assert.equal(h.runtime.cancelOwner(owner),1);assert.equal(h.queue.size,0);
  const nextOwner=()=>{};h.runtime.onError=nextOwner;
  h.runtime.configure({maxFps:15});h.runtime.requestAnimationFrame(()=>h.runtime.requestAnimationFrame(()=>assert.fail('canceled timer ran')));
  h.tick();assert.equal(h.timers.size,1);assert.equal(h.runtime.cancelOwner(nextOwner),1);
  assert.equal(h.timers.size,0);assert.equal(h.queue.size,0);h.tick(1000);h.runtime.dispose();
});

test('a retired loader cannot queue late frames or borrow the replacement owner',()=>{
  const h=harness(),oldErrors=[],newErrors=[];let oldDraws=0,newDraws=0;
  const oldOwner=error=>oldErrors.push(error),newOwner=error=>newErrors.push(error);
  const oldLoaderRAF=callback=>h.runtime.requestAnimationFrame(callback,oldOwner);
  oldLoaderRAF(()=>oldDraws++);assert.equal(h.runtime.cancelOwner(oldOwner),1);
  h.runtime.onError=newOwner;
  assert.equal(oldLoaderRAF(()=>{oldDraws++;throw Error('late retired frame');}),0);
  const current=h.runtime.requestAnimationFrame(()=>newDraws++,newOwner);assert(current>0);
  h.tick();assert.equal(oldDraws,0);assert.equal(newDraws,1);assert.deepEqual(oldErrors,[]);assert.deepEqual(newErrors,[]);
  assert.equal(h.runtime.stats.pending,0);h.runtime.dispose();
});

test('explicitly unowned frames stay independent of a stopped active owner',()=>{
  const reported=[],failure=Error('unowned failure'),h=harness({reportError:error=>reported.push(error)});
  const owner=()=>assert.fail('unowned failure adopted the active handler');h.runtime.onError=owner;h.runtime.cancelOwner(owner);
  assert.equal(h.runtime.requestAnimationFrame(()=>assert.fail('stopped default owner ran')),0);
  assert(h.runtime.requestAnimationFrame(()=>{throw failure;},undefined)>0);
  let healthy=0;assert(h.runtime.requestAnimationFrame(()=>healthy++,null)>0);
  assert.equal(h.runtime.cancelOwner(undefined),0);assert.equal(h.runtime.cancelOwner(null),0);assert.equal(h.runtime.stats.pending,2);
  h.tick();assert.deepEqual(reported,[failure]);assert.equal(healthy,1);h.runtime.dispose();
});

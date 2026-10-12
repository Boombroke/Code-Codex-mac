import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameRuntime} from '../scripts/frame-runtime.mjs';
function harness(){let id=0,time=0;const queue=new Map();const host={requestAnimationFrame(cb){queue.set(++id,cb);return id;},cancelAnimationFrame(i){queue.delete(i);}};return {runtime:createFrameRuntime(host),tick(ms=1000/60){time+=ms;const tasks=[...queue];queue.clear();for(const [,cb] of tasks)cb(time);},queue};}
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

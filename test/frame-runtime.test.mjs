import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameRuntime} from '../scripts/frame-runtime.mjs';
function harness(){let id=0,time=0;const queue=new Map();const host={requestAnimationFrame(cb){queue.set(++id,cb);return id;},cancelAnimationFrame(i){queue.delete(i);}};return {runtime:createFrameRuntime(host),tick(ms=1000/60){time+=ms;const tasks=[...queue];queue.clear();for(const [,cb] of tasks)cb(time);},queue};}
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

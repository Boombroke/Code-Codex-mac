import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderPolicy} from '../scripts/render-policy.mjs';
test('balanced Retina output stays inside the pixel budget',()=>{
  const result=createRenderPolicy({dpr:2,width:1398,height:1329});
  assert.equal(result.maxFps,60);
  assert(1398*1329*result.renderDpr**2<=3_000_001);
  assert(result.renderDpr>1.2&&result.renderDpr<1.3);
});
test('native quality, economy and unfocused playback have distinct budgets',()=>{
  assert.equal(createRenderPolicy({mode:'quality',dpr:2,width:1280,height:720}).renderDpr,2);
  assert.equal(createRenderPolicy({mode:'economy',dpr:2}).maxFps,30);
  for(const mode of ['balanced','quality','economy'])assert.equal(createRenderPolicy({mode,dpr:2,focused:false}).maxFps,15);
});
test('balanced complex shaders use 30 fps while lighter effects retain 60 fps',()=>{
  for(const effect of ['black-hole','aurora-ionosphere','heavenly-cloud','milky-way','mountain','cloud-train']){
    const result=createRenderPolicy({effect,dpr:2,width:1412,height:1326});
    assert.equal(result.maxFps,30);assert.equal(result.maxPixels,2_000_000);
    assert(1412*1326*result.renderDpr**2<=2_000_001);
    assert(result.renderDpr>=1);assert.equal(createRenderPolicy({effect,mode:'quality'}).maxFps,60);
  }
  for(const effect of ['glow-horizon','blinking-squares','media',''])assert.equal(createRenderPolicy({effect}).maxFps,60);
});
test('large windows honor every pixel budget without changing native UI density',()=>{
  for(const mode of ['balanced','quality','economy']){
    const result=createRenderPolicy({mode,effect:'milky-way',dpr:2,width:5120,height:2880});
    assert(5120*2880*result.renderDpr**2<=result.maxPixels+1);
    assert(result.renderDpr>0&&result.renderDpr<1);
  }
  assert.equal(createRenderPolicy({mode:'economy',dpr:2,width:800,height:600}).renderDpr,1);
});

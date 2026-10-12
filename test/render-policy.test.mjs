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
  assert.equal(createRenderPolicy({mode:'balanced',dpr:2,focused:false}).maxFps,30);
});

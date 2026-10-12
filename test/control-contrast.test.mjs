import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlContrast} from '../scripts/control-contrast.mjs';

const model=createControlContrast();
// Independent reference calculation checks the actual composited pixels.
const luminance=rgb=>rgb.map(channel=>channel/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
function minimumContrast(samples,result,alpha=result.alpha) {
  const ink=luminance(result.foreground);
  return Math.min(...samples.map(sample=>{
    const background=luminance(sample.map((value,index)=>value*(1-alpha)+result.rgb[index]*alpha));
    return (Math.max(ink,background)+.05)/(Math.min(ink,background)+.05);
  }));
}

test('flat dark and bright controls retain the gentle default surface',()=>{
  for(const [tone,samples] of [['dark',[[0,0,0],[18,25,35]]],['light',[[245,248,252],[255,255,255]]]]) {
    const result=model.surface(samples,tone);
    assert.equal(result.alpha,.16);
    assert.equal(result.hover.alpha,.24);
    assert(minimumContrast(samples,result)>=4.5);
    assert(minimumContrast(samples,result,result.hover.alpha)>=4.5);
  }
});

test('black and white under the same control both remain readable',()=>{
  const samples=[[0,0,0],[255,255,255]];
  for(const tone of ['light','dark']) {
    const result=model.surface(samples,tone);
    assert(result.alpha>.16&&result.alpha<=.64);
    assert(minimumContrast(samples,result)>=4.5);
    assert(minimumContrast(samples,result,result.hover.alpha)>=4.5);
    assert(result.hover.alpha>=result.alpha&&result.hover.alpha<=.72);
    assert(minimumContrast(samples,result,result.alpha-.00001)<4.5,'surface should use the lowest passing alpha, within CSS precision');
  }
});

test('colored and grayscale backgrounds meet the threshold at every sample',()=>{
  const levels=[0,32,64,96,128,160,192,224,255];
  const colors=[];
  for(const red of [0,64,128,192,255])for(const green of [0,64,128,192,255])for(const blue of [0,64,128,192,255])colors.push([red,green,blue]);
  const samples=[...levels.map(value=>[value,value,value]),...colors];
  for(const tone of ['light','dark']) {
    const result=model.surface(samples,tone);
    assert(result.alpha>=.16&&result.alpha<=.64);
    assert(minimumContrast(samples,result)>=4.5);
    assert(minimumContrast(samples,result,result.hover.alpha)>=4.5);
  }
});

test('mixed medium colors receive only the tint required by their worst pixel',()=>{
  for(const samples of [[[30,50,80],[135,140,165]],[[190,125,55],[240,215,185]],[[15,170,115],[175,105,195]]])for(const tone of ['light','dark']) {
    const result=model.surface(samples,tone);
    assert(minimumContrast(samples,result)>=4.5);
    assert(minimumContrast(samples,result,result.hover.alpha)>=4.5);
    if(result.alpha>.16)assert(minimumContrast(samples,result,result.alpha-.00001)<4.5);
  }
});

test('hover never reduces the worst-sample contrast at flat extremes or mixed colors',()=>{
  for(const samples of [[[0,0,0]],[[255,255,255]],[[0,0,0],[255,255,255]],[[40,90,170],[230,185,95]]])for(const tone of ['light','dark']) {
    const result=model.surface(samples,tone);
    assert(result.hover.alpha>=result.alpha&&result.hover.alpha<=.72);
    assert(minimumContrast(samples,result,result.hover.alpha)>=minimumContrast(samples,result));
  }
});

test('the renderer helper is self contained and leaves source samples untouched',()=>{
  const samples=[[12,44,75],[235,220,200]],before=structuredClone(samples);
  const serialized=new Function('return ('+createControlContrast.toString()+')()')();
  for(const tone of ['light','dark'])assert.deepEqual(serialized.surface(samples,tone),model.surface(samples,tone));
  assert.deepEqual(samples,before);
});

test('missing or invalid samples keep a usable default without changing foreground opacity',()=>{
  for(const tone of ['light','dark']) {
    const result=model.surface([[NaN,0,0],null,[0]],tone);
    assert.equal(result.alpha,.16);
    assert(result.contrast>=4.5);
    assert.equal(Object.keys(result.vars).length,2);
    assert(!Object.keys(result.vars).some(key=>key.includes('opacity')));
  }
});

// Resolution changes apply to the decorative canvas only, never the app UI.
export function createRenderPolicy({mode='balanced',dpr=1,width=1,height=1,focused=true}={}) {
  const native=Math.max(1,Number(dpr)||1);
  const profile=mode==='quality'?{density:native,pixels:8_000_000,fps:60}:mode==='economy'?{density:1.25,pixels:2_000_000,fps:30}:{density:1.5,pixels:3_000_000,fps:60};
  const area=Math.max(1,width)*Math.max(1,height);
  const renderDpr=Math.max(1,Math.min(native,profile.density,Math.sqrt(profile.pixels/area)));
  return {mode:['quality','economy'].includes(mode)?mode:'balanced',maxFps:focused?profile.fps:Math.min(profile.fps,30),renderDpr,maxPixels:profile.pixels};
}

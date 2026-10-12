// Resolution changes apply to the decorative canvas only, never the app UI.
export function createRenderPolicy({mode='balanced',dpr=1,width=1,height=1,focused=true,effect=''}={}) {
  const native=Math.max(1,Number(dpr)||1);
  // These effects render a procedural WebGL shader, often with multiple passes
  // or ray steps. The cadence is decorative; native text remains unscaled.
  const complex=['black-hole','aurora-ionosphere','heavenly-cloud','milky-way','mountain','cloud-train'].includes(effect);
  const profile=mode==='quality'?{density:native,pixels:8_000_000,fps:60}:mode==='economy'?{density:1,pixels:1_000_000,fps:30}:complex?{density:1.5,pixels:2_000_000,fps:30}:{density:1.5,pixels:3_000_000,fps:60};
  const area=Math.max(1,width)*Math.max(1,height);
  // A large display can need a density below one to honor the pixel budget.
  const renderDpr=Math.min(native,profile.density,Math.sqrt(profile.pixels/area));
  return {mode:['quality','economy'].includes(mode)?mode:'balanced',maxFps:focused?profile.fps:15,renderDpr,maxPixels:profile.pixels};
}

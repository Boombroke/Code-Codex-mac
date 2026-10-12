// Serialized into the renderer: keep helpers inside the exported function.
export function createControlContrast() {
  const linear=channel=>{
    const value=channel/255;
    return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
  };
  const luminance=rgb=>.2126*linear(rgb[0])+.7152*linear(rgb[1])+.0722*linear(rgb[2]);
  const contrast=(first,second)=>(Math.max(first,second)+.05)/(Math.min(first,second)+.05);
  const composite=(background,tint,alpha)=>background.map((value,index)=>value*(1-alpha)+tint[index]*alpha);
  const css=(rgb,alpha)=>`rgba(${rgb.join(',')},${alpha})`;

  function surface(samples,tone='dark') {
    const light=tone==='light';
    const rgb=light?[245,248,252]:[13,19,28];
    const foreground=light?[2,4,6]:[255,255,255];
    const pixels=[];
    for(const sample of Array.isArray(samples)?samples:[]) {
      if(!sample||sample.length<3)continue;
      const color=Array.from(sample).slice(0,3);
      if(color.every(channel=>typeof channel==='number'&&Number.isFinite(channel)))pixels.push(color.map(channel=>Math.min(255,Math.max(0,channel))));
    }
    // An empty off-screen sample should retain the gentle default surface.
    if(!pixels.length)pixels.push(rgb);
    const ink=luminance(foreground);
    const minimumContrast=alpha=>{
      let minimum=Infinity;
      for(const pixel of pixels)minimum=Math.min(minimum,contrast(ink,luminance(composite(pixel,rgb,alpha))));
      return minimum;
    };
    let alpha=.16;
    if(minimumContrast(alpha)<4.5) {
      let lower=alpha,upper=.64;
      for(let step=0;step<24;step++) {
        const middle=(lower+upper)/2;
        if(minimumContrast(middle)>=4.5)upper=middle;else lower=middle;
      }
      // Round toward the passing bound so the emitted CSS remains readable.
      alpha=Math.min(.64,Math.ceil(upper*1e6)/1e6);
    }
    const surfaceContrast=minimumContrast(alpha);
    let hoverAlpha=Math.min(.72,Math.ceil(Math.max(.24,alpha+.08)*1e6)/1e6);
    // At a pure black/white backdrop, the non-extreme tint can slightly lower
    // contrast even though it still passes. Preserve the surface in that case.
    if(minimumContrast(hoverAlpha)<surfaceContrast)hoverAlpha=alpha;
    const value=css(rgb,alpha),hoverValue=css(rgb,hoverAlpha);
    return {
      css:value,alpha,rgb,foreground,contrast:surfaceContrast,
      hover:{css:hoverValue,alpha:hoverAlpha,rgb:[...rgb],contrast:minimumContrast(hoverAlpha)},
      vars:{'--cc-settings-control-surface':value,'--cc-settings-control-hover':hoverValue},
    };
  }
  return {surface};
}

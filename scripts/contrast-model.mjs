// Serialized into the renderer: keep all helpers inside this function.
export function createContrastModel() {
  const luminance=([r,g,b])=>{
    const linear=n=>{const s=n/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;};
    return .2126*linear(r)+.7152*linear(g)+.0722*linear(b);
  };
  const composite=(background,tint,alpha)=>background.map((v,i)=>v*(1-alpha)+tint[i]*alpha);
  const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  function palette(rgb,previous) {
    const l=luminance(rgb);
    // Hysteresis prevents text flipping back and forth on animated midtones.
    let dark=previous==='light'?l>.15:previous==='dark'?l>.21:l>.18;
    if(ratio(l,dark?luminance([2,4,6]):1)<4.5)dark=!dark;
    const foreground=dark?'#020406':'#ffffff';
    const soft=dark?[24,35,45]:[241,245,249];
    const muted=ratio(l,luminance(soft))>=4.5?(dark?'#18232d':'#f1f5f9'):foreground;
    const shadow=dark?'0 1px 2px rgba(255,255,255,.55)':'0 1px 2px rgba(0,0,0,.65)';
    const safeColor=hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return ratio(l,luminance(rgb))>=4.5?hex:foreground;};
    const syntax=dark?{comment:muted,keyword:'#772149',literal:'#763312',string:'#155e2c',variable:'#54318e',attribute:'#68400b',name:'#124978',error:'#8b2020'}:{comment:muted,keyword:'#ffd2e8',literal:'#ffd1b3',string:'#c2f3cf',variable:'#e6d6ff',attribute:'#ffedba',name:'#c2e2ff',error:'#ffc5c5'};
    const syntaxVars=Object.fromEntries(Object.entries(syntax).map(([name,color])=>['--color-codex-syntax-'+name,safeColor(color)]));
    return {tone:dark?'light':'dark',luminance:l,contrast:ratio(l,luminance(dark?[2,4,6]:[255,255,255])),vars:{
      '--cc-theme-fg':foreground,'--cc-theme-muted':muted,
      '--cc-theme-accent':safeColor(dark?'#003f80':'#c2e2ff'),...syntaxVars,
      '--cc-theme-border':dark?'rgba(13,20,27,.28)':'rgba(255,255,255,.3)',
      '--cc-theme-shadow':shadow,
    }};
  }
  function nativeTone({theme,className='',variant='',prefersDark=false}={}) {
    if(theme==='light'||theme==='dark')return theme;
    if(/(?:^|\s)dark(?:\s|$)/.test(className))return 'dark';
    if(/(?:^|\s)light(?:\s|$)/.test(className))return 'light';
    if(variant.trim()==='light'||variant.trim()==='dark')return variant.trim();
    return prefersDark?'dark':'light';
  }
  return {luminance,composite,ratio,palette,nativeTone};
}

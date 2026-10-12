// Serialized into the renderer: keep all helpers inside this function.
export function createContrastModel() {
  const luminance=([r,g,b])=>{
    const linear=n=>{const s=n/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;};
    return .2126*linear(r)+.7152*linear(g)+.0722*linear(b);
  };
  const composite=(background,tint,alpha)=>background.map((v,i)=>v*(1-alpha)+tint[i]*alpha);
  const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  // Stable text avoids animated backgrounds switching the same label between
  // black and white. The controller also edges inherited accent/syntax text without changing its fill.
  const syntax={comment:'#e2e8f0',keyword:'#ffd2e8',literal:'#ffd1b3',string:'#c2f3cf',variable:'#e6d6ff',attribute:'#ffedba',name:'#c2e2ff',error:'#ffc5c5'};
  const syntaxVars=Object.fromEntries(Object.entries(syntax).map(([name,color])=>['--color-codex-syntax-'+name,color]));
  function stablePalette() {
    return {tone:'dark',vars:{
      '--cc-theme-fg':'#ffffff','--cc-theme-muted':'#e2e8f0',
      '--cc-theme-accent':'#c2e2ff',...syntaxVars,
      // Small controls retain enough dark backing for unoutlined white labels.
      // This does not change the composer's separately configured transparency.
      '--cc-settings-control-surface':'rgba(13,19,28,.64)',
      '--cc-settings-control-hover':'rgba(13,19,28,.72)',
      '--cc-theme-border':'rgba(255,255,255,.28)',
      '--cc-theme-stroke':'0.55px rgba(0,0,0,.95)',
      '--cc-theme-shadow':'0 1px 1px rgba(0,0,0,.7)',
      '--cc-theme-scheme':'dark',
    }};
  }
  function nativeTone({theme,className='',variant='',prefersDark=false}={}) {
    if(theme==='light'||theme==='dark')return theme;
    if(/(?:^|\s)dark(?:\s|$)/.test(className))return 'dark';
    if(/(?:^|\s)light(?:\s|$)/.test(className))return 'light';
    if(variant.trim()==='light'||variant.trim()==='dark')return variant.trim();
    return prefersDark?'dark':'light';
  }
  // Keep the old method name usable for callers while they stop sampling.
  return {luminance,composite,ratio,stablePalette,palette:stablePalette,nativeTone};
}

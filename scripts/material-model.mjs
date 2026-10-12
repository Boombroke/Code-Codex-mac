// Alpha and backdrop filtering apply to surfaces only, never to text opacity.
export function createMaterials({composerTransparency=75,codeTransparency=60,codeStyle='frosted',tone='dark',performance='balanced'}={}){
  const percent=(value,fallback)=>Number.isFinite(Number(value))?Math.min(100,Math.max(0,Number(value))):fallback;
  const input=percent(composerTransparency,75),code=percent(codeTransparency,60);
  const base=tone==='light'?'245,248,252':'18,23,32';
  const economy=performance==='economy';
  const composerAlpha=1-input/100,codeAlpha=codeStyle==='transparent'?0:1-code/100;
  return {composerTransparency:input,codeTransparency:code,composerAlpha,codeAlpha,vars:{
    '--cc-mac-composer-surface':`rgba(${base},${composerAlpha})`,
    '--cc-material-composer-filter':economy?'none':performance==='quality'?'blur(4px) saturate(1.08)':'blur(3px)',
    '--cc-material-code-surface':`rgba(${base},${codeAlpha})`,
    '--cc-material-code-filter':economy||codeStyle==='transparent'?'none':performance==='quality'?'blur(6px) saturate(1.08)':'blur(4px)',
    '--cc-material-border':tone==='light'?'rgba(15,35,55,.18)':'rgba(235,247,255,.22)',
    '--cc-material-edge':tone==='light'?'rgba(255,255,255,.6)':'rgba(255,255,255,.09)',
  }};
}

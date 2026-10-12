export function clearConversationMasks(opacity={}) {
  return {...opacity,navigation:0,sidebar:0,conversation:0};
}

export function createTheme({transparency=100,backgroundOpacity=100,hue=0,tone='dark',accent}={}) {
  const percent=value=>Number.isFinite(Number(value))?Math.min(100,Math.max(0,Number(value))):100;
  const t=percent(transparency),opacity=percent(backgroundOpacity),alpha=1-t/100;
  const light=tone==='light',base=light?'245,248,252':'13,19,28';
  const color=accent||`hsl(${(155+Number(hue||0)+360)%360} 75% ${light?36:70}%)`;
  return {transparency:t,backgroundOpacity:opacity,alpha,vars:{
    '--cc-theme-surface':`rgba(${base},${alpha})`,
    '--cc-theme-fg':light?'#10202b':'#f2f8fc',
    '--cc-theme-muted':light?'#334b5d':'#c5d7e4',
    '--cc-theme-accent':color,
    '--cc-theme-border':light?'rgba(15,35,55,.25)':'rgba(222,244,255,.28)',
    '--cc-theme-hover':light?'rgba(10,30,50,.12)':'rgba(235,250,255,.12)',
    '--cc-theme-shadow':light?'none':'0 1px 2px rgba(0,0,0,.6)',
    '--cc-theme-scheme':light?'light':'dark',
  }};
}

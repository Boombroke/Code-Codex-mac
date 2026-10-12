export function clearConversationMasks(opacity={}) {
  return {...opacity,navigation:0,sidebar:0,conversation:0};
}

export function createTheme({transparency=100,backgroundOpacity=100,hue=0,tone='dark',accent}={}) {
  const percent=value=>Number.isFinite(Number(value))?Math.min(100,Math.max(0,Number(value))):100;
  const t=percent(transparency),opacity=percent(backgroundOpacity),alpha=1-t/100;
  const light=tone==='light',base=light?'245,248,252':'13,19,28';
  const color=accent||`hsl(${(155+Number(hue||0)+360)%360} 75% ${light?36:70}%)`;
  const vars={
    '--cc-theme-surface':`rgba(${base},${alpha})`,
    '--cc-theme-fg':light?'#10202b':'#f2f8fc',
    '--cc-theme-muted':light?'#334b5d':'#c5d7e4',
    '--cc-theme-accent':color,
    '--cc-theme-border':light?'rgba(15,35,55,.25)':'rgba(222,244,255,.28)',
    '--cc-theme-hover':light?'rgba(10,30,50,.12)':'rgba(235,250,255,.12)',
    '--cc-theme-shadow':light?'none':'0 1px 2px rgba(0,0,0,.6)',
    '--cc-theme-scheme':light?'light':'dark',
  };
  // Native token aliases are computed at :root; redefining only their inputs
  // on a descendant does not update inherited, already-resolved aliases.
  for(const key of [
    "color-text","color-text-default","color-text-primary","color-text-foreground","color-text-emphasis","color-text-prose","color-text-composer-primary",
    "app-color-text-foreground","color-token-foreground","color-token-text-primary","color-token-text-secondary","color-token-editor-foreground","color-token-input-foreground","color-token-dropdown-foreground","color-token-menu-foreground","color-token-side-bar-title-foreground","color-codex-editor-cursor","color-codex-editor-inline-code-foreground","text-primary",
  ])vars["--"+key]="var(--cc-theme-fg)";
  for(const key of ["color-text-secondary","color-text-tertiary","app-color-text-foreground-secondary","app-color-text-foreground-tertiary","color-codex-description","color-token-description-foreground","color-token-text-tertiary","color-token-input-placeholder-foreground","text-secondary","text-tertiary"])vars["--"+key]="var(--cc-theme-muted)";
  for(const key of ["color-surface","color-surface-secondary","color-surface-tertiary","color-surface-canvas","color-surface-card","color-surface-elevated","color-surface-elevated-secondary","color-surface-default","color-background-surface","color-background-surface-under","color-background-elevated-primary","color-background-elevated-secondary","app-color-background-surface","app-color-background-surface-under","app-color-background-elevated-primary","app-color-background-elevated-secondary","color-token-bg-primary","color-token-bg-secondary","color-token-bg-tertiary","color-token-main-surface-primary","color-token-side-bar-background","bg-primary","bg-secondary","bg-tertiary"])vars["--"+key]="var(--cc-theme-surface)";
  for(const key of ["color-text-accent","color-accent-blue","color-token-text-link-foreground","app-color-text-accent"])vars["--"+key]="var(--cc-theme-accent)";
  return {transparency:t,backgroundOpacity:opacity,alpha,vars};
}

// Serialized into document-start and mounted payloads. Native Root, wrapped
// Body and peer rails share one small Home material, never independent tints.
export function createComposerStyle(scopes = ['[data-cc-mac-background-surface][data-cc-mac-active]']) {
  const prefixes = (typeof scopes === 'string' ? [scopes] : scopes).map(scope => scope.trim());
  if (!prefixes.length || prefixes.some(scope => !scope || /[{};]/.test(scope))) throw Error('Composer styles need an explicit shell scope');
  // Portal scopes end at the local owner itself, rather than its ancestor.
  const within = selectors => prefixes.flatMap(scope => selectors.flatMap(selector => [`${scope}${selector}`,`${scope} ${selector}`])).join(',\n');
  const roots = ':is([data-composer-surface-variant],[data-composer-layout])';
  const internals = ':is([data-composer-body],[data-composer-input],[data-composer-input-layout],[class*="ComposerLayoutBody"],[class*="ComposerLayoutInput"],[class*="ComposerLayoutFooter"],[class*="ComposerLayoutReplyContext"])';
  const shell = `${roots}:not(${internals}):not(${roots} ${roots})`;
  const protectedControl = ':is(button,a,[role="button"],[role="switch"],[role="checkbox"],[role="radio"],[role="combobox"],[role="tooltip"],[role="menu"],[role="dialog"],[role="listbox"])';
  const popup = ':is([role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"],[data-composer-overlay-floating-ui])';
  const safe = selector => `${selector}:not(${protectedControl}):not(${protectedControl} *):not(${popup} *)`;
  const rail = `.bg-background-composer-action-bar:not(${protectedControl})`;
  const structural = ':is([data-composer-layout],[data-composer-surface-variant],[data-composer-body],[data-composer-input],[data-composer-input-layout],[class*="ComposerLayoutBody"],[class*="ComposerLayoutInput"],[class*="ComposerLayoutFooter"],[class*="ComposerLayoutReplyContext"],.ProseMirror,textarea,.bg-background-composer-surface,.bg-background-composer-action-bar)';
  const home = `${shell}[data-composer-utility-bar-variant="home"]`;
  const homeChrome = ':is([data-composer-rail],[data-composer-rail-item],.composer-surface-chrome,.absolute.inset-x-0:has([data-composer-rail]),.relative:has(>[data-composer-body]))';
  const owner = safe('[data-cc-mac-home-material-owner]');
  const homeItem='[data-composer-rail-item][data-composer-placement="home"]';
  const nativeHomeRail=safe(`[data-composer-rail]:has(${homeItem})`);
  const clear = [safe(shell),safe(`${shell} ${structural}`),safe(rail),safe(`${home} ${homeChrome}`),owner,safe(`[data-cc-mac-home-material-owner] ${structural}`),safe(`[data-cc-mac-home-material-owner] ${homeChrome}`),nativeHomeRail,safe(`${nativeHomeRail} ${homeChrome}`)];
  const owners = [
    safe(`${shell}:not([data-cc-mac-home-material-owner]):not([data-cc-mac-home-material-owner] *)`),
    // Home rails are transparent even while their geometric owner is pending.
    // Unrelated standalone action bars keep their original one-layer policy.
    safe(`${rail}:not(${roots} ${rail}):not(.bg-background-composer-action-bar ${rail}):not([data-cc-mac-home-material-owner] *):not(${homeItem}):not([data-composer-rail]:has(${homeItem})):not([data-composer-rail]:has(${homeItem}) *)`),
  ];
  const surface = 'var(--cc-mac-composer-surface,var(--cc-mac-prepaint-composer,rgba(18,23,32,.25)))';
  const frost = 'var(--cc-material-composer-filter,var(--cc-mac-prepaint-composer-filter,none))';
  const chrome=[safe(`${home} ${homeChrome}`),safe(`[data-cc-mac-home-material-owner] ${homeChrome}`),nativeHomeRail];
  return `
${within(clear)} {
  --composer-layout-surface-background:transparent!important;
  --composer-layout-surface-backdrop-filter:none!important;
  --composer-layout-surface-shadow:none!important;
  --color-background-composer-surface:transparent!important;
  --color-background-composer-action-bar:transparent!important;
  --color-composer-surface:transparent!important;
  background-color:transparent!important;background-image:none!important;
  backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important;
}
${within(owners)} {
  background-color:${surface}!important;background-image:none!important;
  backdrop-filter:${frost}!important;-webkit-backdrop-filter:${frost}!important;
}
${within([safe(home)])} {
  border-radius:var(--composer-border-radius,22px)!important;
  corner-shape:var(--composer-corner-shape,round)!important;
}
${within([owner])} {
  isolation:isolate!important;border-color:transparent!important;
  border-radius:var(--cc-home-material-radius,var(--composer-border-radius,22px))!important;
  corner-shape:var(--cc-home-material-corner-shape,var(--composer-corner-shape,round))!important;
}
${within([`${owner}::before`])} {
  content:"";position:absolute;pointer-events:none;z-index:-1;
  top:var(--cc-home-material-top,0px);right:var(--cc-home-material-right,0px);bottom:var(--cc-home-material-bottom,0px);left:var(--cc-home-material-left,0px);
  border-radius:var(--cc-home-material-radius,var(--composer-border-radius,22px));corner-shape:var(--cc-home-material-corner-shape,var(--composer-corner-shape,round));
  border:1px solid var(--cc-material-border,rgba(235,247,255,.22));
  background:${surface}!important;backdrop-filter:${frost}!important;-webkit-backdrop-filter:${frost}!important;box-shadow:none!important;
}
${within(chrome.flatMap(selector=>[`${selector}::before`,`${selector}::after`]))} {background:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border-color:transparent!important}
${within([...chrome,safe(`${home} ${internals}`),safe(`[data-cc-mac-home-material-owner] ${internals}`)])} {border-color:transparent!important}
`;
}

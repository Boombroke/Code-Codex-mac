// Serialized into both document-start and mounted payloads. Keep all helpers
// inside this function so each phase chooses the same native painting owner.
export function createComposerStyle(scopes = ['[data-cc-mac-background-surface][data-cc-mac-active]']) {
  const prefixes = (typeof scopes === 'string' ? [scopes] : scopes).map(scope => scope.trim());
  if (!prefixes.length || prefixes.some(scope => !scope || /[{};]/.test(scope))) throw Error('Composer styles need an explicit shell scope');
  const within = selectors => prefixes.flatMap(scope => selectors.map(selector => `${scope} ${selector}`)).join(',\n');
  const roots = ':is([data-composer-surface-variant],[data-composer-layout])';
  const internals = ':is([data-composer-body],[data-composer-input],[data-composer-input-layout],[class*="ComposerLayoutBody"],[class*="ComposerLayoutInput"],[class*="ComposerLayoutFooter"],[class*="ComposerLayoutReplyContext"])';
  // data-composer-layout occurs on Root, Body, Input and Footer in the native
  // app. Only an outer root is a shell; nested layout tokens are never owners.
  const shell = `${roots}:not(${internals}):not(${roots} ${roots})`;
  const popup = ':is([role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"],[data-composer-overlay-floating-ui])';
  const protectedControl = ':is(button,a,[role="button"],[role="switch"],[role="checkbox"],[role="radio"],[role="combobox"],[role="tooltip"],[role="menu"],[role="dialog"],[role="listbox"])';
  const safe = selector => `${selector}:not(${protectedControl}):not(${protectedControl} *):not(${popup} *)`;
  const rail = `.bg-background-composer-action-bar:not(${protectedControl})`;
  const structural = `:is([data-composer-layout],[data-composer-surface-variant],[data-composer-body],[data-composer-input],[data-composer-input-layout],[class*="ComposerLayoutBody"],[class*="ComposerLayoutInput"],[class*="ComposerLayoutFooter"],[class*="ComposerLayoutReplyContext"],.ProseMirror,textarea,.bg-background-composer-surface,.bg-background-composer-action-bar)`;
  const home = `${shell}[data-composer-utility-bar-variant="home"]`;
  const homeChrome = ':is([data-composer-rail],[data-composer-rail-item],.composer-surface-chrome,.absolute.inset-x-0:has([data-composer-rail]),.relative:has(>[data-composer-body]))';
  const clear = [safe(shell), safe(`${shell} ${structural}`), safe(rail),safe(`${home} ${homeChrome}`)];
  const owners = [
    safe(`${shell}:not([data-cc-mac-home-material-owner])`),
    // Unrelated standalone rails can paint once. Home rails always use the
    // unified plate, even where absolute positioning crosses the root bounds.
    safe(`${rail}:not(${roots} ${rail}):not(.bg-background-composer-action-bar ${rail})`),
  ];
  const surface = 'var(--cc-mac-composer-surface,var(--cc-mac-prepaint-composer,rgba(18,23,32,.25)))';
  const frost = 'var(--cc-material-composer-filter,var(--cc-mac-prepaint-composer-filter,none))';
  const homeOwner = `${safe(home)}[data-cc-mac-home-material-owner]`;
  return `
${within(clear)} {
  --composer-layout-surface-background:transparent!important;
  --composer-layout-surface-backdrop-filter:none!important;
  --composer-layout-surface-shadow:none!important;
  --color-background-composer-surface:transparent!important;
  --color-background-composer-action-bar:transparent!important;
  --color-composer-surface:transparent!important;
  background-color:transparent!important;background-image:none!important;
  backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
  box-shadow:none!important;
}
${within(owners)} {
  background-color:${surface}!important;background-image:none!important;
  backdrop-filter:${frost}!important;-webkit-backdrop-filter:${frost}!important;
}
${within([homeOwner])} {isolation:isolate!important;border-color:transparent!important}
${within([`${homeOwner}::before`])} {
  content:"";position:absolute;pointer-events:none;z-index:-1;
  top:var(--cc-home-material-top,0px);right:var(--cc-home-material-right,0px);bottom:var(--cc-home-material-bottom,0px);left:var(--cc-home-material-left,0px);
  border-radius:inherit;border:1px solid var(--cc-material-border,rgba(235,247,255,.22));
  background:${surface}!important;backdrop-filter:${frost}!important;-webkit-backdrop-filter:${frost}!important;box-shadow:none!important;
}
${within([`${home} ${homeChrome}::before`,`${home} ${homeChrome}::after`])} {background:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border-color:transparent!important}
${within([safe(`${home} ${homeChrome}`),safe(`${home} ${internals}`)])} {border-color:transparent!important}
`;
}

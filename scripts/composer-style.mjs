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
  const clear = [safe(shell), safe(`${shell} ${structural}`), safe(rail)];
  const body = ':is([data-composer-body],[class*="ComposerLayoutBody"])';
  const owners = [
    safe(`${shell}:not([data-composer-utility-bar-variant="home"])`),
    safe(`${shell}[data-composer-utility-bar-variant="home"] > ${body}`),
    // A standalone action rail can paint once. Rails inside a composer or
    // another rail are clear, including Home rails outside its painted body.
    safe(`${rail}:not(${roots} ${rail}):not(.bg-background-composer-action-bar ${rail})`),
  ];
  const surface = 'var(--cc-mac-composer-surface,var(--cc-mac-prepaint-composer,rgba(18,23,32,.25)))';
  const frost = 'var(--cc-material-composer-filter,var(--cc-mac-prepaint-composer-filter,none))';
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
`;
}

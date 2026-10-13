import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createComposerStyle} from '../scripts/composer-style.mjs';
import {createMaterials} from '../scripts/material-model.mjs';

const rules = css => [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(([,selectors,declarations]) => ({selectors,declarations}));

test('document-start and mounted phases share one serialized composer policy',()=>{
  const isolated=vm.runInNewContext('('+createComposerStyle.toString()+')');
  const head='html[data-cc-mac-prepaint] #root',mounted='[data-cc-mac-background-surface][data-cc-mac-active]';
  assert.equal(isolated([head,mounted]),createComposerStyle([head,mounted]));
  assert.equal(createComposerStyle(head).replaceAll(head,mounted),createComposerStyle(mounted));
  for(const css of [createComposerStyle(head),createComposerStyle(mounted)]){
    assert(!css.includes('data-cc-mac-region'),'painting must not change when region markers arrive');
    assert.equal(rules(css).length,7,'Home uses a single geometric plate with chrome cleanup');
  }
});

test('native inner layout tokens cannot become additional material owners',()=>{
  const [clearing,painting]=rules(createComposerStyle());
  for(const marker of ['data-composer-body','data-composer-input','data-composer-input-layout','ComposerLayoutBody','ComposerLayoutInput','ComposerLayoutFooter','ComposerLayoutReplyContext']){
    assert(clearing.selectors.includes(marker),'clear native structural node '+marker);
    assert(painting.selectors.includes(marker),'exclude internal layout tokens from roots '+marker);
  }
  assert(painting.selectors.includes(':not(:is([data-composer-surface-variant],[data-composer-layout]) :is([data-composer-surface-variant],[data-composer-layout]))'));
  assert(painting.selectors.includes(':not([data-cc-mac-home-material-owner])'));
  assert(!painting.selectors.includes(' > :is([data-composer-body]'),'wrapped Home Body cannot own another material');
  assert(clearing.declarations.includes('--composer-layout-surface-background:transparent!important'));
  assert(clearing.declarations.includes('--color-background-composer-action-bar:transparent!important'));
  assert(clearing.selectors.includes('.ProseMirror,textarea'),'editable contents cannot paint a second backing');
  assert(painting.selectors.includes(':not(.bg-background-composer-action-bar .bg-background-composer-action-bar'));
});

test('default composer tint is 25% and the material filter paints only with its owner',()=>{
  const material=createMaterials(),[clear,paint]=rules(createComposerStyle());
  assert.equal(material.composerAlpha,.25);
  assert.equal(material.vars['--cc-mac-composer-surface'],'rgba(18,23,32,0.25)');
  assert(paint.declarations.includes('var(--cc-mac-composer-surface,var(--cc-mac-prepaint-composer,rgba(18,23,32,.25)))'));
  assert(paint.declarations.includes('var(--cc-material-composer-filter,var(--cc-mac-prepaint-composer-filter,none))'));
  assert(clear.declarations.includes('backdrop-filter:none!important'));
  assert.equal(createMaterials({performance:'economy'}).vars['--cc-material-composer-filter'],'none');
  assert(!/(?:^|[;\s])(?:opacity|filter|transform)\s*:/.test(clear.declarations+paint.declarations),'text opacity and pixels remain native');
});

test('structural cleanup preserves semantic controls, popups and general surface tokens',()=>{
  const css=createComposerStyle();
  for(const role of ['switch','checkbox','radio','button','combobox','tooltip','menu','dialog','listbox'])assert(css.includes(`[role="${role}"]`));
  const [clear]=rules(css);
  assert(clear.selectors.includes('[role="listbox"]) *)'),'control descendants must also keep their own backing');
  assert(!/--color-surface(?:[-:]|\s)/.test(clear.declarations),'generic surface aliases must remain available to buttons');
  assert(!css.includes('aria-selected'),'selected controls must not be made transparent');
  assert(!css.includes('data-state'),'active controls must not be made transparent');
  assert(css.includes('data-cc-mac-home-material-owner'),'Home plate has a dedicated owner');
  assert(!css.includes('ProseMirror::'),'caret and editor pseudo-elements are not cleanup targets');
});

test('each supplied shell scope applies to both rules; missing scopes are rejected',()=>{
  const scopeA='html[data-early] #root',scopeB='[data-mounted][data-active]';
  const css=createComposerStyle([scopeA,scopeB]);
  for(const rule of rules(css)){assert(rule.selectors.includes(scopeA));assert(rule.selectors.includes(scopeB));}
  for(const invalid of [[],[''],['body{}'],['body;main']])assert.throws(()=>createComposerStyle(invalid),/explicit shell scope/);
});

test('Home fallback and its single plate explicitly preserve round corners when native Root radius is zero',()=>{
  const css=createComposerStyle(),all=rules(css),fallback=all[2],owner=all[3],plate=all[4];
  assert(fallback.selectors.includes('data-composer-utility-bar-variant="home"'));
  assert(fallback.declarations.includes('border-radius:var(--composer-border-radius,22px)!important'));
  for(const rule of [owner,plate])assert(rule.declarations.includes('var(--cc-home-material-radius,var(--composer-border-radius,22px))'));
  assert(!plate.declarations.includes('border-radius:inherit'));
  assert(plate.declarations.includes('pointer-events:none'));
});

test('Portal scopes match the local owner itself and peer HomeRoot cannot repaint within that owner',()=>{
  const scope='html:has(#root[data-cc-mac-validated-surface]) [data-cc-mac-home-material-surface]',css=createComposerStyle([scope]);
  const [clear,paint,,owner,plate]=rules(css);
  assert(owner.selectors.includes(scope+'[data-cc-mac-home-material-owner]'));
  assert(plate.selectors.includes(scope+'[data-cc-mac-home-material-owner]'));
  assert(paint.selectors.includes(':not([data-cc-mac-home-material-owner] *)'));
  assert(paint.selectors.includes(':not([data-composer-rail-item][data-composer-placement="home"])'));
  assert(clear.selectors.includes('[data-composer-rail]:has([data-composer-rail-item][data-composer-placement="home"])'));
  assert(clear.selectors.includes('[data-cc-mac-home-material-owner] :is([data-composer-layout]'));
  assert(!css.includes('position:relative'),'only a geometry-validated adapter can lease owner positioning');
  for(const rule of rules(css))assert(rule.selectors.includes(':not(:is(button,a,'),'Portal cleanup preserves controls and popup descendants');
});

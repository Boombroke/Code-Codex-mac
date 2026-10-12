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
    assert.equal(rules(css).length,2,'only structural clearing and owner painting are needed');
  }
});

test('native inner layout tokens cannot become additional material owners',()=>{
  const [clearing,painting]=rules(createComposerStyle());
  for(const marker of ['data-composer-body','data-composer-input','data-composer-input-layout','ComposerLayoutBody','ComposerLayoutInput','ComposerLayoutFooter','ComposerLayoutReplyContext']){
    assert(clearing.selectors.includes(marker),'clear native structural node '+marker);
    assert(painting.selectors.includes(marker),'exclude internal layout tokens from roots '+marker);
  }
  assert(painting.selectors.includes(':not(:is([data-composer-surface-variant],[data-composer-layout]) :is([data-composer-surface-variant],[data-composer-layout]))'));
  assert(painting.selectors.includes(':not([data-composer-utility-bar-variant="home"])'));
  assert(painting.selectors.includes('[data-composer-utility-bar-variant="home"] > :is([data-composer-body],[class*="ComposerLayoutBody"])'));
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
  assert(!css.includes('::before')&&!css.includes('::after'),'native caret/selection pseudo-elements remain untouched');
});

test('each supplied shell scope applies to both rules; missing scopes are rejected',()=>{
  const scopeA='html[data-early] #root',scopeB='[data-mounted][data-active]';
  const css=createComposerStyle([scopeA,scopeB]);
  for(const rule of rules(css)){assert(rule.selectors.includes(scopeA));assert(rule.selectors.includes(scopeB));}
  for(const invalid of [[],[''],['body{}'],['body;main']])assert.throws(()=>createComposerStyle(invalid),/explicit shell scope/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaterials} from '../scripts/material-model.mjs';
test('75% composer transparency leaves a 25% surface tint',()=>{
  const result=createMaterials();
  assert.equal(result.composerAlpha,.25);
  assert.equal(result.vars['--cc-mac-composer-surface'],'rgba(18,23,32,0.25)');
});
test('clear code and economy remove local blur without changing text opacity',()=>{
  assert.equal(createMaterials({codeStyle:'transparent'}).codeAlpha,0);
  assert.equal(createMaterials({performance:'economy'}).vars['--cc-material-code-filter'],'none');
  assert.equal(createMaterials({performance:'economy'}).vars['--cc-material-composer-filter'],'none');
  assert.equal(createMaterials({tone:'light'}).vars['--cc-mac-composer-surface'],'rgba(245,248,252,0.25)');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createTheme,clearConversationMasks} from '../scripts/theme-model.mjs';
test('100% transparency removes the surface tint and preserves full background opacity',()=>{
  const theme=createTheme();assert.equal(theme.alpha,0);assert.equal(theme.backgroundOpacity,100);assert.equal(theme.vars['--cc-theme-surface'],'rgba(13,19,28,0)');
});
test('the slider uses transparency rather than opacity semantics',()=>{
  assert.equal(createTheme({transparency:0}).alpha,1);
  assert.equal(createTheme({transparency:50}).alpha,.5);
  assert.equal(createTheme({transparency:150}).alpha,0);
});
test('foreground, borders, and accent respond to the selected theme',()=>{
  assert.notEqual(createTheme({tone:'light'}).vars['--cc-theme-fg'],createTheme().vars['--cc-theme-fg']);
  assert.notEqual(createTheme({hue:90}).vars['--cc-theme-accent'],createTheme().vars['--cc-theme-accent']);
});
test('saved sidebar and conversation masks cannot restore tint while other regions keep their settings',()=>{
  const saved={navigation:66,sidebar:66,conversation:58,composer:86,utility:42};
  assert.deepEqual(clearConversationMasks(saved),{navigation:0,sidebar:0,conversation:0,composer:86,utility:42});
  assert.equal(saved.sidebar,66);
  assert.deepEqual(clearConversationMasks(),{navigation:0,sidebar:0,conversation:0});
});

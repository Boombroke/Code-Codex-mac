import test from 'node:test';
import assert from 'node:assert/strict';
import {createContrastModel} from '../scripts/contrast-model.mjs';
import {createTheme} from '../scripts/theme-model.mjs';
const model=createContrastModel();
test('auto follows actual native theme before the OS preference',()=>{
  assert.equal(model.nativeTone({theme:'light',prefersDark:true}),'light');
  assert.equal(model.nativeTone({className:'app dark',prefersDark:false}),'dark');
  assert.equal(model.nativeTone({variant:' light ',prefersDark:true}),'light');
  assert.equal(model.nativeTone({prefersDark:true}),'dark');
});
test('both native themes keep readable text on dark and bright backgrounds',()=>{
  for(const theme of ['light','dark'])for(const rgb of [[18,25,35],[245,238,225],[255,255,255],[0,0,0]])for(const alpha of [0,.25,.4]){
    const backdrop=model.composite(rgb,theme==='light'?[245,248,252]:[18,23,32],alpha);
    assert(model.palette(backdrop).contrast>=4.5);
  }
});
test('midtones choose contrasting ink and small brightness changes do not flip it',()=>{
  for(let v=0;v<=255;v++)assert(model.palette([v,v,v]).contrast>=4.5);
  assert.equal(model.palette([118,118,118],'light').tone,'light');
  assert.equal(model.palette([118,118,118],'dark').tone,'dark');
});
test('native caret and message text use the same local foreground token',()=>{
  const vars=createTheme({tone:'light'}).vars;
  for(const key of ['--color-codex-editor-cursor','--color-token-text-primary','--color-token-input-foreground'])assert.equal(vars[key],'var(--cc-theme-fg)');
  assert.equal(vars['--color-background-elevated-primary'],'var(--cc-theme-surface)');
});

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
test('neutral foreground stays white throughout animated brightness and native theme changes',()=>{
  const expected=model.stablePalette();
  for(const nativeTheme of ['light','dark'])for(const previous of [undefined,'light','dark']) {
    for(let value=0;value<=255;value++) {
      const backdrop=model.composite([value,value,value],nativeTheme==='light'?[245,248,252]:[18,23,32],.25);
      assert.deepEqual(model.palette(backdrop,previous),expected);
    }
  }
  assert.equal(expected.vars['--cc-theme-fg'],'#ffffff');
  assert.equal(expected.tone,'dark');
  assert.equal(expected.vars['--cc-theme-scheme'],'dark');
});
test('stable palette never reads pixels or a previous adaptive tone',()=>{
  const unreadable=new Proxy([],{get(){throw Error('Pixels must not be sampled to style stable text');}});
  assert.deepEqual(model.palette(unreadable,unreadable),model.stablePalette());
  assert.deepEqual(model.stablePalette([255,0,255],'light'),model.stablePalette([0,255,0],'dark'));
});
test('unoutlined control labels retain WCAG contrast without per-frame sampling',()=>{
  const vars=model.stablePalette().vars;
  for(const key of ['--cc-settings-control-surface','--cc-settings-control-hover']) {
    const rgba=/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(vars[key]);
    const tint=rgba.slice(1,4).map(Number),alpha=Number(rgba[4]);
    for(const red of [0,64,128,192,255])for(const green of [0,64,128,192,255])for(const blue of [0,64,128,192,255]) {
      const background=model.composite([red,green,blue],tint,alpha);
      assert(model.ratio(1,model.luminance(background))>=4.5);
    }
  }
});
test('thin edge and one light shadow preserve semantic color families',()=>{
  const vars=model.stablePalette().vars;
  assert.equal(vars['--cc-theme-stroke'],'0.55px rgba(0,0,0,.95)');
  assert.equal((vars['--cc-theme-shadow'].match(/rgba\(/g)||[]).length,1);
  assert.notEqual(vars['--cc-theme-accent'],vars['--cc-theme-fg']);
  assert.notEqual(vars['--color-codex-syntax-keyword'],vars['--color-codex-syntax-string']);
  assert.notEqual(vars['--color-codex-syntax-string'],vars['--cc-theme-fg']);
  for(const key of ['--color-status-success','--color-chart-blue','--color-control-thumb-on-accent','--cc-mac-composer-surface'])assert(!Object.hasOwn(vars,key));
});
test('serialized stable palettes stay independent when a caller changes returned variables',()=>{
  const serialized=new Function('return ('+createContrastModel.toString()+')()')();
  assert.deepEqual(serialized.stablePalette(),model.stablePalette());
  const altered=model.stablePalette();altered.vars['--cc-theme-fg']='#000000';altered.vars['--color-codex-syntax-keyword']='#000000';
  assert.equal(model.stablePalette().vars['--cc-theme-fg'],'#ffffff');
  assert.notEqual(model.stablePalette().vars['--color-codex-syntax-keyword'],'#000000');
});
test('luminance and compositing helpers remain available without a universal white-text contrast claim',()=>{
  assert.equal(model.luminance([0,0,0]),0);
  assert.equal(model.luminance([255,255,255]),1);
  assert.deepEqual(model.composite([0,0,0],[255,255,255],.25),[63.75,63.75,63.75]);
  assert.equal(model.ratio(1,1),1,'plain white fill alone cannot meet 4.5 against white; its fine black edge needs visual validation');
});
test('native caret and message text use the same local foreground token',()=>{
  const vars=createTheme({tone:'light'}).vars;
  for(const key of ['--color-codex-editor-cursor','--color-token-text-primary','--color-token-input-foreground'])assert.equal(vars[key],'var(--cc-theme-fg)');
  assert.equal(vars['--color-background-elevated-primary'],'var(--cc-theme-surface)');
});

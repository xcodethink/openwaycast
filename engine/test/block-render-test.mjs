// 1.2b/c 验证:读 brand.json + storyboard.json → 填全部区块 → 拼镜 → 渲染。
// 不接 TTS/照片背景(专验区块库:8 区块 + 可变条目 + --accent/--accent2 + 按镜唯一 id)。
// 用法: node test/block-render-test.mjs [brand]   默认 wjdigital   产物 /tmp/wc-blocktest.mp4
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { fillBlock } from '../lib/fill-block.mjs';

const ENG = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BRAND = process.argv[2] || 'wjdigital';
const bd = path.join(ENG, 'brands', BRAND);
const brand = JSON.parse(fs.readFileSync(path.join(bd, 'brand.json'), 'utf8'));
const sb = JSON.parse(fs.readFileSync(path.join(bd, 'storyboard.json'), 'utf8'));
const BUILD = '/tmp/wc-blocktest';
const HF = 'hyperframes@0.6.109';

const brandCtx = {
  ACCENT: brand.accent, ACCENT2: brand.accent2 || brand.accent,
  BG: `rgb(${brand.bgRGB.join(',')})`, BRAND_MARK: brand.mark, BRAND_NAME: brand.name,
};

fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(path.join(BUILD, 'compositions'), { recursive: true });
fs.cpSync(path.join(ENG, 'template', 'fonts'), path.join(BUILD, 'fonts'), { recursive: true });
fs.copyFileSync(path.join(ENG, 'vendor', 'gsap.min.js'), path.join(BUILD, 'gsap.min.js'));

const starts = []; let acc = 0;
const files = sb.shots.map((sh, i) => {
  const id = 'shot' + (i + 1);
  const tmpl = fs.readFileSync(path.join(ENG, 'blocks', sh.block + '.html'), 'utf8');
  const ctx = { ...brandCtx, ...sh.content, ID: id, SEQ: `0${i + 1} / 0${sb.shots.length}` };
  let html = fillBlock(tmpl, ctx).split('https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js').join('gsap.min.js');
  const fn = `0${i + 1}-${sh.block}.html`;
  fs.writeFileSync(path.join(BUILD, 'compositions', fn), html);
  starts.push(acc); acc += sh.dur;
  return { id, fn, start: starts[i], dur: sh.dur };
});
const total = acc, cuts = starts.slice(1);
const scenes = files.map(f => `    <div id="s-${f.id}" data-composition-id="${f.id}" data-composition-src="compositions/${f.fn}" data-start="${f.start}" data-duration="${f.dur}" data-track-index="0"></div>`).join('\n');
const index = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><script src="gsap.min.js"></script>
<style>html,body{margin:0;padding:0;width:1080px;height:1920px;background:#000;overflow:hidden}#master-root{width:1080px;height:1920px;position:relative}[data-composition-id="master"]>div[data-composition-id]{position:absolute;inset:0}#wipe{position:absolute;left:0;top:0;width:1080px;height:1920px;z-index:60;background:linear-gradient(180deg,${brand.accent},${brand.accent});transform:scaleY(0);transform-origin:50% 50%;pointer-events:none}</style></head>
<body><div id="master-root" data-composition-id="master" data-width="1080" data-height="1920" data-start="0">
${scenes}
    <div id="wipe"></div>
  </div>
  <script>window.__timelines=window.__timelines||{};(function(){var w=document.getElementById('wipe');var m=gsap.timeline({paused:true});[${cuts.join(',')}].forEach(function(t){m.fromTo(w,{scaleY:0},{scaleY:1,duration:0.16,ease:"power2.in",transformOrigin:"50% 50%"},t-0.16).to(w,{scaleY:0,duration:0.16,ease:"power2.out",transformOrigin:"50% 50%"},t)});m.set({},{},${total});window.__timelines["master"]=m})();</script>
</body></html>`;
fs.writeFileSync(path.join(BUILD, 'index.html'), index);
fs.writeFileSync(path.join(BUILD, 'meta.json'), JSON.stringify({ id: 'blocktest', name: 'Block Test', width: 1080, height: 1920 }));
fs.writeFileSync(path.join(BUILD, 'hyperframes.json'), JSON.stringify({ "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json", "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry", "paths": { "blocks": "compositions", "components": "compositions/components", "assets": "assets" } }));
console.log(`${BRAND}: 填充 ${files.length} 区块完成,渲染中…`);
execSync(`cd ${JSON.stringify(BUILD)} && npx -y ${HF} render --quality draft --fps 30 --workers 2 --output /tmp/wc-blocktest.mp4`, { stdio: 'inherit' });
console.log('✅ /tmp/wc-blocktest.mp4  (总 ' + total.toFixed(1) + 's)');

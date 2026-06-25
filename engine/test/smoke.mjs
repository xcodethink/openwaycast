// 冒烟/回归自检:不渲染,秒级。结构 + 依赖 + 区块库契约 + storyboard 填充。出片前跑一遍防低级错误。
// 用法: node test/smoke.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cfg } from '../config.mjs';
import { fillBlock } from '../lib/fill-block.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, '..');
const pad2 = n => String(n).padStart(2, '0');
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

console.log('=== brand-engine 冒烟自检 ===');

// 1) 依赖
console.log('[依赖]');
ok(parseInt(process.versions.node) >= 22, `Node ≥22 (当前 ${process.version})`);
ok(cfg.ffmpeg && fs.existsSync(cfg.ffmpeg), 'ffmpeg');
ok(cfg.ffprobe && fs.existsSync(cfg.ffprobe), 'ffprobe');
ok(cfg.kokoroVenv && fs.existsSync(cfg.kokoroVenv + '/bin/python'), 'Kokoro venv(英文配音)');
ok(/gsap@\d+\.\d+\.\d+/.test(fs.readFileSync(path.join(ENG, 'build.mjs'), 'utf8')), 'gsap CDN 版本已锁(渲染期 hyperframes 内联,仓库不再分发 gsap)');
ok(fs.existsSync(path.join(ENG, 'build.mjs')) && fs.existsSync(path.join(ENG, 'build-all.mjs')), 'build.mjs + build-all.mjs');
const bsrc = fs.readFileSync(path.join(ENG, 'build.mjs'), 'utf8');
ok(/hyperframes@\d+\.\d+\.\d+/.test(bsrc) && !/npx -y hyperframes /.test(bsrc), 'hyperframes 已锁版本(无裸 npx hyperframes)');
ok(bsrc.includes('GSAP_CDN') && bsrc.includes('VENDORED_GSAP'), 'build gsap 处理:默认 CDN,vendor/ 有则本地化离线');

// 2) 区块库契约(每个 block 一次)
console.log('[区块库 blocks/]');
const blocksDir = path.join(ENG, 'blocks');
const blocks = fs.readdirSync(blocksDir).filter(f => f.endsWith('.html'));
ok(blocks.length >= 1, '至少 1 个区块');
for (const b of blocks) {
  const s = fs.readFileSync(path.join(blocksDir, b), 'utf8');
  ok(s.includes('data-composition-id="{{ID}}"'), `${b}: 按镜唯一 id 占位 {{ID}}`);
  ok(/\.set\(\{\},\{\},[0-9.]+\)/.test(s), `${b}: 有 .set({},{},N) 收尾(重定时锚点)`);
  ok(s.includes('__timelines['), `${b}: 注册 __timelines`);
  ok(!s.includes('base64'), `${b}: 不含内嵌 base64(背景走 asset)`);
  ok(s.includes('<div class="bg"></div>'), `${b}: 有 .bg 锚点(供注入背景)`);
  ok(s.includes('--accent:{{ACCENT}}') && s.includes('{{BG}}'), `${b}: 品牌色/底色走 CSS 变量({{ACCENT}}/{{BG}})`);
}

// 2b) fill-block 守卫(回归:残留 token 必须抛错,无论大小写)
try {
  const { fillBlock } = await import('../lib/fill-block.mjs');
  let t1 = false; try { fillBlock('a {{X}} b', {}); } catch { t1 = true; } ok(t1, 'fill-block:未填大写 token 抛错');
  let t2 = false; try { fillBlock('a {{name}} b', {}); } catch { t2 = true; } ok(t2, 'fill-block:未填小写 token 也抛错(回归)');
  ok(fillBlock('a {{X}} b', { X: '$& $1 keep' }) === 'a $& $1 keep b', 'fill-block:$&/$1 按字面替换不被特殊解释');
  ok(fillBlock('x<!--ITEMS:R-->[{{a}}{{b}}]<!--/ITEMS-->y', { R: [{ a: '1' }] }) === 'x[1]y', 'fill-block:ITEMS 缺省小写字段清空');
} catch (e) { ok(false, 'fill-block 守卫自检异常: ' + String(e.message).slice(0, 80)); }

// 3) 每个品牌:brand.json / vo.json / storyboard.json + 填充演练 + 背景
const brandsDir = path.join(ENG, 'brands');
const brandSlugs = fs.readdirSync(brandsDir).filter(d => fs.existsSync(path.join(brandsDir, d, 'brand.json')));
ok(brandSlugs.length >= 1, '至少 1 个品牌');
for (const slug of brandSlugs) {
  console.log(`[品牌 ${slug}]`);
  const bd = path.join(brandsDir, slug);
  let bj = {};
  try { bj = JSON.parse(fs.readFileSync(path.join(bd, 'brand.json'), 'utf8')); ok(true, 'brand.json 可解析'); }
  catch { ok(false, 'brand.json 可解析'); }
  ['name', 'slug', 'prefix', 'accent', 'bgRGB'].forEach(k => ok(bj[k] != null, `brand.json.${k}`));
  ok(Array.isArray(bj.bgRGB) && bj.bgRGB.length === 3, 'brand.json.bgRGB 为 [r,g,b]');
  // vo.json
  let vo = {};
  try { vo = JSON.parse(fs.readFileSync(path.join(bd, 'vo.json'), 'utf8')); } catch {}
  // storyboard.json
  let sb = {};
  try { sb = JSON.parse(fs.readFileSync(path.join(bd, 'storyboard.json'), 'utf8')); ok(true, 'storyboard.json 可解析'); }
  catch { ok(false, 'storyboard.json 可解析'); }
  const N = Array.isArray(sb.shots) ? sb.shots.length : 0;
  ok(N >= 1, 'storyboard.shots 非空');
  ok(Array.isArray(vo.vo) && vo.vo.length === N && vo.vo.every(x => x && x.trim()), `vo.vo ${N} 段非空(英,与镜数一致)`);
  ok(Array.isArray(vo.vo_zh) && vo.vo_zh.length === N && vo.vo_zh.every(x => x && x.trim()), `vo.vo_zh ${N} 段非空(中,与镜数一致)`);
  // 填充演练:每镜的 block 存在 + fillBlock 不抛(零残留 token) + 产出含 composition-id
  const brandCtx = { ACCENT: bj.accent, ACCENT2: bj.accent2 || bj.accent, BG: `rgb(${(bj.bgRGB||[5,6,8]).join(',')})`, BRAND_MARK: bj.mark || '◆', BRAND_NAME: bj.name };
  (sb.shots || []).forEach((sh, i) => {
    const bp = path.join(blocksDir, `${sh.block}.html`);
    if (!fs.existsSync(bp)) { ok(false, `镜${pad2(i+1)}: 区块 blocks/${sh.block}.html 存在`); return; }
    try {
      const out = fillBlock(fs.readFileSync(bp, 'utf8'), { ...brandCtx, ...sh.content, ID: `shot${i+1}`, SEQ: `${pad2(i+1)} / ${pad2(N)}` });
      ok(out.includes(`data-composition-id="shot${i+1}"`), `镜${pad2(i+1)}(${sh.block}): 填充成功 + 唯一 id`);
    } catch (e) { ok(false, `镜${pad2(i+1)}(${sh.block}): 填充零残留 — ${String(e.message).slice(0,60)}`); }
  });
  // 背景图 + manifest(与镜数一致)
  for (let i = 1; i <= N; i++) {
    const img = path.join(bd, 'assets', 'bg', pad2(i) + '.jpg');
    ok(fs.existsSync(img) && fs.statSync(img).size > 1000, `assets/bg/${pad2(i)}.jpg`);
  }
  let mf = {};
  try { mf = JSON.parse(fs.readFileSync(path.join(bd, 'bg-manifest.json'), 'utf8')); } catch {}
  ok(Array.isArray(mf.images) && mf.images.length === N && mf.images.every(x => x.credit), `bg-manifest ${N} 条含署名`);
}

// 4) 内容管线(Phase 2.1/2.4)—— 离线:结构 + 启发式 + 注入假 LLM + 防杜撰
console.log('[内容管线 content/]');
for (const f of ['scrape.mjs', 'color.mjs', 'extract-brief.mjs', 'brief.mjs']) ok(fs.existsSync(path.join(ENG, 'content', f)), `content/${f} 存在`);
try {
  const color = await import('../content/color.mjs');
  ok(color.isVividHex('#9dff71') === true, 'isVividHex 接受鲜艳色');
  ok(color.isVividHex('#000000') === false && color.isVividHex('#ffffff') === false && color.isVividHex('#808080') === false, 'isVividHex 拒黑/白/灰');
  const eb = await import('../content/extract-brief.mjs');
  const sig = {
    source_url: 'https://acme.example', final_url: 'https://acme.example/', title: 'ACME — We build robots',
    description: 'ACME builds friendly robots.', og: { site_name: 'ACME' },
    headings: { h1: ['We build robots'], h2: [], h3: [] }, nav: ['Home', 'Robots', 'Pricing', 'About', 'Contact', 'ACME'],
    emails: ['hi@acme.example'], phones: [], socials: ['https://x.com/acme'], text: 'ACME builds friendly robots.', images: [],
  };
  // 启发式:确定性,不臆造
  const h = eb.heuristicBrief(sig);
  ok(h.name === 'ACME', '启发式 name 取 og:site_name');
  ok(h.tagline === 'We build robots', '启发式 tagline 取标题副段');
  ok(!h.services.includes('Home') && !h.services.includes('Pricing') && !h.services.includes('ACME') && h.services.includes('Robots'), '启发式 services 过滤样板/品牌名');
  ok(h.city === null && h.extraction_unknowns.includes('city'), '启发式 city 无依据→null 且进 unknowns(不臆造)');
  // 组装 + 注入假 LLM provider(免网络/免 key)
  const fake = { model: 'fake-1', call: async () => ({ name: 'ACME Inc', tagline: 'Robots for all', city: 'Berlin', one_liner: 'x', services: Array(20).fill('s'), selling_points: Array(9).fill('p'), _unknowns: [] }) };
  const bl = await eb.extractBrief(sig, { llm: fake, accent: { accent: '#9dff71', source: 'theme-color', confidence: 'high' } });
  ok(bl.extraction.mode === 'llm' && bl.extraction.provider === 'inject', '注入 LLM:mode=llm');
  ok(bl.name === 'ACME Inc' && bl.city === 'Berlin', '注入 LLM:字段并入');
  ok(bl.services.length === 8 && bl.selling_points.length === 5, '注入 LLM:services/selling_points 截断到上限');
  ok(bl.contact.email === 'hi@acme.example' && bl.accent === '#9dff71' && bl.accent_confidence === 'high', '组装:contact/accent 并入');
  // 防杜撰:LLM 全 null → 不发明
  const nullLlm = { call: async () => ({ name: null, tagline: null, city: null, one_liner: null, services: [], selling_points: [], _unknowns: ['name'] }) };
  const bn = await eb.extractBrief(sig, { llm: nullLlm });
  ok(bn.name === null && bn.city === null && bn.services.length === 0, '防杜撰:LLM 返回 null 时不臆造');
  // extractJson 稳健性(回归:贪婪正则会被散文花括号带歪)
  ok(eb.extractJson('Here is the brief: {"name":"X"} let me know {more}').name === 'X', 'extractJson:忽略前后散文/花括号');
  ok(eb.extractJson('```json\n{"a":1}\n```').a === 1, 'extractJson:剥 markdown 围栏');
  ok(eb.extractJson('{"s":"has } brace inside"}').s === 'has } brace inside', 'extractJson:字符串内花括号不误判');
  let threw = false; try { eb.extractJson('no json here'); } catch { threw = true; } ok(threw, 'extractJson:无 JSON 抛错');
  // provider 解析
  ok(eb.resolveProvider({}, {}) === null, 'resolveProvider:无 key→null');
  ok(eb.resolveProvider({}, { ANTHROPIC_API_KEY: 'sk-x' })?.provider === 'anthropic', 'resolveProvider:有 anthropic key');
  ok(eb.resolveProvider({ provider: 'openai', apiKey: 'k' }, {})?.model === 'gpt-4o-mini', 'resolveProvider:openai 默认 model');

  // write-script(2.2):区块目录 + 双模式 + 校验
  const ws = await import('../content/write-script.mjs');
  const cat = ws.blockCatalog();
  ok(cat.grid && cat.grid.items.TILES && ['tn', 'th', 'td'].every(f => cat.grid.items.TILES.includes(f)), 'blockCatalog:grid.TILES 字段 tn/th/td');
  ok(cat.cover && cat.cover.scalars.includes('WORD') && cat.cover.scalars.includes('TAG') && !cat.cover.scalars.includes('ACCENT'), 'blockCatalog:cover 标量含 WORD/TAG,排除注入 token');
  const fakeBrief = { name: 'ACME', tagline: 'We build robots', city: 'Berlin', one_liner: 'ACME builds friendly robots.', services: ['Design', 'Build', 'Support'], selling_points: ['Fast', 'Reliable'], contact: { website: 'acme.example', email: 'hi@acme.example', socials: [] }, accent: null, accent_confidence: 'none', extraction: { mode: 'heuristic', unknowns: [] } };
  // 确定性骨架(无 key,不注入)
  const sk = await ws.writeScript(fakeBrief);
  ok(sk.meta.mode === 'skeleton', 'writeScript:无 key→骨架');
  ok(sk.storyboard.shots.length === sk.vo.vo.length && sk.vo.vo.length >= 5, 'writeScript:骨架镜数=vo段数');
  ok(sk.meta.has_zh === false && sk.vo.vo_zh.length === 0, 'writeScript:骨架无 ZH(标记待补)');
  ok(sk.storyboard.shots.every(s => cat[s.block]), 'writeScript:骨架所有区块存在');  // writeScript 内部已 fillBlock 干跑校验,不抛=内容齐全
  // services 不足→grid 兜底为 statement-list(不崩)
  const sk2 = await ws.writeScript({ ...fakeBrief, services: [], selling_points: [] });
  ok(sk2.storyboard.shots.length >= 5, 'writeScript:空 services 仍出有效骨架');
  // 注入假 LLM:产出被校验 + vo/vo_zh 并入
  const fakeWriter = { model: 'fake', call: async (b, c, n) => ({
    shots: [{ block: 'cover', content: { META_L: 'A', META_R: 'B', WORD: 'ACME', SUB: 'X', KICKER: 'K', HERO: 'H', TAG: 'T' } }, { block: 'cta', content: { META_L: 'A', META_R: 'B', WORD: 'ACME', Q: 'Q', CSUB: 'C', BTN: 'go', DISC: 'd' } }],
    vo: ['en1', 'en2'], vo_zh: ['中1', '中2'], _unknowns: [] }) };
  const li = await ws.writeScript(fakeBrief, { llm: fakeWriter });
  ok(li.meta.mode === 'llm' && li.meta.has_zh === true && li.vo.vo_zh.length === 2, 'writeScript:注入 LLM→mode=llm + ZH 并入');
  // 校验拦截:未知区块 / 漏内容字段必须抛
  let bad1 = false; try { await ws.writeScript(fakeBrief, { llm: { call: async () => ({ shots: [{ block: 'nope', content: {} }], vo: ['x'], vo_zh: ['x'] }) } }); } catch { bad1 = true; } ok(bad1, 'writeScript:未知区块抛错');
  let bad2 = false; try { await ws.writeScript(fakeBrief, { llm: { call: async () => ({ shots: [{ block: 'cover', content: { META_L: 'A' } }], vo: ['x'], vo_zh: ['x'] }) } }); } catch { bad2 = true; } ok(bad2, 'writeScript:区块内容漏填抛错');
  // H2:条目错型(TILES 给字符串)必须抛(否则渲染空格子)
  let bH2 = false; try { await ws.writeScript(fakeBrief, { llm: { call: async () => ({ shots: [{ block: 'grid', content: { META_L: 'A', META_R: 'B', LABEL: 'L', TILES: ['oops'] } }], vo: ['x'], vo_zh: ['x'] }) } }); } catch { bH2 = true; } ok(bH2, 'writeScript:条目错型(非对象)抛错');
  // H3:整镜标量全空必须抛(否则渲染空镜)
  let bH3 = false; try { await ws.writeScript(fakeBrief, { llm: { call: async () => ({ shots: [{ block: 'cover', content: { META_L: '', META_R: '', WORD: '', SUB: '', KICKER: '', HERO: '', TAG: '' } }], vo: ['x'], vo_zh: ['x'] }) } }); } catch { bH3 = true; } ok(bH3, 'writeScript:整镜全空抛错');
  // 可选小写字段为空仍应通过(grid td / list lv 允许空)
  let okOpt = true; try { await ws.writeScript(fakeBrief, { llm: { call: async () => ({ shots: [{ block: 'grid', content: { META_L: 'A', META_R: 'B', LABEL: 'L', TILES: [{ tn: '01', th: 'X', td: '' }] } }], vo: ['x'], vo_zh: ['x'] }) } }); } catch { okOpt = false; } ok(okOpt, 'writeScript:条目可选字段为空仍通过');
  let bad3 = false; try { await ws.writeScript(fakeBrief, { llm: { call: async () => ({ shots: [{ block: 'cta', content: { META_L: 'A', META_R: 'B', WORD: 'W', Q: 'Q', CSUB: 'C', BTN: 'b', DISC: 'd' } }], vo: ['a', 'b'], vo_zh: ['x'] }) } }); } catch { bad3 = true; } ok(bad3, 'writeScript:vo 段数≠镜数抛错');

  // images(2.3):provider 解析 + 检索词 + 注入抓取器处理(离线)
  const im = await import('../content/images.mjs');
  ok(im.resolveImageProvider({}, {}) === null, 'resolveImageProvider:无 key→null');
  ok(im.resolveImageProvider({}, { PEXELS_API_KEY: 'k' })?.provider === 'pexels', 'resolveImageProvider:pexels');
  ok(im.resolveImageProvider({}, { UNSPLASH_ACCESS_KEY: 'k' })?.provider === 'unsplash', 'resolveImageProvider:unsplash');
  ok(im.deriveQueries({ city: 'Tokyo' }).some(q => q.includes('Tokyo')) && im.deriveQueries({}).length >= 4, 'deriveQueries:有城市含城市/无城市通用');
  const bgSrc = fs.readdirSync(path.join(ENG, 'brands', 'wjdigital', 'assets', 'bg')).filter(f => /\.jpg$/.test(f)).sort().map(f => ({ download_url: path.join(ENG, 'brands', 'wjdigital', 'assets', 'bg', f), credit: `City — P ${f} — Pexels` }));
  const bgOut = path.join(ENG, 'test', '_smoke-bg');
  fs.rmSync(bgOut, { recursive: true, force: true });
  try {
    const r = await im.buildBackgrounds({ city: 'Test' }, { ffmpeg: cfg.ffmpeg, count: 3, outDir: bgOut, fetcher: async () => bgSrc, readLocal: p => fs.readFileSync(p) });
    const made = fs.readdirSync(path.join(bgOut, 'assets', 'bg')).filter(f => /\.jpg$/.test(f));
    ok(made.length === 3, 'buildBackgrounds:生成 3 张');
    const mf = JSON.parse(fs.readFileSync(path.join(bgOut, 'bg-manifest.json'), 'utf8'));
    ok(mf.images.length === 3 && mf.images.every(x => x.credit && x.file), 'buildBackgrounds:manifest 3 条含署名');
    const cp = await import('child_process');
    const dim = cp.execFileSync(cfg.ffprobe, ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(bgOut, 'assets', 'bg', '02.jpg')]).toString().trim();
    ok(dim === '1080,1920', 'buildBackgrounds:输出裁切到 1080x1920');
  } finally { fs.rmSync(bgOut, { recursive: true, force: true }); }
  let nb = false; try { await im.buildBackgrounds({}, { ffmpeg: cfg.ffmpeg, count: 3, outDir: bgOut }); } catch { nb = true; } ok(nb, 'buildBackgrounds:无 key/fetcher 抛错');
  let ni = false; try { await im.buildBackgrounds({}, { ffmpeg: cfg.ffmpeg, count: 6, outDir: bgOut, fetcher: async () => [{ download_url: 'x', credit: 'c' }], readLocal: () => Buffer.alloc(4096) }); } catch { ni = true; } ok(ni, 'buildBackgrounds:候选不足抛错');
  // M6:非图片字节(HTML/JSON 错误页伪装)→ 不喂 ffmpeg,候选耗尽抛错 + 不留半成品
  const bgOut2 = path.join(ENG, 'test', '_smoke-bg2'); fs.rmSync(bgOut2, { recursive: true, force: true });
  let nimg = false; try { await im.buildBackgrounds({}, { ffmpeg: cfg.ffmpeg, count: 2, outDir: bgOut2, fetcher: async () => [{ download_url: 'a.jpg', credit: 'c' }, { download_url: 'b.jpg', credit: 'c' }], readLocal: () => Buffer.from('<!DOCTYPE html><html>not an image</html>') }); } catch { nimg = true; } ok(nimg, 'buildBackgrounds:非图片字节被拦(不喂 ffmpeg)');
  ok(!fs.existsSync(path.join(bgOut2, 'assets', 'bg')) || fs.readdirSync(path.join(bgOut2, 'assets', 'bg')).length === 0, 'buildBackgrounds:失败不留半成品');
  fs.rmSync(bgOut2, { recursive: true, force: true });
} catch (e) { ok(false, '内容管线自检异常: ' + String(e.message).slice(0, 80)); }

// 5) TTS 抽象层(Phase 3)—— 离线:provider 解析 + 依赖检查 + 注入 dispatch
console.log('[TTS 抽象 tts/]');
ok(fs.existsSync(path.join(ENG, 'tts', 'synth.mjs')), 'tts/synth.mjs 存在');
try {
  const tts = await import('../tts/synth.mjs');
  ok(tts.resolveTTSProvider({ lang: 'zh' }, {}) === 'cosyvoice' && tts.resolveTTSProvider({ lang: 'en' }, {}) === 'kokoro', 'resolveTTSProvider:默认本地按语言');
  ok(tts.resolveTTSProvider({ lang: 'en' }, { WAYCAST_TTS_PROVIDER: 'openai' }) === 'openai', 'resolveTTSProvider:env 覆盖');
  ok(tts.resolveTTSProvider({ provider: 'elevenlabs' }, {}) === 'elevenlabs', 'resolveTTSProvider:opts 优先');
  let bad = false; try { tts.resolveTTSProvider({ provider: 'bogus' }, {}); } catch { bad = true; } ok(bad, 'resolveTTSProvider:未知 provider 抛错');
  ok(tts.isCloudTTS('openai') && tts.isCloudTTS('elevenlabs') && tts.isCloudTTS('azure') && !tts.isCloudTTS('kokoro') && !tts.isCloudTTS('cosyvoice'), 'isCloudTTS:云/本地区分');
  ok(tts.ttsBlockers('openai', {}, {}).includes('OPENAI_API_KEY') && tts.ttsBlockers('openai', {}, { OPENAI_API_KEY: 'k' }).length === 0, 'ttsBlockers:openai 需 key');
  ok(tts.ttsBlockers('elevenlabs', {}, {}).includes('ELEVENLABS_API_KEY'), 'ttsBlockers:elevenlabs 需 key');
  ok(tts.ttsBlockers('azure', {}, { AZURE_TTS_KEY: 'k' }).includes('AZURE_TTS_REGION'), 'ttsBlockers:azure 需 region');
  ok(tts.ttsBlockers('kokoro', { kokoroVenv: '/no/such' }, {}).length === 1, 'ttsBlockers:kokoro 缺 venv');
  // 注入 dispatch:不碰真模型/网络,验证管线把 provider/lines 传对
  let seen = null;
  const paths = await tts.synthesizeVO({ lines: ['a', 'b'], lang: 'en', rawDir: path.join(ENG, 'test', '_smoke-tts'), synth: ({ provider, lines }) => { seen = { provider, n: lines.length }; return ['x', 'y']; } });
  ok(seen && seen.provider === 'kokoro' && seen.n === 2 && paths.length === 2, 'synthesizeVO:注入 dispatch 传对 provider/lines');
  fs.rmSync(path.join(ENG, 'test', '_smoke-tts'), { recursive: true, force: true });
  let em = false; try { await tts.synthesizeVO({ lines: [], lang: 'en', rawDir: '/tmp/x', synth: () => [] }); } catch { em = true; } ok(em, 'synthesizeVO:空 lines 抛错');
} catch (e) { ok(false, 'TTS 抽象自检异常: ' + String(e.message).slice(0, 80)); }

// 6) 可移植/安装(Phase 4)
console.log('[可移植/安装]');
const ROOT = path.join(ENG, '..');
for (const f of ['.env.example', 'setup.sh', 'docker-compose.yml', 'Dockerfile.tts', 'docs/install.md', 'docs/tts.md',
  'CLAUDE.md', 'AGENTS.md', 'docs/agent-usage.md', 'docs/storyboard-schema.md'])
  ok(fs.existsSync(path.join(ROOT, f)), `${f} 存在`);
ok(fs.existsSync(path.join(ENG, 'content', 'catalog.mjs')), 'content/catalog.mjs 存在(agent 查区块契约)');
// npm 包层
for (const f of ['package.json', 'bin/waycast.mjs', '.npmignore']) ok(fs.existsSync(path.join(ROOT, f)), `${f} 存在`);
try {
  const pj = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok(pj.name === 'waycastai' && pj.bin && pj.bin.waycast && Array.isArray(pj.files), 'package.json:name/bin/files 齐');
  ok(pj.type === 'module' && pj.engines && /22/.test(pj.engines.node), 'package.json:ESM + Node≥22');
} catch (e) { ok(false, 'package.json 解析: ' + String(e.message).slice(0, 60)); }
{
  const bsrc3 = fs.readFileSync(path.join(ENG, 'build.mjs'), 'utf8');
  ok(/BUILD = path\.join\(os\.tmpdir\(\)/.test(bsrc3), 'build.mjs:渲染暂存在 tmpdir(不污染品牌包/npm)');
  ok(/cfg\.brandsDir/.test(bsrc3), 'build.mjs:品牌目录走 cfg.brandsDir(支持 WAYCAST_HOME)');
}
// MCP server 层(静态;端到端见 test/mcp-test.mjs)
ok(fs.existsSync(path.join(ENG, 'mcp', 'server.mjs')), 'mcp/server.mjs 存在');
ok(fs.existsSync(path.join(ROOT, 'docs', 'mcp.md')), 'docs/mcp.md 存在');
try {
  const msrc = fs.readFileSync(path.join(ENG, 'mcp', 'server.mjs'), 'utf8');
  for (const t of ['waycast_scrape', 'waycast_catalog', 'waycast_write_brand', 'waycast_make_brand', 'waycast_render', 'waycast_doctor', 'waycast_list_brands'])
    ok(msrc.includes(`'${t}'`), `mcp 工具 ${t}`);
  ok(msrc.includes("'initialize'") && msrc.includes("'tools/list'") && msrc.includes("'tools/call'"), 'mcp:协议方法齐(initialize/tools-list/tools-call)');
  ok(fs.readFileSync(path.join(ROOT, 'bin', 'waycast.mjs'), 'utf8').includes("case 'mcp'"), 'bin 有 mcp 子命令');
} catch (e) { ok(false, 'mcp 自检: ' + String(e.message).slice(0, 60)); }
// 引擎非测试代码不得硬编码 /tmp(Windows 无 /tmp;须用 os.tmpdir())
let tmpHardcode = [];
for (const d of ['', 'content', 'tts', 'lib']) {
  const dir = path.join(ENG, d); if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.mjs')) continue;
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/['"`]\/tmp\//.test(s)) tmpHardcode.push(path.join(d, f));
  }
}
ok(tmpHardcode.length === 0, `非测试代码无硬编码 /tmp(${tmpHardcode.join(',') || 'clean'})`);
{
  const bsrc2 = fs.readFileSync(path.join(ENG, 'build.mjs'), 'utf8');
  ok(bsrc2.includes('os.tmpdir()'), 'build.mjs 用 os.tmpdir()(跨平台临时目录)');
  ok(/MIN_SHOT/.test(bsrc2) && /Math\.max\(MIN_SHOT/.test(bsrc2), 'build.mjs 有最小镜时长钳位(防短旁白内容被切)');
  ok(bsrc2.includes("'<div class=\"bg\">' + bgartFor(i) + '</div>'"), 'build.mjs 背景照片嵌入 .bg(随 ken-burns 连续运动,防静止段)');
  const srcMark = ['xFin', 'Compass'].join(''), oldDir = 'auto/' + 'brand-engine';  // 拆分:本文件自身不出现完整私有名
  ok(!bsrc2.includes(srcMark) && !bsrc2.includes(oldDir), 'build.mjs 无源项目残留注释');
}

// 7) GUI 控制台(Phase 5)—— 静态检查(不 import server.mjs:它 import 即 listen)
console.log('[GUI 控制台 console/]');
for (const f of ['console/server.mjs', 'console/index.html', 'console/start.command'])
  ok(fs.existsSync(path.join(ENG, f)), `${f} 存在`);
try {
  const srv = fs.readFileSync(path.join(ENG, 'console', 'server.mjs'), 'utf8');
  ok(srv.includes("'127.0.0.1'") || srv.includes('"127.0.0.1"'), 'server 仅绑 127.0.0.1(本地工具不对外)');
  ok(srv.includes('safeName') && /\[a-zA-Z0-9._-\]/.test(srv), 'server 有 safeName 路径穿越守卫');
  ok(srv.includes('spawn(') && srv.includes('make-brand.mjs') && srv.includes('build.mjs'), 'server 走子进程复用 make-brand/build');
  ok(srv.includes('text/event-stream'), 'server 有 SSE 进度流');
  const html = fs.readFileSync(path.join(ENG, 'console', 'index.html'), 'utf8');
  ok(html.includes('/api/generate') && html.includes('/api/render') && html.includes('/api/brand/'), 'index.html 接生成/渲染/编辑 API');
} catch (e) { ok(false, 'console 自检异常: ' + String(e.message).slice(0, 80)); }

console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);

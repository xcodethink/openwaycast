// brand-engine —— 配置驱动的品牌介绍片引擎(一套代码,多品牌,中英双语)
// 用法: BRAND=wjdigital [VO_LANG=en|zh] [QUALITY=draft|standard] node build.mjs
//   每家品牌在 brands/<slug>/: brand.json + vo.json(vo/vo_zh) + storyboard.json(镜头=区块+内容) + assets/bg/0N.jpg + bg-manifest.json
//   镜头由 blocks/ 区块库按 storyboard.json 内容填充生成(per-brand compositions 已退役)。
//   背景由本引擎按 manifest 注入(asset 文件,非 base64);转场色=品牌色;en=Kokoro am_michael / zh=CosyVoice 同嗓克隆。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { cfg, checkDeps } from './config.mjs';
import { fillBlock } from './lib/fill-block.mjs';
import { resolveTTSProvider, ttsBlockers, isCloudTTS, synthesizeVO } from './tts/synth.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));            // engine/
const ENGINE_TPL = path.join(HERE, 'template');      // 复用字体 + 音乐
const FF = cfg.ffmpeg, FFPROBE = cfg.ffprobe;
const WARM = "highpass=f=75,equalizer=f=130:t=q:w=1.2:g=3.5,equalizer=f=320:t=q:w=1.4:g=-1.5,equalizer=f=3200:t=q:w=2:g=2,acompressor=threshold=-18dB:ratio=3:attack=6:release=140:makeup=3,alimiter=limit=0.95";
const QUALITY = process.env.QUALITY || 'draft';
const LANG = process.env.VO_LANG || 'en';
const BRAND = process.env.BRAND;
const HF = 'hyperframes@0.6.109';        // 锁版本:npx 默认取最新会漂移(已见 0.6.96→0.6.109);TTS 适配器也复用
// 配音由 tts/synth.mjs 抽象(本地 Kokoro/CosyVoice 或云);路径/凭据见 config.mjs + 各 provider env
const GSAP_CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js';   // 本地化:渲染期不依赖 CDN

if (!BRAND) { console.error('[用法] 必须指定 BRAND,例: BRAND=wjdigital node build.mjs   可选: VO_LANG=zh QUALITY=standard'); process.exit(2); }
const brandDir = path.join(cfg.brandsDir, BRAND);
if (!fs.existsSync(brandDir)) { const ex = fs.existsSync(cfg.brandsDir) ? fs.readdirSync(cfg.brandsDir).join(', ') : '(无)'; console.error(`[找不到品牌] ${path.join(cfg.brandsDir, BRAND)} 不存在。现有: ${ex}`); process.exit(2); }

const brand = JSON.parse(fs.readFileSync(path.join(brandDir, 'brand.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(brandDir, 'vo.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(brandDir, 'bg-manifest.json'), 'utf8'));
const VO = (LANG === 'zh' && Array.isArray(meta.vo_zh)) ? meta.vo_zh : meta.vo;
const BUILD = path.join(os.tmpdir(), `wc-build-${BRAND}-${LANG}`);   // 渲染暂存挪到 tmp,品牌目录只留源(不污染包/git/用户目录)
const ACCENT = brand.accent || '#ff8a00';
const ACCENT2 = brand.accent2 || ACCENT;
const RGB = brand.bgRGB || [5, 6, 8];
const BG_OPACITY = brand.bgOpacity != null ? brand.bgOpacity : 0.42;
const pad2 = n => String(n).padStart(2, '0');

// storyboard 是唯一镜头来源:每镜从 blocks/ 区块库 + storyboard.json 内容生成(per-brand compositions 已退役)。
const sbPath = path.join(brandDir, 'storyboard.json');
if (!fs.existsSync(sbPath)) { console.error(`[找不到 storyboard] brands/${BRAND}/storyboard.json 不存在(镜头由区块库 + storyboard 驱动)`); process.exit(2); }
const SB = JSON.parse(fs.readFileSync(sbPath, 'utf8'));
const FILES = SB.shots.map((sh, i) => `${pad2(i + 1)}-${sh.block}.html`);
const idsComp = SB.shots.map((_, i) => `shot${i + 1}`);
const brandCtx = { ACCENT, ACCENT2, BG: `rgb(${RGB.join(',')})`, BRAND_MARK: brand.mark || '◆', BRAND_NAME: brand.name };

// 出片日志
try { fs.mkdirSync(cfg.outputDir, { recursive: true }); } catch {}
const LOGFILE = path.join(cfg.outputDir, 'build.log');   // 随成片(gitignored),不写进引擎/包
function logLine(o) { try { fs.appendFileSync(LOGFILE, JSON.stringify({ t: new Date().toISOString(), brand: BRAND, ...o }) + '\n'); } catch {} }
function fail(e) {
  logLine({ status: 'fail', stage: 'run', lang: LANG, quality: QUALITY, error: String(e && e.message || e).slice(0, 200) });
  console.error('\n[出片失败] ' + String(e && e.message || e).split('\n')[0]);
  process.exit(1);
}
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);   // 顶层 await(TTS 等)异步抛错也走统一失败出口
function run(cmd, opts) {
  let last;
  for (let a = 1; a <= 2; a++) { try { return execSync(cmd, opts); } catch (e) { last = e; if (a < 2) console.log(`\n  [重试] ${String(e.message).split('\n')[0].slice(0, 80)}`); } }
  throw last;
}

// 依赖自检(按语言)
const TTS_PROVIDER = resolveTTSProvider({ lang: LANG });
const coreMiss = checkDeps().filter(c => !c.ok && c.fatalFor === 'all').map(c => `${c.name}: ${c.detail}`);
const ttsMiss = ttsBlockers(TTS_PROVIDER, cfg).map(d => `TTS(${TTS_PROVIDER}): ${d}`);
const miss = [...coreMiss, ...ttsMiss];
if (miss.length) { logLine({ status: 'fail', stage: 'deps', lang: LANG, tts: TTS_PROVIDER, missing: miss }); console.error('[依赖缺失]\n' + miss.map(m => '  - ' + m).join('\n') + '\n  排查: node doctor.mjs(云 TTS 需设对应 API key)'); process.exit(2); }

// 输入校验
const N = Array.isArray(SB.shots) ? SB.shots.length : 0;
const errs = [];
if (!Array.isArray(SB.shots) || N === 0) errs.push('storyboard.json 缺 shots 数组(或为空)');
if (LANG === 'zh' && (!Array.isArray(meta.vo_zh) || meta.vo_zh.length === 0))
  errs.push('中文旁白 vo.json.vo_zh 未生成(无 LLM key 的骨架模式只产英文)—— 用 LLM 补中文,或改 VO_LANG=en');
else if (!Array.isArray(VO) || VO.length !== N) errs.push(`旁白 ${LANG} 必须正好 ${N} 段(当前 ${Array.isArray(VO) ? VO.length : 0})`);
else VO.forEach((v, i) => { if (!v || !String(v).trim()) errs.push(`旁白第 ${i + 1} 段为空`); });
FILES.forEach((f, i) => {
  if (!fs.existsSync(path.join(HERE, 'blocks', `${SB.shots[i].block}.html`))) errs.push(`区块缺失: blocks/${SB.shots[i].block}.html`);
  if (!fs.existsSync(path.join(brandDir, 'assets', 'bg', `${pad2(i+1)}.jpg`))) errs.push(`背景图缺失: assets/bg/${pad2(i+1)}.jpg`);
});
if (errs.length) { logLine({ status: 'fail', stage: 'input', errors: errs }); console.error('[录入有误]\n' + errs.map(e => '  - ' + e).join('\n')); process.exit(3); }

// ---------- 1) 工作区 + 注入背景(asset 引用,非 base64;转场色=品牌色) ----------
fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(path.join(BUILD, 'compositions'), { recursive: true });
fs.mkdirSync(path.join(BUILD, 'assets/audio/vo'), { recursive: true });
fs.cpSync(path.join(ENGINE_TPL, 'fonts'), path.join(BUILD, 'fonts'), { recursive: true });
fs.cpSync(path.join(brandDir, 'assets', 'bg'), path.join(BUILD, 'assets', 'bg'), { recursive: true });
// gsap:默认走 CDN(版本锁在 URL);仅当用户在 vendor/ 放了 gsap.min.js 才本地化(离线渲染)。
// 本仓库/包不再分发 gsap.min.js → 规避其再分发许可疑问;渲染本就联网(npx hyperframes)。
const VENDORED_GSAP = fs.existsSync(path.join(HERE, 'vendor', 'gsap.min.js'));
if (VENDORED_GSAP) fs.copyFileSync(path.join(HERE, 'vendor', 'gsap.min.js'), path.join(BUILD, 'gsap.min.js'));
function bgartFor(i) {
  const file = `assets/bg/${String(i + 1).padStart(2, '0')}.jpg`;
  const [r, g, b] = RGB;
  const scrim = `radial-gradient(130% 62% at 50% 50%,rgba(${r},${g},${b},.6) 0%,rgba(${r},${g},${b},.26) 52%,rgba(${r},${g},${b},0) 100%)`;
  const edge = `linear-gradient(180deg,rgb(${r},${g},${b}) 0%,rgba(${r},${g},${b},0) 18%,rgba(${r},${g},${b},0) 80%,rgb(${r},${g},${b}) 100%)`;
  return `<div class="bgart" style="position:absolute;inset:0;overflow:hidden;pointer-events:none"><div style="position:absolute;inset:0;background:url(${file}) center/cover;opacity:${BG_OPACITY}"></div><div style="position:absolute;inset:0;background:${scrim}"></div><div style="position:absolute;inset:0;background:${edge}"></div></div>`;
}
FILES.forEach((f, i) => {
  const sh = SB.shots[i];
  const tmpl = fs.readFileSync(path.join(HERE, 'blocks', `${sh.block}.html`), 'utf8');
  let s = fillBlock(tmpl, { ...brandCtx, ...sh.content, ID: idsComp[i], SEQ: `${pad2(i + 1)} / ${pad2(N)}` });
  // 把背景照片嵌进 .bg 内:区块对 .bg 的 ken-burns 缩放会顺带带动照片 → 全程连续运动,
  // 杜绝"内容揭示完后照片静止"的近静止窗(短镜尤其明显),也更生动。
  if (s.includes('<div class="bg"></div>')) s = s.replace('<div class="bg"></div>', '<div class="bg">' + bgartFor(i) + '</div>');
  if (VENDORED_GSAP) s = s.split(GSAP_CDN).join('gsap.min.js');   // 有 vendored 才本地化,否则保留 CDN
  fs.writeFileSync(path.join(BUILD, 'compositions', f), s);
});
console.log(`[1/5] ${brand.name} 工作区就绪(storyboard 区块库 + 背景按 manifest 注入)`);

// ---------- 2) 配音(TTS 抽象层:本地 Kokoro/CosyVoice 或云 OpenAI/ElevenLabs/Azure)----
const ids = SB.shots.map((_, i) => pad2(i + 1));
const voDur = [];
const rawDir = path.join(os.tmpdir(), `wc-vo-${BRAND}`);   // os.tmpdir() 跨平台(Windows 无 /tmp)
fs.rmSync(rawDir, { recursive: true, force: true }); fs.mkdirSync(rawDir, { recursive: true });
console.log(`[2/5] 配音(provider=${TTS_PROVIDER}${isCloudTTS(TTS_PROVIDER) ? ',云' : ',本地'})…`);
const rawPaths = await synthesizeVO({ lines: VO, lang: LANG, provider: TTS_PROVIDER, rawDir, cfg, hf: HF, voice: process.env.VO_VOICE, model: process.env.WAYCAST_TTS_MODEL, log: s => process.stdout.write(s) });
process.stdout.write('\n');
// 统一后处理:WARM EQ + 44.1k 立体声(provider 无关),并取时长
ids.forEach((id, i) => {
  const out = path.join(BUILD, `assets/audio/vo/vo-${id}.wav`);
  execSync(`${FF} -y -i ${JSON.stringify(rawPaths[i])} -af "${WARM}" -ar 44100 -ac 2 ${JSON.stringify(out)}`, { stdio: 'ignore' });
  voDur.push(parseFloat(execSync(`${FFPROBE} -v error -show_entries format=duration -of default=nw=1:nk=1 ${JSON.stringify(out)}`).toString()));
  process.stdout.write(`\r[2/5] 后处理 ${i + 1}/${N} (${voDur[i].toFixed(1)}s)   `);
});
console.log('');

// ---------- 3) 按配音重定时 ----------
// 最小镜时长:区块内容揭示排程最长约 5.4s(grid 8 格)。短旁白也要给足时间,否则内容被切 + 留静窗。
const MIN_SHOT = 5.5;
const dur = voDur.map(d => Math.max(MIN_SHOT, Math.round((d + 0.6) * 10) / 10));
const starts = []; let acc = 0; dur.forEach(d => { starts.push(acc); acc += d; });
const total = Math.round(acc * 10) / 10;
const cuts = starts.slice(1);
ids.forEach((n, i) => {
  const f = path.join(BUILD, 'compositions', FILES[i]);
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/data-duration="[0-9.]+"/, `data-duration="${dur[i]}"`).replace(/\.set\(\{\},\{\},[0-9.]+\)/, `.set({},{},${dur[i]})`);
  fs.writeFileSync(f, s);
});
console.log('[3/5] 重定时:总时长 ' + total + 's');

// ---------- 4) 音乐(可选,循环铺底) + index/meta ----------
// 音乐源:MUSIC env(自带 CC0 轨)> template/assets/audio/epic-bgm.* / *.mp3。都没有 → 无 bgm(不阻塞出片)。
const musicSrc = (process.env.MUSIC && fs.existsSync(process.env.MUSIC)) ? process.env.MUSIC
  : ['epic-bgm.mp3', 'bgm.mp3', 'epic-trailer.mp3'].map(f => path.join(ENGINE_TPL, 'assets/audio', f)).find(f => fs.existsSync(f));
let hasMusic = false;
if (musicSrc) {
  try { execSync(`${FF} -y -stream_loop -1 -i ${JSON.stringify(musicSrc)} -t ${total} -af "afade=t=in:st=0:d=0.6,afade=t=out:st=${(total-1.8).toFixed(1)}:d=1.8" -c:a libmp3lame -q:a 2 ${JSON.stringify(path.join(BUILD,'assets/audio/epic-bgm.mp3'))}`, { stdio: 'ignore' }); hasMusic = true; }
  catch { console.log('  [警告] 背景音乐处理失败,改为无 bgm 出片'); }
} else { console.log('  [提示] 无背景音乐(设 MUSIC=<CC0轨> 或放 template/assets/audio/bgm.mp3 可加)'); }
const musicTag = hasMusic ? `    <audio id="music" class="clip" src="assets/audio/epic-bgm.mp3" data-start="0" data-duration="${total}" data-track-index="40" data-volume="0.28"></audio>\n` : '';
const scenes = idsComp.map((id, i) => `    <div id="s-${id}" data-composition-id="${id}" data-composition-src="compositions/${FILES[i]}" data-start="${starts[i]}" data-duration="${dur[i]}" data-track-index="0"></div>`).join('\n');
const voAudio = ids.map((n, i) => `    <audio id="vo-${n}" class="clip" src="assets/audio/vo/vo-${n}.wav" data-start="${(starts[i]+0.2).toFixed(2)}" data-duration="${voDur[i].toFixed(1)}" data-track-index="${31+i}" data-volume="1.0"></audio>`).join('\n');
const index = `<!doctype html><html lang="${LANG}"><head><meta charset="UTF-8"><script src="${VENDORED_GSAP ? 'gsap.min.js' : GSAP_CDN}"></script>
<style>html,body{margin:0;padding:0;width:1080px;height:1920px;background:#000;overflow:hidden}#master-root{width:1080px;height:1920px;position:relative}[data-composition-id="master"]>div[data-composition-id]{position:absolute;inset:0}#wipe{position:absolute;left:0;top:0;width:1080px;height:1920px;z-index:60;background:linear-gradient(180deg,${ACCENT},${ACCENT});transform:scaleY(0);transform-origin:50% 50%;pointer-events:none}#wipe::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 6px,rgba(0,0,0,.12) 6px 8px)}</style></head>
<body><div id="master-root" data-composition-id="master" data-width="1080" data-height="1920" data-start="0">
${scenes}
    <div id="wipe"></div>
${musicTag}${voAudio}
  </div>
  <script>window.__timelines=window.__timelines||{};(function(){var w=document.getElementById('wipe');var m=gsap.timeline({paused:true});[${cuts.join(',')}].forEach(function(t){m.fromTo(w,{scaleY:0},{scaleY:1,duration:0.16,ease:"power2.in",transformOrigin:"50% 50%"},t-0.16).to(w,{scaleY:0,duration:0.16,ease:"power2.out",transformOrigin:"50% 50%"},t)});m.set({},{},${total});window.__timelines["master"]=m})();</script>
</body></html>`;
fs.writeFileSync(path.join(BUILD, 'index.html'), index);
fs.writeFileSync(path.join(BUILD, 'meta.json'), JSON.stringify({ id: `${brand.slug}-brand-intro`, name: `${brand.name} Brand Intro`, width: 1080, height: 1920 }));
fs.writeFileSync(path.join(BUILD, 'hyperframes.json'), JSON.stringify({ "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json", "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry", "paths": { "blocks": "compositions", "components": "compositions/components", "assets": "assets" } }, null, 2));
console.log('[4/5] index/音乐/meta 生成');

// ---------- 5) 渲染 + freezedetect 内建自检 ----------
const D = new Date(), pad = n => String(n).padStart(2, '0');
const ts = `${D.getFullYear()}${pad(D.getMonth()+1)}${pad(D.getDate())}-${pad(D.getHours())}${pad(D.getMinutes())}`;
const outName = `${brand.prefix}-brand-intro-${LANG}-${QUALITY}-${ts}.mp4`;
const outDir = cfg.outputDir;
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, outName);
console.log('[5/5] 渲染中(' + QUALITY + ')…');
// 渲染:先并行(快);失败(常见于机器高负载时 parallel capture 导航超时)→ 自动降级 --workers 1 顺序渲染(更稳,稍慢)
const renderCmd = w => `cd ${JSON.stringify(BUILD)} && npx -y ${HF} render --quality ${QUALITY} --fps 30 --workers ${w} --output ${JSON.stringify(outPath)}`;
try { execSync(renderCmd(2), { stdio: 'inherit' }); }
catch { console.log('\n  [渲染重试] 并行渲染失败(可能机器繁忙)→ 改 --workers 1 顺序渲染…'); execSync(renderCmd(1), { stdio: 'inherit' }); }
// 内建静止段自检(standard 上才准;draft 会假阴性)
let freezes = '?';
try { freezes = (execSync(`${FF} -i ${JSON.stringify(outPath)} -vf "freezedetect=n=-55dB:d=1.0" -map 0:v -f null - 2>&1 | grep -c freeze_start || true`).toString().trim()); } catch {}
const warnFreeze = freezes !== '0' && freezes !== '?';
logLine({ status: 'ok', lang: LANG, quality: QUALITY, file: outName, durationSec: total, freezes });
console.log(`\n✅ 出片:${outPath}`);
console.log(`   静止段自检: ${freezes === '0' ? '✓ 无' : freezes + ' 处' + (QUALITY!=='standard' ? '(draft 会假阴性,正式片请在 standard 上看)' : ' —— 需排查!')}`);
if (warnFreeze && QUALITY === 'standard') console.log('   [警告] standard 仍有静止段,检查某镜尾部是否缺"呼吸/sweep"填充');

// make-brand.mjs —— CLI:URL → 完整品牌包 brands/<slug>/{brand.json, storyboard.json, vo.json}。
// 打通 URL → 成片:产出后(补背景图)即可 `BRAND=<slug> node build.mjs` 渲染。
// 人工确认关:写 REVIEW.md(name/accent/镜次/旁白预览/unknowns),提示渲染前核对。
// 用法: node content/make-brand.mjs <url> [--slug x] [--out dir] [--provider anthropic|openai] [--reuse-bg <brand>] [--shots N]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildBrief } from './brief.mjs';
import { writeScript } from './write-script.mjs';
import { buildBackgrounds, resolveImageProvider } from './images.mjs';
import { cfg } from '../config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRANDS = cfg.brandsDir;   // 用户品牌目录(WAYCAST_HOME 下 / 或引擎内 dev)
const DEFAULT_ACCENT = '#ff8a00';

function parseArgs(argv) { const a = { _: [] }; for (let i = 0; i < argv.length; i++) { const t = argv[i]; if (t.startsWith('--')) { const k = t.slice(2); a[k] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; } else a._.push(t); } return a; }
function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }  // 可能返回 ''(纯非 ASCII 名)
function hostOf(u) { try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).host.replace(/^www\./, ''); } catch { return ''; } }
// slug 候选链:显式 --slug > 品牌名 > 网站域名 > URL 域名;纯中文名等 slugify 为空时回退域名,不再全塌成 "brand"
function deriveSlug(opts, brief, url) {
  if (opts.slug) return slugify(opts.slug) || String(opts.slug).toLowerCase();
  for (const c of [brief.name, hostOf(brief.contact && brief.contact.website || ''), hostOf(url)]) { const s = slugify(c); if (s) return s; }
  return 'brand';
}

export async function makeBrand(url, opts = {}) {
  const { brief } = await buildBrief(url, opts);
  const script = await writeScript(brief, { ...opts, nShots: opts.shots ? +opts.shots : undefined });
  const slug = deriveSlug(opts, brief, url);
  const accent = (brief.accent && brief.accent_confidence === 'high') ? brief.accent : (brief.accent || DEFAULT_ACCENT);
  const brand = {
    name: brief.name || slug, slug, prefix: slug.toUpperCase().replace(/-/g, '_'),
    city: brief.city || null, accent, accent2: accent, mark: '◆',
    bgRGB: [5, 6, 8], bgOpacity: 0.42,
  };
  const outDir = opts.out || path.join(BRANDS, slug);
  // 防数据丢失:已存在品牌包则拒绝覆盖(除非 --force / opts.force),避免 slug 撞车冲掉手调品牌
  if (!opts.force && fs.existsSync(path.join(outDir, 'brand.json'))) {
    throw new Error(`brands/${slug}/ 已存在(含 brand.json)。换 --slug <别名>,或确认覆盖加 --force。`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'brand.json'), JSON.stringify(brand, null, 2));
  fs.writeFileSync(path.join(outDir, 'storyboard.json'), JSON.stringify(script.storyboard, null, 2));
  fs.writeFileSync(path.join(outDir, 'vo.json'), JSON.stringify(script.vo, null, 2));

  // 背景图:① --reuse-bg 显式复用(优先) ② 有图库 key 自动选图 ③ 否则提示手动
  const nBg = script.storyboard.shots.length;
  let bgNote = `补 ${nBg} 张背景图到 ${path.relative(process.cwd(), outDir)}/assets/bg/0N.jpg + bg-manifest.json(设 PEXELS_API_KEY/UNSPLASH_ACCESS_KEY 可自动选图;或 --reuse-bg <brand>)`;
  const imgProv = opts.imgFetcher ? { provider: 'inject' } : resolveImageProvider(opts);
  if (!opts['reuse-bg'] && (imgProv || opts.imgFetcher)) {
    try {
      const r = await buildBackgrounds(brief, { ffmpeg: cfg.ffmpeg, count: nBg, outDir, prov: imgProv, fetcher: opts.imgFetcher, readLocal: opts.readLocal, apiKey: opts.apiKey });
      bgNote = `自动选图 ${r.count} 张(${imgProv.provider};署名已写入 bg-manifest)`;
    } catch (e) { bgNote = `自动选图失败(${String(e.message).slice(0, 100)})→ 需 --reuse-bg <brand> 或手动放图`; }
  } else if (opts['reuse-bg']) {
    // 源品牌:先在用户品牌目录找,再回退随包样本(npx 用户可复用 wjdigital/northwind 的图)
    const srcBrand = [cfg.brandsDir, cfg.bundledBrandsDir].map(d => path.join(d, opts['reuse-bg'])).find(d => fs.existsSync(path.join(d, 'assets', 'bg'))) || path.join(BRANDS, opts['reuse-bg']);
    const src = path.join(srcBrand, 'assets', 'bg');
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.join(outDir, 'assets', 'bg'), { recursive: true });
      const imgs = fs.readdirSync(src).filter(f => /\.jpg$/i.test(f)).sort();
      script.storyboard.shots.forEach((_, i) => { const s = imgs[i % imgs.length]; if (s) fs.copyFileSync(path.join(src, s), path.join(outDir, 'assets', 'bg', `${String(i + 1).padStart(2, '0')}.jpg`)); });
      const mf = path.join(srcBrand, 'bg-manifest.json');
      if (fs.existsSync(mf)) { const m = JSON.parse(fs.readFileSync(mf, 'utf8')); m.images = (m.images || []).slice(0, script.storyboard.shots.length); while (m.images.length < script.storyboard.shots.length) m.images.push(m.images[m.images.length - 1] || { credit: 'reused' }); fs.writeFileSync(path.join(outDir, 'bg-manifest.json'), JSON.stringify(m, null, 2)); }
      bgNote = `已复用 ${opts['reuse-bg']} 的背景图(占位,正式请换本品牌图)`;
    }
  }

  // 人工确认关:REVIEW.md
  const review = [
    `# WayCast 品牌包待确认 — ${brand.name}`, '',
    `来源: ${url}`, `生成模式: brief=${brief.extraction.mode} / script=${script.meta.mode}${script.meta.provider ? ' (' + script.meta.provider + '/' + script.meta.model + ')' : ''}`, '',
    `## 关键字段(渲染前请核对)`,
    `- 品牌名: ${brand.name}`,
    `- 城市: ${brand.city || '(未知 — 建议补)'}`,
    `- 主色 accent: ${brand.accent} (置信度 ${brief.accent_confidence}${brief.accent_confidence !== 'high' ? ' — 建议人工确认/替换' : ''})`,
    `- 镜次: ${script.storyboard.shots.length}(${script.storyboard.shots.map(s => s.block).join(' → ')})`,
    `- 中文旁白: ${script.meta.has_zh ? '已生成' : '未生成(需 LLM 或人工;EN 可先渲)'}`,
    '', `## 旁白预览(EN)`, ...script.vo.vo.map((v, i) => `${i + 1}. ${v}`),
    '', `## 待确认/未知`, ...(brief.extraction.unknowns.length ? brief.extraction.unknowns.map(u => `- brief.${u}`) : ['- (brief 无)']),
    ...(script.meta.unknowns.length ? script.meta.unknowns.map(u => `- script: ${u}`) : []),
    ...script.meta.notes.map(n => `- 注: ${n}`),
    '', `## 背景图`, `- ${bgNote}`,
    '', `## 渲染`, `\`\`\``, `cd engine && BRAND=${slug} VO_LANG=en QUALITY=draft node build.mjs`, `\`\`\``,
    script.meta.has_zh ? `中文: \`BRAND=${slug} VO_LANG=zh ...\`` : `(ZH 旁白补齐后才能 VO_LANG=zh)`,
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'REVIEW.md'), review);
  return { slug, outDir, brand, script, brief };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = parseArgs(process.argv.slice(2));
  const url = a._[0];
  if (!url) { console.error('用法: node content/make-brand.mjs <url> [--slug x] [--out dir] [--provider ..] [--reuse-bg <brand>] [--shots N] [--force]'); process.exit(2); }
  try {
    const r = await makeBrand(url, { slug: typeof a.slug === 'string' ? a.slug : undefined, out: typeof a.out === 'string' ? a.out : undefined, provider: typeof a.provider === 'string' ? a.provider : undefined, 'reuse-bg': typeof a['reuse-bg'] === 'string' ? a['reuse-bg'] : undefined, shots: typeof a.shots === 'string' ? a.shots : undefined, force: !!a.force });
    console.error(`\n✅ 品牌包: ${path.relative(process.cwd(), r.outDir)}/  (brand.json + storyboard.json + vo.json + REVIEW.md)`);
    console.error(`   ${r.brand.name} · ${r.script.storyboard.shots.length} 镜 · script=${r.script.meta.mode} · accent=${r.brand.accent}(${r.brief.accent_confidence})`);
    console.error(`   下一步: 看 REVIEW.md 核对 → 补背景图(或 --reuse-bg)→ BRAND=${r.slug} node build.mjs`);
  } catch (e) { console.error('[make-brand 失败]', e.message); process.exit(1); }
}

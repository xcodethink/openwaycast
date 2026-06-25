// images.mjs —— 自动选图配图(2.3)。BYO-key 图库(Pexels / Unsplash)→ 挑竖图 → 裁切 9:16 +
// 锐化 + 增对比 → brands/<slug>/assets/bg/0N.jpg + bg-manifest.json(含署名)。
// 无 key → 抛错(调用方 make-brand 回退 --reuse-bg / 手动)。压暗 scrim 由 build.mjs 渲染期叠加。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const UA = 'WayCast/0.1 (+https://github.com/wayjetai/waycastai)';

// ---- provider 解析 ----
export function resolveImageProvider(opts = {}, env = process.env) {
  const provider = opts.provider || env.WAYCAST_IMAGE_PROVIDER || (env.PEXELS_API_KEY ? 'pexels' : (env.UNSPLASH_ACCESS_KEY || env.UNSPLASH_API_KEY) ? 'unsplash' : null);
  if (provider === 'pexels') { const apiKey = opts.apiKey || env.PEXELS_API_KEY; return apiKey ? { provider, apiKey } : null; }
  if (provider === 'unsplash') { const apiKey = opts.apiKey || env.UNSPLASH_ACCESS_KEY || env.UNSPLASH_API_KEY; return apiKey ? { provider, apiKey } : null; }
  return null;
}

// ---- 检索词:城市优先(每镜不同视角),否则通用商务 ----
export function deriveQueries(brief) {
  const city = (brief?.city || '').trim();
  if (city) return [`${city} skyline night`, `${city} skyscraper`, `${city} business district`, `${city} city architecture`, `${city} downtown dusk`, `${city} cityscape`];
  return ['modern skyscraper night', 'business district skyline', 'glass office tower', 'city skyline dusk', 'corporate architecture', 'downtown night lights'];
}

async function getJson(url, headers, timeoutMs = 15000) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try { const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, ...headers } }); if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 160)}`); return await r.json(); }
  finally { clearTimeout(to); }
}

// 每个 provider 返回标准候选:{ download_url, credit, source_url, ping? }
async function searchPexels(query, n, apiKey) {
  const j = await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&size=large&per_page=${n}`, { Authorization: apiKey });
  return (j.photos || []).map(p => ({ download_url: p.src?.large2x || p.src?.original || p.src?.portrait, credit: `${(p.alt || 'Photo').slice(0, 60)} — ${p.photographer} — Pexels`, source_url: p.url }));
}
async function searchUnsplash(query, n, apiKey) {
  const j = await getJson(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${n}`, { Authorization: `Client-ID ${apiKey}` });
  return (j.results || []).map(p => ({ download_url: p.urls?.full || p.urls?.regular, credit: `Photo — ${p.user?.name || 'Unknown'} — Unsplash`, source_url: p.links?.html, ping: p.links?.download_location }));
}

async function fetchCandidates(prov, queries, need) {
  const out = [], seen = new Set();
  for (const q of queries) {
    if (out.length >= need) break;
    let batch = [];
    try { batch = prov.provider === 'unsplash' ? await searchUnsplash(q, Math.max(need, 6), prov.apiKey) : await searchPexels(q, Math.max(need, 6), prov.apiKey); }
    catch (e) { continue; }   // 单个查询失败不致命
    for (const c of batch) { if (c.download_url && !seen.has(c.download_url)) { seen.add(c.download_url); out.push(c); } }
  }
  return out;
}

async function download(url, timeoutMs = 30000) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try { const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA } }); if (!r.ok) return null; const b = Buffer.from(await r.arrayBuffer()); return b.length > 2048 ? b : null; }
  catch { return null; } finally { clearTimeout(to); }
}

// 按 magic 字节确认是真图片(挡住 HTML 错误页 / 限流 JSON 被喂给 ffmpeg 报天书)
function isImage(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;                                   // jpeg
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;                // png
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return true;
  if (buf.slice(0, 4).toString('latin1') === 'GIF8') return true;
  if (buf.slice(4, 12).toString('latin1').includes('ftyp')) return true;                                    // avif/heic
  return false;
}

// 裁切到 1080x1920(cover)+ 轻锐化 + 增对比/饱和(用户要求"更清晰、对比更强")
export function processToBg(srcFile, outFile, ffmpeg) {
  try {
    execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', srcFile,
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,unsharp=5:5:0.8:3:3:0.4,eq=contrast=1.08:saturation=1.05',
      '-frames:v', '1', '-q:v', '3', outFile], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) { throw new Error('ffmpeg 处理失败: ' + String((e.stderr && e.stderr.toString()) || e.message).slice(0, 200)); }
}

// 主入口。opts.fetcher = async(queries,need)=>[{download_url,credit,...}] 假抓取器(测试用,免 key/网络)。
export async function buildBackgrounds(brief, opts = {}) {
  const { ffmpeg, count, outDir } = opts;
  if (!ffmpeg) throw new Error('缺 ffmpeg');
  if (!count || count < 1) throw new Error('count 无效');
  const queries = opts.queries || deriveQueries(brief);
  let cands;
  if (opts.fetcher) cands = await opts.fetcher(queries, count);
  else {
    const prov = opts.prov || resolveImageProvider(opts);
    if (!prov) throw new Error('无图库 key(设 PEXELS_API_KEY / UNSPLASH_ACCESS_KEY,或用 --reuse-bg / 手动放图)');
    cands = await fetchCandidates(prov, queries, count);
  }
  if (!cands || cands.length < count) throw new Error(`候选图不足(需 ${count},得 ${cands ? cands.length : 0})`);

  const bgDir = path.join(outDir, 'assets', 'bg');
  fs.mkdirSync(bgDir, { recursive: true });
  const images = [], used = [];
  let ci = 0;   // 候选指针:下载失败/非图片的候选跳过,继续下一个,不浪费整次
  try {
    for (let i = 0; i < count; i++) {
      let buf = null, c = null;
      while (ci < cands.length && !buf) {
        c = cands[ci++];
        if (!c.download_url || /^data:/i.test(c.download_url)) continue;
        const b = opts.readLocal ? opts.readLocal(c.download_url) : await download(c.download_url);
        if (b && isImage(b)) buf = b;   // 验真是图片,挡 HTML/JSON 错误页
      }
      if (!buf) throw new Error(`可用图不足(取到第 ${i} 张后候选耗尽,共 ${cands.length} 候选)`);
      const tmp = path.join(os.tmpdir(), `wc-img-${i}-${buf.length % 100000}`);
      fs.writeFileSync(tmp, buf);
      const out = path.join(bgDir, `${String(i + 1).padStart(2, '0')}.jpg`);
      try { processToBg(tmp, out, ffmpeg); } finally { try { fs.unlinkSync(tmp); } catch {} }
      if (c.ping) { try { await getJson(c.ping, opts.prov?.apiKey ? { Authorization: `Client-ID ${opts.prov.apiKey}` } : {}); } catch {} }  // Unsplash 下载追踪(尽力)
      images.push({ shot: i + 1, file: `${String(i + 1).padStart(2, '0')}.jpg`, credit: c.credit || 'stock', source_url: c.source_url || null });
      used.push(c.credit);
    }
    const provLabel = opts.fetcher ? 'inject' : (opts.prov?.provider || '?');
    const manifest = { note: `WayCast 自动选图(${provLabel});渲染期由 build.mjs 叠加压暗 scrim`, images };
    fs.writeFileSync(path.join(outDir, 'bg-manifest.json'), JSON.stringify(manifest, null, 2));
    return { count, credits: used, manifest };
  } catch (e) {
    // 失败不留半成品(否则后续 build.mjs 读到残缺 bg / 缺 manifest 报天书)
    fs.rmSync(bgDir, { recursive: true, force: true });
    try { fs.rmSync(path.join(outDir, 'bg-manifest.json'), { force: true }); } catch {}
    throw e;
  }
}

// CLI: node content/images.mjs <url> <outDir> [count]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [url, outDir, countArg] = process.argv.slice(2);
  if (!url || !outDir) { console.error('用法: node content/images.mjs <url> <outDir> [count]'); process.exit(2); }
  const { buildBrief } = await import('./brief.mjs');
  const { cfg } = await import('../config.mjs');
  const { brief } = await buildBrief(url);
  try { const r = await buildBackgrounds(brief, { ffmpeg: cfg.ffmpeg, count: +(countArg || 6), outDir }); console.error(`✅ ${r.count} 张 → ${outDir}/assets/bg/`); }
  catch (e) { console.error('[images 失败]', e.message); process.exit(1); }
}

// console/server.mjs —— WayCast 本地控制台(纯 Node 零依赖 http + SSE)。
// 填 URL → 生成品牌包 → 改文案/选声线 → 渲染 → 下载。复用已测的 make-brand / build CLI(子进程 + SSE)。
// 仅绑 127.0.0.1(本地工具,不对外)。用: node console/server.mjs  → 浏览器开 http://127.0.0.1:4178
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { cfg, checkDeps } from '../config.mjs';
import { TTS_PROVIDERS, ttsBlockers, isCloudTTS } from '../tts/synth.mjs';
import { resolveProvider as resolveLLM } from '../content/llm.mjs';
import { resolveImageProvider } from '../content/images.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, '..');
const BRANDS = cfg.brandsDir;
const PORT = cfg.port || 4178;
const send = (res, code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
const json = (res, code, obj) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj));
// 防路径穿越:slug/文件名只允许安全字符
const safeName = s => /^[a-zA-Z0-9._-]+$/.test(String(s || '')) ? s : null;

function listBrands() {
  if (!fs.existsSync(BRANDS)) return [];
  return fs.readdirSync(BRANDS).filter(d => fs.existsSync(path.join(BRANDS, d, 'brand.json'))).map(slug => {
    let n = slug, shots = 0; try { n = JSON.parse(fs.readFileSync(path.join(BRANDS, slug, 'brand.json'), 'utf8')).name || slug; } catch {}
    try { shots = (JSON.parse(fs.readFileSync(path.join(BRANDS, slug, 'storyboard.json'), 'utf8')).shots || []).length; } catch {}
    const hasBg = fs.existsSync(path.join(BRANDS, slug, 'assets', 'bg', '01.jpg'));
    return { slug, name: n, shots, hasBg };
  });
}
function capabilities() {
  const core = checkDeps().filter(c => c.fatalFor === 'all');
  const tts = TTS_PROVIDERS.map(p => ({ provider: p, cloud: isCloudTTS(p), ok: ttsBlockers(p, cfg).length === 0 }));
  const llm = resolveLLM({}); const img = resolveImageProvider({});
  return { coreOk: core.every(c => c.ok), core, tts, llm: llm ? `${llm.provider}/${llm.model}` : null, images: img ? img.provider : null, outputDir: cfg.outputDir };
}

// 子进程 → SSE。args 已是安全数组(不过 shell)
function sse(res, cmd, args, env) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  ev('start', { cmd: [cmd, ...args].join(' ').replace(/\s--force\b/, '') });
  const child = spawn(cmd, args, { cwd: ENG, env: { ...process.env, ...env } });
  const pipe = buf => String(buf).split(/\r?\n/).filter(Boolean).forEach(l => ev('log', l));
  child.stdout.on('data', pipe); child.stderr.on('data', pipe);
  child.on('error', e => { ev('error', String(e.message)); res.end(); });
  child.on('close', code => { ev(code === 0 ? 'done' : 'error', { code }); res.end(); });
  res.on('close', () => { try { child.kill(); } catch {} });   // 浏览器断开则杀子进程
}

async function readBody(req) { const c = []; for await (const ch of req) c.push(ch); return Buffer.concat(c).toString('utf8'); }

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const p = u.pathname;
    // 静态
    if (p === '/' || p === '/index.html') return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(HERE, 'index.html')));
    if (p === '/api/capabilities') return json(res, 200, capabilities());
    if (p === '/api/brands') return json(res, 200, listBrands());
    // 读品牌包(编辑器)
    if (p.startsWith('/api/brand/')) {
      const slug = safeName(p.slice('/api/brand/'.length)); if (!slug) return json(res, 400, { error: 'bad slug' });
      const bd = path.join(BRANDS, slug);
      if (req.method === 'GET') {
        if (!fs.existsSync(path.join(bd, 'brand.json'))) return json(res, 404, { error: 'not found' });
        const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(bd, f), 'utf8')); } catch { return null; } };
        const review = fs.existsSync(path.join(bd, 'REVIEW.md')) ? fs.readFileSync(path.join(bd, 'REVIEW.md'), 'utf8') : '';
        return json(res, 200, { brand: rd('brand.json'), storyboard: rd('storyboard.json'), vo: rd('vo.json'), review });
      }
      if (req.method === 'POST') {   // 5.2 保存编辑:校验 JSON 再写
        const body = JSON.parse(await readBody(req));
        for (const [f, v] of [['brand.json', body.brand], ['storyboard.json', body.storyboard], ['vo.json', body.vo]]) {
          if (v == null) continue;
          if (typeof v !== 'object') return json(res, 400, { error: `${f} 必须是对象` });
          fs.writeFileSync(path.join(bd, f), JSON.stringify(v, null, 2));
        }
        return json(res, 200, { ok: true });
      }
    }
    // 生成(make-brand,SSE)
    if (p === '/api/generate' && req.method === 'POST') {
      const b = JSON.parse(await readBody(req));
      if (!b.url || !/^https?:\/\//i.test(b.url)) return json(res, 400, { error: 'url 需 http(s)://' });
      const args = ['content/make-brand.mjs', b.url];
      if (b.slug && safeName(b.slug)) args.push('--slug', b.slug);
      if (b.reuseBg && safeName(b.reuseBg)) args.push('--reuse-bg', b.reuseBg);
      if (b.force) args.push('--force');
      return sse(res, process.execPath, args, b.provider ? { WAYCAST_LLM_PROVIDER: b.provider } : {});
    }
    // 渲染(build,SSE)
    if (p === '/api/render' && req.method === 'POST') {
      const b = JSON.parse(await readBody(req));
      const slug = safeName(b.slug); if (!slug) return json(res, 400, { error: 'bad slug' });
      const env = { BRAND: slug, VO_LANG: b.lang === 'zh' ? 'zh' : 'en', QUALITY: b.quality === 'standard' ? 'standard' : 'draft' };
      if (b.ttsProvider && TTS_PROVIDERS.includes(b.ttsProvider)) env.WAYCAST_TTS_PROVIDER = b.ttsProvider;
      if (b.voice) env.VO_VOICE = String(b.voice).slice(0, 40);
      return sse(res, process.execPath, ['build.mjs'], env);
    }
    // 成片列表 + 下载
    if (p === '/api/outputs') {
      const dir = cfg.outputDir; const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.mp4')).sort().reverse() : [];
      return json(res, 200, files.map(f => ({ file: f, size: fs.statSync(path.join(dir, f)).size })));
    }
    if (p.startsWith('/api/download/')) {
      const f = safeName(p.slice('/api/download/'.length)); if (!f || !f.endsWith('.mp4')) return json(res, 400, { error: 'bad file' });
      const fp = path.join(cfg.outputDir, f); if (!fs.existsSync(fp)) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-disposition': `attachment; filename="${f}"` });
      return fs.createReadStream(fp).pipe(res);
    }
    json(res, 404, { error: 'not found' });
  } catch (e) { json(res, 500, { error: String(e.message) }); }
});

server.listen(PORT, '127.0.0.1', () => console.log(`WayCast 控制台 → http://127.0.0.1:${PORT}  (Ctrl-C 退出)`));

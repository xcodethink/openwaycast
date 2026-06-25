// mcp/server.mjs —— WayCast 的 MCP server(stdio,零依赖手写 JSON-RPC 2.0,tools-only)。
// 让 Claude Code 等把 WayCast 当工具调:scrape / catalog / write_brand / make_brand / render / doctor / list。
// 注册(Claude Code):claude mcp add waycast -- npx waycastai mcp    或见 docs/mcp.md。
// 协议:initialize → tools/list → tools/call,消息按行分隔的 JSON-RPC(不含内嵌换行)。
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { cfg, checkDeps } from '../config.mjs';
import { scrapeSite } from '../content/scrape.mjs';
import { blockCatalog } from '../content/write-script.mjs';
import { makeBrand } from '../content/make-brand.mjs';
import { fillBlock } from '../lib/fill-block.mjs';
import { TTS_PROVIDERS, ttsBlockers, isCloudTTS } from '../tts/synth.mjs';
import { resolveProvider as resolveLLM } from '../content/llm.mjs';
import { resolveImageProvider } from '../content/images.mjs';

const ENG = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROTOCOL = '2024-11-05';
const pkg = (() => { try { return JSON.parse(fs.readFileSync(path.join(ENG, '..', 'package.json'), 'utf8')); } catch { return { version: '0.1.0' }; } })();

// ---- 工具实现(返回字符串或对象,统一包成 text content)----
function capabilities() {
  const core = checkDeps().filter(c => c.fatalFor === 'all');
  const tts = TTS_PROVIDERS.map(p => ({ provider: p, cloud: isCloudTTS(p), ok: ttsBlockers(p, cfg).length === 0 }));
  const llm = resolveLLM({}), img = resolveImageProvider({});
  return { coreOk: core.every(c => c.ok), core, tts, llm: llm ? `${llm.provider}/${llm.model}` : null, images: img ? img.provider : null, brandsDir: cfg.brandsDir, outputDir: cfg.outputDir };
}
function listBrands() {
  const d = cfg.brandsDir; if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(s => fs.existsSync(path.join(d, s, 'brand.json'))).map(slug => {
    let name = slug, shots = 0;
    try { name = JSON.parse(fs.readFileSync(path.join(d, slug, 'brand.json'), 'utf8')).name || slug; } catch {}
    try { shots = (JSON.parse(fs.readFileSync(path.join(d, slug, 'storyboard.json'), 'utf8')).shots || []).length; } catch {}
    return { slug, name, shots, hasBg: fs.existsSync(path.join(d, slug, 'assets', 'bg', '01.jpg')) };
  });
}
// agent 自己当 LLM:直接写一个完整品牌包(校验每镜 fillBlock 无残留 + vo 段数==镜数)
function writeBrand({ slug, brand, storyboard, vo }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug || '')) throw new Error('slug 需小写字母数字-');
  const cat = blockCatalog();
  const shots = storyboard?.shots; if (!Array.isArray(shots) || !shots.length) throw new Error('storyboard.shots 需非空数组');
  const inj = { ACCENT: '#fff', ACCENT2: '#fff', BG: '#000', BRAND_MARK: '•', BRAND_NAME: 'X', ID: 'v', SEQ: '01 / 0' + shots.length };
  shots.forEach((s, i) => {
    if (!cat[s.block]) throw new Error(`镜${i + 1}: 未知区块 ${s.block}(可选 ${Object.keys(cat).join(',')})`);
    const tmpl = fs.readFileSync(path.join(ENG, 'blocks', s.block + '.html'), 'utf8');
    try { fillBlock(tmpl, { ...inj, ...s.content }); } catch (e) { throw new Error(`镜${i + 1}(${s.block}): ${e.message}`); }
  });
  if (!Array.isArray(vo?.vo) || vo.vo.length !== shots.length) throw new Error(`vo.vo 段数需 == 镜数(${shots.length})`);
  const dir = path.join(cfg.brandsDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify({ slug, accent2: brand.accent, mark: '◆', bgRGB: [5, 6, 8], bgOpacity: 0.42, ...brand, name: brand.name || slug }, null, 2));
  fs.writeFileSync(path.join(dir, 'storyboard.json'), JSON.stringify(storyboard, null, 2));
  fs.writeFileSync(path.join(dir, 'vo.json'), JSON.stringify({ vo: vo.vo, vo_zh: Array.isArray(vo.vo_zh) ? vo.vo_zh : [] }, null, 2));
  return { slug, dir, shots: shots.length, has_zh: Array.isArray(vo.vo_zh) && vo.vo_zh.length === shots.length, note: '已写品牌包;背景图仍需补(assets/bg/0N.jpg + bg-manifest)或 make_brand --reuse-bg。然后 render。' };
}
function render({ slug, lang = 'en', quality = 'draft' }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug || '')) return Promise.reject(new Error('slug 不合法'));
  return new Promise((resolve, reject) => {
    const env = { ...process.env, BRAND: slug, VO_LANG: lang === 'zh' ? 'zh' : 'en', QUALITY: quality === 'standard' ? 'standard' : 'draft' };
    let out = '';
    const ch = spawn(process.execPath, [path.join(ENG, 'build.mjs')], { env });
    ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => out += d);
    ch.on('close', code => {
      const m = out.match(/出片:\s*(\S+\.mp4)/), frz = /静止段自检:\s*✓ 无/.test(out);
      if (code === 0 && m) resolve({ ok: true, file: m[1], freezeClean: frz, quality });
      else reject(new Error('渲染失败: ' + (out.split('\n').filter(Boolean).slice(-3).join(' | ') || ('exit ' + code))));
    });
    ch.on('error', reject);
  });
}

const TOOLS = [
  { name: 'waycast_doctor', description: '环境/能力自检:core(node/ffmpeg)、各 TTS provider、LLM、选图 是否就绪,以及 brands/输出目录。', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true }, run: async () => capabilities() },
  { name: 'waycast_catalog', description: '区块内容契约:每个版式区块(cover/grid/...)需要哪些标量 token + 哪些数组字段。写 storyboard 前查。', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true }, run: async () => blockCatalog() },
  { name: 'waycast_scrape', description: '抓取一个公司官网 URL,返回客观信号(标题/描述/og/导航/标题层级/邮箱/正文摘要)。撰写文案的事实来源(防杜撰)。', inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'http(s):// 公司官网' } }, required: ['url'] }, annotations: { readOnlyHint: true, openWorldHint: true }, run: async a => scrapeSite(a.url) },
  { name: 'waycast_list_brands', description: '列出当前工作目录下已有的品牌包(slug/名称/镜数/是否有背景图)。', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true }, run: async () => listBrands() },
  { name: 'waycast_write_brand', description: '【你当 LLM 的首选】直接写入一个完整品牌包(brand/storyboard/vo)。先 scrape 看事实 + catalog 查字段,亲手撰写(防杜撰)。每镜会做 fillBlock 校验。写完仍需补背景图再 render。', inputSchema: { type: 'object', properties: { slug: { type: 'string' }, brand: { type: 'object', description: 'name/accent/city 等品牌级字段' }, storyboard: { type: 'object', description: '{ shots:[{block,content}] }' }, vo: { type: 'object', description: '{ vo:[N 英文], vo_zh:[N 中文,可选] }' } }, required: ['slug', 'brand', 'storyboard', 'vo'] }, annotations: { readOnlyHint: false }, run: async a => writeBrand(a) },
  { name: 'waycast_make_brand', description: '一条龙:URL → 品牌包(scrape→简报→脚本→可选自动选图)。无 LLM key 时是骨架草稿;有 key 走 LLM。reuseBg 借现有品牌背景图。', inputSchema: { type: 'object', properties: { url: { type: 'string' }, slug: { type: 'string' }, reuseBg: { type: 'string', description: '借背景图的已有品牌 slug,如 wjdigital' }, force: { type: 'boolean' } }, required: ['url'] }, annotations: { readOnlyHint: false, openWorldHint: true }, run: async a => { const r = await makeBrand(a.url, { slug: a.slug, 'reuse-bg': a.reuseBg, force: a.force }); return { slug: r.slug, dir: r.outDir, mode: r.script.meta.mode, shots: r.script.storyboard.shots.length, accent: r.brand.accent }; } },
  { name: 'waycast_render', description: '渲染一个品牌包为竖屏 mp4。quality=standard 出成片(含静止段自检);draft 快。中文需品牌包有 vo_zh + 本地 CosyVoice/云 TTS。', inputSchema: { type: 'object', properties: { slug: { type: 'string' }, lang: { type: 'string', enum: ['en', 'zh'] }, quality: { type: 'string', enum: ['draft', 'standard'] } }, required: ['slug'] }, annotations: { readOnlyHint: false }, run: async a => render(a) },
];

// ---- 极简 stdio JSON-RPC ----
const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const result = (id, r) => send({ jsonrpc: '2.0', id, result: r });
const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return result(id, { protocolVersion: params?.protocolVersion || PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'waycast', version: pkg.version } });
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;   // 通知无回复
  if (method === 'ping') return result(id, {});
  if (method === 'tools/list') return result(id, { tools: TOOLS.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })) });
  if (method === 'tools/call') {
    const tool = TOOLS.find(t => t.name === params?.name);
    if (!tool) return result(id, { content: [{ type: 'text', text: `未知工具 ${params?.name}。可选: ${TOOLS.map(t => t.name).join(', ')}` }], isError: true });
    try {
      const out = await tool.run(params.arguments || {});
      const text = typeof out === 'string' ? out : JSON.stringify(out, null, 2);
      return result(id, { content: [{ type: 'text', text }], structuredContent: typeof out === 'object' ? out : undefined });
    } catch (e) { return result(id, { content: [{ type: 'text', text: '错误: ' + String(e.message) }], isError: true }); }
  }
  if (id != null) error(id, -32601, `未知方法 ${method}`);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', line => { line = line.trim(); if (!line) return; let msg; try { msg = JSON.parse(line); } catch { return; } Promise.resolve(handle(msg)).catch(e => { if (msg?.id != null) error(msg.id, -32603, String(e.message)); }); });
process.stderr.write(`[waycast-mcp] ready (${TOOLS.length} tools) — brandsDir=${cfg.brandsDir}\n`);

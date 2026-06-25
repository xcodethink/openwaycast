// write-script.mjs —— brief → { storyboard:{shots[]}, vo:{vo[],vo_zh[]} }。
// 双模式:① 有 LLM key → 结构化生成(选区块+填内容+写中英旁白,防杜撰只用 brief 事实);
//        ② 无 key → 确定性骨架(brief→固定 6 镜 EN 草稿;ZH 需 LLM,留空标记)。
// 产出做 fillBlock 干跑校验(零残留 token)+ 镜数/旁白数一致,确保能直接喂引擎渲染。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fillBlock } from '../lib/fill-block.mjs';
import { resolveProvider, llmJson } from './llm.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BLOCKS_DIR = path.join(HERE, '..', 'blocks');
// build/brand 注入,非内容(不该由文案 LLM 提供)
const INJECTED = new Set(['ACCENT', 'ACCENT2', 'BG', 'BRAND_MARK', 'BRAND_NAME', 'ID', 'SEQ']);

// 扫 blocks/ 自动提取每个区块的内容结构:scalars(大写标量 token)+ items(ITEMS 区域及其字段)
export function blockCatalog(dir = BLOCKS_DIR) {
  const cat = {};
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.html'))) {
    const name = f.replace(/\.html$/, ''); const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const items = {};
    let body = html.replace(/<!--ITEMS:([A-Z0-9_]+)-->([\s\S]*?)<!--\/ITEMS-->/g, (m, key, inner) => {
      items[key] = [...new Set((inner.match(/\{\{([a-z][a-zA-Z0-9_]*)\}\}/g) || []).map(t => t.slice(2, -2)))];
      return ''; // 从 body 移除,避免把条目字段当标量
    });
    const scalars = [...new Set((body.match(/\{\{([A-Z0-9_]+)\}\}/g) || []).map(t => t.slice(2, -2)))].filter(t => !INJECTED.has(t));
    cat[name] = { scalars, items };
  }
  return cat;
}

// 干跑校验:区块存在 + 标量键齐全(fillBlock 抓缺键/残留)+ 条目必须是对象数组 + 不允许整镜全空。
// 注意:条目内的"可选小写字段"(如 grid td、list lv)允许为空 —— fillBlock 会清空,属设计。
function validateShot(shot, catalog) {
  const spec = catalog[shot.block];
  if (!spec) throw new Error(`未知区块 "${shot.block}"(可选: ${Object.keys(catalog).join(', ')})`);
  const c = shot.content || {};
  // 条目区域:必须是非空数组,且每条是普通对象(挡住 LLM 回传字符串/数组 → 渲染空条目)
  for (const [key, fields] of Object.entries(spec.items)) {
    const arr = c[key];
    if (!Array.isArray(arr) || arr.length === 0) throw new Error(`ITEMS ${key} 需非空数组`);
    arr.forEach((it, i) => {
      if (typeof it !== 'object' || it === null || Array.isArray(it)) throw new Error(`${key}[${i}] 必须是对象({${fields.join(',')}})`);
    });
  }
  // 防整镜全空:标量与条目字段里至少要有一处非空文本
  const scalarHasText = spec.scalars.some(t => String(c[t] ?? '').trim());
  const itemHasText = Object.entries(spec.items).some(([k, fields]) => (c[k] || []).some(it => fields.some(f => String(it?.[f] ?? '').trim())));
  if (!scalarHasText && !itemHasText) throw new Error('整镜内容为空');
  // fillBlock 干跑:缺标量键 / 残留 token 会抛
  const tmpl = fs.readFileSync(path.join(BLOCKS_DIR, shot.block + '.html'), 'utf8');
  fillBlock(tmpl, { ACCENT: '#fff', ACCENT2: '#fff', BG: '#000', BRAND_MARK: '•', BRAND_NAME: 'X', ID: 'v', SEQ: '01 / 06', ...c });
}

// ---- LLM 模式 ----
function catalogPrompt(catalog) {
  return Object.entries(catalog).map(([name, s]) => {
    const items = Object.entries(s.items).map(([k, fs]) => `${k}:[{${fs.join(',')}}]`).join(' ');
    return `- ${name}: scalars{${s.scalars.join(',')}}${items ? ' arrays ' + items : ''}`;
  }).join('\n');
}
const SYS = `You are a brand-video scriptwriter. Given a brand brief, produce a vertical (9:16) brand intro video script: an ordered set of shots (each picks one layout block and fills its content) plus an English and Chinese voiceover line per shot.
RULES (strict):
- Use ONLY facts from the brief. Never invent services, numbers, city, claims, or contact info. If the brief lacks something, omit it or keep copy generic — do not fabricate.
- On-screen text: short, punchy, display-style. Voiceover: natural spoken sentences (English am_michael style; Chinese 简体, 口语, 不要直译腔).
- Fill EVERY scalar token and EVERY array item field for the chosen block (use the exact token names). HTML allowed in text values: <br>, <em>, <i>.
- Output ONLY one JSON object, no prose.`;
function scriptUserPrompt(brief, catalog, nShots) {
  return `BRIEF (JSON):\n${JSON.stringify({ name: brief.name, tagline: brief.tagline, city: brief.city, one_liner: brief.one_liner, services: brief.services, selling_points: brief.selling_points, contact: brief.contact })}

AVAILABLE BLOCKS (pick per shot; fill exactly these tokens/fields):
${catalogPrompt(catalog)}

Produce a ${nShots}-shot arc (typical: cover → who-we-are → services/grid → why-us → how-it-works → beliefs → cta; adapt to the brief). Return JSON:
{
  "shots": [ { "block": "<block name>", "content": { <token>:<text>, "<ARRAY_KEY>":[ {<field>:<text>}, ... ] } }, ... ],
  "vo":    [ "English voiceover for shot 1", ... ],   // length == shots
  "vo_zh": [ "镜 1 中文旁白", ... ],                   // length == shots, 简体口语
  "_unknowns": [ "anything you had to leave generic for lack of brief data" ]
}`;
}

// ---- 确定性骨架(无 key)----
const up = s => String(s || '').toUpperCase();
const pad2 = n => String(n).padStart(2, '0');
function sentence(s) { s = String(s || '').trim(); if (!s) return ''; return /[.!?。!?]$/.test(s) ? s : s + '.'; }

function skeleton(brief) {
  const b = brief, name = b.name || (b.contact?.website) || 'Our brand';
  const svcs = (b.services || []).filter(Boolean);
  const sp = (b.selling_points || []).filter(Boolean);
  const city = b.city, web = b.contact?.website || '', email = b.contact?.email;
  const tagline = b.tagline || b.one_liner || name;
  const oneLiner = b.one_liner || b.tagline || `${name} — ${svcs.slice(0, 3).join(', ')}`;
  const shots = [], vo = [];

  // 1 cover
  shots.push({ block: 'cover', content: {
    META_L: up(name), META_R: up(city || web), WORD: up(name), SUB: [up(svcs[0] || 'BRAND'), up(city || '')].filter(Boolean).join(' · '),
    KICKER: 'WHO WE ARE', HERO: tagline.length <= 42 ? tagline : up(name), TAG: sentence(oneLiner) } });
  vo.push(`This is ${name}. ${sentence(tagline)}`);

  // 2 editorial-facts
  shots.push({ block: 'editorial-facts', content: {
    META_L: 'WHO WE ARE', META_R: up(city || web), KICKER: 'THE COMPANY',
    HEAD: tagline.length <= 60 ? `<em>${tagline}</em>` : `What <em>${name}</em> does.`, BODY: sentence(oneLiner),
    FACTS: (() => {                         // fn 是醒目数字位,只放可靠计数,不塞截断城市
      const f = [];
      if (svcs.length) f.push({ fn: pad2(svcs.length), fl: 'Services<br><i>End-to-end</i>' });
      if (sp.length) f.push({ fn: pad2(sp.length), fl: 'Reasons to choose us<br><i>What sets us apart</i>' });
      if (!f.length) f.push({ fn: '01', fl: 'Partner<br><i>End-to-end</i>' });
      return f;
    })() } });
  vo.push(sentence(oneLiner));   // 直接用简介句(避免首字母小写破坏 "WJ" 这类缩写)

  // 3 grid(services)—— 至少 2 项才用 grid,否则用 statement-list 兜底
  if (svcs.length >= 2) {
    shots.push({ block: 'grid', content: {
      META_L: 'WHAT WE DO', META_R: `${svcs.length} AREAS`, LABEL: 'What we offer',
      TILES: svcs.slice(0, 8).map((s, i) => ({ tn: pad2(i + 1), th: s, td: '' })) } });
    vo.push(`We work across ${svcs.length} areas — ${svcs.slice(0, 3).join(', ')}, and more.`);
  } else {
    shots.push({ block: 'statement-list', content: {
      META_L: 'WHAT WE DO', META_R: up(web), KICKER: 'WHAT WE DO',
      HEAD: `What <em>${name}</em><br>delivers.`, LIST: (svcs.length ? svcs : ['Tailored solutions']).map(s => ({ lk: s, lv: '' })),
      FOOT: sentence(oneLiner) } });
    vo.push(`${name} delivers ${(svcs[0] || 'tailored solutions').toLowerCase()}.`);
  }

  // 4 statement-list(卖点/why)—— sp 优先,否则用 services,再否则通用兜底(保证非空)
  const why = (sp.length ? sp : (svcs.length ? svcs : ['Tailored to your goals', 'Built to deliver', 'An honest partner'])).slice(0, 3);
  shots.push({ block: 'statement-list', content: {
    META_L: 'WHY US', META_R: 'WHAT YOU GET', KICKER: 'WHY IT MATTERS',
    HEAD: `Why teams choose<br><em>${name}</em>.`,
    LIST: why.map(s => ({ lk: s, lv: '' })),
    FOOT: sentence(oneLiner) } });
  vo.push(sp.length ? `Teams choose us for ${sp.slice(0, 2).join(' and ').toLowerCase()}.` : `Teams choose ${name} to get the result they actually want.`);

  // 5 flow(通用流程)
  shots.push({ block: 'flow', content: {
    META_L: 'HOW IT WORKS', META_R: 'SIMPLE', LABEL: 'How we work',
    STEPS: [
      { cls: '', snum: '01', sname: 'You reach out', sdesc: 'Tell us your goal' },
      { cls: '', snum: '02', sname: 'We tailor', sdesc: 'A plan built around you' },
      { cls: 'done', snum: '03', sname: "It's delivered", sdesc: 'Outcome, ready to use' },
    ] } });
  vo.push(`Getting started is simple: you reach out, we tailor a plan, and we deliver.`);

  // 6 cta
  shots.push({ block: 'cta', content: {
    META_L: "LET'S TALK", META_R: web || (email || ''), WORD: up(name),
    Q: `Let's build<br>something <em>great</em>.`, CSUB: 'Tell us your goals — we will take it from there.',
    BTN: email || web || name, DISC: [name, oneLiner, web].filter(Boolean).join(' · ') } });
  vo.push(`${name}. ${email ? 'Reach us at ' + email + '.' : (web ? 'Find us at ' + web + '.' : "Let's talk.")}`);

  return { shots, vo };
}

// 校验 + 标准化产物
function finalizeScript(shots, vo, vo_zh, catalog, meta) {
  if (!Array.isArray(shots) || !shots.length) throw new Error('脚本无 shots');
  shots.forEach((s, i) => { try { validateShot(s, catalog); } catch (e) { throw new Error(`镜 ${i + 1}(${s.block}): ${e.message}`); } });
  if (!Array.isArray(vo) || vo.length !== shots.length) throw new Error(`vo 段数(${vo?.length})与镜数(${shots.length})不一致`);
  const zhOk = Array.isArray(vo_zh) && vo_zh.length === shots.length && vo_zh.every(x => x && String(x).trim());
  if (!zhOk && Array.isArray(vo_zh) && vo_zh.length) (meta.notes = meta.notes || []).push(`LLM 返回 ZH ${vo_zh.length} 段但镜数 ${shots.length}(或有空段),已弃用 ZH —— 检查 LLM 输出`);
  return {
    storyboard: { _note: `WayCast 自动生成(${meta.mode})`, shots: shots.map((s, i) => ({ block: s.block, dur: 5.5, content: s.content })) },
    vo: { vo, vo_zh: zhOk ? vo_zh : [] },
    meta: { mode: meta.mode, provider: meta.provider || null, model: meta.model || null, has_zh: zhOk, unknowns: meta.unknowns || [], notes: meta.notes || [] },
  };
}

// 主入口。opts.llm = {call(brief,catalog,nShots)->obj} 假 provider(测试用)。opts.nShots 默认 8(LLM)/6(骨架)。
export async function writeScript(brief, opts = {}) {
  const catalog = opts.catalog || blockCatalog();
  if (opts.llm && typeof opts.llm.call === 'function') {
    const got = await opts.llm.call(brief, catalog, opts.nShots || 8);
    return finalizeScript(got.shots, got.vo, got.vo_zh, catalog, { mode: 'llm', provider: 'inject', model: opts.llm.model || 'inject', unknowns: got._unknowns || [] });
  }
  const prov = resolveProvider(opts);
  if (prov) {
    try {
      const n = opts.nShots || 8;
      const got = await llmJson({ system: SYS, user: scriptUserPrompt(brief, catalog, n), prov, maxTokens: 3000 });
      return finalizeScript(got.shots, got.vo, got.vo_zh, catalog, { mode: 'llm', provider: prov.provider, model: prov.model, unknowns: got._unknowns || [] });
    } catch (e) {
      const sk = skeleton(brief);
      return finalizeScript(sk.shots, sk.vo, [], catalog, { mode: 'skeleton', notes: [`LLM 文案失败,已回退确定性骨架: ${String(e.message).slice(0, 120)}`, 'ZH 旁白需 LLM'] });
    }
  }
  const sk = skeleton(brief);
  return finalizeScript(sk.shots, sk.vo, [], catalog, { mode: 'skeleton', notes: ['无 LLM key:确定性骨架草稿;ZH 旁白需 LLM 或人工;文案建议人工润色'] });
}

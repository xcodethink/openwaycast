// extract-brief.mjs —— signals → 结构化品牌简报(brief)。
// 双模式:① 有 LLM key → provider 抽取(质量高,防杜撰);② 无 key → 启发式(确定性,部分字段留待人工/LLM)。
// brief 是 Phase 2 下游(文案/选图/套模板)的输入;字段语义见 docs/brief-schema.md。
// 防杜撰铁律:只用源中存在的信息,缺失置 null/[],绝不臆造服务/城市/联系方式;不确定的进 _unknowns。
import { resolveProvider, llmJson } from './llm.mjs';
export { resolveProvider } from './llm.mjs';   // 兼容旧引用(brief.mjs / smoke 仍从此处取)
export { extractJson } from './llm.mjs';

// ---- 启发式(无 key 也能用)----
// 子串匹配(导航项常是"Privacy Policy"/"Terms of Use"这类双词),命中即视为样板非服务
const BOILERPLATE = /\b(home|blog|news|career|job|contact|about|login|log\s?in|sign\s?in|sign\s?up|register|privacy|terms|cookie|sitemap|faq|support|help|menu|search|language|pricing|demo|download)\b|^(en|中文|cn|zh|jp|ko)$|©/i;
// 仅认可靠模式(去掉贪婪的 "from/office in":会把 "from Alibaba" 这类误判成城市);宁缺毋造
const CITY_HINT = /\b(?:based in|located in|headquarter(?:ed|s)? in|hq in)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+){0,2})/;

function firstSentence(s) { if (!s) return null; const m = String(s).split(/(?<=[.!?。!?])\s/)[0]; return m ? m.trim() : null; }

export function heuristicBrief(sig) {
  const host = (() => { try { return new URL(sig.final_url || sig.source_url).host.replace(/^www\./, ''); } catch { return null; } })();
  const titleParts = (sig.title || '').split(/\s[—–|·-]\s/).map(s => s.trim()).filter(Boolean);
  const name = sig.og?.site_name || (titleParts[0] && titleParts[0].length <= 40 ? titleParts[0] : null) || host;
  // tagline:标题副段 / 首个短 h1 / 描述首句
  let tagline = titleParts.length > 1 ? titleParts.slice(1).join(' — ') : null;
  if (!tagline && sig.headings?.h1?.length) tagline = sig.headings.h1.find(h => h.length <= 80) || null;
  if (!tagline) tagline = firstSentence(sig.description);
  // city:仅在描述/正文出现明确"based in X"等模式时才填,否则 null(不臆造)
  let city = null; const cm = (`${sig.description || ''} ${sig.text || ''}`).match(CITY_HINT); if (cm) city = cm[1].trim();
  const one_liner = sig.description || sig.og?.description || null;
  // services:启发式弱——取非样板的导航项作"候选",标低置信(排除品牌名/邮箱/箭头项)
  const nameLc = (name || '').toLowerCase();
  const services = (sig.nav || []).map(t => t.trim()).filter(t => t && !BOILERPLATE.test(t) && !/@/.test(t) && t.length <= 30 && !/[→»>]/.test(t) && t.toLowerCase() !== nameLc)
    .filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);
  const unknowns = [];
  if (!city) unknowns.push('city');
  unknowns.push('selling_points', 'tagline_polish');
  // services 永远是导航候选(未经站点确认为"服务")→ 一律进 unknowns 交人工确认,不冒充已证实数据
  unknowns.push('services');
  return {
    name, tagline, city, one_liner,
    services, selling_points: [],
    extraction_unknowns: unknowns,
    extraction_notes: ['启发式抽取:services 为导航候选(可能含非服务项);selling_points/精炼文案需 LLM 或人工。设 LLM key 可大幅提升。'],
  };
}

// ---- LLM 抽取(BYO-key)----
const SYS = `You extract a structured brand brief from a company website's scraped signals, for generating a short brand intro video.
RULES (anti-fabrication, strict):
- Use ONLY facts present in the provided signals. Never invent services, city, contact, or claims.
- If a field is not supported by the signals, use null (or [] for lists). Do not guess.
- Keep copy faithful to the site's own wording; you may lightly tighten, not embellish.
- Output ONLY a JSON object, no prose, matching the requested schema.`;

function userPrompt(sig) {
  return `Signals (JSON):\n${JSON.stringify({
    final_url: sig.final_url, title: sig.title, description: sig.description, og: sig.og,
    headings: sig.headings, nav: sig.nav, emails: sig.emails, phones: sig.phones, socials: sig.socials,
    text_excerpt: (sig.text || '').slice(0, 6000),
  })}

Return JSON with exactly these fields:
{
  "name": string|null,            // brand/company name
  "tagline": string|null,         // short punchy line (<= 80 chars), from the site
  "city": string|null,            // HQ/base city, only if stated
  "one_liner": string|null,       // one-sentence description of what they do
  "services": [string],           // concrete services/offerings/focus areas (max 8)
  "selling_points": [string],     // why-choose-us differentiators (max 5)
  "_unknowns": [string]           // field names you could not determine from signals
}`;
}

// 主入口。opts.llm 可传一个 {call(sig)->obj} 假 provider(测试用,免网络/免 key)。
export async function extractBrief(sig, opts = {}) {
  const base = {
    source_url: sig.source_url, final_url: sig.final_url, fetched_at: opts.fetched_at || null,
    name: null, tagline: null, city: null, one_liner: null, services: [], selling_points: [],
    contact: { email: sig.emails?.[0] || null, phone: sig.phones?.[0] || null, website: (() => { try { return new URL(sig.final_url).host.replace(/^www\./, ''); } catch { return null; } })(), socials: sig.socials || [] },
    accent: opts.accent?.accent ?? null, accent_source: opts.accent?.source ?? 'none', accent_confidence: opts.accent?.confidence ?? 'none',
    extraction: { mode: 'heuristic', provider: null, model: null, unknowns: [], notes: [] },
  };
  // 测试假 provider
  if (opts.llm && typeof opts.llm.call === 'function') {
    const got = await opts.llm.call(sig);
    return finalize(base, got, { mode: 'llm', provider: 'inject', model: opts.llm.model || 'inject' });
  }
  const prov = resolveProvider(opts);
  if (prov) {
    try {
      const got = await llmJson({ system: SYS, user: userPrompt(sig), prov, maxTokens: 1500 });
      return finalize(base, got, { mode: 'llm', provider: prov.provider, model: prov.model });
    } catch (e) {
      const h = heuristicBrief(sig);
      return finalize(base, h, { mode: 'heuristic', provider: null, model: null, notes: [`LLM 抽取失败,已回退启发式: ${String(e.message).slice(0, 120)}`] });
    }
  }
  // 无 key → 启发式
  const h = heuristicBrief(sig);
  return finalize(base, h, { mode: 'heuristic', provider: null, model: null });
}

function finalize(base, got, meta) {
  const b = { ...base };
  for (const k of ['name', 'tagline', 'city', 'one_liner']) if (got[k] != null) b[k] = got[k];
  if (Array.isArray(got.services)) b.services = got.services.slice(0, 8);
  if (Array.isArray(got.selling_points)) b.selling_points = got.selling_points.slice(0, 5);
  b.extraction = {
    mode: meta.mode, provider: meta.provider, model: meta.model,
    unknowns: got._unknowns || got.extraction_unknowns || [],
    notes: [...(meta.notes || []), ...(got.extraction_notes || [])],
  };
  return b;
}

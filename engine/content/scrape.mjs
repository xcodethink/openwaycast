// scrape.mjs —— 抓站 → 确定性信号(零依赖:Node fetch + 正则)。
// 不做"理解",只做"采集":把页面里客观存在的信号抽干净,交给 extract-brief 去结构化。
// scrapeSite(url) → { source_url, final_url, fetched_pages[], title, description, og{}, theme_color,
//   icons[], headings{h1[],h2[],h3[]}, nav[], emails[], phones[], socials[], images[], text }
import { setTimeout as sleep } from 'timers/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 WayCast/0.1 (+https://github.com/wayjetai/waycastai)';
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

export function decodeEntities(s = '') {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return _; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return _; } })
    .replace(/&([a-zA-Z#0-9]+);/g, (m, k) => (ENT[k] != null ? ENT[k] : m));
}
const clean = s => decodeEntities(String(s || '').replace(/\s+/g, ' ').trim());
const stripTags = html => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ');

// 取标签属性值(支持 "..." / '...' / 无引号);标签边界 quote-aware,允许 content 内含 ">"
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}
function meta(html, key) {
  // 逐个 <meta> 标签(允许引号内出现 ">"),按 name= 或 property= 匹配 key,取 content
  const tags = html.match(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) || [];
  for (const tag of tags) {
    const nm = attr(tag, 'name') || attr(tag, 'property');
    if (nm && nm.toLowerCase() === key.toLowerCase()) { const c = attr(tag, 'content'); if (c != null) return clean(c); }
  }
  return null;
}
function allTagText(html, tag) {
  const out = [], re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'); let m;
  while ((m = re.exec(html))) { const t = clean(stripTags(m[1])); if (t && t.length <= 160) out.push(t); }
  return [...new Set(out)];
}

function parsePage(html, baseUrl) {
  const titleTag = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const og = {};
  for (const k of ['og:site_name', 'og:title', 'og:description', 'og:image', 'og:url', 'twitter:title', 'twitter:description', 'twitter:image']) { const v = meta(html, k); if (v) og[k.replace(/^og:|^twitter:/, m => m === 'og:' ? '' : 'tw_')] = v; }
  // 链接
  const links = [];
  let m, lre = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = lre.exec(html))) { const href = m[1].trim(); const text = clean(stripTags(m[2])); if (href) links.push({ href, text }); }
  // 图标
  const icons = [];
  let ire = /<link\b[^>]*rel=["']([^"']*icon[^"']*)["'][^>]*>/gi;
  while ((m = ire.exec(html))) { const h = m[0].match(/href=["']([^"']+)["']/i); if (h) icons.push(abs(h[1], baseUrl)); }
  // 图片
  const images = [];
  let imre = /<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi;
  while ((m = imre.exec(html))) { const src = abs(m[1], baseUrl); const w = m[0].match(/width=["']?(\d+)/i); images.push({ src, w: w ? +w[1] : null }); }
  return {
    title: clean(titleTag), description: meta(html, 'description'), theme_color: meta(html, 'theme-color'),
    og, icons, links, images,
    headings: { h1: allTagText(html, 'h1'), h2: allTagText(html, 'h2'), h3: allTagText(html, 'h3') },
    text: clean(stripTags(html)).slice(0, 8000),
  };
}

function abs(href, base) { try { return new URL(href, base).href; } catch { return href; } }
function normUrl(u) { if (!/^https?:\/\//i.test(u)) u = 'https://' + u; return u; }

async function fetchHtml(url, timeoutMs = 12000) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' } });
    const ct = r.headers.get('content-type') || '';
    const html = ct.includes('html') || ct === '' ? await r.text() : '';
    return { ok: r.ok, status: r.status, final_url: r.url || url, html, content_type: ct };
  } finally { clearTimeout(to); }
}

// 从首页导航里挑值得抓的子页(about/services/contact 等),同域、最多 maxExtra 个
const SUBPAGE_HINT = /\b(about|company|who[-\s]?we[-\s]?are|service|solution|product|work|what[-\s]?we[-\s]?do|contact|team|mission)\b/i;
function pickSubpages(links, baseUrl, maxExtra) {
  const baseHost = new URL(baseUrl).host; const seen = new Set(); const out = [];
  for (const { href, text } of links) {
    const u = abs(href, baseUrl); let h;
    try { h = new URL(u); } catch { continue; }
    if (h.host !== baseHost) continue;
    if (!/^https?:$/.test(h.protocol)) continue;
    const path = h.pathname.replace(/\/+$/, '');
    if (!path || path === '') continue;                              // 跳过首页
    if (/\.(pdf|jpg|png|svg|zip|mp4|webp|gif|ico|css|js)$/i.test(path)) continue;
    const key = h.origin + path;
    if (seen.has(key)) continue;
    if (SUBPAGE_HINT.test(path) || SUBPAGE_HINT.test(text)) { seen.add(key); out.push(key); }
    if (out.length >= maxExtra) break;
  }
  return out;
}

const SOCIAL = /(facebook|instagram|linkedin|twitter|x\.com|youtube|tiktok|t\.me|telegram|wa\.me|whatsapp|github|threads)\.?/i;
function harvest(pages) {
  const emails = new Set(), phones = new Set(), socials = new Set();
  for (const p of pages) {
    for (const { href } of p.links || []) {
      if (/^mailto:/i.test(href)) emails.add(clean(href.replace(/^mailto:/i, '').split('?')[0]));
      if (/^tel:/i.test(href)) phones.add(clean(href.replace(/^tel:/i, '')));
      if (SOCIAL.test(href) && /^https?:/i.test(href)) socials.add(href.split('?')[0]);
    }
    // 正文里的邮箱(兜底)
    for (const e of (p.text || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []) emails.add(e);
  }
  return { emails: [...emails], phones: [...phones], socials: [...socials] };
}

export async function scrapeSite(url, { maxPages = 4, timeoutMs = 12000, throttleMs = 350 } = {}) {
  const start = normUrl(url.trim());
  const home = await fetchHtml(start, timeoutMs);
  if (!home.html) throw new Error(`抓取失败或非 HTML: ${start} (status ${home.status}, ${home.content_type})`);
  const homeP = parsePage(home.html, home.final_url);
  const subUrls = pickSubpages(homeP.links, home.final_url, Math.max(0, maxPages - 1));
  const pages = [{ url: home.final_url, ...homeP }];
  for (const su of subUrls) {
    await sleep(throttleMs);
    try { const r = await fetchHtml(su, timeoutMs); if (r.html) pages.push({ url: r.final_url, ...parsePage(r.html, r.final_url) }); } catch { /* 子页失败不致命 */ }
  }
  const { emails, phones, socials } = harvest(pages);
  // 候选图:og:image 优先,再按宽度挑大图
  const ogImg = homeP.og.image ? abs(homeP.og.image, home.final_url) : null;
  const bigImgs = [...new Map(pages.flatMap(p => p.images).filter(i => i.src && !/\.svg(\?|$)/i.test(i.src)).map(i => [i.src, i])).values()]
    .sort((a, b) => (b.w || 0) - (a.w || 0)).slice(0, 12).map(i => i.src);
  const images = [...new Set([ogImg, ...bigImgs].filter(Boolean))];
  return {
    source_url: start, final_url: home.final_url,
    fetched_pages: pages.map(p => p.url),
    title: homeP.title, description: homeP.description || homeP.og.description || null,
    og: homeP.og, theme_color: homeP.theme_color || null,
    icons: [...new Set(pages.flatMap(p => p.icons))],
    headings: {
      h1: [...new Set(pages.flatMap(p => p.headings.h1))],
      h2: [...new Set(pages.flatMap(p => p.headings.h2))],
      h3: [...new Set(pages.flatMap(p => p.headings.h3))],
    },
    nav: homeP.links.filter(l => l.text && l.text.length <= 40).map(l => l.text).filter((v, i, a) => a.indexOf(v) === i).slice(0, 40),
    emails, phones, socials, images,
    text: pages.map(p => p.text).join('\n\n').slice(0, 16000),
  };
}

// CLI: node content/scrape.mjs <url>
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  if (!url) { console.error('用法: node content/scrape.mjs <url>'); process.exit(2); }
  scrapeSite(url).then(s => console.log(JSON.stringify(s, null, 2))).catch(e => { console.error('[scrape 失败]', e.message); process.exit(1); });
}

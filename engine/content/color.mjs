// color.mjs —— 主色(accent)提取(2.4)。
// 顺序:theme-color meta(最权威)→ 品牌视觉图(og:image / logo)取"最鲜艳代表色" → 兜底 null。
// "最鲜艳"而非"平均":品牌色通常是画面里高饱和的那一抹,平均色只会得到暗浊底色。
// 取色法:ffmpeg 把图缩到 48x48 rawvideo rgb24 → Node 读字节 → HSV 打分挑 accent(零额外依赖)。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36 WayCast/0.1';

export function isHex(s) { return typeof s === 'string' && /^#?[0-9a-fA-F]{6}$/.test(s.trim()); }
export function normHex(s) { const h = s.trim().replace(/^#/, '').toLowerCase(); return '#' + h; }
// 够"鲜艳"才算品牌色:拒黑/白/灰(暗色模式常把 theme-color 设成 #000000)
export function isVividHex(s) {
  if (!isHex(s)) return false;
  const h = normHex(s).slice(1); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const { s: sat, v } = rgb2hsv(r, g, b);
  return sat >= 0.25 && v >= 0.18;   // 白/灰已被 sat 门槛拦掉,纯亮饱和色(v=1)不该拒
}
// 按 magic 字节给临时文件正确扩展名(避免 ffmpeg 凭错误扩展名选错 demuxer,如 .img→GEM Raster)
function extFromMagic(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return '.jpg';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return '.webp';
  if (buf.slice(0, 4).toString('latin1') === 'GIF8') return '.gif';
  if (buf.slice(0, 2).toString('latin1') === 'BM') return '.bmp';
  if (buf.slice(4, 12).toString('latin1').includes('ftyp')) return '.avif';
  return '.dat';   // 未知 → 交给 ffmpeg 内容嗅探
}
function toHex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s: mx ? d / mx : 0, v: mx };
}

async function fetchToTmp(url, timeoutMs = 12000) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept': 'image/*' } });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 64) return null;
    const f = path.join(os.tmpdir(), `wc-color-${Date.now()}-${buf.length % 100000}${extFromMagic(buf)}`);
    fs.writeFileSync(f, buf); return f;
  } catch { return null; } finally { clearTimeout(to); }
}

// 从一张图取"最鲜艳代表色"(偏亮);够鲜艳像素太少则返回 null。
// 不取"像素最多的色相"(那常是暗底色),取"最鲜艳的那抹"(品牌 accent 的典型位置)。
function vividFromFile(file, ffmpeg, size = 64) {
  let raw;
  try { raw = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-vf', `scale=${size}:${size}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 }); }
  catch { return null; }
  const total = Math.floor(raw.length / 3);
  if (!total) return null;
  const vivid = [];
  for (let i = 0; i + 2 < raw.length; i += 3) {
    const r = raw[i], g = raw[i + 1], b = raw[i + 2]; const { h, s, v } = rgb2hsv(r, g, b);
    if (s < 0.40 || v < 0.35) continue;                        // 滤掉灰/黑/过暗(白由 s 门槛拦掉)
    vivid.push({ r, g, b, h, score: s * Math.pow(v, 1.3) });   // 偏亮的鲜艳更可能是 accent
  }
  if (vivid.length < Math.max(6, total * 0.01)) return null;    // 鲜艳像素太少 → 不可信
  // 锚定最鲜艳像素,聚拢色相相近(±25°)的鲜艳像素,取其得分加权代表色
  vivid.sort((a, b) => b.score - a.score);
  const anchor = vivid[0].h;
  const near = vivid.filter(p => { let d = Math.abs(p.h - anchor); if (d > 180) d = 360 - d; return d <= 25; });
  const cluster = near.length >= 3 ? near : vivid.slice(0, Math.min(8, vivid.length));
  let R = 0, G = 0, B = 0, W = 0;
  for (const p of cluster) { R += p.r * p.score; G += p.g * p.score; B += p.b * p.score; W += p.score; }
  return toHex(R / W, G / W, B / W);
}

// signals: scrape.mjs 产物;ffmpeg: 路径
// → { accent: hex|null, source, confidence: 'high'|'low'|'none' }
// high = theme-color meta(权威);low = 从图片猜的(建议,需用户确认);none = 没找到(用默认)。
export async function accentFromSignals(signals, { ffmpeg } = {}) {
  if (signals?.theme_color && isVividHex(signals.theme_color)) return { accent: normHex(signals.theme_color), source: 'theme-color', confidence: 'high' };
  if (!ffmpeg) return { accent: null, source: 'none', confidence: 'none' };
  // 候选视觉:logo 图标优先(品牌色最纯),再 og:image,再首张大图。仅 http(s)(跳过 data:/svg)
  const cands = [...(signals?.icons || []), signals?.og?.image, ...(signals?.images || [])].filter(Boolean)
    .filter(u => /^https?:\/\//i.test(u) && !/\.svg(\?|$)/i.test(u)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
  for (const u of cands) {
    const f = await fetchToTmp(u); if (!f) continue;
    try {
      const hex = vividFromFile(f, ffmpeg);
      if (hex) return { accent: hex, source: `image:${u.split('/').pop().split('?')[0].slice(0, 40)}`, confidence: 'low' };
    } finally { try { fs.unlinkSync(f); } catch {} }
  }
  return { accent: null, source: 'none', confidence: 'none' };
}

// CLI: node content/color.mjs <url>   (自跑 scrape 再取色)
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  if (!url) { console.error('用法: node content/color.mjs <url>'); process.exit(2); }
  const { scrapeSite } = await import('./scrape.mjs');
  const { cfg } = await import('../config.mjs');
  const s = await scrapeSite(url);
  const r = await accentFromSignals(s, { ffmpeg: cfg.ffmpeg });
  console.log(JSON.stringify(r, null, 2));
}

// brief.mjs —— CLI:URL → 品牌简报。编排 scrape → 主色 → 抽取 → 写 brief.json。
// 用法: node content/brief.mjs <url> [--out brief.json] [--provider anthropic|openai] [--model X]
//   有 ANTHROPIC_API_KEY / OPENAI_API_KEY 自动走 LLM;无则启发式(仍可用)。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cfg } from '../config.mjs';
import { scrapeSite } from './scrape.mjs';
import { accentFromSignals } from './color.mjs';
import { extractBrief, resolveProvider } from './extract-brief.mjs';

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) { const t = argv[i]; if (t.startsWith('--')) { const k = t.slice(2); a[k] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; } else a._.push(t); }
  return a;
}

export async function buildBrief(url, opts = {}) {
  const sig = await scrapeSite(url, opts.scrape || {});
  const accent = await accentFromSignals(sig, { ffmpeg: cfg.ffmpeg });
  const brief = await extractBrief(sig, { ...opts, accent, fetched_at: new Date().toISOString() });
  return { brief, signals: sig };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = parseArgs(process.argv.slice(2));
  const url = a._[0];
  if (!url) { console.error('用法: node content/brief.mjs <url> [--out brief.json] [--provider anthropic|openai] [--model X]'); process.exit(2); }
  const prov = resolveProvider({ provider: typeof a.provider === 'string' ? a.provider : undefined, model: typeof a.model === 'string' ? a.model : undefined });
  console.error(`[brief] 抓取 ${url} … (${prov ? `LLM=${prov.provider}/${prov.model}` : '启发式,无 LLM key'})`);
  try {
    const { brief } = await buildBrief(url, { provider: typeof a.provider === 'string' ? a.provider : undefined, model: typeof a.model === 'string' ? a.model : undefined });
    const out = typeof a.out === 'string' ? a.out : null;
    if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(brief, null, 2)); console.error(`[brief] 写入 ${out}`); }
    else console.log(JSON.stringify(brief, null, 2));
    console.error(`[brief] 模式=${brief.extraction.mode} · name=${brief.name} · accent=${brief.accent || '(默认/待填)'}(${brief.accent_confidence}) · services=${brief.services.length} · 未知字段=[${brief.extraction.unknowns.join(',')}]`);
  } catch (e) { console.error('[brief 失败]', e.message); process.exit(1); }
}

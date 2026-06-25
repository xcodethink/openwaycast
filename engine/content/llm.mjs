// llm.mjs —— 共享 LLM provider 层(BYO-key)。被 extract-brief / write-script 复用。
// 统一入口 llmJson({system,user}) → 解析后的 JSON 对象。provider 走 anthropic / openai。

// 从 LLM 回复里稳健取出第一个完整 JSON 对象:先剥 markdown 围栏,再花括号平衡扫描
//(贪婪 /\{[\s\S]*\}/ 会被散文里的花括号带歪 → 解析失败,故弃用)
export function extractJson(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) t = fence[1].trim();
  const start = t.indexOf('{'); if (start < 0) throw new Error('LLM 未返回 JSON');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { if (--depth === 0) return JSON.parse(t.slice(start, i + 1)); }
  }
  throw new Error('LLM 返回的 JSON 不完整');
}

// provider 解析:显式 opts > 环境变量;返回 {provider, model, apiKey} 或 null(无 key)
export function resolveProvider(opts = {}, env = process.env) {
  const provider = opts.provider || env.WAYCAST_LLM_PROVIDER || (env.ANTHROPIC_API_KEY ? 'anthropic' : env.OPENAI_API_KEY ? 'openai' : null);
  if (!provider) return null;
  if (provider === 'anthropic') { const apiKey = opts.apiKey || env.ANTHROPIC_API_KEY; return apiKey ? { provider, apiKey, model: opts.model || env.WAYCAST_LLM_MODEL || 'claude-sonnet-4-6' } : null; }
  if (provider === 'openai') { const apiKey = opts.apiKey || env.OPENAI_API_KEY; return apiKey ? { provider, apiKey, model: opts.model || env.WAYCAST_LLM_MODEL || 'gpt-4o-mini' } : null; }
  return null;
}

async function callAnthropic({ system, user, apiKey, model, maxTokens, timeoutMs }) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return extractJson(j.content?.map(c => c.text).join('') || '');
  } finally { clearTimeout(to); }
}

async function callOpenAI({ system, user, apiKey, model, maxTokens, timeoutMs }) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // o 系列 / gpt-5 用 max_completion_tokens(旧 max_tokens 会被这些模型 400)
    const tokKey = /^(o\d|gpt-5)/i.test(model) ? 'max_completion_tokens' : 'max_tokens';
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, [tokKey]: maxTokens, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return extractJson(j.choices?.[0]?.message?.content || '');
  } finally { clearTimeout(to); }
}

// 统一调用:prov 来自 resolveProvider;返回解析后的 JSON 对象(失败抛错,由调用方决定回退)
export async function llmJson({ system, user, prov, maxTokens = 1500, timeoutMs = 60000 }) {
  if (!prov) throw new Error('无 LLM provider(缺 key)');
  const args = { system, user, apiKey: prov.apiKey, model: prov.model, maxTokens, timeoutMs };
  return prov.provider === 'openai' ? callOpenAI(args) : callAnthropic(args);
}

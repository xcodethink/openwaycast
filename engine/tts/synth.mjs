// synth.mjs —— TTS 抽象层(Phase 3)。统一接口,本地(Kokoro 英 / CosyVoice 中)+ 云(OpenAI / ElevenLabs / Azure)可插拔。
// 产出每段一个 raw 音频文件(任何 ffmpeg 可读格式);WARM EQ + 重采样仍由 build.mjs 后处理。
// 默认本地按语言(zh→cosyvoice,其余→kokoro);WAYCAST_TTS_PROVIDER 或 opts.provider 可覆盖。云需 BYO-key。
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));   // engine/tts(用 fileURLToPath,空格路径也正确)
export const TTS_PROVIDERS = ['kokoro', 'cosyvoice', 'openai', 'elevenlabs', 'azure'];
const CLOUD = new Set(['openai', 'elevenlabs', 'azure']);
const pad2 = n => String(n).padStart(2, '0');

export function resolveTTSProvider({ provider, lang } = {}, env = process.env) {
  const p = provider || env.WAYCAST_TTS_PROVIDER;
  if (p) { if (!TTS_PROVIDERS.includes(p)) throw new Error(`未知 TTS provider "${p}"(可选: ${TTS_PROVIDERS.join(', ')})`); return p; }
  return lang === 'zh' ? 'cosyvoice' : 'kokoro';   // 默认本地,按语言
}
export function isCloudTTS(provider) { return CLOUD.has(provider); }

// provider-aware 依赖/凭据检查:返回缺失项数组(空=可用)
export function ttsBlockers(provider, cfg = {}, env = process.env) {
  const miss = [];
  if (provider === 'kokoro') { if (!(cfg.kokoroVenv && fs.existsSync(cfg.kokoroVenv + '/bin/python'))) miss.push('Kokoro venv(~/.hyperframes-tts-venv)'); }
  else if (provider === 'cosyvoice') {
    if (!(cfg.cosyvoicePy && fs.existsSync(cfg.cosyvoicePy))) miss.push('CosyVoice python(conda env cosyvoice)');
    if (!(cfg.cosyvoiceRepo && fs.existsSync(cfg.cosyvoiceRepo + '/cosyvoice/cli/cosyvoice.py'))) miss.push('CosyVoice 仓库');
    else if (!fs.existsSync(cfg.cosyvoiceRepo + '/pretrained_models/CosyVoice2-0.5B/llm.pt')) miss.push('CosyVoice2-0.5B 模型(llm.pt 未下载)');
  }
  else if (provider === 'openai') { if (!env.OPENAI_API_KEY) miss.push('OPENAI_API_KEY'); }
  else if (provider === 'elevenlabs') { if (!env.ELEVENLABS_API_KEY) miss.push('ELEVENLABS_API_KEY'); }
  else if (provider === 'azure') { if (!env.AZURE_TTS_KEY) miss.push('AZURE_TTS_KEY'); if (!env.AZURE_TTS_REGION) miss.push('AZURE_TTS_REGION'); }
  return miss;
}

// ---- 本地适配器 ----
function synthKokoro({ lines, rawDir, voice, cfg, hf, log }) {
  const env = { ...process.env, PATH: cfg.kokoroVenv + '/bin:' + process.env.PATH };
  const v = voice || 'am_michael';
  return lines.map((line, i) => {
    const out = path.join(rawDir, `raw-${pad2(i + 1)}.wav`);
    // execFileSync 参数数组:不过 shell,旁白里的 $ / 反引号 / 引号不会被展开或截断
    let last; for (let a = 1; a <= 2; a++) { try { execFileSync('npx', ['-y', hf, 'tts', line, '--voice', v, '--output', out], { stdio: 'ignore', env }); last = null; break; } catch (e) { last = e; } }
    if (last) throw new Error(`Kokoro 合成第 ${i + 1} 段失败: ${String(last.message).split('\n')[0].slice(0, 100)}`);
    log(`\r[TTS:kokoro] ${i + 1}/${lines.length}   `);
    return out;
  });
}
function synthCosyvoice({ lines, rawDir, cfg, log }) {
  const batch = path.join(HERE, 'cosyvoice_batch.py');
  const prompt = path.join(HERE, '..', 'voices', 'brand-michael-prompt.wav');
  const reqFile = path.join(rawDir, 'req.json');
  fs.writeFileSync(reqFile, JSON.stringify({ texts: lines, prompt, outdir: rawDir }));
  log('[TTS:cosyvoice] 加载模型 + 批量合成(首次较慢)…');
  execFileSync(cfg.cosyvoicePy, [batch, reqFile], { stdio: 'inherit', env: { ...process.env, COSYVOICE_REPO: cfg.cosyvoiceRepo } });
  return lines.map((_, i) => {
    const f = path.join(rawDir, `vo-${pad2(i + 1)}.wav`);
    if (!fs.existsSync(f)) throw new Error(`CosyVoice 第 ${i + 1} 段产物缺失: ${f}`);
    return f;
  });
}

// ---- 云适配器(fetch)----
async function postBytes(url, headers, body, timeoutMs = 60000) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try { const r = await fetch(url, { method: 'POST', signal: ctrl.signal, headers, body }); if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 160)}`); return Buffer.from(await r.arrayBuffer()); }
  finally { clearTimeout(to); }
}
async function synthOpenAI({ lines, rawDir, voice, model, env, log }) {
  const key = env.OPENAI_API_KEY, v = voice || env.WAYCAST_TTS_VOICE || 'onyx', m = model || 'tts-1';
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const buf = await postBytes('https://api.openai.com/v1/audio/speech', { 'content-type': 'application/json', authorization: `Bearer ${key}` }, JSON.stringify({ model: m, voice: v, input: lines[i], response_format: 'wav' }));
    const f = path.join(rawDir, `raw-${pad2(i + 1)}.wav`); fs.writeFileSync(f, buf); out.push(f); log(`\r[TTS:openai] ${i + 1}/${lines.length}   `);
  }
  return out;
}
async function synthElevenLabs({ lines, rawDir, voice, model, env, log }) {
  const key = env.ELEVENLABS_API_KEY, vid = voice || env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB', m = model || 'eleven_multilingual_v2';
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const buf = await postBytes(`https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_44100_128`, { 'content-type': 'application/json', 'xi-api-key': key }, JSON.stringify({ text: lines[i], model_id: m }));
    const f = path.join(rawDir, `raw-${pad2(i + 1)}.mp3`); fs.writeFileSync(f, buf); out.push(f); log(`\r[TTS:elevenlabs] ${i + 1}/${lines.length}   `);
  }
  return out;
}
async function synthAzure({ lines, lang, rawDir, voice, env, log }) {
  const key = env.AZURE_TTS_KEY, region = env.AZURE_TTS_REGION;
  const v = voice || env.WAYCAST_TTS_VOICE || (lang === 'zh' ? 'zh-CN-YunyangNeural' : 'en-US-GuyNeural');
  const xmlLang = v.split('-').slice(0, 2).join('-');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const ssml = `<speak version='1.0' xml:lang='${xmlLang}'><voice xml:lang='${xmlLang}' name='${v}'>${String(lines[i]).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</voice></speak>`;
    const buf = await postBytes(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm' }, ssml);
    const f = path.join(rawDir, `raw-${pad2(i + 1)}.wav`); fs.writeFileSync(f, buf); out.push(f); log(`\r[TTS:azure] ${i + 1}/${lines.length}   `);
  }
  return out;
}

// 主入口:返回每段 raw 音频路径(顺序与 lines 一致)。opts.synth 可注入假适配器(测试用)。
export async function synthesizeVO(opts) {
  const { lines, lang, rawDir, cfg = {}, hf, voice, model, log = () => {}, env = process.env } = opts;
  if (!Array.isArray(lines) || !lines.length) throw new Error('lines 为空');
  fs.mkdirSync(rawDir, { recursive: true });
  const provider = opts.provider || resolveTTSProvider({ lang }, env);
  if (opts.synth) return opts.synth({ ...opts, provider });   // 测试注入
  const miss = ttsBlockers(provider, cfg, env);
  if (miss.length) throw new Error(`TTS provider "${provider}" 依赖/凭据缺失: ${miss.join(', ')}`);
  switch (provider) {
    case 'kokoro': return synthKokoro({ lines, rawDir, voice, cfg, hf, log });
    case 'cosyvoice': return synthCosyvoice({ lines, rawDir, cfg, log });
    case 'openai': return synthOpenAI({ lines, rawDir, voice, model, env, log });
    case 'elevenlabs': return synthElevenLabs({ lines, rawDir, voice, model, env, log });
    case 'azure': return synthAzure({ lines, lang, rawDir, voice, env, log });
    default: throw new Error(`未实现的 provider: ${provider}`);
  }
}

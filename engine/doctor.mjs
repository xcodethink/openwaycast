// WayCast 环境自检 —— 换机器/部署后先跑。报告"现在能做什么":core + TTS + 内容(LLM/选图)。
// 用: node doctor.mjs
import { checkDeps, cfg } from './config.mjs';
import { TTS_PROVIDERS, ttsBlockers, isCloudTTS } from './tts/synth.mjs';
import { resolveProvider as resolveLLM } from './content/llm.mjs';
import { resolveImageProvider } from './content/images.mjs';

const line = (ok, name, detail) => console.log(`  ${ok ? '✓' : '—'} ${String(name).padEnd(24)} ${detail || ''}`);
console.log('\n  WayCast 环境自检\n  ' + '─'.repeat(52));

// 1) 核心(缺则完全无法出片)
console.log('  [核心]');
const core = checkDeps().filter(c => c.fatalFor === 'all');
core.forEach(c => line(c.ok, c.name, c.detail));
const coreOk = core.every(c => c.ok);

// 2) TTS provider(本地 + 云)
console.log('  [TTS provider]');
const ttsOk = {};
for (const p of TTS_PROVIDERS) {
  const miss = ttsBlockers(p, cfg); ttsOk[p] = miss.length === 0;
  line(ttsOk[p], `${p}${isCloudTTS(p) ? '(云)' : '(本地)'}`, ttsOk[p] ? '就绪' : '缺 ' + miss.join(', '));
}
const enTTS = ['kokoro', 'openai', 'elevenlabs', 'azure'].some(p => ttsOk[p]);
const zhTTS = ['cosyvoice', 'openai', 'elevenlabs', 'azure'].some(p => ttsOk[p]);

// 3) 内容自动化(可选;缺只是降级,不阻塞)
console.log('  [内容自动化]');
const llm = resolveLLM({}); const img = resolveImageProvider({});
line(!!llm, 'LLM 文案', llm ? `${llm.provider}/${llm.model}` : '未配 → 启发式/骨架草稿(仍可出片)');
line(!!img, '自动选图', img ? img.provider : '未配 → --reuse-bg 或手动放图');

console.log('  ' + '─'.repeat(52));
if (!coreOk) { console.log('  [阻塞] 核心依赖缺失 —— 无法出片。修:brew install ffmpeg;Node ≥22。\n'); process.exit(1); }
console.log(`  出片就绪:英文 ${enTTS ? '✓' : '✗(无可用 TTS:装 Kokoro venv 或设云 TTS key)'}   中文 ${zhTTS ? '✓' : '✗(装 CosyVoice 或设云 TTS key)'}`);
console.log(`  全自动(URL→成片):${llm ? '文案 ✓' : '文案降级'} · ${img ? '选图 ✓' : '选图需手动'}`);
console.log(`  出片目录: ${cfg.outputDir}\n`);
process.exit(0);

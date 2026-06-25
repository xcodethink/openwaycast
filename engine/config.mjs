// WayCast 集中配置 —— 路径自动探测 + env 覆盖(换机器能跑的根)
// 优先级: 环境变量 > 自动探测的常见位置 > which 查 PATH
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HOME = os.homedir();
const CFGDIR = path.dirname(fileURLToPath(import.meta.url));   // engine/
const which = cmd => { try { return execSync(`command -v ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const firstExisting = arr => arr.find(p => p && fs.existsSync(p)) || '';

// .env 加载(零依赖):把 KEY=VALUE 注入 process.env。已存在的真实环境变量优先(不覆盖)。
// 候选顺序:用户工作目录(WAYCAST_HOME / cwd)> 仓库根。先设到的胜出。
const loadEnv = (file) => {
  if (!file || !fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]] !== undefined) continue;   // 跳过注释/空行;真实 env 优先
    process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '').replace(/^~(?=\/)/, HOME);
  }
};
[process.env.WAYCAST_HOME && path.join(process.env.WAYCAST_HOME.replace(/^~/, HOME), '.env'),
 path.join(process.cwd(), '.env'),
 path.join(CFGDIR, '..', '.env')].forEach(loadEnv);

export const cfg = {
  // 音视频工具
  ffmpeg:  process.env.FFMPEG  || firstExisting(['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']) || which('ffmpeg'),
  ffprobe: process.env.FFPROBE || firstExisting(['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', '/usr/bin/ffprobe']) || which('ffprobe'),
  // 英文 TTS(Kokoro venv)
  kokoroVenv: process.env.KOKORO_VENV || firstExisting([HOME + '/.hyperframes-tts-venv']),
  // 中文 TTS(CosyVoice conda 环境 + 仓库)
  cosyvoicePy:   process.env.COSYVOICE_PY   || firstExisting([HOME + '/miniforge3/envs/cosyvoice/bin/python', HOME + '/miniconda3/envs/cosyvoice/bin/python', HOME + '/anaconda3/envs/cosyvoice/bin/python']),
  cosyvoiceRepo: process.env.COSYVOICE_REPO || firstExisting([HOME + '/CosyVoice']),  // 自有克隆别处放 → 设 COSYVOICE_REPO
  // 工作目录:WAYCAST_HOME 设了(npx 场景,bin 设成用户 cwd)→ 品牌/成片落那;没设(仓库内 dev)→ 保持引擎内,行为不变
  //   brandsDir = 用户的品牌包;bundledBrandsDir = 随包样本(给 --reuse-bg / init);outputDir = 成片
  brandsDir: process.env.WAYCAST_BRANDS ? process.env.WAYCAST_BRANDS.replace(/^~/, HOME)
    : (process.env.WAYCAST_HOME ? path.join(process.env.WAYCAST_HOME.replace(/^~/, HOME), 'brands') : path.join(CFGDIR, 'brands')),
  bundledBrandsDir: path.join(CFGDIR, 'brands'),
  outputDir: process.env.OUTPUT_DIR ? process.env.OUTPUT_DIR.replace(/^~/, HOME)
    : (process.env.WAYCAST_HOME ? path.join(process.env.WAYCAST_HOME.replace(/^~/, HOME), 'output') : path.join(CFGDIR, '..', 'output')),
  port: parseInt(process.env.PORT || '4178', 10),
};

// 依赖自检:返回 [{name, ok, detail, fatalFor}]
export function checkDeps() {
  const node = process.version;
  const checks = [];
  const add = (name, ok, detail, fatalFor = 'all') => checks.push({ name, ok, detail, fatalFor });
  add('Node.js', !!node, node, 'all');
  add('ffmpeg', !!cfg.ffmpeg, cfg.ffmpeg || '未找到(brew install ffmpeg)', 'all');
  add('ffprobe', !!cfg.ffprobe, cfg.ffprobe || '未找到(brew install ffmpeg)', 'all');
  const kokoroPy = cfg.kokoroVenv && fs.existsSync(cfg.kokoroVenv + '/bin/python');
  add('Kokoro venv(英文配音)', !!kokoroPy, kokoroPy ? cfg.kokoroVenv : '未找到 ~/.hyperframes-tts-venv', 'en');
  const cosyOk = cfg.cosyvoicePy && fs.existsSync(cfg.cosyvoicePy);
  add('CosyVoice python(中文配音)', !!cosyOk, cosyOk ? cfg.cosyvoicePy : '未找到 conda 环境 cosyvoice', 'zh');
  const repoOk = cfg.cosyvoiceRepo && fs.existsSync(cfg.cosyvoiceRepo + '/cosyvoice/cli/cosyvoice.py');
  add('CosyVoice 仓库(中文配音)', !!repoOk, repoOk ? cfg.cosyvoiceRepo : '未找到 CosyVoice 仓库', 'zh');
  const modelOk = repoOk && fs.existsSync(cfg.cosyvoiceRepo + '/pretrained_models/CosyVoice2-0.5B/llm.pt');
  add('CosyVoice 模型(中文配音)', !!modelOk, modelOk ? 'CosyVoice2-0.5B 已下载' : '模型未下载(llm.pt 缺失)', 'zh');
  return checks;
}

// 给定语言,返回阻塞性缺失项(空数组 = 可以出片)
export function blockers(lang = 'en') {
  return checkDeps().filter(c => !c.ok && (c.fatalFor === 'all' || c.fatalFor === lang));
}

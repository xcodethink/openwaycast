#!/usr/bin/env node
// WayCast CLI 统一入口(npm bin)。npx waycastai <子命令>。
// 品牌包/成片默认落在你当前目录(WAYCAST_HOME=cwd);引擎与样本随包。
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PKG = path.dirname(path.dirname(fileURLToPath(import.meta.url)));   // 包根
const ENG = path.join(PKG, 'engine');
const [, , cmd, ...rest] = process.argv;
// 用户的工作目录:品牌包/成片落这里(不写进 node_modules)
const env = { ...process.env, WAYCAST_HOME: process.env.WAYCAST_HOME || process.cwd() };

function run(script, args = [], extraEnv = {}) {
  const child = spawn(process.execPath, [path.join(ENG, script), ...args], { stdio: 'inherit', env: { ...env, ...extraEnv } });
  child.on('exit', code => process.exit(code ?? 0));
  child.on('error', e => { console.error('[waycast] 启动失败:', e.message); process.exit(1); });
}

// 从 rest 取 --flag value(用于 render)
function flag(name, def) { const i = rest.indexOf('--' + name); return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : def; }

const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).version; } catch { return '?'; } })();
const HELP = `WayCast —— URL → 竖屏品牌介绍片(开源自托管)

用法: npx waycastai <命令>
  make <url> [--slug x] [--reuse-bg <brand>] [--provider anthropic|openai] [--force]
                          抓站 → 品牌包(brand/storyboard/vo + REVIEW)写入 ./brands/<slug>/
  render <slug> [--lang en|zh] [--quality draft|standard]
                          渲染品牌包 → ./output/*.mp4
  console                 本地图形控制台(http://127.0.0.1:4178)
  mcp                     启动 MCP server(stdio;给 Claude Code 当工具调,见 docs/mcp.md)
  doctor                  环境/能力自检(core / TTS / LLM / 选图)
  catalog [--json]        区块内容契约(自己写 storyboard 时查)
  init [dir]              在目录里铺好 .env + brands/ 起步
  help | version

品牌包/成片默认落在当前目录;被 Claude Code 等 agent 驱动见随包 CLAUDE.md / docs/agent-usage.md。
LLM/图库/云 TTS 的 key 写进 .env(可选,本地也能跑)。`;

switch (cmd) {
  case 'make': run('content/make-brand.mjs', rest); break;
  case 'render': {
    const slug = rest.find(a => !a.startsWith('--'));
    if (!slug) { console.error('用法: waycast render <slug> [--lang en|zh] [--quality draft|standard]'); process.exit(2); }
    run('build.mjs', [], { BRAND: slug, VO_LANG: flag('lang', 'en'), QUALITY: flag('quality', 'draft') });
    break;
  }
  case 'console': run('console/server.mjs', rest); break;
  case 'mcp': run('mcp/server.mjs', rest); break;
  case 'doctor': run('doctor.mjs', rest); break;
  case 'catalog': run('content/catalog.mjs', rest); break;
  case 'init': {
    const dir = path.resolve(rest[0] || '.');
    fs.mkdirSync(path.join(dir, 'brands'), { recursive: true });
    const envDst = path.join(dir, '.env');
    if (!fs.existsSync(envDst)) { fs.copyFileSync(path.join(PKG, '.env.example'), envDst); console.log('+ .env(从 .env.example;按需填 key)'); }
    console.log(`✓ 已在 ${dir} 铺好:brands/ + .env`);
    console.log('  下一步: npx waycastai doctor   然后   npx waycastai make https://你的官网 --reuse-bg wjdigital');
    break;
  }
  case 'version': case '--version': case '-v': console.log('waycastai ' + VERSION); break;
  case undefined: case 'help': case '--help': case '-h': console.log(HELP); break;
  default: console.error(`未知命令 "${cmd}"。\n\n` + HELP); process.exit(2);
}

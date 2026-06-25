#!/usr/bin/env bash
# WayCast 安装引导(mac / linux)。只检查 + 引导,不擅自跑重型安装(模型/venv 由你按提示装)。
# 用: bash setup.sh
set -euo pipefail
cd "$(dirname "$0")"
say() { printf '%s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

say "── WayCast setup ───────────────────────────────"

# 1) Node ≥ 22
if have node; then
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$NODE_MAJOR" -ge 22 ]; then say "  ✓ Node $(node -v)"; else say "  ✗ Node $(node -v) — 需 ≥ 22(nvm install 22 / brew install node)"; fi
else say "  ✗ Node 未安装 — https://nodejs.org 或 nvm install 22"; fi

# 2) ffmpeg
if have ffmpeg && have ffprobe; then say "  ✓ ffmpeg $(ffmpeg -version | head -1 | awk '{print $3}')"
else
  say "  ✗ ffmpeg 未安装 —"
  case "$(uname -s)" in
    Darwin) say "      brew install ffmpeg" ;;
    Linux)  say "      sudo apt-get install -y ffmpeg  (或对应包管理器)" ;;
    *)      say "      安装 ffmpeg 并确保在 PATH" ;;
  esac
fi

# 3) .env
if [ -f .env ]; then say "  ✓ .env 已存在"
else cp .env.example .env; say "  + 已从 .env.example 生成 .env(全可选;按需填 LLM/图库/云 TTS key)"; fi

say ""
say "  TTS 后端(择一即可,出片必需):"
say "    本地英文 Kokoro:  python -m venv ~/.hyperframes-tts-venv 并装依赖(见 docs/tts.md)"
say "    本地中文 CosyVoice: conda env + 仓库 + 下载 CosyVoice2-0.5B(见 docs/tts.md)"
say "    或云(零本地依赖): 在 .env 设 OPENAI_API_KEY 等,WAYCAST_TTS_PROVIDER=openai"
say ""
say "  详细自检 → node engine/doctor.mjs"
say "  全自动出片 → cd engine && node content/make-brand.mjs https://你的官网"
say "─────────────────────────────────────────────────"

# 4) 跑一次能力自检(不阻断 setup)
if have node; then node engine/doctor.mjs || true; fi

# 安装 & 快速上手(Phase 4)

WayCast 是零运行时依赖的 Node 工具(Node ≥ 22 + ffmpeg);TTS 与"内容自动化"按需接后端,**不接任何 key 也能跑**(本地 TTS + 确定性文案/手动配图)。

## 1. 引导

```bash
bash setup.sh           # 检查 Node/ffmpeg、生成 .env、跑能力自检
node engine/doctor.mjs  # 随时看"现在能做什么"(core / TTS / LLM / 选图)
```

## 2. 选后端(都可选,组合自由)

| 能力 | 本地(离线) | 云(BYO-key,.env) |
|---|---|---|
| TTS 配音(出片必需,择一) | Kokoro(英)/ CosyVoice(中) | `WAYCAST_TTS_PROVIDER=openai\|elevenlabs\|azure` + 对应 key |
| 文案 | 确定性骨架(草稿) | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` |
| 选图 | `--reuse-bg` / 手动放图 | `PEXELS_API_KEY` / `UNSPLASH_ACCESS_KEY` |

key 全部写进 `.env`(`cp .env.example .env`,已 gitignore)。本地 TTS 安装见 [docs/tts.md](tts.md)。

## 3. 出片

```bash
cd engine

# A) 全自动:URL → 品牌包(brand/storyboard/vo)→ 看 REVIEW.md 核对
node content/make-brand.mjs https://example.com           # 有图库 key 自动选图
node content/make-brand.mjs https://example.com --reuse-bg wjdigital   # 无 key:借现成背景

# B) 渲染品牌包 → 成片
BRAND=<slug> VO_LANG=en QUALITY=draft node build.mjs       # draft 快;standard 出成片
```

成片在 `output/`(或 `OUTPUT_DIR`)。`node test/smoke.mjs` 秒级自检(不渲染)。

## 安全说明(本地工具)

WayCast 是**单用户本地工具**,不是多租户服务:
- 图形控制台与 MCP server **仅绑 `127.0.0.1`**,不对外。**不要**把它们暴露到不可信网络。
- `scrape` / 自动选图会请求**你提供的 URL**(并跟随跳转),没有内网/元数据地址(如 169.254.169.254)拦截 —— 因为默认假设你只对自己的目标站跑。若要在服务端代他人跑,请自行加 URL 白名单/内网拦截。
- key 只存本地 `.env`(gitignored),只发给你选的 provider,不经第三方。

## 4. 跨平台

- macOS / Linux:直接跑(`brew install ffmpeg` / `apt-get install ffmpeg`)。
- 路径无关:工具靠 `config.mjs` 自动探测 + env 覆盖,临时文件走 `os.tmpdir()`,不依赖 `/tmp` 或固定家目录。
- Windows:核心 Node 逻辑应可跑;`setup.sh` 是 bash(用 WSL / Git Bash),本地模型建议走 WSL 或云 TTS。**未在原生 Windows 实测**。

## 5. 图形控制台(可选,不想敲命令就用它)

```bash
node engine/console/server.mjs      # 或双击 engine/console/start.command(macOS)
# 浏览器开 http://127.0.0.1:4178
```

零依赖本地 web(仅绑 127.0.0.1,不对外)。顶部能力横幅显示"现在能做什么";① 填 URL 生成品牌包(实时日志);② 品牌列表点开 → ③ 编辑 storyboard/vo/brand(改文案)+ 选语言/画质/声线后端/音色 → 渲染出片(实时日志)→ ④ 下载成片。底层复用 make-brand / build CLI(子进程 + SSE),与命令行同一套逻辑。

## 6. Docker(WIP)

`docker-compose.yml` + `Dockerfile.tts` 已备骨架,用于把本地模型打包免装。**镜像尚未构建/验证**(GB 级权重下载待固化)。当前请走本地 Node 或云 provider。

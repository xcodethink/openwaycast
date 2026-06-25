# WayCast

> 贴一个公司官网 URL → 自动生成一条竖屏品牌介绍片(文案 + 真人配音 + 真实城市背景 + 成片)。**开源 · 自托管 · 本地优先,云可选(自带 key)。**
>
> *全自动的"好文案 + 自动配图"需自带 LLM + 图库 key;不接任何 key 也能出片,但文案是英文骨架草稿、背景需手动/借用、暂无中文旁白(见下「后端」)。*

```
公司 URL → 品牌简报(+主色) → 自动文案(中/英) → 选图配图 → 配音 → 渲染 → 成片 mp4
           └──────── 全程零剪辑;每一步都有"无 key 也能跑"的本地/确定性回退 ────────┘
```

竖屏 1080×1920、8 镜机构风(封面 / 我们是谁 / 做什么 / 为何 / 流程 / 领域 / 信念 / CTA),数据驱动的可复用区块库,一套代码多品牌、中英双语。

## 快速开始

### 免 clone(npm)
```bash
npx waycastai doctor                                   # 环境/能力自检
npx waycastai make https://example.com --reuse-bg wjdigital   # URL → 品牌包(落当前目录 ./brands/)
npx waycastai render <slug> --quality draft            # → ./output/*.mp4
npx waycastai console                                  # 或图形控制台 127.0.0.1:4178
```
品牌包/成片落在你当前目录;`npx waycastai help` 看全部命令。需 Node≥22 + ffmpeg + 一个 TTS 后端(本地或云 key)。

### 或 clone 仓库
```bash
bash setup.sh                      # 检查 Node≥22 + ffmpeg,生成 .env,跑能力自检
node engine/doctor.mjs             # 看"现在能做什么"(core / TTS / 文案 / 选图)

cd engine
# 全自动:URL → 品牌包(brand/storyboard/vo + REVIEW.md)
node content/make-brand.mjs https://example.com
#   无图库 key 时借现成背景:--reuse-bg wjdigital
# 渲染成片(draft 快 / standard 出片)
BRAND=<slug> VO_LANG=en QUALITY=draft node build.mjs   # 成片在 output/
```

不想敲命令?**图形控制台**:`node engine/console/server.mjs` → 浏览器开 http://127.0.0.1:4178(填 URL → 编辑文案/选声线 → 渲染 → 下载)。详见 [docs/install.md](docs/install.md)。

## 后端(都可选,本地无 key 即可出片)

| 能力 | 本地(离线) | 云(BYO-key) |
|---|---|---|
| **配音**(出片必需,择一) | Kokoro(英)/ CosyVoice(中,同嗓克隆),Apache-2.0 | OpenAI / ElevenLabs / Azure |
| **文案** | 确定性骨架(草稿) | Anthropic / OpenAI(防杜撰) |
| **选图** | `--reuse-bg` / 手动放图 | Pexels / Unsplash |

key 写进 `.env`(见 [.env.example](.env.example))。本地 TTS 安装 + 切换见 [docs/tts.md](docs/tts.md)。

## 用 AI agent 驱动(Claude Code 等)

WayCast 可被编码 agent 直接驱动 —— 干净 CLI + JSON 产物 + 结构自检。克隆后,你的 agent 读 [`CLAUDE.md`](CLAUDE.md) 即知如何操作。最佳姿势:**agent 自己当 LLM** —— `scrape` 看真实信号 → `node engine/content/catalog.mjs` 查区块字段 → 亲手写 `storyboard.json + vo.json`(防杜撰)→ `build`,零 API key 出最高质量文案。完整 worked example 见 [`docs/agent-usage.md`](docs/agent-usage.md)。

**MCP server**(把出片当工具调,而非跑 CLI):`claude mcp add waycast -- npx waycastai mcp` → Claude Code 里直接 `waycast_scrape / waycast_write_brand / waycast_render` 等 7 个工具。见 [`docs/mcp.md`](docs/mcp.md)。

## 架构

- **区块库 + storyboard**:8 个数据驱动版式区块([engine/blocks/](engine/blocks/))+ 每品牌 `storyboard.json`(选区块 + 填内容);渲染走 hyperframes(锁版本,gsap 用版本锁 CDN)。
- **内容管线**([engine/content/](engine/content/)):`scrape → brief(+取色) → write-script(中英旁白) → 选图`,双模式 + 防杜撰 + 人工确认关。详见 [docs/content-pipeline.md](docs/content-pipeline.md)。
- **TTS 抽象**([engine/tts/](engine/tts/)):provider 可插拔,provider-aware 依赖检查。
- 设计与决策:[docs/decisions/](docs/decisions/)(ADR)。

`node engine/test/smoke.mjs` 秒级结构自检(不渲染)。

## 状态

核心链路(URL→成片)可用;**本地路径已实测**,云/LLM/图库路径为结构化实现(接 key 即用)。Docker 打包本地模型(免装 conda)为 WIP。变更看 [CHANGELOG.md](CHANGELOG.md)。

## 许可

双授权 **MIT OR Apache-2.0**(任选)。本地 TTS 模型(Kokoro / CosyVoice2,均 Apache-2.0)、字体(OFL)、CC-BY 示例背景图(逐张署名)等第三方组件见 [NOTICE](NOTICE)。背景音乐不随仓库分发,自带 CC0 轨。

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。

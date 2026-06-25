# WayCast — 给 AI 协作者的操作手册

> 你(Claude Code / 任意编码 agent)正在一个 WayCast 仓库里。本文件告诉你怎么用它出片。
> WayCast = 贴一个公司官网 URL → 自动产出一条竖屏(1080×1920)品牌介绍片。开源、自托管、本地优先。
> **所有命令在 `engine/` 下跑。** 依赖:Node ≥22 + ffmpeg(`node engine/doctor.mjs` 自检)。零 npm 依赖。

## 心智模型

一条片子 = 一个**品牌包** `engine/brands/<slug>/`:
```
brand.json        品牌级:name/slug/prefix/accent/accent2/mark/bgRGB/bgOpacity/city
storyboard.json   有序 N 镜:每镜 { block, content }(选版式区块 + 填文案)
vo.json           { vo:[N 段英文], vo_zh:[N 段中文] }  旁白,逐镜对应
assets/bg/0N.jpg  每镜一张背景图(N 张)
bg-manifest.json  { images:[{shot,file,credit}] }  逐张署名
```
`BRAND=<slug> VO_LANG=en|zh QUALITY=draft|standard node build.mjs` → 渲染到 `output/*.mp4`。

## 你有两种驱动姿势

### 姿势 A —— 你自己当 LLM(推荐,质量最高,零 API key)
你就是模型,别让 WayCast 再去调云 LLM。流程:
1. `node content/scrape.mjs <url>` → 看公司真实信号(标题/描述/导航/正文)。
2. 据此**你亲自撰写**品牌包(防杜撰:只用站点真实信息,无依据的城市/数字/服务不要编):
   - `node content/catalog.mjs` 查每个区块要哪些 token / 数组字段(权威,实时从 blocks/ 导出)。
   - 写 `brands/<slug>/brand.json`、`storyboard.json`(8 镜典型弧:cover→who→services→why→how→who-it-powers→beliefs→cta)、`vo.json`(中英旁白,逐镜一句自然口语)。
3. 背景图:`--reuse-bg` 不可用(那是 make-brand 的),你自己把 N 张图放进 `assets/bg/0N.jpg` + 写 `bg-manifest.json`;或先借现有品牌的图占位。
4. `BRAND=<slug> VO_LANG=en QUALITY=draft node build.mjs` 出草稿 →(满意)`QUALITY=standard`。
> 参考实现:`engine/test/llm-sim.mjs` 就是"agent 当 LLM 注入文案"的可跑样例(对 Stripe 产出真实服务网格 + 中英旁白)。

### 姿势 B —— 跑现成 CLI(快,但无 LLM key 时文案是骨架草稿)
```
node content/make-brand.mjs <url> [--slug x] [--reuse-bg <已有brand>] [--force]
```
无 LLM key → 确定性骨架(英文草稿、services 取自导航可能含噪声、无中文);有 `ANTHROPIC_API_KEY`(`.env`)→ 自动好文案。产出后看 `brands/<slug>/REVIEW.md` 核对,再 `build.mjs`。

## 铁律 / 坑(务必遵守)

- **防杜撰**:文案只用站点实有信息;不确定的(城市/营收/服务)留空,别编。这是产品底线。
- **content 不写注入 token**:`ACCENT/ACCENT2/BG/BRAND_MARK/BRAND_NAME/ID/SEQ` 由 build 注入。catalog 列的才是你要填的。文本可含 `<br> <em> <i>`。
- **vo.json 段数必须 == 镜数**;中文出片(`VO_LANG=zh`)要求 `vo_zh` 非空,否则 build 明确报错。骨架模式不产中文。
- **背景图 N 张对应 N 镜** + manifest 每张 `credit`。缺图 build 会拦。
- **覆盖保护**:make-brand 不覆盖已存在品牌,需 `--slug` 换名或 `--force`。
- **画质**:`draft` 快(freeze 自检不准);**正式片必须 `standard`**,看"静止段自检 ✓ 无"。
- **TTS**:默认本地(英 Kokoro / 中 CosyVoice,见 `docs/tts.md`);或 `.env` 设云 key + `WAYCAST_TTS_PROVIDER`。`node doctor.mjs` 看哪条可用。
- **别提交 `.env` / key**(已 gitignore)。

## 自检 / 常用命令(都在 engine/ 下)

```
node doctor.mjs              # 能力矩阵:core / 各 TTS provider / LLM / 选图 现在能不能用
node test/smoke.mjs          # 秒级结构自检(不渲染),改动后跑一遍,应 0 失败
node content/scrape.mjs <url>        # URL → 信号(你撰文案前先看)
node content/catalog.mjs [--json]    # 区块内容契约(写 storyboard 前查)
node console/server.mjs              # 本地 web 控制台(给人用;127.0.0.1:4178)
```

## MCP(可选)

仓库自带 MCP server(`engine/mcp/server.mjs`,零依赖 stdio)。注册后(`claude mcp add waycast -- npx waycastai mcp`)可把上面的流程当工具调:`waycast_scrape / waycast_catalog / waycast_write_brand / waycast_make_brand / waycast_render / waycast_doctor / waycast_list_brands`。与直接跑 CLI 等价,见 `docs/mcp.md`。

## 想深入

`docs/agent-usage.md`(本手册的展开 + 完整 worked example)· `docs/storyboard-schema.md`(区块字段)· `docs/content-pipeline.md` · `docs/tts.md` · `docs/install.md` · `README.md`。
路线:`roadmap.yaml`;变更:`CHANGELOG.md`。

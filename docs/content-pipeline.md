# 内容自动化流水线(Phase 2)

把一个公司官网 URL 变成可渲染的品牌片包,再交引擎出片。全程零运行时依赖(Node 内置 fetch + ffmpeg),LLM 可选(BYO-key,无 key 有确定性回退)。

```
URL ─▶ scrape ─▶ signals ─▶ extract-brief ─▶ brief.json
                              (+ color → accent)
brief ─▶ write-script ─▶ storyboard.json + vo.json
make-brand = scrape→brief→write-script→组装 brands/<slug>/{brand,storyboard,vo}.json + REVIEW.md
                              ▼
        BRAND=<slug> node build.mjs ─▶ 成片 mp4
```

## 一条命令:URL → 品牌包

```bash
cd engine
node content/make-brand.mjs https://example.com [--slug x] [--provider anthropic|openai] [--reuse-bg <brand>] [--shots N] [--force]
```

产出 `brands/<slug>/`:`brand.json`(name/accent/city…)、`storyboard.json`(N 镜=区块+内容)、`vo.json`(中英旁白)、`REVIEW.md`(人工确认关)。

然后补背景图(见下)→ `BRAND=<slug> VO_LANG=en node build.mjs` 出片。

## 双模式

| 模块 | 有 LLM key | 无 key(确定性回退) |
|---|---|---|
| extract-brief | 语义抽取全字段 | 启发式(name/tagline/contact/accent 可靠;services=导航候选入 unknowns) |
| write-script | 选区块+填内容+**中英旁白**,8 镜叙事弧 | 固定 6 镜骨架,EN 旁白模板化,**ZH 留空待补**,文案=草稿 |

key 来源:`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`,或 `--provider` + `WAYCAST_LLM_PROVIDER`/`WAYCAST_LLM_MODEL`。默认 anthropic=`claude-sonnet-4-6`。

## 防杜撰(铁律)

- 只用 brief 事实;LLM prompt 明令不得臆造服务/数字/城市/联系方式,缺则留空。
- write-script 对每镜做 `fillBlock` 干跑校验:区块必须存在、所有 token 必须有内容(零残留),vo 段数必须等于镜数 —— 不合格直接抛错,不出坏片。
- `REVIEW.md` 列出所有 `unknowns` + 注记 + accent 置信度,渲染前人工确认。

## 区块目录(catalog)

`write-script` 启动时扫 `blocks/*.html`,自动提取每个区块的内容结构(标量 token + ITEMS 数组字段),同时驱动 LLM prompt 和产出校验。新增/改区块无需改文案代码。

## 背景图(2.3 自动选图)

`make-brand` 按以下优先级配背景图:
1. **`--reuse-bg <已有brand>`**:复用现有品牌的城市图(开发/占位)。
2. **自动选图**(有图库 key 时,默认):从 brief.city 派生检索词(`<城市> skyline night / skyscraper / business district …`;无城市则通用商务),向 Pexels/Unsplash 取竖图 → 每镜不同 → ffmpeg 裁切 `1080x1920`(cover)+ 锐化 + 增对比 → `assets/bg/0N.jpg`,并把每张署名写入 `bg-manifest.json`。
3. **手动**:放 `brands/<slug>/assets/bg/0N.jpg`(N=镜数)+ 写 `bg-manifest.json`(每张含 `credit`)。

图库 key:`PEXELS_API_KEY` 或 `UNSPLASH_ACCESS_KEY`(均免费申请);`--provider pexels|unsplash` 或 `WAYCAST_IMAGE_PROVIDER` 指定。Unsplash 会尽力回调 download 端点(API 合规)。压暗 scrim 仍由 build.mjs 渲染期叠加,故选图只需清晰主体。

## 已验证

`make-brand https://wjdigital.ai --reuse-bg wjdigital`(无 key,骨架模式)→ 6 镜品牌包 → 引擎渲染 **freeze=0**,打通 URL→成片。LLM 模式结构化测试覆盖(注入式),线上质量待有 key 时验。

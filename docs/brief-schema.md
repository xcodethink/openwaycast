# brand-brief schema (Phase 2.1)

`brief.json` 是"内容自动化"管线的第一产物:由公司官网 URL 抽取的**结构化品牌简报**,作为下游(文案生成 / 选图 / 套模板)的统一输入。

产出方式:`node engine/content/brief.mjs <url>` —— 内部 `scrape → 主色 → 抽取`。

## 双模式

| 模式 | 触发 | 质量 | 字段覆盖 |
|---|---|---|---|
| **LLM** | 有 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`(或 `--provider`) | 高 | 全字段,含 services/selling_points/city |
| **heuristic** | 无 key(或 LLM 调用失败回退) | 中(确定性) | name/tagline/one_liner/contact/accent 可靠;services 为导航候选;city/selling_points 多留空待补 |

环境变量:`WAYCAST_LLM_PROVIDER`(anthropic|openai)、`WAYCAST_LLM_MODEL`(默认 anthropic=`claude-sonnet-4-6` / openai=`gpt-4o-mini`)。

## 字段

```jsonc
{
  "source_url": "https://wjdigital.ai",       // 用户输入
  "final_url":  "https://wjdigital.ai/",       // 跟随跳转后的真实 URL
  "fetched_at": "2026-06-18T04:01:57.796Z",    // ISO 时间戳

  "name":       "WJ DIGITAL",                  // 品牌名
  "tagline":    "AI that makes software feel unnecessary",  // 短标语(<=80 字符,取自站点)
  "city":       null,                          // 总部城市;仅在站点明确陈述时填,否则 null(不臆造)
  "one_liner":  "WJ DIGITAL builds AI systems that …",      // 一句话业务描述

  "services":        ["Vision", "What we build", "Focus areas"],  // 服务/聚焦领域(<=8)
  "selling_points":  [],                       // 差异化卖点(<=5;heuristic 下常为空)

  "contact": {
    "email":   "service@wjdigital.ai",         // 首个 mailto / 正文邮箱
    "phone":   null,                           // 首个 tel
    "website": "wjdigital.ai",                 // final_url 主机名(去 www)
    "socials": []                              // 社媒链接
  },

  "accent":            "#83e266",              // 品牌主色(可能为 null)
  "accent_source":     "image:favicon-150x150.png",  // theme-color | image:<file> | none
  "accent_confidence": "low",                  // high(theme-color meta) | low(图片猜测) | none

  "extraction": {
    "mode":     "heuristic",                   // heuristic | llm
    "provider": null,                          // anthropic | openai | null
    "model":    null,
    "unknowns": ["city", "selling_points", "tagline_polish", "services"],  // 抽取器自报"没把握/缺失"的字段 → 人工确认关处理(heuristic 下 services 总在此列:导航候选未经证实)
    "notes":    ["…"]                          // 人类可读说明(如回退原因)
  }
}
```

## 防杜撰约定(铁律)

- 只用源中存在的信息;字段无依据则 `null` / `[]`,**绝不臆造**服务、城市、联系方式或宣传语。
- 不确定 → 进 `extraction.unknowns`,交人工确认关(Phase 2.2 文案前)处理。
- `accent_confidence != high` 时,主色仅为建议,下游应允许用户覆盖;`none` 时用模板默认色。

## 已知边界(heuristic 模式)

- **city**:仅认 "based in / located in / headquartered in" 等可靠模式;多数站点 → null(LLM 模式可从描述推断)。
- **services**:取自导航(已过滤 Home/Blog/Privacy 等样板与品牌名),可能含非服务项;**heuristic 下一律列入 `unknowns`**(未经站点证实);LLM 模式按语义提取。
- **selling_points / 文案精炼**:需 LLM 或人工。
- **accent**:仅 raster 图(PNG/JPG/WEBP/GIF)参与取色;**纯 SVG logo 且无 theme-color → accent=null**(用模板默认色,待用户填)。

## 抽取器输出键约定

- LLM 路径返回 `_unknowns`;heuristic 返回 `extraction_unknowns`。两者都被 `finalize()` 归一到顶层 `extraction.unknowns`,下游只读后者。

## 下游(后续 Phase)

`brief.json` → [2.2 文案] 生成 8 镜脚本 + 中英旁白(防杜撰 + 人工确认)→ [2.3 选图] 按 services/city 选城市/商务背景图 → [套模板] 填 storyboard + brand.json(accent 来自此处)。

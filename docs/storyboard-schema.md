# Storyboard / 区块 schema

一个品牌片 = **品牌级配置(brand.json)** + **storyboard(有序区块列表)** + **vo.json(旁白)** + **assets/bg + bg-manifest**。

## brand.json(品牌级)
```jsonc
{
  "name": "WJ DIGITAL", "slug": "wjdigital", "prefix": "WJDIGITAL",
  "accent": "#ff8a00",          // 品牌色 → 注入 --accent(区块内所有强调色走 var(--accent)/color-mix)
  "bgRGB": [5,6,8],              // 底色 → 注入 {{BG}}=rgb(...)
  "mark": "◆",                   // 页脚品牌符号
  "bgOpacity": 0.42
}
```

## storyboard(有序 N 镜;每镜选一个区块 + 填内容)
```jsonc
{
  "shots": [
    { "block": "cover", "content": { "META_L":"WJ DIGITAL","META_R":"KUALA LUMPUR",
        "WORD":"WJ DIGITAL","SUB":"AI · KUALA LUMPUR","KICKER":"OUR THESIS",
        "HERO":"NOT BETTER<br>SOFTWARE.","TAG":"...<em>unnecessary</em>." } },
    // ... 中间区块 ...
    { "block": "cta", "content": { "Q":"...","CSUB":"...","BTN":"...","DISC":"..." } }
  ]
}
```
- 镜数不固定(8 是当前默认);`SEQ`(0N/总数)、`ID`(shotN,按镜唯一)、`ACCENT`/`BG`/`BRAND_MARK`/`BRAND_NAME` 由 build 注入,不写在 content 里。
- content 里可用 `<br>` `<em>`。

## 区块库(blocks/*.html)
模板用 `{{TOKEN}}` 标量占位 + `var(--accent)` 上色;列表型区块的可变条目由 build 按 content 数组生成(1.2b)。

> 权威来源:`node engine/content/catalog.mjs [--json]` 实时从 blocks/ 导出每镜 content 契约(不会跟代码漂移)。下表为速查。

| 区块 | 用途 | 标量 token | 数组(条目字段) |
|---|---|---|---|
| cover | 封面 logo 锁定+主张 | META_L, META_R, WORD, SUB, KICKER, HERO, TAG | — |
| cta | 封底 CTA | META_L, META_R, WORD, Q, CSUB, BTN, DISC | — |
| statement-list | 社论标题+N条清单 | META_L, META_R, KICKER, HEAD, FOOT | LIST: [{ lk, lv }] |
| editorial-facts | 社论+双大数字 | META_L, META_R, KICKER, HEAD, BODY | FACTS: [{ fn, fl }] |
| layer-stack | N层架构堆叠 | META_L, META_R, LABEL, FLOW | LAYERS: [{ cls, lnum, lname, ldesc, ltag }] |
| grid | N瓷砖网格(2列) | META_L, META_R, LABEL | TILES: [{ tn, th, td }] |
| flow | N步箭头流(末步高亮) | META_L, META_R, LABEL | STEPS: [{ cls, snum, sname, sdesc }] |
| manifesto | N条价值观 | META_L, META_R, LABEL | ITEMS: [{ bh, bd }] |

条目里的小写字段为可选(缺则留空);`cls` 用于高亮态(如 flow 末步 `"done"`、layer-stack 首层 `"hi"`)。

## 状态
- 1.2a:机制(填充+--accent+按镜唯一id+渲染)已验证(cover/cta);见 `engine/test/block-render-test.mjs`。
- 1.2b:补齐其余 6 个列表型区块(含可变条目渲染)。
- 1.2c/d:WJ/HT 改写成 storyboard + 逐帧对等验证。

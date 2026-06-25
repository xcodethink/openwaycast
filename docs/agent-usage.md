# 用 Claude Code(或任意编码 agent)驱动 WayCast

WayCast 设计成可被 agent 直接驱动:干净 CLI、JSON 产物、结构自检。本文给出完整 worked example。
（速览见仓库根 [`CLAUDE.md`](../CLAUDE.md)。所有命令在 `engine/` 下。）

## 两种姿势

| | 姿势 A:你当 LLM(推荐) | 姿势 B:跑 make-brand CLI |
|---|---|---|
| 文案来源 | **你亲手写**(质量最高,零 API key) | 无 key=骨架草稿;有 `ANTHROPIC_API_KEY`=自动好文案 |
| 适合 | 被 Claude Code 等 agent 驱动 | 一条命令快速出包 / 无人值守 |

被 agent 驱动时优先**姿势 A**:你本来就是模型,不必让 WayCast 再去调云 LLM。

## Worked example(姿势 A:为 https://example-co.com 出片)

### 1. 看真实信号(别凭空想)
```bash
cd engine
node content/scrape.mjs https://example-co.com
```
读它的 title / description / og / headings / nav / text —— 这是你撰文案的**唯一事实来源**。无依据的城市、数字、服务**不要编**(防杜撰是产品底线)。

### 2. 查区块内容契约
```bash
node content/catalog.mjs            # 人读;--json 机器读
```
得到每个区块要哪些标量 token + 哪些数组字段。例如 `grid` 要 `META_L,META_R,LABEL` + `TILES:[{tn,th,td}]`。
`ACCENT/BG/BRAND_MARK/BRAND_NAME/ID/SEQ` 由 build 注入,**别**写进 content。文本可含 `<br> <em> <i>`。

### 3. 亲手写品牌包到 `engine/brands/<slug>/`
`brand.json`:
```json
{ "name":"Example Co","slug":"example-co","prefix":"EXAMPLE_CO",
  "city":null,"accent":"#2b6cff","accent2":"#2b6cff","mark":"◆","bgRGB":[5,6,8],"bgOpacity":0.42 }
```
`storyboard.json`(典型 8 镜弧;每镜选区块 + 填 content):
```json
{ "shots":[
  { "block":"cover","content":{ "META_L":"EXAMPLE CO","META_R":"PAYMENTS","WORD":"EXAMPLE CO",
      "SUB":"WHAT THEY ACTUALLY DO","KICKER":"OUR MISSION","HERO":"A REAL<br>HEADLINE.","TAG":"Their <em>real</em> tagline." } },
  { "block":"grid","content":{ "META_L":"WHAT WE DO","META_R":"N AREAS","LABEL":"...",
      "TILES":[ {"tn":"01","th":"Real service","td":"Short, true description"} ] } }
] }
```
`vo.json`(中英旁白,逐镜一句自然口语,段数 == 镜数):
```json
{ "vo":["English line for shot 1.", "..."], "vo_zh":["镜 1 中文旁白。", "..."] }
```
> 可跑参考:`engine/test/llm-sim.mjs` —— 一个把"agent 撰写的 Stripe 中英文案"注入管线的完整样例,对 Stripe 产出真实服务网格 + 双语旁白。

### 4. 背景图
每镜一张 `assets/bg/0N.jpg`(N=镜数)+ `bg-manifest.json`(逐张 `credit`)。
有 `PEXELS_API_KEY`/`UNSPLASH_ACCESS_KEY` 可让 WayCast 自动取(`make-brand` 路径);否则你手动放图,或先借现有品牌的图占位:
```bash
mkdir -p brands/example-co/assets/bg
cp brands/wjdigital/assets/bg/0{1..8}.jpg brands/example-co/assets/bg/   # 占位
cp brands/wjdigital/bg-manifest.json brands/example-co/bg-manifest.json # 记得后续换成真实来源+署名
```

### 5. 渲染 + 验收
```bash
BRAND=example-co VO_LANG=en QUALITY=draft node build.mjs      # 草稿快看
BRAND=example-co VO_LANG=en QUALITY=standard node build.mjs   # 正式片:必须看到"静止段自检 ✓ 无"
```
成片在 `output/`。抽帧自检(肉眼看文案/版式):`ffmpeg -ss 5 -i output/<file>.mp4 -frames:v 1 /tmp/f.png`。
中文片:`VO_LANG=zh`(需 `vo_zh` 非空 + CosyVoice 可用,见 `docs/tts.md`)。

## 姿势 B(一条命令)
```bash
node content/make-brand.mjs https://example-co.com --slug example-co --reuse-bg wjdigital
# 看 brands/example-co/REVIEW.md 核对(unknowns / accent 置信度)→ 改 storyboard/vo →
BRAND=example-co VO_LANG=en node build.mjs
```

## 给人用的图形控制台
```bash
node console/server.mjs    # http://127.0.0.1:4178:填 URL → 编辑 → 渲染 → 下载
```

## 自检
`node doctor.mjs`(能力矩阵)· `node test/smoke.mjs`(秒级结构自检,改动后应 0 失败)。

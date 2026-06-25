# ADR-0002 · 素材与模型授权核实(开源分发"生死门")

- 状态:已接受(Phase 0 核实)
- 日期:2026-06-17

## 问题
开源产品**捆绑/再分发**的每一项资产,必须授权允许"商用 + 再分发"。逐项核实:

| 资产 | 授权 | 商用 | 再分发/捆绑 | 结论 |
|---|---|---|---|---|
| **Kokoro-82M**(英文 TTS,含 am_michael 声) | **Apache-2.0** | ✅ | ✅ | 可捆(NOTICE 署名) |
| **CosyVoice2-0.5B**(中文 TTS,代码+权重) | **Apache-2.0** | ✅ | ✅ | 可捆(NOTICE 署名) |
| hyperframes(渲染) | 用其 CLI(npx),锁 0.6.109 | — | 不捆,运行时取 | OK |
| gsap 3.14.2 | 标准 license(免费版) | ✅ | 本地化捆在产物 | 复核其再分发条款,必要时换 license |
| Oswald / Noto Sans SC / JetBrains Mono | **OFL / Apache** | ✅ | ✅ | 可捆(附 license) |
| `epic-trailer.mp3`(配乐) | **Pixabay Content License** | ✅商用 | ⚠️**再分发是灰区**(禁止"as-is"单独再分发) | **不可直接捆 → Phase 6 换 CC0 曲** |
| 城市背景图 | CC0 / CC-BY(Wikimedia) | ✅ | CC-BY 需署名 | **不捆;改 BYO-key 图库 + 少量 CC0 示例** |

## 核实来源
- Kokoro:huggingface.co/hexgrad/Kokoro-82M —— "Apache-licensed weights ... deployed in ... commercial APIs"。
- CosyVoice:github.com/FunAudioLLM/CosyVoice(代码 Apache-2.0)+ huggingface.co/FunAudioLLM/CosyVoice2-0.5B 模型卡 "License: apache-2.0"。

## 决策
1. **本地 TTS 可随产品分发** → "捆绑本地模型 + Docker" 方案成立(生死门通过)。
2. NOTICE 文件列出 Kokoro / CosyVoice / 字体 的版权与 Apache 要求的声明。
3. **音乐**:Phase 6 前换成明确 **CC0** 曲(不可捆 Pixabay)。
4. **图片**:不捆需署名图;BYO-key 图库自动 + 仓库少量 CC0 示例;CC-BY 自动带 credits(给用户用)。
5. **gsap**:复核免费版再分发条款(Phase 6);如不允许捆,改 CDN 可选或换等价 MIT 动画库。

## 待复核(Phase 6 Pre-publish)
- gsap 免费版再分发细则
- 各模型 NOTICE/版权声明逐字
- Qwen 基座(CosyVoice2 派生)是否带额外条款

## Phase 6 决议(2026-06-18,用户拍板)
- **音乐 → 移除 + BYO CC0**:Pixabay `epic-trailer.mp3` 已 `git rm`;引擎音乐改为可选(`MUSIC` env / `template/assets/audio/bgm.mp3`,无则无 bgm 出片),与非免费曲完全解耦。仓库不带默认曲。`.gitignore` 挡 `template/assets/audio/*.mp3` 防误加(要捆 CC0 曲需 `git add -f`)。
- **城市背景图 → 保留捆绑(CC-BY + 署名)**:ADR-0002 原"不捆"收敛为"**捆绑 CC-BY 示例 + 逐张署名**"。CC-BY 明确允许"带署名再分发";`brands/*/assets/bg/*.jpg` 每张在该品牌 `bg-manifest.json` 有 credit(CC BY 2.0/3.0/4.0)。用户自有品牌走图库 key / 自备图。NOTICE 已据此更新。
- **样本品牌**(2026-06-25 修订):`wjdigital`(本项目自有品牌)保留;另一个样本(原为某真实第三方公司的公开信息)已替换为**虚构占位品牌** `northwind`(域 `northwind.example`,RFC 2606 保留)。原则:公开仓库的 bundled examples 一律用占位符,不捆绑真实第三方品牌的名称/域名/社交账号作为 demo 资产,即便是公开信息。背景图为通用城市素材沿用(CC-BY 逐张署名不变)。
- gsap(RRG 2026-06-21 闭合):**不再分发** `vendor/gsap.min.js`(已 git rm);渲染期由 hyperframes 抓取版本锁定的 CDN 构建(`cdn.jsdelivr.net/npm/gsap@3.14.2`)并内联。规避再分发许可疑问;渲染本就联网(npx hyperframes)无新增约束。用户可自放 `engine/vendor/gsap.min.js` 走离线。已重渲 standard 验证(freeze=0,动画正常)。

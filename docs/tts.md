# TTS 抽象层(Phase 3)

配音从 build.mjs 抽到 `engine/tts/synth.mjs`,可插拔后端:**本地**(离线、随产品分发)或**云**(BYO-key)。统一接口产出每段 raw 音频,WARM EQ + 44.1k 重采样仍由 build.mjs 后处理(provider 无关)。

## Provider

| provider | 类型 | 语言 | 凭据 / 依赖 | 默认音色 |
|---|---|---|---|---|
| `kokoro` | 本地 | 英(en 默认) | `~/.hyperframes-tts-venv`(Apache-2.0) | am_michael |
| `cosyvoice` | 本地 | 中(zh 默认,同嗓克隆) | conda env `cosyvoice` + 仓库 + 模型(Apache-2.0) | brand-michael-prompt |
| `openai` | 云 | 多语 | `OPENAI_API_KEY` | onyx · tts-1 |
| `elevenlabs` | 云 | 多语 | `ELEVENLABS_API_KEY`(`ELEVENLABS_VOICE_ID`) | Adam · eleven_multilingual_v2 |
| `azure` | 云 | 多语 | `AZURE_TTS_KEY` + `AZURE_TTS_REGION` | en-US-GuyNeural / zh-CN-YunyangNeural |

## 选择

默认**本地按语言**:`zh → cosyvoice`,其余 `→ kokoro`。覆盖:

```bash
WAYCAST_TTS_PROVIDER=openai BRAND=acme VO_LANG=en node build.mjs      # 切云
WAYCAST_TTS_VOICE=nova  WAYCAST_TTS_MODEL=tts-1  ...                  # 覆盖音色/模型
VO_VOICE=am_adam ...                                                  # kokoro 音色
```

build.mjs 启动时按所选 provider 做 **provider-aware 依赖检查**:本地缺 venv/模型、或云缺 key,都会在出片前清晰报错(不会跑到一半才挂)。`node doctor.mjs` 看本地依赖。

## 接口(供 GUI / 程序化复用)

```js
import { synthesizeVO, resolveTTSProvider, ttsBlockers, isCloudTTS } from './tts/synth.mjs';
const provider = resolveTTSProvider({ lang });                 // 或显式传 provider
const miss = ttsBlockers(provider, cfg);                       // [] = 可用
const rawPaths = await synthesizeVO({ lines, lang, provider, rawDir, cfg, hf, voice, model, log });
```

`opts.synth` 可注入假适配器(测试用,免模型/网络)。

## 授权

本地 Kokoro-82M + CosyVoice2-0.5B(代码+权重)均 **Apache-2.0**,可随产品分发、可商用(见 ADR-0002)。云后端用用户自己的 key,音频归用户。

## Docker(3.4,WIP)

本地模型的 conda/venv 复现对普通用户很重,计划用 Docker 封装(`Dockerfile.tts`,见仓库根)。**该镜像尚未构建/验证** —— 当前用户仍需本机装 venv/conda,或改用云 provider(零本地依赖)。

# ADR-0001 · Phase 0 立项决策

- 状态:已接受
- 日期:2026-06-17

## 背景
将一套内部生产级品牌片引擎(私有项目)产品化为开源工具,供所有人自托管使用。

## 决策
1. **命名**:显示名 **WayCast**;仓库/包名 **`waycastai`**。
   - 因 `waycast` 在 npm 已占用、GitHub org 已占、且语义撞 "Wayland cast"(18 个投屏工具仓库)。`waycastai` 全平台空闲(npm/PyPI/GitHub),且统一 `wayjetai` 命名家族。显示名 ≠ 包名是常见做法。
2. **License**:**双授权 MIT OR Apache-2.0**(用户任选),传播最广 + 专利保护兼得。
3. **v1 范围**:CLI + 本地 Web GUI **一起发**。
4. **TTS**:**双后端可插拔**。本地 = Kokoro(英)/CosyVoice(中,同嗓克隆);云 = ElevenLabs/OpenAI/Azure adapter(用户自带 key)。本地模型经 Docker 封装分发。
5. **图片**:双模式 = BYO-key 图库(Pexels/Unsplash)自动 + 用户手动丢图;仓库只捆少量 CC0 示例,不捆需署名/限商用图。
6. **不做**:SaaS/多租户/计费/托管渲染(自托管开源工具,非云服务);数字人;通用视频编辑器。

## 理由
目标是"人人可用的开源产品"→ 最大灵活度(本地/云、自动/手动都支持)+ 移植性优先(Docker)+ 授权清白(可捆素材必须 Apache/OFL/CC0)。

## 影响
对话数预估 16–18(完整路线)。分阶段推进,逐 phase 闭环。

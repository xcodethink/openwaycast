# Changelog

All notable changes to WayCast are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/); versioning: [SemVer](https://semver.org/).

## [0.1.1] — 2026-06-25

Pre-alpha hardening. No user-facing pipeline changes.

### Changed
- Bundled sample brand genericized to a fictional placeholder (`northwind`, `northwind.example`); the public repo no longer ships any real third-party company's brand/domain/socials as a demo asset. The maintainer's own brand sample is retained.
- Local CosyVoice (ZH TTS) default repo path is now a neutral `~/CosyVoice`; point `COSYVOICE_REPO` at your clone if it lives elsewhere.

### Fixed
- `.env` is now actually loaded (zero-dep loader): it was documented in `.env.example` but never read, so BYO-key / path settings placed there had no effect. Real shell environment variables still take precedence; `~` is expanded; the working dir's `.env` wins over the repo's.

## [0.1.0] — 2026-06-24

First public pre-alpha.

### Added
- URL → brand package → vertical 1080×1920 MP4 pipeline: scrape → brief (+brand color) → script (EN/ZH copy) → city images → local TTS → retime → render.
- Reusable 8-shot block library (data-driven storyboard); bilingual English / 简体中文.
- Pluggable TTS provider layer: local Kokoro (EN) / CosyVoice (ZH same-voice clone); cloud OpenAI / ElevenLabs / Azure (BYO-key).
- Content automation: deterministic keyless fallback + optional LLM (Anthropic/OpenAI), with anti-fabrication.
- Agent-native usage: `CLAUDE.md` / `AGENTS.md` + block-catalog CLI; MCP server (7 tools); `npx waycastai` CLI; local web console.
- Auto image selection (Pexels / Unsplash, BYO-key) with attribution.

### Known limitations (pre-alpha)
- Cloud LLM/TTS/image adapters are implemented but not yet verified live.
- One-click Docker image for local models is a work in progress.
- Windows is untested (use WSL).

[0.1.1]: https://github.com/xcodethink/openwaycast/releases/tag/v0.1.1
[0.1.0]: https://github.com/xcodethink/openwaycast/releases/tag/v0.1.0

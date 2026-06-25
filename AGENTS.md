# AGENTS.md

WayCast 的 AI 协作者操作手册在 **[`CLAUDE.md`](CLAUDE.md)**(读它)。

三句话起步:
1. 所有命令在 `engine/` 下;先 `node engine/doctor.mjs` 看环境能做什么。
2. 出片 = 造一个品牌包 `engine/brands/<slug>/{brand,storyboard,vo}.json + assets/bg` → `BRAND=<slug> node engine/build.mjs`。
3. 你自己就是 LLM:`scrape` 看真实信号 → `catalog` 查区块字段 → 亲手写 storyboard/vo(防杜撰)→ build。详见 `docs/agent-usage.md`。

# MCP server —— 把 WayCast 当工具调

WayCast 自带一个 **MCP server**(stdio,零依赖手写),让 Claude Code / Claude Desktop 等把出片流程当工具调用,而不只是跑 CLI。

## 注册

**Claude Code:**
```bash
# 装了 npm 包后:
claude mcp add waycast -- npx waycastai mcp
# 或克隆仓库本地跑:
claude mcp add waycast -- node /abs/path/to/waycastai/engine/mcp/server.mjs
claude mcp list      # 应显示 waycast: Connected
```

**Claude Desktop / 其他**(JSON 配置):
```json
{
  "mcpServers": {
    "waycast": { "command": "npx", "args": ["waycastai", "mcp"] }
  }
}
```

key(可选,LLM/图库/云 TTS)放进 `.env` 或注册时用 `--env`。品牌包/成片落在 server 进程的工作目录(`WAYCAST_HOME`,默认 cwd)。

## 工具(7 个)

| 工具 | 作用 | 只读 |
|---|---|---|
| `waycast_doctor` | 能力自检(core / TTS / LLM / 选图 / 目录) | ✓ |
| `waycast_catalog` | 区块内容契约(写 storyboard 前查字段) | ✓ |
| `waycast_scrape` | 抓公司官网 → 客观信号(撰文案的事实来源) | ✓ |
| `waycast_list_brands` | 列已有品牌包 | ✓ |
| `waycast_write_brand` | **你当 LLM 首选**:直接写完整品牌包(brand/storyboard/vo),每镜 fillBlock 校验 | |
| `waycast_make_brand` | 一条龙 URL→品牌包(无 key 骨架 / 有 key LLM;reuseBg 借图) | |
| `waycast_render` | 渲染品牌包 → mp4(quality=standard 出成片 + 静止段自检) | |

## 典型用法(Claude Code 里一句话)

> "用 WayCast 给 https://某公司.com 做条品牌片"

agent 会:`waycast_scrape` 看事实 → `waycast_catalog` 查字段 → **`waycast_write_brand`** 亲手写中英文案(防杜撰)→(借图)`waycast_make_brand reuseBg` 或手动补 `assets/bg` → `waycast_render standard` → 拿到 mp4 路径。

这与"在 Claude Code 里跑 CLI"等价,只是把每步包成了结构化工具调用 + 返回 `structuredContent`。详细姿势同 [agent-usage.md](agent-usage.md)。

## 说明

- 协议:MCP `2024-11-05`,stdio 传输,JSON-RPC 2.0(tools-only)。零额外依赖。
- `waycast_render` 是长任务(分钟级);MCP 客户端会等待,完成返回成片路径 + 是否无静止段。
- 中文渲染需品牌包含 `vo_zh` + 本地 CosyVoice 或云 TTS(见 [tts.md](tts.md))。

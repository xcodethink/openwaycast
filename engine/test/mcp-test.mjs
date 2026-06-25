// mcp-test.mjs —— MCP server 集成自检(spawn + JSON-RPC 往返)。用: node test/mcp-test.mjs
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const ENG = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ch = spawn(process.execPath, [path.join(ENG, 'mcp', 'server.mjs')]);
let buf = '', fail = 0; const got = {};
const ok = (c, m) => { if (!c) { fail++; console.log('  ✗ ' + m); } else console.log('  ✓ ' + m); };
ch.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) try { const m = JSON.parse(l); if (m.id != null) got[m.id] = m; } catch {} } });

const msgs = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'waycast_catalog', arguments: {} } },
  { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'waycast_doctor', arguments: {} } },
  { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope', arguments: {} } },
];
console.log('=== MCP server 自检 ===');
setTimeout(() => msgs.forEach(m => ch.stdin.write(JSON.stringify(m) + '\n')), 300);
setTimeout(() => {
  ch.kill();
  ok(got[1]?.result?.serverInfo?.name === 'waycast', 'initialize → serverInfo.name=waycast');
  ok(got[1]?.result?.capabilities?.tools, 'initialize → capabilities.tools');
  const tools = got[2]?.result?.tools || [];
  ok(tools.length === 7, `tools/list → 7 工具(实 ${tools.length})`);
  ok(['waycast_scrape', 'waycast_write_brand', 'waycast_render'].every(n => tools.some(t => t.name === n)), 'tools/list → 含 scrape/write_brand/render');
  ok(tools.every(t => t.inputSchema && t.inputSchema.type === 'object'), 'tools/list → 每个工具有 object inputSchema');
  ok(/grid/.test(got[3]?.result?.content?.[0]?.text || '') && !got[3]?.result?.isError, 'tools/call catalog → 返回区块');
  ok(got[4]?.result?.structuredContent?.coreOk != null, 'tools/call doctor → structuredContent.coreOk');
  ok(got[5]?.result?.isError === true, 'tools/call 未知工具 → isError');
  console.log(`\n=== ${fail ? fail + ' 失败' : '全部通过'} ===`);
  process.exit(fail ? 1 : 0);
}, 2500);

// catalog.mjs —— 打印区块库的内容契约(每个区块要哪些标量 token + 哪些 ITEMS 数组及其字段)。
// 给"自己当 LLM"手写 storyboard.json 的 agent 查:权威来源 = 实时扫 blocks/,不会跟代码漂移。
// 用: node content/catalog.mjs        人类可读
//     node content/catalog.mjs --json  机器可读(agent 用这个)
import { blockCatalog } from './write-script.mjs';

const cat = blockCatalog();
if (process.argv.includes('--json')) { console.log(JSON.stringify(cat, null, 2)); process.exit(0); }

console.log('WayCast 区块内容契约(写 storyboard.json 每镜 content 用)\n' + '─'.repeat(56));
console.log('注:ACCENT/ACCENT2/BG/BRAND_MARK/BRAND_NAME/ID/SEQ 由 build 注入,勿写进 content。');
console.log('   文本值可含 <br> <em> <i>。ITEMS 数组里的小写字段为可选(缺则留空)。\n');
for (const [name, spec] of Object.entries(cat)) {
  const items = Object.entries(spec.items).map(([k, fs]) => `${k}: [ { ${fs.join(', ')} }, ... ]`);
  console.log(`■ ${name}`);
  console.log(`    标量: ${spec.scalars.join(', ') || '(无)'}`);
  if (items.length) console.log(`    数组: ${items.join('  |  ')}`);
  console.log('');
}
console.log('示例一镜:  { "block": "grid", "content": { "META_L":"WHAT WE DO","META_R":"6 AREAS",');
console.log('             "LABEL":"...","TILES":[ {"tn":"01","th":"Payments","td":"Accept online"}, ... ] } }');

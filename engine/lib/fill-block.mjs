// 区块模板填充。
// 标量: {{TOKEN}}(大写) ← ctx[TOKEN]
// 条目区域: <!--ITEMS:KEY-->...inner...<!--/ITEMS--> ← ctx[KEY] 数组,inner 按每条 obj 的 {{field}} 渲染后拼接
// 未填充的 token(大写或小写)会抛错(防漏填默默出坏片);条目内未提供的可选小写字段先清空。
export function fillBlock(html, ctx) {
  let s = html;
  // 1) 条目区域
  s = s.replace(/<!--ITEMS:([A-Z0-9_]+)-->([\s\S]*?)<!--\/ITEMS-->/g, (m, key, inner) => {
    const arr = ctx[key];
    if (!Array.isArray(arr)) throw new Error(`ITEMS:${key} 需要数组,实际 ${typeof arr}`);
    return arr.map(item => {
      let r = inner;
      for (const [k, v] of Object.entries(item)) r = r.split('{{' + k + '}}').join(v == null ? '' : String(v));
      return r.replace(/\{\{[a-z][a-zA-Z0-9_]*\}\}/g, ''); // 清掉本条目未提供的可选小写字段
    }).join('');
  });
  // 2) 标量(跳过数组)
  for (const [k, v] of Object.entries(ctx)) { if (Array.isArray(v)) continue; s = s.split('{{' + k + '}}').join(v == null ? '' : String(v)); }
  // 此时 ITEMS 区域的可选小写字段已清空,剩下的任何 {{...}}(无论大小写)都是真漏填
  const left = s.match(/\{\{[A-Za-z][\w]*\}\}/g);
  if (left) throw new Error('区块未填充 token: ' + [...new Set(left)].join(', '));
  return s;
}

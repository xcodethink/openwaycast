// 一键出全:所有品牌 × en/zh,串行(避免并发重载 CosyVoice/渲染)。
// 用法: [QUALITY=standard] [LANGS=en,zh] [BRANDS=wjdigital,northwind] node build-all.mjs
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QUALITY = process.env.QUALITY || 'standard';
const LANGS = (process.env.LANGS || 'en,zh').split(',');
const BRANDS = (process.env.BRANDS || fs.readdirSync(path.join(HERE, 'brands')).filter(d => fs.existsSync(path.join(HERE, 'brands', d, 'brand.json')))).toString().split(',');

console.log(`build-all: 品牌[${BRANDS}] × 语言[${LANGS}] × ${QUALITY}\n`);
const results = [];
for (const brand of BRANDS) {
  for (const lang of LANGS) {
    console.log(`\n========== ${brand} / ${lang} ==========`);
    try {
      execSync(`node ${JSON.stringify(path.join(HERE, 'build.mjs'))}`, { stdio: 'inherit', env: { ...process.env, BRAND: brand, VO_LANG: lang, QUALITY } });
      results.push(`✓ ${brand}/${lang}`);
    } catch (e) { results.push(`✗ ${brand}/${lang} (失败)`); }
  }
}
console.log('\n===== build-all 汇总 =====\n' + results.join('\n'));

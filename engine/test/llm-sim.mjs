// llm-sim.mjs —— 用"Claude 本人当 LLM provider"验证 LLM 文案路径的真实质量(免 key)。
// 注入的 brief/script 由 Claude 依据真实抓取信号撰写(防杜撰:无依据不编),走与线上 LLM 完全相同的注入口。
// 用: node test/llm-sim.mjs <url> <slug>   产出 brands/<slug>/ 后可 BRAND=<slug> 渲染(en/zh)。
import { makeBrand } from '../content/make-brand.mjs';

// —— 以下为 Claude 依据 https://stripe.com 真实抓取信号撰写的 LLM 产物(城市未在站点陈述→null,不编) ——
const BRIEF = {
  name: 'Stripe',
  tagline: 'Financial infrastructure to grow your revenue',
  city: null,
  one_liner: 'Stripe is a financial services platform that helps businesses accept payments, build flexible billing, and move money — from the first transaction to the billionth.',
  services: ['Online payments', 'Billing & subscriptions', 'Connect & payouts', 'Financial services', 'Revenue & finance automation', 'Developer-first infrastructure'],
  selling_points: ['Scales from your first transaction to your billionth', 'The backbone of global commerce', 'Reliable, extensible infrastructure for any stack'],
  _unknowns: ['city'],
};

const SCRIPT = {
  shots: [
    { block: 'cover', content: { META_L: 'STRIPE', META_R: 'PAYMENTS · GLOBAL', WORD: 'STRIPE', SUB: 'FINANCIAL INFRASTRUCTURE', KICKER: 'OUR MISSION', HERO: 'GROW YOUR<br>REVENUE.', TAG: 'Financial infrastructure for <em>ambitious</em> businesses.' } },
    { block: 'editorial-facts', content: { META_L: 'WHO WE ARE', META_R: 'GLOBAL COMMERCE', KICKER: 'THE PLATFORM', HEAD: 'One platform for<br><em>money movement</em>.', BODY: 'Stripe helps businesses accept payments, build billing, and move money — from the first transaction to the billionth.', FACTS: [{ fn: '06', fl: 'Product areas<br><i>One integration</i>' }, { fn: '1st→Bn', fl: 'Scale<br><i>First sale to billionth</i>' }] } },
    { block: 'grid', content: { META_L: 'WHAT WE DO', META_R: 'SIX AREAS', LABEL: 'A complete financial stack', TILES: [{ tn: '01', th: 'Payments', td: 'Accept online &amp; in-person' }, { tn: '02', th: 'Billing', td: 'Subscriptions &amp; invoicing' }, { tn: '03', th: 'Connect', td: 'Payouts to third parties' }, { tn: '04', th: 'Financial services', td: 'Issuing, treasury, capital' }, { tn: '05', th: 'Revenue automation', td: 'Tax, reporting, recognition' }, { tn: '06', th: 'Developer tools', td: 'APIs built for every stack' }] } },
    { block: 'statement-list', content: { META_L: 'WHY STRIPE', META_R: 'BUILT TO SCALE', KICKER: 'WHY IT MATTERS', HEAD: 'From your first sale<br>to your <em>billionth</em>.', LIST: [{ lk: 'Accept payments', lv: 'in minutes.' }, { lk: 'Add financial services', lv: 'without rebuilding.' }, { lk: 'Move money', lv: 'worldwide.' }], FOOT: 'The same platform powers a first sale and global scale.' } },
    { block: 'flow', content: { META_L: 'HOW IT WORKS', META_R: 'ONE INTEGRATION', LABEL: 'From integration to revenue', STEPS: [{ cls: '', snum: '01', sname: 'Integrate', sdesc: 'One API, any stack' }, { cls: '', snum: '02', sname: 'Accept', sdesc: 'Payments, billing, payouts' }, { cls: 'done', snum: '03', sname: 'Grow', sdesc: 'Scale money movement worldwide' }] } },
    { block: 'layer-stack', content: { META_L: 'WHO IT POWERS', META_R: 'ALL SIZES', LABEL: 'Powering businesses of all sizes', LAYERS: [{ cls: 'hi', lnum: '01', lname: 'STARTUPS', ldesc: 'Launch and take the first payment', ltag: 'DAY ONE' }, { cls: '', lnum: '02', lname: 'SCALE-UPS', ldesc: 'New markets and business models', ltag: 'EXPANSION' }, { cls: '', lnum: '03', lname: 'ENTERPRISES', ldesc: 'Global commerce at billion scale', ltag: 'THE BACKBONE' }], FLOW: 'One platform — from <em>day one</em> to global scale.' } },
    { block: 'manifesto', content: { META_L: 'WHAT WE BELIEVE', META_R: 'GLOBAL COMMERCE', LABEL: 'What guides our work', ITEMS: [{ bh: 'Infrastructure should be <em>invisible</em>.', bd: 'You ship products; the plumbing just works.' }, { bh: 'Build for <em>developers</em>.', bd: 'Clean APIs turn money movement into a few lines of code.' }, { bh: 'Grow the GDP of the <em>internet</em>.', bd: 'When commerce is easier, more businesses get built.' }] } },
    { block: 'cta', content: { META_L: "LET'S TALK", META_R: 'stripe.com', WORD: 'STRIPE', Q: 'Start with your<br>first <em>transaction</em>.', CSUB: 'From startups to global enterprises — talk to our team.', BTN: 'sales@stripe.com', DISC: 'Stripe · Financial infrastructure to grow your revenue · stripe.com' } },
  ],
  vo: [
    'This is Stripe — financial infrastructure to grow your revenue.',
    'Stripe is one platform for money movement: accept payments, build billing, and move money, from your first transaction to your billionth.',
    "It's a complete financial stack — payments, billing, Connect payouts, financial services, revenue automation, and developer-first tools.",
    'Why Stripe? Accept payments in minutes, add financial services without rebuilding, and move money worldwide.',
    'It works with one integration: integrate once, start accepting, and grow money movement worldwide.',
    'And it powers businesses of every size — from startups taking their first payment to enterprises running global commerce.',
    'We believe infrastructure should be invisible, built for developers, and made to grow the GDP of the internet.',
    'Start with your first transaction. From startups to global enterprises — talk to the Stripe team at stripe dot com.',
  ],
  vo_zh: [
    '这里是 Stripe —— 助你增长营收的金融基础设施。',
    'Stripe 是一个统一的资金流转平台:收款、计费、资金调拨,从你的第一笔交易,到第十亿笔。',
    '它是一整套金融能力 —— 在线收款、订阅计费、Connect 分账、金融服务、营收自动化,以及面向开发者的接口。',
    '为什么选 Stripe?几分钟接入收款,无需重构即可叠加金融服务,资金还能在全球流转。',
    '一次集成即可run通:接入一次,开始收款,让资金在全球范围增长。',
    '它服务各种体量的企业 —— 从拿下第一笔付款的初创,到支撑全球贸易的大型企业。',
    '我们相信:基础设施应当隐于无形、为开发者而建,并致力于做大互联网的 GDP。',
    '从你的第一笔交易开始。无论初创还是跨国企业,都可以联系 Stripe 团队,访问 stripe.com。',
  ],
  _unknowns: [],
};

const dual = { model: 'claude-as-provider', call: async (a, b) => (b === undefined ? BRIEF : SCRIPT) };  // extractBrief: call(sig); writeScript: call(brief,catalog,n)

const url = process.argv[2] || 'https://stripe.com';
const slug = process.argv[3] || '_sim';
const r = await makeBrand(url, { slug, force: true, 'reuse-bg': 'wjdigital', llm: dual });
console.log(`✅ ${r.brand.name} → brands/${r.slug}/  script=${r.script.meta.mode} has_zh=${r.script.meta.has_zh} 镜=${r.script.storyboard.shots.length}`);
console.log('  区块:', r.script.storyboard.shots.map(s => s.block).join(' → '));

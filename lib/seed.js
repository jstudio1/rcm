// Default content, written to data/content.json the first time the server starts.
// After that everything is edited from /admin.
const legal = require('./legal-defaults');
const base = () => ({
  site: {
    name: 'RAYCITY-M',
    url: '',
    defaultTitle: 'RAYCITY-M | ตำนานสตรีทเรซกลับมาอีกครั้ง บนมือถือและคอม',
    description: 'RAYCITY-M ตำนานสตรีทเรซกลับมาอีกครั้ง เล่นได้ทั้งบนมือถือและคอม พบกันเร็วๆ นี้',
    keywords: 'RAYCITY-M, เกมแข่งรถ, สตรีทเรซ, เกมมือถือ, เกมพีซี',
    logo: '/img/logo.png',
    favicon: '/img/favicon.png',
    ogImage: '/img/hero_race_v2_poster.jpg',
    footer: '© 2026 RAYCITY-M. All rights reserved.',
    // SEO tools: search-console verification codes, Google Analytics 4 ID, X/Twitter handle
    googleVerify: '',
    bingVerify: '',
    ga4: '',
    twitter: '',
    // loading screen before the site: on/off, only on the first page of a visit, which pages
    loader: 'true',
    loaderOnce: 'true',
    loaderScope: 'home',
    loaderStyle: 'launcher' // launcher | tacho | headlights | neon | tuktuk | tukglow | tuklong | tukxl | tukmid | tukfast
  },
  // member portal (login / register / account area): a mockup until it is pointed at a real API
  portal: {
    enabled: '', mode: 'mock', apiBase: '', registerOpen: 'true', navLabel: 'เข้าสู่ระบบ',
    epLogin: '/auth/login', epRegister: '/auth/register', epLogout: '/auth/logout', epForgot: '/auth/forgot-password', epMe: '/me', epPassword: '/me/password',
    epHistory: '/me/history', epCoupons: '/me/coupons', epItems: '/me/items', epPayments: '/me/payment-methods', epRedeem: '/me/redeem'
  },
  links: {
    social: { facebook: '', tiktok: '', discord: '', youtube: '' },
    download: { windows: '', ios: '', android: '' },
    // which buttons show on the home page (turn off a store that isn't ready, or the whole row)
    show: { windows: 'true', ios: 'true', android: 'true', register: 'true', facebook: 'true', tiktok: 'true', discord: 'true', youtube: 'true' }
  },
  home: {
    seoTitle: '',
    seoDescription: '',
    heroVideo: '',
    heroVideoMobile: '',
    heroImage: '',
    badge: 'COMING SOON · MOBILE & PC',
    h1: 'RAYCITY-M',
    h2: 'The street legend returns',
    h3: 'on mobile & PC',
    lead: 'ตำนานสตรีทเรซที่คุณคิดถึง กลับมาให้ซิ่งอีกครั้ง เล่นได้ทั้งบนมือถือและคอม พบกันเร็วๆ นี้',
    registerText: 'ลงทะเบียนล่วงหน้า',
    registerLink: '',
    registerMsg: 'เปิดให้ลงทะเบียนล่วงหน้าเร็วๆ นี้ ติดตามประกาศทางเพจ',
    storesLabel: 'AVAILABLE SOON ON',
    followLabel: 'FOLLOW US',
    soonLabel: 'เร็วๆ นี้บน',
    downloadLabel: 'ดาวน์โหลดบน',
    gameplayMore: 'ดูทั้งหมด',
    latestNewsTitle: 'ข่าวสารล่าสุด'
  },
  pages: {
    rewards: { navLabel: 'REWARDS', seoTitle: 'Rewards | ลงทะเบียนล่วงหน้า รับรางวัล | RAYCITY-M', seoDescription: 'ลงทะเบียนล่วงหน้า RAYCITY-M รับรางวัลพิเศษ ยิ่งมีผู้ลงทะเบียนมาก ของรางวัลยิ่งปลดล็อกครบ', eyebrow: 'REWARDS', h1: 'ลงทะเบียนล่วงหน้า รับรางวัล', h2: '', intro: 'ยิ่งมีผู้ลงทะเบียนมาก ของรางวัลยิ่งปลดล็อกครบ รายละเอียดรางวัลจะประกาศอีกครั้งก่อนเปิดให้บริการ' },
    gameplay: { navLabel: 'GAMEPLAY', seoTitle: 'Gameplay | ซิ่งให้สุด บนทุกหน้าจอ | RAYCITY-M', seoDescription: 'รู้จักระบบเกม RAYCITY-M แข่งสตรีทเรซ แต่งรถ และเล่นได้ทั้งบนมือถือและคอมพิวเตอร์', eyebrow: 'GAMEPLAY', h1: 'ซิ่งให้สุด บนทุกหน้าจอ', h2: '', intro: 'ตำนานสตรีทเรซที่กลับมาในรูปแบบใหม่ เล่นได้ทั้งบนมือถือและคอมพิวเตอร์' },
    drivers: { navLabel: 'DRIVERS', seoTitle: 'Drivers | เลือกสไตล์นักซิ่งของคุณ | RAYCITY-M', seoDescription: 'ทำความรู้จักนักซิ่งและรถประจำตัวใน RAYCITY-M', eyebrow: 'DRIVERS', h1: 'เลือกสไตล์นักซิ่งของคุณ', h2: '', intro: 'เปิดตัวนักซิ่งและรถประจำตัวทีละคนก่อนเปิดให้บริการ ติดตามได้ทางเพจ' },
    news: { navLabel: 'NEWS', seoTitle: 'News | ข่าวสารล่าสุด | RAYCITY-M', seoDescription: 'ข่าวสาร ประกาศ และกิจกรรมล่าสุดจากทีมงาน RAYCITY-M', eyebrow: 'NEWS', h1: 'ข่าวสารล่าสุด', h2: '', intro: 'ประกาศและกิจกรรมจากทีมงาน RAYCITY-M', empty: 'ยังไม่มีข่าวสาร' },
    faq: { navLabel: 'FAQ', seoTitle: 'FAQ | คำถามที่พบบ่อย | RAYCITY-M', seoDescription: 'รวมคำถามที่พบบ่อยเกี่ยวกับ RAYCITY-M วันเปิดให้บริการ แพลตฟอร์ม และการลงทะเบียนล่วงหน้า', eyebrow: 'FAQ', h1: 'คำถามที่พบบ่อย', h2: '', intro: '', navLabelEn: 'FAQ', seoTitleEn: 'FAQ | RAYCITY-M', seoDescriptionEn: 'Frequently asked questions about RAYCITY-M: release, platforms, cost and pre-registration.', h1En: 'Frequently asked questions', introEn: '' },
    privacy: { navLabel: 'นโยบายความเป็นส่วนตัว', seoTitle: 'นโยบายความเป็นส่วนตัว | RAYCITY-M', seoDescription: 'นโยบายความเป็นส่วนตัวของ RAYCITY-M: เราเก็บข้อมูลอะไร ใช้ทำอะไร เก็บนานแค่ไหน การลบบัญชี และสิทธิของท่านตาม PDPA', eyebrow: 'PRIVACY', h1: 'นโยบายความเป็นส่วนตัว', h2: '', intro: 'อธิบายว่าเราเก็บ ใช้ และคุ้มครองข้อมูลของท่านอย่างไร', body: legal.privacyBody, updated: '2026-10-27',
      navLabelEn: 'Privacy Policy', seoTitleEn: 'Privacy Policy | RAYCITY-M', seoDescriptionEn: 'RAYCITY-M privacy policy: what data we collect, why, how long we keep it, account deletion and your rights under the PDPA.', h1En: 'Privacy Policy', introEn: 'How we collect, use and protect your data.', bodyEn: legal.privacyBodyEn },
    terms: { navLabel: 'ข้อตกลงการใช้บริการ', seoTitle: 'ข้อตกลงการใช้บริการ | RAYCITY-M', seoDescription: 'ข้อตกลงการใช้บริการของ RAYCITY-M: บัญชีผู้เล่น เงินและไอเทมในเกม ข้อห้าม กฎแชท การคืนเงิน และการหยุดให้บริการ', eyebrow: 'TERMS', h1: 'ข้อตกลงการใช้บริการ', h2: '', intro: 'กติกาการเล่นเกมและการใช้เว็บไซต์ของเรา', body: legal.termsBody, updated: '2026-10-27',
      navLabelEn: 'Terms of Service', seoTitleEn: 'Terms of Service | RAYCITY-M', seoDescriptionEn: 'RAYCITY-M terms of service: player accounts, in-game currency and items, prohibited conduct, chat rules, refunds and discontinuation.', h1En: 'Terms of Service', introEn: 'The rules for playing the game and using our website.', bodyEn: legal.termsBodyEn },
    support: { navLabel: 'ซัพพอร์ต / ติดต่อเรา', seoTitle: 'ซัพพอร์ตและติดต่อเรา | RAYCITY-M', seoDescription: 'ติดต่อทีมงาน RAYCITY-M: ปัญหาการเข้าเกม รายงานผู้เล่น การลบบัญชี และข้อมูลส่วนบุคคล พร้อมคำถามที่พบบ่อย', eyebrow: 'SUPPORT', h1: 'ซัพพอร์ตและติดต่อเรา', h2: '', intro: 'ทีมงานพร้อมช่วยเหลือ เลือกช่องทางที่สะดวกได้เลย', body: legal.supportBody, updated: '', navLabelEn: 'Support', seoTitleEn: 'Support and contact | RAYCITY-M', seoDescriptionEn: 'Contact the RAYCITY-M team: login problems, reporting players, account deletion and personal data, plus frequently asked questions.', h1En: 'Support and contact', introEn: 'Our team is here to help. Choose the channel that suits you.', bodyEn: legal.supportBodyEn },
    // reserved for the account-deletion and loot-box-odds pages: hidden everywhere until they have a title and text
    delete: { navLabel: 'ลบบัญชี', seoTitle: '', seoDescription: '', eyebrow: 'ACCOUNT', h1: '', h2: '', intro: '', body: '', updated: '', navLabelEn: 'Delete account', seoTitleEn: '', seoDescriptionEn: '', h1En: '', introEn: '', bodyEn: '' },
    odds: { navLabel: 'อัตรากล่องสุ่ม', seoTitle: '', seoDescription: '', eyebrow: 'ODDS', h1: '', h2: '', intro: '', body: '', updated: '', navLabelEn: 'Loot box odds', seoTitleEn: '', seoDescriptionEn: '', h1En: '', introEn: '', bodyEn: '' },
  },
  contact: legal.contact,
  cookies: legal.cookies,
  legal: legal.legal,
  supportFaq: legal.supportFaq,
  rewards: [
    { id: 'r1', milestone: '50K', title: 'ไอเทมต้อนรับ', desc: 'ชุดไอเทมเริ่มต้นสำหรับนักซิ่งหน้าใหม่', status: 'LOCKED' },
    { id: 'r2', milestone: '100K', title: 'รถสตรีทสุดเท่', desc: 'รับรถพิเศษสำหรับผู้ลงทะเบียนล่วงหน้า', status: 'LOCKED' },
    { id: 'r3', milestone: '200K', title: 'เงินในเกม', desc: 'เติมทุนให้ปรับแต่งรถได้ตั้งแต่วันแรก', status: 'LOCKED' },
    { id: 'r4', milestone: '500K', title: 'รถระดับตำนาน', desc: 'รางวัลใหญ่สุดสำหรับทุกคนที่ลงทะเบียน', status: 'LOCKED' }
  ],
  gameplay: [
    { id: 'g1', title: 'Street Race', desc: 'แข่งบนถนนในเมืองยามค่ำคืน ไล่ขอบทางโค้งกับคู่แข่งทั่วประเทศ', image: '/img/track.jpg', alt: 'Street Race' },
    { id: 'g2', title: 'Tune & Customize', desc: 'แต่งรถ ปรับแต่งเครื่องยนต์และสีสัน สร้างคันที่เป็นตัวคุณ', image: '/img/car1.jpg', alt: 'Tune & Customize' },
    { id: 'g3', title: 'Mobile & PC', desc: 'เล่นได้ทั้งสองแพลตฟอร์ม ซิ่งต่อได้ทุกที่ทุกเวลา', image: '/img/teaser.jpg', alt: 'Mobile & PC' }
  ],
  drivers: [
    { id: 'd1', title: 'Street Rookie', desc: 'น้องใหม่หัวใจนักแข่ง', image: '/img/keyart_rc_v1_web.jpg', pos: '12% center', badge: 'COMING SOON' },
    { id: 'd2', title: 'Drift King', desc: 'เจ้าแห่งโค้งสุดลื่น', image: '/img/keyart_rc_v1_web.jpg', pos: '42% center', badge: 'COMING SOON' },
    { id: 'd3', title: 'Speed Demon', desc: 'เร็วแรงทะลุขีดจำกัด', image: '/img/keyart_rc_v1_web.jpg', pos: '72% center', badge: 'COMING SOON' },
    { id: 'd4', title: 'Night Rider', desc: 'ราชาแห่งถนนยามค่ำ', image: '/img/keyart_rc_v1_web.jpg', pos: '100% center', badge: 'COMING SOON' }
  ],
  faq: [
    { id: 'f1', q: 'RAYCITY-M คืออะไร', a: 'เกมแข่งรถสตรีทที่นำตำนานกลับมาให้ซิ่งอีกครั้ง รองรับทั้งมือถือและคอมพิวเตอร์', qEn: 'What is RAYCITY-M?', aEn: 'A street racing game that brings the legend back. It supports both mobile and computers.' },
    { id: 'f2', q: 'เปิดให้บริการเมื่อไหร่', a: 'ขณะนี้อยู่ระหว่างเตรียมการ ติดตามวันเปิดให้บริการได้จากเพจทางการ', qEn: 'When does it launch?', aEn: 'We are still preparing. Follow the official page for the launch date.' },
    { id: 'f3', q: 'เล่นได้บนแพลตฟอร์มอะไรบ้าง', a: 'Windows PC, iOS (App Store) และ Android (Google Play)', qEn: 'Which platforms does it run on?', aEn: 'Windows PC, iOS (App Store) and Android (Google Play).' },
    { id: 'f4', q: 'ต้องเสียค่าใช้จ่ายไหม', a: 'รายละเอียดจะประกาศอีกครั้งก่อนเปิดให้บริการ', qEn: 'Is it free to play?', aEn: 'Details will be announced before launch.' },
    { id: 'f5', q: 'ลงทะเบียนล่วงหน้าได้ที่ไหน', a: 'เร็วๆ นี้ ติดตามประกาศทางเพจเฟซบุ๊ก RAYCITY-M', qEn: 'Where can I pre-register?', aEn: 'Coming soon. Follow announcements on the RAYCITY-M Facebook page.' }
  ],
  news: [
    { id: 'n1', slug: 'raycity-m-official-announcement', title: 'เปิดตัว RAYCITY-M อย่างเป็นทางการ', date: '2026-10-24', tag: 'ANNOUNCEMENT', published: true, image: '/img/keyart_rc_v1_web.jpg', excerpt: 'ตำนานสตรีทเรซกลับมาอีกครั้งบนมือถือและคอม', body: '## RAYCITY-M กลับมาแล้ว\nตำนานสตรีทเรซกลับมาอีกครั้ง เล่นได้ทั้งบนมือถือและคอมพิวเตอร์\n\n### ติดตามข่าวสาร\nติดตามประกาศและกิจกรรมได้ทางเพจเฟซบุ๊กอย่างเป็นทางการ', seoTitle: '', seoDescription: '' },
    { id: 'n2', slug: 'pre-registration', title: 'เปิดลงทะเบียนล่วงหน้า', date: '2026-10-25', tag: 'EVENT', published: false, image: '', excerpt: 'ลงทะเบียนเพื่อรับรางวัลพิเศษก่อนใคร', body: 'รายละเอียดจะประกาศเร็วๆ นี้', seoTitle: '', seoDescription: '' }
  ]
});
// every page also gets: hide-from-Google switch and its own share image
module.exports = () => {
  const s = base();
  for (const p of Object.values(s.pages)) Object.assign(p, { noindex: '', ogImage: '' });
  return s;
};

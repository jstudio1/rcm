// Default content, written to data/content.json the first time the server starts.
// After that everything is edited from /admin.
const legal = require('./legal-defaults');
const base = () => ({
  site: {
    name: 'RAYCITY-M',
    url: '',
    defaultTitle: 'RAYCITY-M | ตำนานสตรีทเรซกลับมาอีกครั้ง บนมือถือ',
    description: 'RAYCITY-M ตำนานสตรีทเรซกลับมาอีกครั้ง เล่นได้บนมือถือ พบกันเร็วๆ นี้',
    keywords: 'RAYCITY-M, เกมแข่งรถ, สตรีทเรซ, เกมมือถือ',
    // English page (/en): empty = the Thai text is shown
    defaultTitleEn: 'RAYCITY-M | The street racing legend returns on mobile',
    descriptionEn: 'RAYCITY-M: the street racing legend returns. Play it on mobile. Coming soon.',
    footerEn: '',
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
    loaderStyle: 'launcher', // launcher | tacho | headlights | neon | tuktuk | tukglow | tuklong | tukxl | tukmid | tukfast
    // maintenance: while on, every public page shows the maintenance page (503); the admin keeps working
    maintenance: '',
    maintenanceTitle: 'ปิดปรับปรุงชั่วคราว',
    maintenanceMsg: 'เรากำลังปรับปรุงเว็บไซต์เพื่อประสบการณ์ที่ดีขึ้น กรุณากลับมาใหม่อีกครั้งในภายหลัง ติดตามข่าวสารได้ทางเพจทางการ',
    maintenanceUntil: '',
    maintenanceTitleEn: 'Down for maintenance',
    maintenanceMsgEn: 'We are improving the website. Please come back a little later, and follow our official page for news.'
  },
  // pre-registration counter and reward goals (the goals themselves are the "rewards" list): a mockup until wired to the game
  prereg: {
    enabled: 'true', onHome: 'true', mode: 'mock', mockCount: '13002', apiUrl: '',
    eyebrow: 'PRE-REGISTRATION REWARDS', title: 'รวมพลังสตาร์', titleAccent: 'ปลดล็อกรางวัล', intro: 'ยิ่งรวมทีมได้มากเท่าไร รางวัลก็ยิ่งใหญ่ขึ้น! มุ่งสู่เป้าหมายไปด้วยกัน',
    statusLabel: 'รอประกาศรางวัล', counterLabel: 'ผู้ลงทะเบียนล่วงหน้า', unit: 'คน', nextText: 'อีกเพียง {n} คน เพื่อถึงเป้าหมายขั้นถัดไป', allDoneText: 'ถึงทุกเป้าหมายแล้ว ขอบคุณทุกคนที่ร่วมทาง!',
    goalsLabel: 'รางวัลตามยอดลงทะเบียน', reachedCount: 'ถึงเป้าหมายแล้ว', reachedLabel: 'ถึงเป้าหมายแล้ว', nextLabel: 'เป้าหมายถัดไป', lockedLabel: 'ยังไม่ถึงเป้า', viewLabel: 'ดูรางวัล',
    detailReached: 'ยอดถึงเป้าหมายแล้ว', detailLocked: 'ยังไม่ถึงเป้าหมาย',
    // English page (/en): empty = the Thai text is shown
    eyebrowEn: 'PRE-REGISTRATION REWARDS', titleEn: 'Join forces,', titleAccentEn: 'unlock the rewards', introEn: 'The more of us there are, the bigger the rewards. Let us reach the goals together!',
    statusLabelEn: 'Rewards to be announced', counterLabelEn: 'Pre-registered players', unitEn: 'players', nextTextEn: 'Only {n} more players to reach the next goal', allDoneTextEn: 'Every goal reached. Thank you all for joining the ride!',
    goalsLabelEn: 'Rewards by sign-ups', reachedCountEn: 'Goals reached', reachedLabelEn: 'Goal reached', nextLabelEn: 'Next goal', lockedLabelEn: 'Not yet reached', viewLabelEn: 'View reward',
    detailReachedEn: 'Goal reached', detailLockedEn: 'Goal not reached yet',
    // closing time (Thailand time, YYYY-MM-DDTHH:mm): after it, sign-up closes by itself and the site shows the closed state
    endAt: '', countdownLabel: 'ปิดรับลงทะเบียนใน', dayUnit: 'วัน', closedButton: 'ปิดรับลงทะเบียนแล้ว', endedText: 'ปิดรับลงทะเบียนล่วงหน้าแล้ว ขอบคุณทุกคนที่ร่วมลงทะเบียน',
    countdownLabelEn: 'Pre-registration closes in', dayUnitEn: 'd', closedButtonEn: 'Pre-registration closed', endedTextEn: 'Pre-registration has closed. Thank you for joining!'
  },
  // member portal (login / register / account area): a mockup until it is pointed at a real API
  portal: {
    enabled: '', mode: 'mock', apiBase: '', registerOpen: 'true', navLabel: 'เข้าสู่ระบบ',
    // login and register pages
    loginTitle: 'เข้าสู่ระบบ', loginIntro: '', forgotOpen: 'true', registerTitle: 'สมัครสมาชิก', registerIntro: '',
    // account area: member card, currency names, top-up page
    memberLabel: 'RAYCITY-M MEMBER', cashName: 'แคช', rainName: 'เรน', pointName: 'แต้มพ้อย', topupEnabled: 'true', topupTitle: 'การเติมเงิน',
    epLogin: '/auth/login', epRegister: '/auth/register', epLogout: '/auth/logout', epForgot: '/auth/forgot-password', epMe: '/me', epPassword: '/me/password',
    epHistory: '/me/history', epCoupons: '/me/coupons', epItems: '/me/items', epRedeem: '/me/redeem',
    epTopup: '/topup/methods', epTopupRedeem: '/topup/redeem', epTopupCheckout: '/topup/checkout'
  },
  // top-up methods and the price table of each (a mockup until the game's payment API is connected)
  topup: {
    methods: [
      { id: 'truemoney-cashcard', name: 'TrueMoney CashCard', title: 'Truemoney CashCard (บัตรเงินสดทรูมันนี่)', logo: '', enabled: 'true', mode: 'code', codeLabel: 'กรอกรหัสบัตร', codePh: 'กรอกรหัส…', note: '' },
      { id: 'razer-gold', name: 'Razer Gold', title: 'Razer Gold', logo: '', enabled: 'true', mode: 'code', codeLabel: 'กรอกรหัสบัตร', codePh: 'กรอกรหัส…', note: '' },
      { id: 'promptpay', name: 'PromptPay', title: 'PromptPay (สแกนจ่ายผ่านแอปธนาคาร)', logo: '', enabled: 'true', mode: 'checkout', codeLabel: '', codePh: '', note: 'เลือกแพ็กเกจแล้วกดชำระเงิน ระบบจะแสดง QR สำหรับสแกนจ่าย' },
      { id: 'alipay', name: 'Alipay', title: 'Alipay', logo: '', enabled: 'true', mode: 'checkout', codeLabel: '', codePh: '', note: 'เลือกแพ็กเกจแล้วกดชำระเงิน ระบบจะพาไปหน้าชำระเงินของ Alipay' },
      { id: 'truemoney-wallet', name: 'TrueMoney Wallet', title: 'TrueMoney Wallet', logo: '', enabled: 'true', mode: 'checkout', codeLabel: '', codePh: '', note: 'เลือกแพ็กเกจแล้วกดชำระเงิน ระบบจะพาไปชำระผ่านแอป TrueMoney' }
    ].map(m => Object.assign(m, { packages: [['50', '5000', '38'], ['90', '9000', '68'], ['150', '15000', '114'], ['300', '30000', '228'], ['500', '50000', '380'], ['1000', '100000', '760']].map(([price, cash, point]) => ({ price, cash, point })) }))
  },
  links: {
    social: { facebook: '', tiktok: '', discord: '', youtube: '' },
    download: { windows: '', ios: '', android: '' },
    // which buttons show on the home page (turn off a store that isn't ready, or the whole row)
    show: { windows: 'false', ios: 'true', android: 'true', register: 'true', facebook: 'true', tiktok: 'true', discord: 'true', youtube: 'true' }
  },
  home: {
    seoTitle: '',
    seoDescription: '',
    heroVideo: '',
    heroVideoMobile: '',
    heroImage: '',
    badge: 'COMING SOON · MOBILE',
    h1: 'RAYCITY-M',
    h2: 'The street legend returns',
    h3: 'on mobile',
    lead: 'ตำนานสตรีทเรซที่คุณคิดถึง กลับมาให้ซิ่งอีกครั้ง เล่นได้บนมือถือ พบกันเร็วๆ นี้',
    registerText: 'ลงทะเบียนล่วงหน้า',
    registerLink: '',
    registerMsg: 'เปิดให้ลงทะเบียนล่วงหน้าเร็วๆ นี้ ติดตามประกาศทางเพจ',
    storesLabel: 'AVAILABLE SOON ON',
    followLabel: 'FOLLOW US',
    soonLabel: 'เร็วๆ นี้บน',
    downloadLabel: 'ดาวน์โหลดบน',
    gameplayMore: 'ดูทั้งหมด',
    // game band: a slanted banner with the game's pitch, two buttons and a car picture (between pre-registration and news)
    bandOn: 'true',
    bandTitle: 'RAYCITY-M',
    bandText: 'RAYCITY-M เกมแข่งรถสตรีทออนไลน์บนมือถือ ซิ่งไปกับเพื่อนทั่วประเทศในเมืองยามค่ำคืน แต่งรถในแบบของคุณ ทำภารกิจ ปลดล็อกสนามและรถคันใหม่ แล้วพิสูจน์ว่าใครคือเจ้าแห่งถนน',
    bandImage: '',
    bandBtn1: 'ดาวน์โหลดเกม', bandLink1: '',
    bandBtn2: 'สร้างบัญชีผู้เล่น', bandLink2: '',
    bandTitleEn: '', bandTextEn: 'RAYCITY-M is an online street racing game for mobile. Race friends across the night city, tune your car your way, clear missions, unlock new tracks and cars, and prove who rules the road.',
    bandBtn1En: 'Download the game', bandBtn2En: 'Create an account',
    latestNewsTitle: 'ข่าวสารล่าสุด',
    // English page (/en): empty = the Thai text is shown
    seoTitleEn: '', seoDescriptionEn: '', badgeEn: 'COMING SOON · MOBILE', h1En: '', h2En: '', h3En: '',
    leadEn: 'The street racing legend you miss is back. Play it on your phone. Coming soon.',
    registerTextEn: 'Pre-register now', registerMsgEn: 'Pre-registration opens soon. Follow our page for the announcement.',
    storesLabelEn: '', followLabelEn: '', soonLabelEn: 'Coming soon on', downloadLabelEn: 'Download on', gameplayMoreEn: 'View all', latestNewsTitleEn: 'Latest news'
  },
  pages: {
    rewards: { navLabel: 'REWARDS', seoTitle: 'ลงทะเบียนล่วงหน้า รับรางวัลพิเศษ | RAYCITY-M เกมแข่งรถมือถือ', seoDescription: 'ลงทะเบียนล่วงหน้าเกมแข่งรถมือถือ RAYCITY-M รับรางวัลพิเศษ ยิ่งมีผู้ลงทะเบียนมาก ของรางวัลยิ่งปลดล็อกครบ เริ่มสะสมตั้งแต่วันนี้', eyebrow: 'REWARDS', h1: 'ลงทะเบียนล่วงหน้า รับรางวัล', h2: '', intro: 'ยิ่งมีผู้ลงทะเบียนมาก ของรางวัลยิ่งปลดล็อกครบ รายละเอียดรางวัลจะประกาศอีกครั้งก่อนเปิดให้บริการ', navLabelEn: 'REWARDS', seoTitleEn: 'Pre-register for RAYCITY-M | Mobile racing game rewards', seoDescriptionEn: 'Pre-register for the RAYCITY-M mobile street racing game and earn special rewards. The more players sign up, the more rewards unlock.', eyebrowEn: 'REWARDS', h1En: 'Pre-register and earn rewards', h2En: '', introEn: 'The more players pre-register, the more rewards unlock. Reward details will be announced before launch.' },
    gameplay: { navLabel: 'GAMEPLAY', seoTitle: 'ระบบเกมและการแข่งสตรีทเรซ | RAYCITY-M เกมแข่งรถมือถือ', seoDescription: 'รู้จักระบบเกม RAYCITY-M เกมแข่งสตรีทเรซบนมือถือ ตั้งแต่การแข่งขัน การแต่งรถและจูนรถ ไปจนถึงโหมดต่างๆ ที่เล่นได้ทุกหน้าจอ', eyebrow: 'GAMEPLAY', h1: 'ซิ่งให้สุด บนทุกหน้าจอ', h2: '', intro: 'ตำนานสตรีทเรซที่กลับมาในรูปแบบใหม่ เล่นได้บนมือถือ', navLabelEn: 'GAMEPLAY', seoTitleEn: 'Gameplay and street racing | RAYCITY-M mobile racing game', seoDescriptionEn: 'Discover the RAYCITY-M game systems: street racing, car tuning and modes you can play on every screen.', eyebrowEn: 'GAMEPLAY', h1En: 'Race hard on every screen', h2En: '', introEn: 'The street racing legend returns in a new form. Play it on mobile.' },
    drivers: { navLabel: 'DRIVERS', seoTitle: 'นักซิ่งและรถประจำตัว | RAYCITY-M เกมแข่งรถมือถือ', seoDescription: 'ทำความรู้จักนักซิ่งและรถประจำตัวใน RAYCITY-M เกมแข่งรถมือถือ เลือกสไตล์การขับที่ใช่สำหรับคุณ', eyebrow: 'DRIVERS', h1: 'เลือกสไตล์นักซิ่งของคุณ', h2: '', intro: 'เปิดตัวนักซิ่งและรถประจำตัวทีละคนก่อนเปิดให้บริการ ติดตามได้ทางเพจ', navLabelEn: 'DRIVERS', seoTitleEn: 'Drivers and signature cars | RAYCITY-M mobile racing game', seoDescriptionEn: 'Meet the drivers and signature cars of RAYCITY-M and choose the racing style that fits you.', eyebrowEn: 'DRIVERS', h1En: 'Choose your racing style', h2En: '', introEn: 'We reveal the drivers and their cars one by one before launch. Follow our page.' },
    news: { navLabel: 'NEWS', seoTitle: 'ข่าวสารและประกาศล่าสุด | RAYCITY-M เกมแข่งรถมือถือ', seoDescription: 'ข่าวสาร ประกาศ อัปเดต และกิจกรรมล่าสุดจากทีมงาน RAYCITY-M เกมแข่งรถมือถือ ติดตามได้ที่นี่ก่อนใคร', eyebrow: 'NEWS', h1: 'ข่าวสารล่าสุด', h2: '', intro: 'ประกาศและกิจกรรมจากทีมงาน RAYCITY-M', empty: 'ยังไม่มีข่าวสาร', navLabelEn: 'NEWS', seoTitleEn: 'Latest news and announcements | RAYCITY-M', seoDescriptionEn: 'The latest news, announcements, updates and events from the RAYCITY-M team.', eyebrowEn: 'NEWS', h1En: 'Latest news', h2En: '', introEn: 'Announcements and events from the RAYCITY-M team.', emptyEn: 'No news yet.' },
    faq: { navLabel: 'FAQ', seoTitle: 'คำถามที่พบบ่อย | RAYCITY-M เกมแข่งรถมือถือ', seoDescription: 'รวมคำถามที่พบบ่อยเกี่ยวกับ RAYCITY-M วันเปิดให้บริการ แพลตฟอร์มที่รองรับ ค่าใช้จ่าย และการลงทะเบียนล่วงหน้า', eyebrow: 'FAQ', h1: 'คำถามที่พบบ่อย', h2: '', intro: '', navLabelEn: 'FAQ', seoTitleEn: 'Frequently asked questions | RAYCITY-M mobile racing game', seoDescriptionEn: 'Frequently asked questions about RAYCITY-M: release date, supported platforms, cost and pre-registration.', h1En: 'Frequently asked questions', introEn: '' },
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
    { id: 'r1', milestone: '1,000', target: '1000', title: 'รางวัลปริศนา', desc: 'รายละเอียดรางวัลจะประกาศภายหลัง', image: '', alt: '', status: '', titleEn: 'Mystery reward', descEn: 'Reward details will be announced later.' },
    { id: 'r2', milestone: '3,000', target: '3000', title: 'รางวัลปริศนา', desc: 'รายละเอียดรางวัลจะประกาศภายหลัง', image: '', alt: '', status: '', titleEn: 'Mystery reward', descEn: 'Reward details will be announced later.' },
    { id: 'r3', milestone: '5,000', target: '5000', title: 'รางวัลปริศนา', desc: 'รายละเอียดรางวัลจะประกาศภายหลัง', image: '', alt: '', status: '', titleEn: 'Mystery reward', descEn: 'Reward details will be announced later.' },
    { id: 'r4', milestone: '10,000', target: '10000', title: 'รางวัลปริศนา', desc: 'รายละเอียดรางวัลจะประกาศภายหลัง', image: '', alt: '', status: '', titleEn: 'Mystery reward', descEn: 'Reward details will be announced later.' },
    { id: 'r5', milestone: '20,000', target: '20000', title: 'รางวัลปริศนา', desc: 'รายละเอียดรางวัลจะประกาศภายหลัง', image: '', alt: '', status: '', titleEn: 'Mystery reward', descEn: 'Reward details will be announced later.' },
    { id: 'r6', milestone: '30,000', target: '30000', title: 'รางวัลปริศนา', desc: 'รายละเอียดรางวัลจะประกาศภายหลัง', image: '', alt: '', status: '', titleEn: 'Mystery reward', descEn: 'Reward details will be announced later.' }
  ],
  gameplay: [
    { id: 'g1', title: 'Street Race', desc: 'แข่งบนถนนในเมืองยามค่ำคืน ไล่ขอบทางโค้งกับคู่แข่งทั่วประเทศ', image: '/img/track.jpg', alt: 'Street Race', titleEn: 'Street Race', descEn: 'Race through the city streets at night and chase the corners against rivals from across the country.' },
    { id: 'g2', title: 'Tune & Customize', desc: 'แต่งรถ ปรับแต่งเครื่องยนต์และสีสัน สร้างคันที่เป็นตัวคุณ', image: '/img/car1.jpg', alt: 'Tune & Customize', titleEn: 'Tune & Customize', descEn: 'Customize your car: tune the engine and the paint to build one that is yours.' },
    { id: 'g3', title: 'Mobile', desc: 'ซิ่งต่อได้ทุกที่ทุกเวลาบนมือถือ', image: '/img/teaser.jpg', alt: 'Mobile', titleEn: 'Mobile', descEn: 'Keep racing anywhere, anytime on your phone.' }
  ],
  drivers: [
    { id: 'd1', title: 'Street Rookie', desc: 'น้องใหม่หัวใจนักแข่ง', image: '/img/keyart_rc_v1_web.jpg', pos: '12% center', badge: 'COMING SOON', titleEn: 'Street Rookie', descEn: 'A rookie with the heart of a racer.' },
    { id: 'd2', title: 'Drift King', desc: 'เจ้าแห่งโค้งสุดลื่น', image: '/img/keyart_rc_v1_web.jpg', pos: '42% center', badge: 'COMING SOON', titleEn: 'Drift King', descEn: 'Master of the slippery corners.' },
    { id: 'd3', title: 'Speed Demon', desc: 'เร็วแรงทะลุขีดจำกัด', image: '/img/keyart_rc_v1_web.jpg', pos: '72% center', badge: 'COMING SOON', titleEn: 'Speed Demon', descEn: 'Fast enough to break every limit.' },
    { id: 'd4', title: 'Night Rider', desc: 'ราชาแห่งถนนยามค่ำ', image: '/img/keyart_rc_v1_web.jpg', pos: '100% center', badge: 'COMING SOON', titleEn: 'Night Rider', descEn: 'King of the night roads.' }
  ],
  faq: [
    { id: 'f1', q: 'RAYCITY-M คืออะไร', a: 'เกมแข่งรถสตรีทที่นำตำนานกลับมาให้ซิ่งอีกครั้ง รองรับมือถือ', qEn: 'What is RAYCITY-M?', aEn: 'A street racing game that brings the legend back. It supports both mobile and computers.' },
    { id: 'f2', q: 'เปิดให้บริการเมื่อไหร่', a: 'ขณะนี้อยู่ระหว่างเตรียมการ ติดตามวันเปิดให้บริการได้จากเพจทางการ', qEn: 'When does it launch?', aEn: 'We are still preparing. Follow the official page for the launch date.' },
    { id: 'f3', q: 'เล่นได้บนแพลตฟอร์มอะไรบ้าง', a: 'iOS (App Store) และ Android (Google Play)', qEn: 'Which platforms does it run on?', aEn: 'iOS (App Store) and Android (Google Play).' },
    { id: 'f4', q: 'ต้องเสียค่าใช้จ่ายไหม', a: 'รายละเอียดจะประกาศอีกครั้งก่อนเปิดให้บริการ', qEn: 'Is it free to play?', aEn: 'Details will be announced before launch.' },
    { id: 'f5', q: 'ลงทะเบียนล่วงหน้าได้ที่ไหน', a: 'เร็วๆ นี้ ติดตามประกาศทางเพจเฟซบุ๊ก RAYCITY-M', qEn: 'Where can I pre-register?', aEn: 'Coming soon. Follow announcements on the RAYCITY-M Facebook page.' }
  ],
  news: [
    { id: 'n1', slug: 'raycity-m-official-announcement', title: 'เปิดตัว RAYCITY-M อย่างเป็นทางการ', date: '2026-10-24', tag: 'NEWS', published: true, image: '/img/keyart_rc_v1_web.jpg', titleEn: 'RAYCITY-M officially revealed', excerptEn: 'The street racing legend returns on mobile.', bodyEn: '## RAYCITY-M is back\nThe street racing legend returns. Play it on mobile.\n\n### Stay tuned\nFollow announcements and events on our official Facebook page.', excerpt: 'ตำนานสตรีทเรซกลับมาอีกครั้งบนมือถือ', body: '## RAYCITY-M กลับมาแล้ว\nตำนานสตรีทเรซกลับมาอีกครั้ง เล่นได้บนมือถือ\n\n### ติดตามข่าวสาร\nติดตามประกาศและกิจกรรมได้ทางเพจเฟซบุ๊กอย่างเป็นทางการ', seoTitle: '', seoDescription: '' },
    { id: 'n2', slug: 'pre-registration', title: 'เปิดลงทะเบียนล่วงหน้า', date: '2026-10-25', tag: 'EVENT', published: false, image: '', titleEn: 'Pre-registration is open', excerptEn: 'Pre-register to earn special rewards before anyone else.', bodyEn: 'Details coming soon.', excerpt: 'ลงทะเบียนเพื่อรับรางวัลพิเศษก่อนใคร', body: 'รายละเอียดจะประกาศเร็วๆ นี้', seoTitle: '', seoDescription: '' }
  ]
});
// every page also gets: hide-from-Google switch and its own share image
module.exports = () => {
  const s = base();
  for (const p of Object.values(s.pages)) Object.assign(p, { noindex: '', ogImage: '' });
  return s;
};

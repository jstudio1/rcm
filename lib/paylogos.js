// Logos of the top-up channels (files in public/img/pay). A channel without a logo of its own in the settings uses the
// standard one for its id, so the storefront top-up page and the game back office always show the same pictures.
const LOGOS = {
  'truemoney-cashcard': '/img/pay/truemoney-cashcard.webp',
  'razer-gold': '/img/pay/razer-gold.webp',
  promptpay: '/img/pay/promptpay.webp',
  alipay: '/img/pay/alipay.webp',
  'truemoney-wallet': '/img/pay/truemoney-wallet.webp'
};
// a custom logo is used only when it is an https address or a path on this site (the same rule as every picture on the site)
const SAFE = /^(https:\/\/[^\s"'<>\\]+|\/(?!\/)[^\s"'<>\\]*)$/;
const logoFor = (id, custom) => (SAFE.test(String(custom || '').trim()) && !/(^|\/)\.\.(\/|$)/.test(String(custom)) ? String(custom).trim() : LOGOS[id] || '');
module.exports = { LOGOS, logoFor };

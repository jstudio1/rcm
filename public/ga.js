// Google Analytics 4: loaded only when a GA4 ID is set in the admin (Site settings > SEO tools).
// Kept as a file (not inline) so the page's Content-Security-Policy can stay strict.
(function () {
  var s = document.currentScript, id = s && s.getAttribute('data-ga');
  if (!id) return;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', id, { anonymize_ip: true });
})();

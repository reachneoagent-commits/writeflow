// Set theme and language before styles apply, to avoid a flash. (CSP does not allow inline scripts, so this is its own file.)
(function () {
  var d = document.documentElement, q = new URLSearchParams(location.search), s = {};
  try { s.theme = localStorage.getItem('hz.theme'); } catch (e) {}
  var theme = q.get('theme') || s.theme;
  if (theme === 'light' || theme === 'dark') d.setAttribute('data-theme', theme);
  d.lang = 'en';
  d.setAttribute('data-lang', 'en');
  if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) d.classList.add('mac');
})();

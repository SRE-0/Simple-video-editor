/* ---------- tema claro / oscuro / automático ---------- */
function setTheme(m) {
  if (!['auto', 'light', 'dark'].includes(m)) m = 'auto';
  try { localStorage.setItem('theme', m); } catch (e) {}
  if (m === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = m;
  document.querySelectorAll('#themeSeg button').forEach(b => { b.classList.toggle('on', b.dataset.m === m); b.setAttribute('aria-pressed', String(b.dataset.m === m)); });
  readColors(); draw();
}
document.querySelectorAll('#themeSeg button').forEach(b => b.onclick = () => setTheme(b.dataset.m));
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });
let saved = 'auto'; try { saved = localStorage.getItem('theme') || 'auto'; } catch (e) {}
setTheme(saved);
lock(true);

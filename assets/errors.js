// Shows a small message at the bottom of the screen if something on the page
// breaks, so problems are visible on a kiosk screen without developer tools.
(() => {
  let shown = 0;
  function show(msg) {
    if (shown++ > 2) return; // don't flood the screen
    const put = () => {
      let bar = document.getElementById('error-bar');
      if (!bar) {
        bar = document.createElement('button');
        bar.id = 'error-bar';
        bar.title = 'Tap to reload';
        bar.onclick = () => location.reload();
        document.body.appendChild(bar);
      }
      bar.textContent = `⚠ ${msg} — tap to reload`;
    };
    document.body ? put() : document.addEventListener('DOMContentLoaded', put);
  }
  window.addEventListener('error', e => {
    const t = e.target;
    if (t && t !== window) {
      // A file failed to load: only the page's own code matters (images can fail harmlessly).
      if (t.tagName === 'SCRIPT' || t.tagName === 'LINK') show(`Couldn't load ${(t.src || t.href).split('/').pop().split('?')[0]}`);
      return;
    }
    show(e.message || 'Something went wrong');
  }, true);
  window.addEventListener('unhandledrejection', e => show((e.reason && e.reason.message) || 'Something went wrong'));
})();

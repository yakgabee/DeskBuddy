// Kiosk mode (set by kiosk.sh opening "?kiosk"): hides the mouse pointer.
// Remembered on this screen; open "?kiosk=0" to turn it off again.
(() => {
  const KEY = 'deskbuddy.kiosk';
  const q = new URLSearchParams(location.search);
  try {
    if (q.has('kiosk')) {
      if (q.get('kiosk') === '0') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, '1');
    }
    if (localStorage.getItem(KEY) === '1') document.documentElement.classList.add('kiosk');
  } catch (e) {
    if (q.has('kiosk') && q.get('kiosk') !== '0') document.documentElement.classList.add('kiosk');
  }
})();

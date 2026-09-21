/* ═══════════════════════════════════════════════════════════════════
   LIFEHUB TV FRAME
   ───────────────────────────────────────────────────────────────────
   Every LifeHub page is designed on a 1920×1080 desktop monitor. The
   TV (TCL Google TV, 4K panel, BrowseHere browser) tells pages it is
   only ~960×540, so the desktop layout gets squeezed and looks zoomed
   in.

   On the TV this file makes the browser lay the page out at 1920 wide
   — same frame as the monitor — and scale it to fill the screen. The
   CSS itself is untouched; monitor, tablet and phone are unaffected.

   Load it in <head>, directly after the viewport <meta>:
       <script src="JS/lifehub-tv-frame.js"></script>

   ── MANUAL OVERRIDE (remembered per device) ────────────────────────
       ?tv=1       force TV frame on
       ?tv=0       force it off
       ?tv=auto    back to auto-detect
       ?tv=debug   show a readout of what the screen reports
═══════════════════════════════════════════════════════════════════ */

(function () {
  var DESIGN_WIDTH = 1920;
  var STORE_KEY = 'lifehub.tvFrame';

  function store(value) {
    try {
      if (value === null) localStorage.removeItem(STORE_KEY);
      else localStorage.setItem(STORE_KEY, value);
    } catch (e) {}
  }

  function stored() {
    try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }

  var param = (location.search.match(/[?&]tv=([^&]*)/) || [])[1];
  if (param === '1' || param === '0') store(param);
  if (param === 'auto') store(null);

  /* TVs have no touchscreen and sit landscape. Tablets are Android too
     but report touch points, so they are left alone. */
  function looksLikeTV() {
    var ua = navigator.userAgent;
    if (/\bTV\b|GoogleTV|Android TV|SMART-TV|BRAVIA|AFT\w/i.test(ua)) return true;
    var androidish = /Android|Linux/i.test(ua) && !/Windows|Macintosh|CrOS/i.test(ua);
    var noTouch = !navigator.maxTouchPoints;
    var landscape = screen.width >= screen.height;
    return androidish && noTouch && landscape;
  }

  var forced = stored();
  var active = forced === '1' || (forced !== '0' && looksLikeTV());

  var before = {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: document.documentElement.clientHeight || window.innerHeight
  };

  if (active) {
    document.documentElement.classList.add('lh-tv');

    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }

    var scale = Math.round((before.width / DESIGN_WIDTH) * 10000) / 10000;
    meta.setAttribute('content',
      'width=' + DESIGN_WIDTH +
      ', initial-scale=' + scale +
      ', minimum-scale=' + scale +
      ', maximum-scale=' + scale +
      ', user-scalable=no');

    /* Some WebViews ignore the viewport tag. If the page still isn't
       1920 wide once it loads, scale the whole document instead. */
    window.addEventListener('load', function () {
      var w = window.innerWidth;
      if (Math.abs(w - DESIGN_WIDTH) > 4 && w < DESIGN_WIDTH) {
        document.documentElement.style.zoom = w / DESIGN_WIDTH;
        document.documentElement.classList.add('lh-tv-zoom');
      }
    });
  }

  if (param === 'debug') {
    window.addEventListener('load', function () {
      var box = document.createElement('pre');
      box.style.cssText =
        'position:fixed;left:24px;bottom:24px;z-index:2147483647;margin:0;' +
        'padding:16px 20px;max-width:900px;white-space:pre-wrap;' +
        'font:20px/1.4 monospace;color:#fff;background:rgba(0,0,0,.85);' +
        'border-radius:12px;pointer-events:none;';
      box.textContent =
        'LifeHub TV frame: ' + (active ? 'ON' : 'OFF') +
        (forced ? '  (forced ' + (forced === '1' ? 'on' : 'off') + ')' : '  (auto)') + '\n' +
        'Mode: ' + (document.documentElement.classList.contains('lh-tv-zoom') ? 'zoom fallback' : 'viewport') + '\n' +
        'Before: ' + before.width + '×' + before.height + '\n' +
        'Now:    ' + window.innerWidth + '×' + window.innerHeight + '\n' +
        'Screen: ' + screen.width + '×' + screen.height + '  DPR ' + window.devicePixelRatio + '\n' +
        'Touch points: ' + navigator.maxTouchPoints + '\n' +
        'UA: ' + navigator.userAgent;
      document.body.appendChild(box);
    });
  }
})();

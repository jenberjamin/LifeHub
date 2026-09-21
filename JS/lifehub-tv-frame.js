/* ═══════════════════════════════════════════════════════════════════
   LIFEHUB TV FRAME
   ───────────────────────────────────────────────────────────────────
   Every LifeHub page is designed on a 1920×1080 desktop monitor. The
   TV (TCL Google TV, 4K panel, BrowseHere browser) tells pages it is
   only ~960×540, so the desktop layout gets squeezed and looks zoomed
   in.

   BrowseHere ignores the viewport <meta>, and zooming the page doesn't
   work either: vw/vh units and media queries still measure the real
   960px screen, so every app broke in its own way.

   So on the TV the page is shown on a STAGE: a 1920×1080 iframe, shrunk
   to fit the screen. Inside it the page really has a 1920×1080 window,
   so px, %, vw, vh, media queries and innerWidth all behave exactly as
   on the monitor. The CSS itself is untouched; monitor, tablet and
   phone never see the stage.

   Load it in <head>, directly after the viewport <meta> and before any
   other script (it stops the outer page before the rest loads):
       <script src="JS/lifehub-tv-frame.js"></script>

   ── MANUAL OVERRIDE (remembered per device) ────────────────────────
       ?tv=1       force TV frame on
       ?tv=0       force it off
       ?tv=auto    back to auto-detect
       ?tv=debug   show a readout of what the screen reports
═══════════════════════════════════════════════════════════════════ */

(function () {
  var DESIGN_WIDTH = 1920;
  var DESIGN_HEIGHT = 1080;
  var STAGE_ID = 'lh-tv-stage';
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

  /* ── INSIDE THE STAGE ───────────────────────────────────────────────
     This is the real page, already 1920×1080. Tag it for TV-only CSS
     and Poppy, and keep the TV's address bar and title in step so a
     reload comes back to the same page. */
  var stage = null;
  try { stage = window.frameElement; } catch (e) {}
  if (stage && stage.id === STAGE_ID) {
    document.documentElement.classList.add('lh-tv');
    window.addEventListener('load', function () {
      try {
        window.top.history.replaceState(null, '', location.href);
        window.top.document.title = document.title;
      } catch (e) {}
      window.focus();
    });
    if (param === 'debug') showDebug('stage');
    return;
  }

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

  if (!active) {
    if (param === 'debug') showDebug('off');
    return;
  }

  /* ── BUILD THE STAGE ────────────────────────────────────────────────
     Keep the page's own viewport <meta>, pinned to the real screen at
     100%: browsers that obey it and browsers that ignore it (like
     BrowseHere) then both give the stage the same screen to fit into. */
  var viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) viewport.setAttribute('content',
    'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no');

  /* Write the stage in, then open a hidden <plaintext>: the browser
     reads the rest of the outer page as plain text, so its styles and
     scripts never run. Firebase, Poppy and navigation only ever run
     once — inside the stage. */
  var src = location.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  document.write(
    '<title>LifeHub</title>' +
    '<style>' +
      'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}' +
      '#' + STAGE_ID + '{position:absolute;left:0;top:0;border:0;display:block;' +
        'width:' + DESIGN_WIDTH + 'px;height:' + DESIGN_HEIGHT + 'px;' +
        'transform-origin:0 0;background:#000}' +
    '</style></head><body>' +
    '<iframe id="' + STAGE_ID + '" src="' + src + '" allowfullscreen ' +
      'allow="autoplay; fullscreen; clipboard-read; clipboard-write"></iframe>' +
    '<plaintext style="display:none">');

  var frame = document.getElementById(STAGE_ID);

  /* Fit the whole 1920×1080 frame on screen, centred. The TV is 16:9,
     so in practice it fills edge to edge. */
  function fit() {
    var w = document.documentElement.clientWidth || window.innerWidth;
    var h = document.documentElement.clientHeight || window.innerHeight;
    var s = Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT);
    var x = (w - DESIGN_WIDTH * s) / 2, y = (h - DESIGN_HEIGHT * s) / 2;
    frame.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
  }
  /* The viewport can settle a frame or two after the <meta> changes,
     so measure again once it has. */
  fit();
  requestAnimationFrame(function () { requestAnimationFrame(fit); });
  window.addEventListener('load', fit);
  window.addEventListener('resize', fit);
  frame.addEventListener('load', function () { try { frame.contentWindow.focus(); } catch (e) {} });

  function showDebug(mode) {
    window.addEventListener('load', function () {
      var box = document.createElement('pre');
      box.style.cssText =
        'position:fixed;left:24px;bottom:24px;z-index:2147483647;margin:0;' +
        'padding:16px 20px;max-width:900px;white-space:pre-wrap;' +
        'font:20px/1.4 monospace;color:#fff;background:rgba(0,0,0,.85);' +
        'border-radius:12px;pointer-events:none;';
      var f = stored();
      var outer = mode === 'stage' ? window.top : window;
      box.textContent =
        'LifeHub TV frame: ' + (mode === 'stage' ? 'ON (stage)' : 'OFF') +
        (f ? '  (forced ' + (f === '1' ? 'on' : 'off') + ')' : '  (auto)') + '\n' +
        'Page sees: ' + window.innerWidth + '×' + window.innerHeight + '\n' +
        'Screen:    ' + outer.innerWidth + '×' + outer.innerHeight +
          '  DPR ' + window.devicePixelRatio + '\n' +
        'Touch points: ' + navigator.maxTouchPoints + '\n' +
        'Poppy calls this screen: ' + (window.LIFEHUB_SCREEN
          ? '"' + window.LIFEHUB_SCREEN.name + '"' + (window.LIFEHUB_SCREEN.tv ? ' (TV)' : '')
          : '(navigation not loaded on this page)') + '\n' +
        'UA: ' + navigator.userAgent;
      document.body.appendChild(box);
    });
  }
})();

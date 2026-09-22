/* LifeHub wallpaper — Phase 1
   Clock + date + weather (top left), static controls (top right),
   mark (bottom left), logo (bottom right). */

const CONFIG = {
  hour12: true,
  latitude: 11.58,
  longitude: 122.75,
  unit: "C",          // "C" or "F"
  scrim: 0.18
};

const $ = (id) => document.getElementById(id);

/* ---------------- clock + date ---------------- */

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const DAYS = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];

function pad(n){ return n < 10 ? "0" + n : "" + n; }

function renderClock(){
  const now = new Date();
  let h = now.getHours();
  const meridiem = h >= 12 ? "PM" : "AM";

  if (CONFIG.hour12){
    h = h % 12 || 12;
    $("meridiem").textContent = meridiem;
    $("meridiem").style.display = "";
  } else {
    $("meridiem").style.display = "none";
  }

  $("time").textContent = pad(h) + ":" + pad(now.getMinutes());
  $("date").textContent =
    MONTHS[now.getMonth()] + " " + now.getDate() + ", " + now.getFullYear() +
    ", " + DAYS[now.getDay()];
}

/* tick on the minute boundary so the display never lags */
function startClock(){
  renderClock();
  const msToNextMinute = 60000 - (Date.now() % 60000);
  setTimeout(() => { renderClock(); setInterval(renderClock, 60000); }, msToNextMinute);
}

/* ---------------- weather ---------------- */

/* Open-Meteo WMO codes → icon key */
function iconKey(code){
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3 || code === 45 || code === 48) return "cloud";
  if (code >= 95) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code >= 71 && code <= 86) return "snow";
  return "cloud";
}

const ICONS = {
  clear:  '<circle cx="12" cy="12" r="4.6"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  partly: '<circle cx="8.5" cy="8.5" r="3.2"/><path d="M8 18h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.5 1.2A3 3 0 0 0 8 18z"/>',
  cloud:  '<path d="M7 18h10a3.7 3.7 0 0 0 .3-7.4 5.4 5.4 0 0 0-10.3 1.3A3.2 3.2 0 0 0 7 18z"/>',
  rain:   '<path d="M7 15h10a3.6 3.6 0 0 0 .3-7.2 5.3 5.3 0 0 0-10.2 1.3A3.1 3.1 0 0 0 7 15z"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/>',
  storm:  '<path d="M7 15h10a3.6 3.6 0 0 0 .3-7.2 5.3 5.3 0 0 0-10.2 1.3A3.1 3.1 0 0 0 7 15z"/><path d="M13 17l-3 3.5h3L10 24"/>',
  snow:   '<path d="M7 15h10a3.6 3.6 0 0 0 .3-7.2 5.3 5.3 0 0 0-10.2 1.3A3.1 3.1 0 0 0 7 15z"/><path d="M9 19h.01M12.5 20.5h.01M16 19h.01"/>'
};

const CACHE_KEY = "lifehub.weather";
const CACHE_MAX_AGE = 6 * 60 * 60 * 1000;   // hide readings older than 6 hours

/* The whole weather block is optional. If there has never been a successful
   reading — offline first run — the date line simply stands on its own. */
function showWeather(tempC, code){
  const t = CONFIG.unit === "F" ? Math.round(tempC * 9 / 5 + 32) : Math.round(tempC);
  $("temp").textContent = t + "\u00B0" + CONFIG.unit;
  $("temp").style.display = "";
  $("wx-icon").innerHTML = '<svg viewBox="0 0 24 24">' + ICONS[iconKey(code)] + '</svg>';
}

function hideWeather(){
  $("temp").style.display = "none";
  $("wx-icon").innerHTML = "";
}

function readCache(){
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (Date.now() - c.at > CACHE_MAX_AGE) return null;
    return c;
  } catch (err){ return null; }
}

function writeCache(tempC, code){
  try{
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: tempC, c: code, at: Date.now() }));
  } catch (err){ /* storage unavailable — cache is a nicety, not a requirement */ }
}

/* Paint whatever the last known reading was, so the wallpaper is never blank
   while a request is in flight or while offline. */
function paintFromCache(){
  const c = readCache();
  if (c) showWeather(c.t, c.c); else hideWeather();
}

async function fetchWeather(){
  if (navigator.onLine === false) return;   // don't bother, keep cached value

  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + CONFIG.latitude +
              "&longitude=" + CONFIG.longitude + "&current=temperature_2m,weather_code";

  const control = new AbortController();
  const bail = setTimeout(() => control.abort(), 8000);

  try{
    const res = await fetch(url, { signal: control.signal, cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    writeCache(data.current.temperature_2m, data.current.weather_code);
    showWeather(data.current.temperature_2m, data.current.weather_code);
  } catch (err){
    paintFromCache();     // network died — fall back, don't blank the display
  } finally {
    clearTimeout(bail);
  }
}

/* ---------------- slideshow ---------------- */

/* Timing is anchored to the wall clock, not to how long the wallpaper has
   been running. The slide for any given hour is worked out from the date
   itself, so a restart mid-hour restores the same image rather than
   starting a fresh hour. */

const SLIDES = {
  theme: "Default",
  hours: 1,
  enabled: true,
  deck: [],
  front: null,
  back: null,
  timer: null,
  watchdog: null,

  /* Sequence bookkeeping.
     seq  = which step of the shuffled sequence is on screen.
     base = the moment the current interval started counting. 0 means
            "anchored to the clock", so slides land on the hour. Manual
            navigation sets it to now, which restarts the full interval. */
  seq: 0,
  offset: 0,
  base: 0,
  paused: false,
  shown: ""
};

const STATE_KEY = "lifehub.state";

/* Small deterministic PRNG — same seed always gives the same order. */
function mulberry32(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function seededOrder(length, seed){
  const order = Array.from({ length }, (_, i) => i);
  const rand = mulberry32(seed);
  for (let i = order.length - 1; i > 0; i--){
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function themeNames(){
  const all = window.LIFEHUB_SLIDES || {};
  return Object.keys(all).filter(k => all[k] && all[k].length);
}

function buildDeck(){
  const all = window.LIFEHUB_SLIDES || {};
  let deck;

  if (SLIDES.theme === "Random"){
    /* every theme pooled together */
    deck = themeNames().reduce((acc, k) => acc.concat(all[k]), []);
  } else {
    deck = all[SLIDES.theme];
  }

  if (!deck || !deck.length){
    const filled = themeNames()[0];
    deck = filled ? all[filled] : [];
  }
  SLIDES.deck = deck.slice();
}

function intervalMs(){
  return Math.max(1, SLIDES.hours) * 3600000;
}

/* How many intervals have elapsed since the anchor. */
function elapsedSteps(){
  return Math.floor((Date.now() - SLIDES.base) / intervalMs());
}

/* The sequence number that should be on screen right now. */
function seqNow(){
  return elapsedSteps() + SLIDES.offset;
}

/* The order for one full pass through the deck. Deterministic for a given
   cycle, and adjusted so a pass never opens on the image the previous pass
   closed with. The adjustment applies to the whole order, not just the first
   slot — otherwise the result stops being a permutation and an image can
   appear twice within the same pass. */
function orderForCycle(n, cycle){
  const order = seededOrder(n, cycle);
  if (n > 2){
    const prev = seededOrder(n, cycle - 1);
    if (order[0] === prev[n - 1]){
      [order[0], order[1]] = [order[1], order[0]];
    }
  }
  return order;
}

function slideForSeq(seq){
  const n = SLIDES.deck.length;
  if (!n) return null;
  if (n === 1) return SLIDES.deck[0];

  const cycle = Math.floor(seq / n);
  const idx = ((seq % n) + n) % n;
  return SLIDES.deck[orderForCycle(n, cycle)[idx]];
}

/* Load first, swap second — so a slow or missing file never shows a blank
   frame or a half-painted image. */
function showSlide(url, immediate){
  return new Promise((resolve) => {
    if (!url) return resolve(false);

    const img = new Image();
    img.onload = () => {
      const incoming = SLIDES.back;
      const outgoing = SLIDES.front;

      incoming.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';

      if (immediate){
        incoming.style.transition = "none";
        incoming.classList.add("is-visible");
        void incoming.offsetWidth;          // flush, so the next change animates
        incoming.style.transition = "";
      } else {
        incoming.classList.add("is-visible");
      }

      if (outgoing) outgoing.classList.remove("is-visible");
      SLIDES.front = incoming;
      SLIDES.back = outgoing;
      SLIDES.shown = url;
      resolve(true);
    };
    img.onerror = () => resolve(false);     // caller decides what to do next
    img.src = url;
  });
}

/* Walk forward through the deck if an image is missing, so one broken file
   can't stall the whole slideshow. */
async function render(seq, immediate){
  if (!SLIDES.deck.length) return;

  for (let attempt = 0; attempt < SLIDES.deck.length; attempt++){
    if (await showSlide(slideForSeq(seq + attempt), immediate && attempt === 0)){
      SLIDES.seq = seq;
      saveState();
      return;
    }
  }
  SLIDES.seq = seq;   // nothing loaded; keep whatever is on screen
}

/* Sleep the exact distance to the next boundary, then re-arm. */
function scheduleNext(){
  clearTimeout(SLIDES.timer);
  SLIDES.timer = null;
  if (SLIDES.paused || !SLIDES.enabled) return;

  const ms = intervalMs();
  const since = Date.now() - SLIDES.base;
  const wait = ms - (((since % ms) + ms) % ms);

  SLIDES.timer = setTimeout(() => {
    render(seqNow(), false);
    scheduleNext();
  }, wait + 250);
}

/* A long sleep or a system clock change can swallow the timer above.
   This catches up within a minute of the machine waking. */
function startWatchdog(){
  clearInterval(SLIDES.watchdog);
  SLIDES.watchdog = setInterval(() => {
    if (SLIDES.paused || !SLIDES.enabled) return;
    const s = seqNow();
    if (s !== SLIDES.seq){
      render(s, false);
      scheduleNext();
    }
  }, 60000);
}

/* Manual navigation. Moves by delta and restarts the interval from now,
   so stepping at 3:20 gives a full hour rather than 40 minutes. */
function stepSlide(delta){
  if (!SLIDES.deck.length) return;

  const target = seqNow() + delta;
  SLIDES.base = Date.now();
  SLIDES.offset = target - elapsedSteps();

  render(target, false);
  scheduleNext();
}

function setPaused(paused){
  SLIDES.paused = paused;
  if (paused){
    clearTimeout(SLIDES.timer);
    SLIDES.timer = null;
  } else {
    /* resuming gives a fresh full interval rather than an instant change */
    const cur = seqNow();
    SLIDES.base = Date.now();
    SLIDES.offset = cur - elapsedSteps();
    scheduleNext();
  }
  saveState();
}

function setTheme(name){
  const cur = SLIDES.theme;
  SLIDES.theme = name;
  buildDeck();
  if (!SLIDES.deck.length){ SLIDES.theme = cur; buildDeck(); return; }

  /* land on a fresh image and restart the interval */
  SLIDES.base = Date.now();
  SLIDES.offset = -elapsedSteps();
  render(0, false);
  scheduleNext();
  saveState();
}

/* ---------------- persisted preferences ---------------- */
/* Theme, colour, pause and position survive a reload. The lock never does —
   it is only ever engaged by clicking it. */

function saveState(){
  try{
    localStorage.setItem(STATE_KEY, JSON.stringify({
      theme: SLIDES.theme,
      paused: SLIDES.paused,
      offset: SLIDES.offset,
      base: SLIDES.base,
      color: PAINT.index,
      mode: CHAT.mode ? CHAT.mode.id : null,
      voice: { on: VOICE.on, uri: VOICE.uri, rate: VOICE.rate, pitch: VOICE.pitch,
               engine: VOICE.engine, gvoice: VOICE.gvoice, gmodel: VOICE.gmodel,
               gstyle: VOICE.gstyle, gkey: VOICE.gkey }
    }));
  } catch (err){ /* storage unavailable — preferences just won't persist */ }
}

function loadState(){
  try{
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.theme === "string") SLIDES.theme = s.theme;
    if (typeof s.paused === "boolean") SLIDES.paused = s.paused;
    if (typeof s.offset === "number") SLIDES.offset = s.offset;
    if (typeof s.base === "number") SLIDES.base = s.base;
    if (typeof s.color === "number") PAINT.index = s.color;
    if (typeof s.mode === "string") CHAT.savedModeId = s.mode;
    if (s.voice && typeof s.voice === "object"){
      if (typeof s.voice.on === "boolean") VOICE.on = s.voice.on;
      if (typeof s.voice.uri === "string") VOICE.uri = s.voice.uri;
      if (typeof s.voice.rate === "number") VOICE.rate = s.voice.rate;
      if (typeof s.voice.pitch === "number") VOICE.pitch = s.voice.pitch;
      ["engine", "gvoice", "gmodel", "gstyle", "gkey"].forEach(k => {
        if (typeof s.voice[k] === "string") VOICE[k] = s.voice[k];
      });
    }
  } catch (err){ /* unreadable — fall back to defaults */ }
}

function startSlideshow(){
  SLIDES.front = $("layer-a");
  SLIDES.back = $("layer-b");

  /* Older markup didn't have the two layers. Say so plainly rather than
     throwing, which would take down everything after this call. */
  if (!SLIDES.front || !SLIDES.back){
    console.warn("LifeHub: layer-a / layer-b missing from the page — " +
                 "LifeHub-HomeScreen.html is out of date. Slideshow disabled.");
    return;
  }

  buildDeck();

  if (!SLIDES.enabled || !SLIDES.deck.length){
    /* No deck — fall back to the single background from the CSS variable. */
    SLIDES.front.classList.add("is-visible");
    return;
  }

  render(seqNow(), true);
  scheduleNext();
  startWatchdog();
}

function restartSlideshow(){
  if (!SLIDES.front || !SLIDES.back) return;
  buildDeck();
  clearTimeout(SLIDES.timer);
  if (!SLIDES.enabled || !SLIDES.deck.length){
    SLIDES.front.classList.add("is-visible");
    return;
  }
  render(seqNow(), false);
  scheduleNext();
  startWatchdog();
}

/* ---------------- logo fallback ---------------- */

function guardLogo(){
  const logo = $("logo");
  if (!logo) return;

  const hide = () => { logo.style.visibility = "hidden"; };

  /* The browser may have already tried and failed to load this before the
     script ran, in which case the error event has been and gone. Check the
     finished state too, or a missing logo shows as a broken-image icon. */
  if (logo.complete && logo.naturalWidth === 0) hide();
  logo.addEventListener("error", hide);
}

/* ---------------- paint ---------------- */

const PAINT = {
  index: 0,
  colors: [
    { name: "White",        ink: "#ffffff" },
    { name: "Cream",        ink: "#f4e9d2" },
    { name: "Black",        ink: "#12100e" },
    { name: "Light Brown",  ink: "#c99a6a" },
    { name: "Dark Brown",   ink: "#6f4b2e" },
    { name: "Cherry Red",   ink: "#e0384c" },
    { name: "Crimson",      ink: "#9c1b31" },
    { name: "Cyan",         ink: "#00e5ff" },
    { name: "Green",        ink: "#35c46a" },
    { name: "Gray",         ink: "#a7adb4" },
    { name: "Pastel Green", ink: "#aedcbf" },
    { name: "Evergreen",    ink: "#0d5c3d" },
    { name: "Moss Green",   ink: "#7d9455" }
  ]
};

/* Dark inks need a light shadow behind them or they vanish into a dark photo,
   so the glow flips to white below a brightness threshold. */
function relLuminance(hex){
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/* Blend two hex colours. t=0 gives the first, t=1 the second. */
function mixHex(a, b, t){
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  return [
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t)
  ];
}
const rgba = (c, a) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";

/* The chat panel is tinted from the paint colour rather than fixed, so a
   light ink gives a light panel with dark text and a dark ink gives the
   reverse. Contrast is derived, never hand-picked per colour. */
function applyChatSkin(ink){
  const root = document.documentElement.style;
  const light = relLuminance(ink) > 0.42;

  const surface = light ? mixHex(ink, "#ffffff", 0.34) : mixHex(ink, "#0a0a0c", 0.80);
  const text    = light ? mixHex(ink, "#14110c", 0.86) : mixHex(ink, "#ffffff", 0.90);
  const accent  = light ? mixHex(ink, "#000000", 0.52) : mixHex(ink, "#ffffff", 0.30);

  root.setProperty("--chat-bg",    rgba(surface, light ? 0.86 : 0.78));
  root.setProperty("--chat-ink",   rgba(text, 1));
  root.setProperty("--chat-dim",   rgba(text, 0.58));
  root.setProperty("--chat-line",  rgba(text, light ? 0.16 : 0.13));
  root.setProperty("--chat-raise", rgba(text, light ? 0.07 : 0.08));
  root.setProperty("--chat-accent", rgba(accent, 1));

  /* my bubble carries the colour, Poppy's stays neutral against the panel */
  root.setProperty("--chat-me",      rgba(mixHex(ink, light ? "#000000" : "#ffffff", light ? 0.18 : 0.10), light ? 0.30 : 0.22));
  root.setProperty("--chat-me-line", rgba(accent, light ? 0.40 : 0.42));
  root.setProperty("--chat-her",     light ? "rgba(255,255,255,.62)" : rgba(text, 0.09));
  root.setProperty("--chat-her-line", rgba(text, light ? 0.14 : 0.12));
  root.setProperty("--chat-scroll",  rgba(text, 0.28));

  /* Errors. These used to be a fixed pale pink, which only reads on a
     dark panel — on the light ones (White, Cream, Pastel Green) it was
     pink on pink. Same rule as the rest: light panel, dark text.
     Deep red on a faint red wash, or soft pink on a deeper one. */
  root.setProperty("--chat-err-ink",  light ? "#8f1426" : "#ffc2c8");
  root.setProperty("--chat-err-bg",   light ? "rgba(224,56,76,.10)" : "rgba(255,90,106,.16)");
  root.setProperty("--chat-err-line", light ? "rgba(160,24,44,.38)" : "rgba(255,90,106,.40)");
}

function applyPaint(){
  const c = PAINT.colors[PAINT.index % PAINT.colors.length];
  const root = document.documentElement.style;
  const strength = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--shadow-strength")) || 1;

  root.setProperty("--ink", c.ink);
  root.setProperty("--ink-soft", c.ink);

  /* Dark inks disappear into a dark photo unless the glow behind them flips
     to light. Shadow strength still scales it, so the Lively slider works
     against either polarity. */
  const dark = relLuminance(c.ink) < 0.22;
  const alpha = Math.min(1, (dark ? 0.70 : 0.55) * strength);
  root.setProperty("--halo", (dark ? "rgba(255,255,255," : "rgba(0,0,0,") + alpha.toFixed(2) + ")");

  applyChatSkin(c.ink);

  const label = $("paint-name");
  if (label){
    label.textContent = c.name;
    label.classList.add("is-shown");
    clearTimeout(applyPaint._t);
    applyPaint._t = setTimeout(() => label.classList.remove("is-shown"), 1400);
  }
}

function cyclePaint(){
  PAINT.index = (PAINT.index + 1) % PAINT.colors.length;
  applyPaint();
  saveState();
}

/* ---------------- lock ---------------- */

const LOCK = { code: "236812", entered: "", locked: false };

function setLocked(locked){
  LOCK.locked = locked;
  document.body.classList.toggle("is-locked", locked);
  const btn = $("ctl-lock");
  btn.setAttribute("aria-label", locked ? "Unlock interface" : "Lock interface");
  btn.title = locked ? "Locked — click to unlock" : "Lock";
  if (locked){
    closePanel("gallery");
    /* hide it, don't clear it — the lock is about blocking input, not
       throwing away the conversation */
    if ($("chat") && $("chat").classList.contains("is-open")) minimiseChat();
  }
  closePanel("code-modal");
}

/* Locking is one click. Unlocking asks for the code — that way the screen
   can be secured instantly and only deliberately released. */
function openUnlockModal(){
  LOCK.entered = "";
  renderKeypadDots();
  $("lock-error").classList.remove("is-shown");
  openPanel("code-modal");
}

function renderKeypadDots(){
  const dots = $("code-dots");
  if (!dots) return;
  dots.innerHTML = "";
  for (let i = 0; i < LOCK.code.length; i++){
    const d = document.createElement("span");
    d.className = "dot" + (i < LOCK.entered.length ? " is-filled" : "");
    dots.appendChild(d);
  }
}

function pressKey(digit){
  if (LOCK.entered.length >= LOCK.code.length) return;
  LOCK.entered += digit;
  renderKeypadDots();

  if (LOCK.entered.length === LOCK.code.length){
    if (LOCK.entered === LOCK.code){
      setLocked(false);
    } else {
      const box = $("lock-box");
      $("lock-error").classList.add("is-shown");
      box.classList.remove("shake");
      void box.offsetWidth;
      box.classList.add("shake");
      LOCK.entered = "";
      renderKeypadDots();
    }
  }
}

/* ---------------- panels ---------------- */

function openPanel(id){
  const el = $(id);
  if (el) el.classList.add("is-open");
}
function closePanel(id){
  const el = $(id);
  if (el) el.classList.remove("is-open");
}
function togglePanel(id){
  const el = $(id);
  if (el) el.classList.toggle("is-open");
}

function buildGallery(){
  const list = $("gallery-list");
  if (!list) return;
  list.innerHTML = "";

  const names = themeNames().concat(["Random"]);
  names.forEach(name => {
    const item = document.createElement("button");
    item.className = "gallery-opt" + (name === SLIDES.theme ? " is-active" : "");
    item.type = "button";
    item.textContent = name;
    item.addEventListener("click", () => {
      setTheme(name);
      buildGallery();
      closePanel("gallery");
    });
    list.appendChild(item);
  });

  if (!names.length){
    const empty = document.createElement("p");
    empty.className = "gallery-empty";
    empty.textContent = "No images yet. Add folders under CSS/files/slides, then run --scan.";
    list.appendChild(empty);
  }
}

/* ---------------- play / pause icon ---------------- */
/* The icon reports state rather than action: a play mark means the slideshow
   is running; a pause mark means it is held. */

const ICON_PLAY  = '<path d="M8 5v14l11-7z"/>';
const ICON_PAUSE = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';

function refreshPlayIcon(){
  const btn = $("ctl-play");
  if (!btn) return;
  const svg = btn.querySelector("svg");
  svg.innerHTML = SLIDES.paused ? ICON_PAUSE : ICON_PLAY;
  btn.classList.toggle("is-active", SLIDES.paused);
  btn.setAttribute("aria-label", SLIDES.paused ? "Slideshow paused" : "Slideshow running");
  btn.title = SLIDES.paused ? "Paused — click to resume" : "Running — click to pause";
}

/* ---------------- Poppy ---------------- */

const CHAT = {
  mode: null,
  /* One source of truth. Every entry: { id, role, text, at }
     `at` is a full ISO timestamp — the date is kept even though only the
     time is ever drawn, so anything downstream has the real date. */
  messages: [],
  busy: false,
  abort: null,
  savedModeId: null,
  editing: null
};

let msgSeq = 0;
const newId = () => "m" + (++msgSeq) + "-" + Date.now().toString(36);

const EMOJI_GROUPS = [
  { name: "Smileys", chars: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤗 🤭 🫢 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 🥱 😵 🤯 🥳 🥺 🥹 😢 😭 😤 😠 😡 🤬 😳 😱 😨 😰 😥 😓 🫠 🤒 🤕 🤧 🥶 🥵 😎 🤓 🧐 🤠" },
  { name: "People",  chars: "👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👋 🤚 🖐️ ✋ 🖖 👏 🙌 🫶 👐 🤲 🤝 🙏 💪 🦾 🧠 👀 👁️ 👄 🫀 🗣️ 👤 🧍 🚶 🏃 💃 🕺 🧘 🤷 🤦 💁 🙋 🙆 🙅 💅" },
  { name: "Hearts",  chars: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 🩶 🩷 🩵 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ✨ 💫 ⭐ 🌟 💥 🔥 💯 ✅ ❌ ❗ ❓ 💤 💭 💬" },
  { name: "Nature",  chars: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦆 🦉 🦋 🐝 🐞 🐢 🐙 🐬 🐳 🦈 🐴 🦄 🌱 🌿 🍀 🌵 🌴 🌳 🌸 🌼 🌻 🌹 🌺 🍁 🍂 🌊 🌙 ☀️ ⛅ ☁️ 🌧️ ⛈️ 🌈 ❄️ 💧 🌍" },
  { name: "Food",    chars: "🍎 🍌 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🌽 🥕 🍞 🥐 🧀 🥚 🍳 🥞 🧇 🥓 🍔 🍟 🍕 🌭 🌮 🌯 🥗 🍝 🍜 🍲 🍣 🍤 🍚 🍙 🥟 🍦 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍿 ☕ 🍵 🧋 🥤 🧃 🍺 🍷 🥂" },
  { name: "Objects", chars: "💻 🖥️ ⌨️ 🖱️ 📱 ⌚ 🎧 🎙️ 📷 🎬 🎨 🖌️ ✏️ 🖊️ 📝 📔 📚 📖 📅 📌 📎 🔍 🔑 🔒 🔓 💡 🔋 🧹 🧺 🛏️ 🚿 🪴 🕯️ 🎁 🎈 🎉 🎊 🏆 🥇 🎯 🎮 🎲 🧩 ⚽ 🏀 🎵 🎶 🎸 🚗 ✈️ 🏠 🏡 🗺️ ⏰ ⏳ 💰 💳" }
];

const EMOJI = EMOJI_GROUPS.reduce((all, g) => all.concat(g.chars.split(" ")), []);

function activeModes(){
  return (window.POPPY && Array.isArray(window.POPPY.modes) && window.POPPY.modes.length)
    ? window.POPPY.modes
    : [{ id: "casual", label: "Casual", blurb: "", system: "" }];
}

function setMode(mode){
  CHAT.mode = mode;
  $("mode-label").textContent = mode.label;
  buildModeMenu();
  saveState();
}

function buildModeMenu(){
  const menu = $("mode-menu");
  if (!menu) return;
  menu.innerHTML = "";

  activeModes().forEach(mode => {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "mode-opt" + (CHAT.mode && mode.id === CHAT.mode.id ? " is-active" : "");
    opt.setAttribute("role", "option");
    opt.innerHTML = '<span class="m-label"></span>' +
                    (mode.blurb ? '<span class="m-blurb"></span>' : "");
    opt.querySelector(".m-label").textContent = mode.label;
    if (mode.blurb) opt.querySelector(".m-blurb").textContent = mode.blurb;

    opt.addEventListener("click", () => { setMode(mode); closeModeMenu(); });
    menu.appendChild(opt);
  });
}

function closeModeMenu(){
  $("mode-menu").classList.remove("is-open");
  $("mode-btn").setAttribute("aria-expanded", "false");
}

/* ---------------- rendering ---------------- */

/* Time only on screen; the full date rides along in the title attribute
   and in the stored ISO string. */
function clockLabel(iso){
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
}
function dateLabel(iso){
  return new Date(iso).toLocaleString([], {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit"
  });
}

function renderEmpty(){
  const log = $("chat-log");
  log.innerHTML = "";
  const p = document.createElement("p");
  p.className = "chat-empty";
  p.textContent = CHAT.mode && CHAT.mode.blurb ? CHAT.mode.blurb : "Say something to Poppy.";
  log.appendChild(p);
}

function bubbleFor(msg){
  const wrap = document.createElement("div");
  wrap.className = "bubble " + (msg.role === "user" ? "me" : "her");
  wrap.dataset.id = msg.id;

  const body = document.createElement("div");
  body.className = "b-text";
  body.textContent = msg.text;

  const stamp = document.createElement("time");
  stamp.className = "b-time";
  stamp.dateTime = msg.at;
  stamp.textContent = clockLabel(msg.at);
  stamp.title = dateLabel(msg.at);

  wrap.appendChild(body);

  if (msg.done && msg.done.length){
    const row = document.createElement("div");
    row.className = "b-done";
    msg.done.forEach(label => {
      const chip = document.createElement("span");
      chip.className = "done-chip";
      chip.textContent = label;
      row.appendChild(chip);
    });
    wrap.appendChild(row);
  }

  wrap.appendChild(stamp);
  return wrap;
}

function scrollLog(){
  const log = $("chat-log");
  log.scrollTop = log.scrollHeight;
}

/* Full rebuild, used after edit / delete / regenerate. Appending is handled
   separately so the ordinary case keeps its entrance animation. */
function renderLog(){
  const log = $("chat-log");
  if (!CHAT.messages.length){ renderEmpty(); return; }

  log.innerHTML = "";
  log.classList.add("no-anim");
  CHAT.messages.forEach(m => log.appendChild(bubbleFor(m)));
  void log.offsetWidth;
  log.classList.remove("no-anim");
  scrollLog();
}

function addMessage(role, text, extra){
  const msg = Object.assign({ id: newId(), role, text, at: new Date().toISOString() }, extra || {});
  CHAT.messages.push(msg);

  const log = $("chat-log");
  const empty = log.querySelector(".chat-empty");
  if (empty) empty.remove();
  log.appendChild(bubbleFor(msg));
  scrollLog();
  return msg;
}

function addError(text){
  const log = $("chat-log");
  const empty = log.querySelector(".chat-empty");
  if (empty) empty.remove();
  const el = document.createElement("div");
  el.className = "bubble err";
  el.textContent = text;
  log.appendChild(el);
  scrollLog();
  return el;
}

function showTyping(){
  const log = $("chat-log");
  const el = document.createElement("div");
  el.className = "bubble her typing-row";
  el.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  log.appendChild(el);
  scrollLog();
  return el;
}

function autoGrow(){
  const box = $("chat-input");
  box.style.height = "auto";
  box.style.height = Math.min(box.scrollHeight, 104) + "px";
}

function refreshSendState(){
  $("chat-send").disabled = CHAT.busy || !$("chat-input").value.trim();
}

/* ---------------- talking ---------------- */

/* Asks for a reply to whatever the last user message is. Used by send,
   by regenerate, and by edit — they only differ in what they do to the
   list beforehand. */
async function requestReply(){
  const last = CHAT.messages[CHAT.messages.length - 1];
  if (!last || last.role !== "user") return;

  CHAT.busy = true;
  refreshSendState();
  const typing = showTyping();

  CHAT.abort = new AbortController();
  /* What Poppy is told about her own past turns.
     Her reply text alone leaves out what actually happened when she acted:
     the receipts hang on the message object and the failures only ever
     reached the DOM. So she'd say "Unpinned LifeHub", the write would
     throw, Jen would see red — and next turn Poppy would carry on as
     though it had worked, because nothing ever told her otherwise.
     Folded in as a bracketed aside so it reads as record, not as
     something she said. */
  const history = CHAT.messages.slice(0, -1).map(m => {
    let text = m.text;
    if (m.done && m.done.length)     text += "\n[done: " + m.done.join("; ") + "]";
    if (m.failed && m.failed.length) text += "\n[failed: " + m.failed.join("; ") + "]";
    return { role: m.role, text: text };
  });

  try{
    if (!window.POPPY || typeof window.POPPY.send !== "function"){
      throw new Error("window.POPPY.send() isn't defined — see JS/LifeHub-poppy.js");
    }
    const reply = await window.POPPY.send({
      text: last.text,
      mode: CHAT.mode,
      history,
      signal: CHAT.abort.signal
    });

    typing.remove();
    const raw = String(reply == null ? "" : reply).trim();

    /* The action block is machinery, not conversation — it comes out of the
       text before anything is shown or spoken. */
    const { clean, actions } = extractActions(raw);
    const done = [];
    const refused = [];

    /* Actions may be async — wallpaper ones aren't, Scribble writes are.
       Awaiting each keeps the receipt honest and lets a thrown message
       through instead of showing a pending Promise. */
    /* A bare "?" is what this used to print when a command arrived with
       no action name, which told nobody anything — including Poppy, who
       reads these back next turn. Naming what actually turned up means
       a malformed block is debuggable from the chat itself. */
    const nameOf = (cmd) => {
      if (cmd && cmd.action) return String(cmd.action);
      if (!cmd || typeof cmd !== "object") return "an unreadable action";
      const keys = Object.keys(cmd).slice(0, 4).join(", ");
      return "an action with no name" + (keys ? " (fields: " + keys + ")" : "");
    };

    for (const cmd of actions){
      try{
        const label = await window.LIFEHUB_ACTIONS.run(cmd);
        if (label) done.push(label);
        else refused.push(nameOf(cmd));
      } catch (err){
        refused.push((err && err.message) ? err.message : nameOf(cmd));
      }
    }

    const answer = clean || (done.length ? "Done." : "");

    if (answer){
      /* refused is attached as well as shown. The red bubble is for Jen;
         this is the copy Poppy gets to read back next turn. */
      const meta = {};
      if (done.length)    meta.done = done;
      if (refused.length) meta.failed = refused;
      addMessage("poppy", answer, Object.keys(meta).length ? meta : null);
      if (VOICE.on) speak(answer);
    } else if (!actions.length){
      addError("Poppy returned an empty reply.");
    }

    if (refused.length){
      addError("Couldn't do: " + refused.join(", ") +
               (refused.includes("unlock") ? " — unlocking needs your code." : ""));
    }
  } catch (err){
    typing.remove();
    if (!(err && err.name === "AbortError")){
      addError((err && err.message) ? err.message : "Something went wrong.");
    }
  } finally {
    CHAT.busy = false;
    CHAT.abort = null;
    refreshSendState();
    scrollLog();
  }
}

async function sendMessage(){
  const box = $("chat-input");
  const text = box.value.trim();
  if (!text || CHAT.busy) return;

  box.value = "";
  autoGrow();
  stopDictation();
  stopSpeaking();
  /* Open the line to Google's voice while Poppy thinks, so the reply's
     audio request doesn't also pay for the connection. */
  if (VOICE.on && VOICE.engine === "gemini" && window.POPPY_VOICE) window.POPPY_VOICE.warm();
  addMessage("user", text);

  $("emoji-tray").classList.remove("is-open");
  $("emoji-btn").setAttribute("aria-expanded", "false");

  await requestReply();
}

/* ---------------- message actions ---------------- */

function indexOfMsg(id){
  return CHAT.messages.findIndex(m => m.id === id);
}

/* Clipboard API needs a secure context, which file:// isn't — so fall back
   to the old execCommand path rather than doing nothing. */
async function copyText(text){
  try{
    if (navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err){ /* fall through */ }

  try{
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (err){ return false; }
}

function flashToast(text){
  const el = $("chat-toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("is-shown");
  clearTimeout(flashToast._t);
  flashToast._t = setTimeout(() => el.classList.remove("is-shown"), 1500);
}

function deleteMessage(id){
  const i = indexOfMsg(id);
  if (i < 0) return;
  stopSpeaking();
  CHAT.messages.splice(i, 1);
  renderLog();
}

/* Everything after the target goes too — a reply to a message that no
   longer says what it said would be stale. */
function regenerate(id){
  if (CHAT.busy) return;
  stopSpeaking();
  const i = indexOfMsg(id);
  if (i < 0) return;
  CHAT.messages = CHAT.messages.slice(0, i);
  renderLog();
  requestReply();
}

function startEdit(id){
  const i = indexOfMsg(id);
  if (i < 0 || CHAT.busy) return;

  const msg = CHAT.messages[i];
  const bubble = $("chat-log").querySelector('[data-id="' + id + '"]');
  if (!bubble) return;

  CHAT.editing = id;
  bubble.classList.add("editing");
  bubble.innerHTML = "";

  const area = document.createElement("textarea");
  area.className = "b-edit";
  area.value = msg.text;

  const row = document.createElement("div");
  row.className = "b-edit-row";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn ghost tiny";
  cancel.textContent = "Cancel";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "btn primary tiny";
  save.textContent = "Save & resend";

  row.appendChild(cancel);
  row.appendChild(save);
  bubble.appendChild(area);
  bubble.appendChild(row);

  const grow = () => { area.style.height = "auto"; area.style.height = area.scrollHeight + "px"; };
  grow();
  area.focus();
  area.selectionStart = area.selectionEnd = area.value.length;
  area.addEventListener("input", grow);

  const finish = () => { CHAT.editing = null; renderLog(); };

  cancel.addEventListener("click", finish);
  save.addEventListener("click", () => {
    const next = area.value.trim();
    CHAT.editing = null;
    if (!next || next === msg.text){ renderLog(); return; }

    msg.text = next;
    msg.at = new Date().toISOString();
    CHAT.messages = CHAT.messages.slice(0, i + 1);   // drop the stale reply
    renderLog();
    requestReply();
  });

  area.addEventListener("keydown", (e) => {
    if (e.key === "Escape"){ e.preventDefault(); finish(); }
    if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); save.click(); }
  });
  scrollLog();
}

/* ---------------- message menu ---------------- */

const MSG_ACTIONS = {
  user:  [["Edit", startEdit], ["Copy", null], ["Delete", deleteMessage]],
  poppy: [["Copy", null], ["Speak", speakMessage], ["Delete", deleteMessage], ["Regenerate", regenerate]]
};

function closeMsgMenu(){
  const m = $("msg-menu");
  if (m) m.classList.remove("is-open");
}

function openMsgMenu(id, clientX, clientY){
  const i = indexOfMsg(id);
  if (i < 0) return;
  const msg = CHAT.messages[i];
  const menu = $("msg-menu");
  menu.innerHTML = "";

  MSG_ACTIONS[msg.role === "user" ? "user" : "poppy"].forEach(([label, fn]) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "msg-opt";
    item.textContent = label;
    item.addEventListener("click", async () => {
      closeMsgMenu();
      if (label === "Copy"){
        flashToast(await copyText(msg.text) ? "Copied" : "Couldn't copy");
      } else if (fn){
        fn(id);
      }
    });
    menu.appendChild(item);
  });

  /* Position inside the panel, then pull back in if it would overhang. */
  const panel = $("chat").getBoundingClientRect();
  menu.classList.add("is-open");
  const w = menu.offsetWidth, h = menu.offsetHeight;

  let x = clientX - panel.left;
  let y = clientY - panel.top;
  if (x + w > panel.width - 6) x = panel.width - w - 6;
  if (y + h > panel.height - 6) y = panel.height - h - 6;

  menu.style.left = Math.max(6, x) + "px";
  menu.style.top  = Math.max(6, y) + "px";
}

/* ---------------- panel open / close ---------------- */

function openChat(){
  $("chat").classList.add("is-open");
  if (!CHAT.messages.length) renderEmpty();
  setTimeout(() => $("chat-input").focus(), 60);
}

/* Minimise hides the panel and keeps everything — transcript, draft, mode.
   Close throws the conversation away. Keeping them separate is the whole
   reason the confirmation exists. */
function minimiseChat(){
  $("chat").classList.remove("is-open");
  closeAllChatPopovers();
}

function closeChat(){
  /* A request in flight is dropped rather than left to resolve into a panel
     that has already been cleared. */
  if (CHAT.abort) CHAT.abort.abort();

  $("chat").classList.remove("is-open");
  closeAllChatPopovers();

  CHAT.messages = [];         // transcript is per-session, by design
  CHAT.busy = false;
  CHAT.editing = null;

  /* The engine counts turns for its cooldowns; clearing the chat without
     resetting it would leave entries muted against a conversation that no
     longer exists. */
  if (window.PoppyEngine && typeof window.PoppyEngine.resetMemory === "function"){
    window.PoppyEngine.resetMemory();
  }
  $("chat-input").value = "";
  autoGrow();
  refreshSendState();
  renderEmpty();
}

function closeAllChatPopovers(){
  closeModeMenu();
  closeHeadMenu();
  closeMsgMenu();
  stopDictation();
  stopSpeaking();
  $("emoji-tray").classList.remove("is-open");
  $("emoji-btn").setAttribute("aria-expanded", "false");
  $("engine-panel").classList.remove("is-open");
  $("voice-panel").classList.remove("is-open");
  $("close-confirm").classList.remove("is-open");
}

function closeHeadMenu(){
  $("head-menu").classList.remove("is-open");
  $("chat-menu-btn").setAttribute("aria-expanded", "false");
}

function toggleChat(){
  if ($("chat").classList.contains("is-open")) minimiseChat();
  else openChat();
}

/* ---------------- dictation ---------------- */

/* Speech recognition needs a secure context. file:// isn't one, so in Lively
   this only works if the wallpaper is loaded from http://localhost rather
   than a file path. The button says so instead of failing quietly. */
const MIC = { rec: null, on: false, base: "", supported: false, reason: "" };

function micSupport(){
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return { ok: false, why: "This browser has no speech recognition." };
  if (!window.isSecureContext){
    return { ok: false, why: "Dictation needs https or localhost. Load the wallpaper from http://localhost instead of a file path." };
  }
  return { ok: true, why: "" };
}

function setMicState(on){
  MIC.on = on;
  const btn = $("mic-btn");
  if (!btn) return;
  btn.classList.toggle("is-live", on);
  btn.setAttribute("aria-label", on ? "Stop dictation" : "Dictate");
  btn.title = on ? "Listening — click to stop" : "Dictate";
}

function stopDictation(){
  if (MIC.rec && MIC.on){
    try{ MIC.rec.stop(); } catch (err){ /* already stopped */ }
  }
  setMicState(false);
}

function startDictation(){
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new Rec();
  rec.lang = navigator.language || "en-US";
  rec.continuous = true;
  rec.interimResults = true;

  const box = $("chat-input");
  MIC.base = box.value ? box.value.replace(/\s*$/, "") + " " : "";

  let settled = "";

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++){
      const chunk = e.results[i][0].transcript;
      if (e.results[i].isFinal) settled += chunk;
      else interim += chunk;
    }
    box.value = (MIC.base + settled + interim).replace(/\s+/g, " ").trimStart();
    autoGrow();
    refreshSendState();
  };

  rec.onerror = (e) => {
    const map = {
      "not-allowed": "Microphone permission denied.",
      "service-not-allowed": "Speech service unavailable here.",
      "no-speech": "Didn't catch anything.",
      "audio-capture": "No microphone found."
    };
    if (e.error !== "aborted") flashToast(map[e.error] || ("Mic error: " + e.error));
    setMicState(false);
  };

  rec.onend = () => setMicState(false);

  MIC.rec = rec;
  try{
    rec.start();
    setMicState(true);
  } catch (err){
    flashToast("Couldn't start the microphone.");
    setMicState(false);
  }
}

function toggleDictation(){
  if (!MIC.supported){ flashToast(MIC.reason); return; }
  if (MIC.on) stopDictation();
  else startDictation();
}

/* ---------------- actions ---------------- */

/* The bridge between what Poppy says and what the wallpaper does.
   The spec is generated from live state — real theme folders, real paint
   names — so it can never drift from what the controls actually support. */

/* ACTION_TAG and extractActions() live in
   JS/poppy/LifeHub-poppy-actions.js — the phone chat reads replies the
   same way, so there is one reader, not two. */

window.LIFEHUB_ACTIONS = {

  /* Handed to the model when the engine says `action` is writable. */
  describe(){
    const themes = themeNames().concat(["Random"]);
    const colors = PAINT.colors.map(c => c.name);

    return [
      "## ACTIONS",
      "You can operate the wallpaper. When Jen asks you to, end your reply with a fenced block:",
      "",
      "```" + ACTION_TAG,
      '{"action":"paint","color":"Cream"}',
      "```",
      "",
      "Rules for the block:",
      "- One JSON object. No commentary inside the block.",
      "- Put it last, after your reply. Say what you did in your own words above it, briefly.",
      "- Only include it when she actually asked for something. Never for a question about the wallpaper.",
      "",
      "Valid actions:",
      '- {"action":"lock"} — locks the interface. You cannot unlock; only Jen can, with her code.',
      '- {"action":"next"} / {"action":"prev"} — step the background',
      '- {"action":"pause"} / {"action":"play"} — hold or resume the slideshow',
      '- {"action":"paint","color":"NAME"} — one of: ' + colors.join(", "),
      '- {"action":"theme","theme":"NAME"} — one of: ' + themes.join(", ")
    ].join("\n");
  },

  /* Executes one action. Returns a short label for the receipt shown in
     the chat, or null if the action was rejected. */
  run(cmd){
    if (!cmd || typeof cmd !== "object") return null;
    const act = String(cmd.action || "").trim().toLowerCase();

    switch (act){
      case "lock":
        setLocked(true);
        return "Locked";

      case "unlock":
        /* Deliberately refused. The lock exists so the screen can't be
           changed by accident; a model that can undo it is not a lock. */
        return null;

      case "next":
        stepSlide(1);
        return "Next background";

      case "prev":
      case "previous":
        stepSlide(-1);
        return "Previous background";

      case "pause":
        setPaused(true); refreshPlayIcon();
        return "Slideshow paused";

      case "play":
      case "resume":
        setPaused(false); refreshPlayIcon();
        return "Slideshow playing";

      case "paint":
      case "color":
      case "colour": {
        const want = String(cmd.color || cmd.colour || "").trim().toLowerCase();
        const i = PAINT.colors.findIndex(c => c.name.toLowerCase() === want);
        if (i < 0) return null;
        PAINT.index = i;
        applyPaint();
        saveState();
        return "Paint · " + PAINT.colors[i].name;
      }

      case "theme": {
        /* Dictionary entries carry stray spaces and casing, and a theme
           only exists if there's a folder for it. */
        const want = String(cmd.theme || cmd.name || "").trim().toLowerCase();
        if (!want) return null;
        if (want === "random"){ setTheme("Random"); return "Theme · Random"; }
        const match = themeNames().find(t => t.toLowerCase() === want);
        if (!match) return null;
        setTheme(match);
        return "Theme · " + match;
      }

      default:
        return null;
    }
  }
};

/* ---------------- Poppy's voice ---------------- */

/* speechSynthesis, unlike speech recognition, works over file:// — so this
   runs in Lively without serving over localhost. */
const VOICE = {
  on: false,
  uri: "",
  rate: 1,
  pitch: 1,
  voices: [],
  speaking: false,
  keepAlive: null,

  /* "gemini" → JS/poppy/LifeHub-poppy-voice.js, falling back to the
     browser voice whenever it can't answer. "browser" → the voices
     below only. */
  engine: "gemini",
  gvoice: "",       // blank = the voice file's default
  gmodel: "",
  gstyle: "",
  gkey: ""          // blank = the Gemini key in Engine configuration
};

function voiceSupported(){
  return typeof window.speechSynthesis !== "undefined" &&
         typeof window.SpeechSynthesisUtterance !== "undefined";
}

/* Voices arrive asynchronously and the list is often empty on first call. */
function loadVoices(){
  if (!voiceSupported()) return;
  VOICE.voices = window.speechSynthesis.getVoices() || [];
  buildVoiceList();
}

/* Windows usually lists a male voice first, so "automatic" would land on
   David. Name matching is a heuristic, not a fact about any voice — it only
   decides ordering and the default, and an explicit choice always wins. */
const FEMALE_HINTS = [
  "zira","hazel","aria","jenny","michelle","eva","susan","samantha","female",
  "catherine","linda","heera","sonia","natasha","clara","libby","emily",
  "amber","ashley","elizabeth","monica","sara","nova","luna","hana","mei",
  "yu","seoyeon","aiko","maria","angelo","rosa","joanna","salli","kimberly"
];

function likelyFemale(v){
  const n = (v.name || "").toLowerCase();
  return FEMALE_HINTS.some(h => n.includes(h));
}

/* Edge and WebView2 expose Microsoft's neural voices to the Web Speech API;
   Chrome generally doesn't. They're the only ones that don't sound like a
   station announcement, so they get first refusal. */
function isNatural(v){
  const n = (v.name || "").toLowerCase();
  return n.includes("natural") || n.includes("online") || n.includes("neural");
}

/* Among the natural voices these read brightest, which is the vibe wanted. */
const PERKY_ORDER = ["aria", "jenny", "michelle", "ana", "sonia", "libby", "clara"];

function perkyRank(v){
  const n = (v.name || "").toLowerCase();
  const i = PERKY_ORDER.findIndex(h => n.includes(h));
  return i === -1 ? PERKY_ORDER.length : i;
}

function langMatches(v){
  const want = (navigator.language || "en-US").toLowerCase().slice(0, 2);
  return (v.lang || "").toLowerCase().startsWith(want);
}

/* Explicit choice always wins. Otherwise: natural before robotic, female
   before male, right language before wrong, brighter names before flat. */
function voiceScore(v){
  return (isNatural(v) ? 0 : 100) +
         (langMatches(v) ? 0 : 40) +
         (likelyFemale(v) ? 0 : 20) +
         perkyRank(v);
}

function sortedVoices(list){
  return list.slice().sort((a, b) => voiceScore(a) - voiceScore(b) || a.name.localeCompare(b.name));
}

function pickVoice(){
  if (!VOICE.voices.length) return null;
  const exact = VOICE.voices.find(v => v.voiceURI === VOICE.uri);
  if (exact) return exact;
  return sortedVoices(VOICE.voices)[0];
}

/* Read the words, not the punctuation the model formats with. */
function speakable(text){
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/(^|\s)[*_]([^*_]+)[*_]/g, "$1$2")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Chrome stops mid-utterance on long strings, so it goes out sentence by
   sentence and the queue does the joining. */
function chunk(text){
  const parts = text.match(/[^.!?…]+[.!?…]*/g) || [text];
  const out = [];
  let buf = "";
  parts.forEach(p => {
    if ((buf + p).length > 180){ if (buf) out.push(buf.trim()); buf = p; }
    else buf += p;
  });
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

function stopSpeaking(){
  if (window.POPPY_VOICE) window.POPPY_VOICE.stop();
  if (!voiceSupported()){ VOICE.speaking = false; refreshVoiceButton(); return; }
  try{ window.speechSynthesis.cancel(); } catch (err){ /* nothing queued */ }
  clearInterval(VOICE.keepAlive);
  VOICE.keepAlive = null;
  VOICE.speaking = false;
  refreshVoiceButton();
}

/* Is the natural voice usable at all? The file loaded and a key exists. */
function geminiVoiceReady(){
  return VOICE.engine === "gemini" && !!window.POPPY_VOICE &&
         window.POPPY_VOICE.hasKey(VOICE.gkey);
}

/* One toast per kind of failure per session. Running out of quota
   shouldn't announce itself on every single reply. */
const VOICE_WARNED = {};

/* `report`, if given, is told what actually spoke — the Test button uses
   it so a silent fallback can never pass for "all the voices sound the
   same". Called with (engine, detail). */
function speak(text, report){
  const clean = speakable(text);
  if (!clean) return;
  const tell = (engine, detail) => { if (report) try { report(engine, detail); } catch (e) {} };

  stopSpeaking();

  if (VOICE.engine !== "gemini" || !window.POPPY_VOICE){
    speakBrowser(clean);
    tell("browser", window.POPPY_VOICE ? "" : "the Gemini voice file didn't load");
    return;
  }

  VOICE.speaking = true;
  refreshVoiceButton();

  /* Settings are read here, synchronously — the Test button relies on
     that when it swaps them in and straight back out. */
  const voiceName = VOICE.gvoice || window.POPPY_VOICE.defaults.voice;
  window.POPPY_VOICE.say(clean, {
    voice: voiceName,
    model: VOICE.gmodel || undefined,
    style: VOICE.gstyle || undefined,
    key:   VOICE.gkey,
    rate:  VOICE.rate
  }).then(() => {
    VOICE.speaking = false;
    refreshVoiceButton();
    tell("gemini", voiceName);
  }).catch(err => {
    /* Cut off on purpose — stopSpeaking() already tidied up. */
    if (err && err.name === "AbortError") return;
    const why = (err && err.message) || "The natural voice failed.";

    /* Always in the console; the toast only once per session, unless
       this is a Test — then the panel says it every time. */
    console.warn("[Poppy voice] fell back to the browser voice —", why);
    if (!report && !VOICE_WARNED[why]){
      VOICE_WARNED[why] = true;
      flashToast(why + " Using the browser voice.");
    }
    VOICE.speaking = false;
    /* remaining: what's still unsaid. "" means part was heard and the
       rest can't be pinned to words — better silent than a repeat. */
    const rest = (err && typeof err.remaining === "string") ? err.remaining : clean;
    if (rest) speakBrowser(rest); else refreshVoiceButton();
    tell("browser", why);
  });
}

/* The browser's own voices. Unchanged from before the Gemini voice — it
   is the fallback, so it has to keep working exactly as it did. */
function speakBrowser(clean){
  if (!voiceSupported()){ refreshVoiceButton(); return; }

  stopSpeaking();
  const voice = pickVoice();

  chunk(clean).forEach(part => {
    const u = new SpeechSynthesisUtterance(part);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = VOICE.rate;
    u.pitch = VOICE.pitch;
    u.onend = () => {
      if (!window.speechSynthesis.pending && !window.speechSynthesis.speaking){
        VOICE.speaking = false;
        clearInterval(VOICE.keepAlive);
        VOICE.keepAlive = null;
        refreshVoiceButton();
      }
    };
    u.onerror = () => { VOICE.speaking = false; refreshVoiceButton(); };
    window.speechSynthesis.speak(u);
  });

  VOICE.speaking = true;
  refreshVoiceButton();

  /* Chrome suspends synthesis when the page isn't focused — which a
     wallpaper never is. Nudging resume() keeps it running. */
  clearInterval(VOICE.keepAlive);
  VOICE.keepAlive = setInterval(() => {
    if (window.speechSynthesis.speaking) window.speechSynthesis.resume();
    else { clearInterval(VOICE.keepAlive); VOICE.keepAlive = null; }
  }, 8000);
}

function speakMessage(id){
  const i = indexOfMsg(id);
  if (i < 0) return;
  speak(CHAT.messages[i].text);
}

function refreshVoiceButton(){
  const btn = $("voice-btn");
  if (!btn) return;
  btn.classList.toggle("is-on", VOICE.on);
  btn.classList.toggle("is-speaking", VOICE.speaking);
  btn.setAttribute("aria-label", VOICE.on ? "Poppy's voice on" : "Poppy's voice off");
  btn.title = VOICE.speaking ? "Speaking — click to stop"
            : VOICE.on ? "Voice on" : "Voice off";
}

function toggleVoice(){
  if (!voiceSupported() && !geminiVoiceReady()){ flashToast("No speech synthesis here."); return; }
  if (VOICE.speaking){ stopSpeaking(); return; }
  VOICE.on = !VOICE.on;
  refreshVoiceButton();
  saveState();
  flashToast(VOICE.on ? "Voice on" : "Voice off");
}

function buildVoiceList(){
  const sel = $("cfg-voice");
  if (!sel) return;
  const current = VOICE.uri;
  sel.innerHTML = "";

  if (!VOICE.voices.length){
    const opt = document.createElement("option");
    opt.textContent = "No voices installed";
    opt.value = "";
    sel.appendChild(opt);
    return;
  }

  const auto = document.createElement("option");
  auto.value = "";
  const guess = pickVoice();
  auto.textContent = "Automatic" + (guess ? " (" + guess.name + ")" : "");
  sel.appendChild(auto);

  /* Best-first, so the top of the list is the part worth auditioning
     rather than a hundred language variants. */
  const mine = sortedVoices(VOICE.voices.filter(langMatches));
  const rest = sortedVoices(VOICE.voices.filter(v => !langMatches(v)));

  const addGroup = (label, list) => {
    if (!list.length) return;
    const g = document.createElement("optgroup");
    g.label = label;
    list.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      opt.textContent = (isNatural(v) ? "\u2726 " : "") + v.name + " — " + v.lang;
      g.appendChild(opt);
    });
    sel.appendChild(g);
  };

  addGroup("Your language", mine);
  addGroup("Other languages", rest);

  sel.value = current;
}

/* The Gemini lists come from the voice file, so they're built on first
   open rather than hard-coded here. */
function buildGeminiLists(){
  const PV = window.POPPY_VOICE;
  const vsel = $("cfg-gvoice"), msel = $("cfg-gmodel");
  if (!PV || vsel.options.length) return;

  const group = (label, list) => {
    const g = document.createElement("optgroup");
    g.label = label;
    list.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.name;
      opt.textContent = v.name + " — " + v.feel;
      g.appendChild(opt);
    });
    vsel.appendChild(g);
  };
  group("Suggested for Poppy", PV.voices.filter(v => v.suggested));
  group("More voices", PV.voices.filter(v => !v.suggested));

  PV.models.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    msel.appendChild(opt);
  });
}

/* Show only the settings that apply to the chosen engine. Pitch has no
   meaning for Gemini — how she sounds is the direction line instead. */
function showVoiceEngine(engine){
  const gemini = engine === "gemini";
  $("voice-gemini").hidden = !gemini;
  $("voice-browser").hidden = gemini;

  const note = $("voice-note");
  note.className = "ov-note";
  if (gemini && !window.POPPY_VOICE){
    note.textContent = "The Gemini voice file didn't load — she'll use the browser voice.";
  } else if (gemini){
    note.textContent = "Natural voices from Gemini. If Gemini can't answer (no key, out of " +
      "quota, offline), she falls back to the browser voice for that reply. " +
      "Fastest with 3.1 Flash at speed 1.00: she streams, starting in about a " +
      "second, one request per reply. Other models or speeds wait for each " +
      "clip, up to three requests.";
  } else {
    note.textContent = "✦ marks natural voices. If none appear, open this in Edge or " +
      "Lively — they expose neural voices that Chrome doesn't.";
  }
}

/* The panel's current settings, as VOICE fields. Test and Save both
   read through this so they can't disagree. */
function voicePanelValues(){
  return {
    engine: $("cfg-voice-engine").value,
    uri:    $("cfg-voice").value,
    rate:   parseFloat($("cfg-rate").value) || 1,
    pitch:  parseFloat($("cfg-pitch").value) || 1,
    gvoice: $("cfg-gvoice").value,
    gmodel: $("cfg-gmodel").value,
    gstyle: $("cfg-gstyle").value.trim()
  };
}

/* The voice has no key box of its own any more — it uses the Gemini key
   in Engine configuration. This says whether there is one. */
function refreshVoiceKeyNote(){
  const note = $("voice-key-note");
  if (!note) return;
  const has = !!(window.POPPY_VOICE && window.POPPY_VOICE.hasKey(""));
  note.className = "ov-note" + (has ? "" : " bad");
  note.textContent = has
    ? "Set — the voice uses the same key as the chat, kept in Engine configuration."
    : "Not set yet. The voice and the chat share one Gemini key — add it in Engine configuration.";
}

/* Before 2026-09-21 the voice had its own key box. Whatever was typed
   there moves to Engine configuration once, so nothing needs re-entering
   and there's only ever one place to change it. */
function migrateVoiceKey(){
  if (!VOICE.gkey || !window.POPPY) return;
  const cfg = POPPY.getConfig();
  if (!(cfg.keys && cfg.keys.gemini)) POPPY.setConfig({ keys: { gemini: VOICE.gkey } });
  VOICE.gkey = "";
  saveState();
}

function openVoicePanel(){
  loadVoices();
  buildGeminiLists();
  const PV = window.POPPY_VOICE;
  const d = PV ? PV.defaults : {};

  $("cfg-voice-engine").value = VOICE.engine === "browser" ? "browser" : "gemini";
  $("cfg-gvoice").value = VOICE.gvoice || d.voice || "";
  $("cfg-gmodel").value = VOICE.gmodel || d.model || "";
  $("cfg-gstyle").value = VOICE.gstyle || d.style || "";
  refreshVoiceKeyNote();

  $("cfg-voice").value = VOICE.uri;
  $("cfg-rate").value = VOICE.rate;
  $("cfg-pitch").value = VOICE.pitch;
  $("rate-out").textContent = Number(VOICE.rate).toFixed(2) + "×";
  $("pitch-out").textContent = Number(VOICE.pitch).toFixed(2);
  $("voice-auto").checked = VOICE.on;
  showVoiceEngine($("cfg-voice-engine").value);
  $("voice-panel").classList.add("is-open");
}

/* ---------------- engine configuration ---------------- */

/* Gemini ids — used by both the Gemini and the Server connection. Flash
   models first: they're the ones with a free tier that lasts the day. */
const MODEL_CHIPS = [
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash"
];

const CONNECTIONS = [
  { id: "server",     label: "Server",     note: "Uses your Express server. Required for Vertex." },
  { id: "gemini",     label: "Gemini",     note: "Straight to Google with your Gemini key. No server needed — works on the TV too." },
  { id: "openrouter", label: "OpenRouter", note: "Straight to OpenRouter. Pick a free model from the list, or type any id." }
];

/* While the panel is open, each connection's model is kept here, so
   switching Gemini → OpenRouter → Gemini brings the Gemini model back
   instead of leaving an OpenRouter id in the box. Saved on Save. */
let ENGINE_DRAFT = { models: {} };

function currentConnection(){
  const active = $("cfg-conn").querySelector(".is-active");
  return active ? active.dataset.conn : "server";
}

function showFld(id, on){ const el = $(id); if (el) el.style.display = on ? "" : "none"; }

/* Only the fields that apply to the chosen connection. The Gemini key
   always shows: the voice uses it whichever connection the chat is on. */
function refreshConnFields(){
  const conn = currentConnection();
  const meta = CONNECTIONS.find(c => c.id === conn) || CONNECTIONS[0];
  const or = conn === "openrouter";

  showFld("fld-url", conn === "server");
  showFld("fld-key-openrouter", or);
  showFld("fld-or-models", or);
  showFld("cfg-chips", !or);
  const think = $("cfg-thinking") && $("cfg-thinking").closest(".fld");
  if (think) think.style.display = or ? "none" : "";   // Google-only setting

  $("cfg-key").placeholder = conn === "server"
    ? "Optional for Vertex models — the voice still needs it"
    : "From aistudio.google.com/apikey";
  $("cfg-model").placeholder = or ? "e.g. google/gemma-4-31b-it:free" : "gemini-3.5-flash";

  if (or) loadOpenRouterFree();
  if (!$("engine-note").classList.contains("bad")) setEngineNote(meta.note);
}

function buildConnChips(){
  const box = $("cfg-conn");
  box.innerHTML = "";
  CONNECTIONS.forEach(c => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.conn = c.id;
    chip.textContent = c.label;
    chip.addEventListener("click", () => {
      /* Park the model typed for the connection being left, then bring
         back the one remembered for the connection being opened. */
      ENGINE_DRAFT.models[currentConnection()] = $("cfg-model").value.trim();
      [...box.children].forEach(x => x.classList.remove("is-active"));
      chip.classList.add("is-active");
      $("cfg-model").value = ENGINE_DRAFT.models[c.id] || "";
      setEngineNote("");
      refreshChips();
      refreshConnFields();
    });
    box.appendChild(chip);
  });
}

function fillEngineForm(cfg){
  const conn = cfg.connection || "server";
  ENGINE_DRAFT = { models: Object.assign({}, cfg.models || {}) };
  if (!ENGINE_DRAFT.models[conn]) ENGINE_DRAFT.models[conn] = cfg.model || "";

  [...$("cfg-conn").children].forEach(chip => {
    chip.classList.toggle("is-active", chip.dataset.conn === conn);
  });
  const keys = cfg.keys || {};
  $("cfg-url").value    = cfg.serverUrl || "";
  $("cfg-key").value    = keys.gemini || "";
  $("cfg-key-or").value = keys.openrouter || "";
  $("cfg-model").value  = ENGINE_DRAFT.models[conn] || "";
  $("cfg-budget").value = cfg.tokenLimit;
  $("cfg-max").value    = cfg.maxTokens;
  $("cfg-thinking").value = cfg.thinking || "quick";
  refreshChips();
  refreshConnFields();
  renderKeyrings();
}

function refreshChips(){
  const current = $("cfg-model").value.trim();
  [...$("cfg-chips").children].forEach(chip => {
    chip.classList.toggle("is-active", chip.dataset.model === current);
  });
  const sel = $("cfg-or-models");
  if (sel && [...sel.options].some(o => o.value === current)) sel.value = current;
  else if (sel) sel.value = "";
}

function buildChips(){
  const box = $("cfg-chips");
  box.innerHTML = "";
  MODEL_CHIPS.forEach(name => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.model = name;
    chip.textContent = name;
    chip.addEventListener("click", () => {
      $("cfg-model").value = name;
      refreshChips();
    });
    box.appendChild(chip);
  });
}

/* ── OpenRouter's free models, live ──────────────────────────────
   Their free list changes month to month — 21 models on 2026-09-21 —
   so it's read from openrouter.ai when the panel needs it rather than
   written down here to go stale. Public, no key, allowed from a page.

   Google's own (Gemma) are grouped first; the rest newest first.
   Classifiers ("content-safety", "guard") are left out — they rate
   text, they don't chat. */
let OR_FREE = null;
let OR_LOADING = null;

function loadOpenRouterFree(){
  if (OR_FREE) return Promise.resolve(fillOpenRouterSelect());
  if (OR_LOADING) return OR_LOADING;
  OR_LOADING = fetch("https://openrouter.ai/api/v1/models")
    .then(res => res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status)))
    .then(data => {
      OR_FREE = ((data && data.data) || [])
        .filter(m => /:free$/.test(m.id) && !/safety|guard/i.test(m.id))
        .sort((a, b) => (b.created || 0) - (a.created || 0));
      fillOpenRouterSelect();
    })
    .catch(() => {
      $("cfg-or-models").innerHTML =
        '<option value="">Couldn’t reach OpenRouter — type a model id below</option>';
    })
    .finally(() => { OR_LOADING = null; });
  return OR_LOADING;
}

function fillOpenRouterSelect(){
  const sel = $("cfg-or-models");
  sel.innerHTML = "";
  const pick = document.createElement("option");
  pick.value = "";
  pick.textContent = OR_FREE.length ? "Pick a free model…" : "No free models listed right now";
  sel.appendChild(pick);

  const size = n => n >= 1e6 ? Math.round(n / 1e6) + "M" : Math.round(n / 1e3) + "k";
  const group = (label, list) => {
    if (!list.length) return;
    const g = document.createElement("optgroup");
    g.label = label;
    list.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.id;
      const until = m.expiration_date ? " · free until " + String(m.expiration_date).slice(0, 10) : "";
      opt.textContent = (m.name || m.id).replace(/\s*\(free\)\s*$/i, "") +
                        " · " + size(m.context_length || 0) + " context" + until;
      g.appendChild(opt);
    });
    sel.appendChild(g);
  };
  group("From Google", OR_FREE.filter(m => /^google\//.test(m.id)));
  group("Everyone else — newest first", OR_FREE.filter(m => !/^google\//.test(m.id)));
  refreshChips();
}

/* ── The key drawer ──────────────────────────────────────────────
   Keys saved under a name, one drawer per provider, sitting under its
   key box. Picking one puts it to work immediately — no Save needed,
   since the moment you want this is the moment a 429 just landed.

   Only the last four characters are ever shown. The drawer lives in
   the same browser storage the key box always used, so it's no more
   (and no less) exposed than the single key was.

   Keys from the SAME Google project share one quota — switching between
   those gains nothing. Only keys from different projects are separate. */
/* Key formats change — AI Studio keys used to start "AIza" and newer
   ones start "AQ." — so a key isn't judged by how it starts. Only what's
   plainly wrong is refused: spaces, too short to be a key, or the other
   provider's key. Google or OpenRouter says if a key doesn't work. */
const GOOGLE_KEY = /^(AIza|AQ\.)/;
const OPENROUTER_KEY = /^sk-or-/i;
function keyProblem(provider, key){
  if (!/^\S{20,}$/.test(key)) return "That doesn't look like a key — keys are long, with no spaces.";
  if (provider === "gemini" && OPENROUTER_KEY.test(key)) return "That's an OpenRouter key — it goes in the OpenRouter drawer.";
  if (provider === "openrouter" && GOOGLE_KEY.test(key)) return "That's a Google key — it goes in the Gemini drawer.";
  return "";
}
const maskKey = k => "••••" + String(k || "").slice(-4);

function keyringOf(provider){
  return ((POPPY.getConfig().keyring || {})[provider] || []).slice();
}
function storeKeyring(provider, list){
  POPPY.setConfig({ keyring: { [provider]: list } });
}

/* One drawer: the saved keys as a list to tap, the key in use marked.
   The hidden key box (data-input) holds the key in use — Save reads it,
   so switching here and Save always agree. */
const KR_LABEL = { gemini: "Gemini", openrouter: "OpenRouter" };
const KR_BIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/></svg>';

function krEl(tag, cls, text){
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  if (tag === "button") el.type = "button";
  return el;
}

function renderKeyring(box){
  const provider = box.dataset.provider;
  const input = $(box.dataset.input);
  const current = input.value.trim();
  const list = keyringOf(provider);
  box.innerHTML = "";

  const rows = krEl("div", "kr-list");
  rows.setAttribute("role", "radiogroup");
  rows.setAttribute("aria-label", "Saved " + KR_LABEL[provider] + " keys");

  list.forEach((k, i) => {
    const on = k.key === current;
    const row = krEl("div", "kr-row" + (on ? " is-on" : ""));
    const pick = krEl("button", "kr-pick");
    pick.setAttribute("role", "radio");
    pick.setAttribute("aria-checked", on ? "true" : "false");
    pick.dataset.i = String(i);
    pick.append(krEl("span", "kr-dot"), krEl("span", "kr-name", k.name),
                krEl("span", "kr-mask", maskKey(k.key)));
    if (on) pick.append(krEl("span", "kr-tag", "In use"));
    const bin = krEl("button", "kr-bin");
    bin.innerHTML = KR_BIN;
    bin.dataset.i = String(i);
    bin.setAttribute("aria-label", "Remove " + k.name);
    bin.title = "Remove";
    row.append(pick, bin);
    rows.appendChild(row);
  });

  /* A key in use that isn't in the drawer (typed before the drawer
     existed, or its entry was removed) stays visible, with a way in. */
  if (current && !list.some(k => k.key === current)){
    const row = krEl("div", "kr-row is-on is-loose");
    const pick = krEl("div", "kr-pick");
    pick.append(krEl("span", "kr-dot"), krEl("span", "kr-name", "Current key"),
                krEl("span", "kr-mask", maskKey(current)), krEl("span", "kr-tag", "Not saved"));
    row.append(pick, krEl("button", "kr-keep", "Save"));
    rows.appendChild(row);
  }
  if (rows.children.length) box.appendChild(rows);

  /* Folded: only the key in use shows, with "Show all" for the rest.
     Worth it only with two or more keys and one of them in use. It
     folds again when a key is picked, added, or Engine is reopened. */
  const total = rows.children.length;
  const foldable = total > 1 && !!rows.querySelector(".kr-row.is-on");
  const unfolded = box.dataset.open === "1";
  rows.classList.toggle("is-folded", foldable && !unfolded);

  /* Adding: a small form, open straight away when the drawer is empty. */
  const adding = box.dataset.adding === "1" || !rows.children.length;
  if (foldable || !adding){
    const foot = krEl("div", "kr-foot");
    if (foldable){
      const more = krEl("button", "kr-more" + (unfolded ? " is-open" : ""),
        unfolded ? "Show less" : "Show all " + total + " keys");
      more.setAttribute("aria-expanded", unfolded ? "true" : "false");
      foot.appendChild(more);
    }
    if (!adding) foot.appendChild(krEl("button", "kr-open", "+ Add a key"));
    box.appendChild(foot);
  }
  if (!adding) return;
  /* Not a password field: a text box next to a password box reads as a
     login to the browser, which then fills in your email and a saved
     password — and Add & use gets those instead of the key. The key is
     still shown as dots (-webkit-text-security, in the CSS). */
  const form = krEl("div", "kr-form");
  const name = krEl("input", "kr-new-name");
  name.type = "text"; name.spellcheck = false; name.autocomplete = "off";
  name.placeholder = "Name it — e.g. Personal";
  const key = krEl("input", "kr-new-key");
  key.type = "text"; key.spellcheck = false; key.autocomplete = "off";
  key.setAttribute("autocapitalize", "off");
  key.setAttribute("data-1p-ignore", ""); key.setAttribute("data-lpignore", "true");
  key.placeholder = input.placeholder || "Paste the key";
  if (box.dataset.prefill) key.value = box.dataset.prefill;
  const actions = krEl("div", "kr-actions");
  if (rows.children.length) actions.appendChild(krEl("button", "btn ghost kr-cancel", "Cancel"));
  actions.appendChild(krEl("button", "btn primary kr-add", "Add & use"));
  /* Problems are said here, where you're looking — the panel's own note
     is at the bottom and can be scrolled out of sight. */
  const msg = krEl("p", "ov-note bad kr-msg");
  msg.setAttribute("aria-live", "polite");
  form.append(name, key, msg, actions);
  box.appendChild(form);
}

function renderKeyrings(){
  document.querySelectorAll("#engine-panel .keyring").forEach(renderKeyring);
}

/* Puts a key to work at once — no Save needed, since the moment you want
   this is the moment a 429 just landed. */
/* Keys removed from the drawer on purpose this session — they must not
   come straight back when you switch away from them. */
const KR_DROPPED = new Set();

function useKey(box, key, name){
  const provider = box.dataset.provider;
  /* The key being switched away from, if it isn't in the drawer yet:
     saved first, so switching never loses a key. */
  const was = $(box.dataset.input).value.trim();
  if (was && was !== key && !KR_DROPPED.has(was) && !keyProblem(provider, was)){
    const list = keyringOf(provider);
    if (!list.some(k => k.key === was)){
      list.push({ name: "Earlier key", key: was });
      storeKeyring(provider, list);
    }
  }
  $(box.dataset.input).value = key;
  POPPY.setConfig({ keys: { [provider]: key } });
  refreshVoiceKeyNote();
  setEngineNote("Now using “" + name + "” for " + KR_LABEL[provider] +
    (provider === "gemini" ? " — chat and voice." : "."), "ok");
}

function wireKeyring(box){
  const provider = box.dataset.provider;
  const label = KR_LABEL[provider];
  let arming = null, armTimer = null;       // the bin waiting for its second press

  const closeForm = () => { delete box.dataset.adding; delete box.dataset.prefill; delete box.dataset.open; };

  function add(){
    const key = box.querySelector(".kr-new-key").value.trim();
    const typed = box.querySelector(".kr-new-name").value.trim();
    const say = text => { box.querySelector(".kr-msg").textContent = text; };
    if (!key){ say("Paste a " + label + " key first."); return; }
    const problem = keyProblem(provider, key);
    if (problem){ say(problem); return; }
    KR_DROPPED.delete(key);
    const list = keyringOf(provider);
    const dupe = list.find(k => k.key === key);
    let name;
    if (dupe){
      if (typed) dupe.name = typed;         // same key, new name: a rename
      name = dupe.name;
    } else {
      name = typed || "Key " + (list.length + 1);
      list.push({ name, key });
    }
    storeKeyring(provider, list);
    closeForm();
    useKey(box, key, name);
    renderKeyring(box);
  }

  /* One listener for the whole drawer: its rows are redrawn on every change. */
  box.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t || !box.contains(t)) return;

    if (t.classList.contains("kr-pick")){
      const k = keyringOf(provider)[parseInt(t.dataset.i, 10)];
      if (!k || k.key === $(box.dataset.input).value.trim()) return;
      useKey(box, k.key, k.name);
      delete box.dataset.open;              // chosen: fold back to the one in use
      renderKeyring(box);
    } else if (t.classList.contains("kr-more")){
      if (box.dataset.open) delete box.dataset.open;
      else box.dataset.open = "1";
      renderKeyring(box);
    } else if (t.classList.contains("kr-bin")){
      const i = parseInt(t.dataset.i, 10);
      if (arming !== i){                     // first press: ask
        arming = i;
        clearTimeout(armTimer);
        box.querySelectorAll(".kr-bin.is-armed").forEach(b => { b.classList.remove("is-armed"); b.innerHTML = KR_BIN; });
        t.classList.add("is-armed");
        t.textContent = "Remove?";
        armTimer = setTimeout(() => { arming = null; renderKeyring(box); }, 3500);
        return;
      }
      clearTimeout(armTimer); arming = null;
      const list = keyringOf(provider);
      const gone = list.splice(i, 1)[0];
      KR_DROPPED.add(gone.key);
      storeKeyring(provider, list);
      setEngineNote("Removed “" + gone.name + "” from the drawer." +
        (gone.key === $(box.dataset.input).value.trim() ? " It's still in use until you pick another." : ""), "ok");
      renderKeyring(box);
    } else if (t.classList.contains("kr-keep")){
      box.dataset.adding = "1";
      box.dataset.prefill = $(box.dataset.input).value.trim();
      renderKeyring(box);
      box.querySelector(".kr-new-name").focus();
    } else if (t.classList.contains("kr-open")){
      box.dataset.adding = "1";
      renderKeyring(box);
      box.querySelector(".kr-new-name").focus();
    } else if (t.classList.contains("kr-cancel")){
      closeForm();
      renderKeyring(box);
    } else if (t.classList.contains("kr-add")){
      add();
    }
  });

  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".kr-new-name, .kr-new-key")){ e.preventDefault(); add(); }
  });
}

function openEngine(){
  /* Each visit starts tidy: drawers folded, no half-filled add form. */
  document.querySelectorAll("#engine-panel .keyring").forEach(b => {
    delete b.dataset.open; delete b.dataset.adding; delete b.dataset.prefill;
  });
  fillEngineForm(POPPY.getConfig());
  setEngineNote("");
  $("engine-panel").classList.add("is-open");
}

function setEngineNote(text, kind){
  const note = $("engine-note");
  note.textContent = text || "";
  note.className = "ov-note" + (kind ? " " + kind : "");
}

function saveEngine(){
  const conn = currentConnection();
  const url = $("cfg-url").value.trim();
  const gkey = $("cfg-key").value.trim();
  const okey = $("cfg-key-or").value.trim();

  if (conn === "server" && !/^https?:\/\//i.test(url)){
    setEngineNote("Server URL needs to start with http:// or https://", "bad");
    return;
  }
  if (conn === "gemini" && !gkey){
    setEngineNote("The Gemini connection needs your Gemini key.", "bad");
    return;
  }
  if (conn === "openrouter" && !okey){
    setEngineNote("The OpenRouter connection needs your OpenRouter key.", "bad");
    return;
  }
  /* The most common mix-up, caught before it becomes a 401. */
  if (gkey && OPENROUTER_KEY.test(gkey)){
    setEngineNote("That's an OpenRouter key in the Gemini box.", "bad");
    return;
  }
  if (okey && GOOGLE_KEY.test(okey)){
    setEngineNote("That's a Google key in the OpenRouter box.", "bad");
    return;
  }
  const model = $("cfg-model").value.trim();
  if (!model){
    setEngineNote("Pick a model, or type one in.", "bad");
    return;
  }
  ENGINE_DRAFT.models[conn] = model;

  POPPY.setConfig({
    connection: conn,
    serverUrl: url,
    keys: { gemini: gkey, openrouter: okey },
    model,
    models: ENGINE_DRAFT.models,
    tokenLimit: Math.max(1000, parseInt($("cfg-budget").value, 10) || 30000),
    maxTokens: Math.max(256, parseInt($("cfg-max").value, 10) || 8000),
    thinking: $("cfg-thinking").value || "quick"
  });

  setEngineNote("Saved.", "ok");
  setTimeout(() => $("engine-panel").classList.remove("is-open"), 550);
}

function startChat(){
  if (!$("chat")) return;

  /* restore the last mode if it still exists, else fall back to the first */
  const modes = activeModes();
  const saved = modes.find(m => m.id === CHAT.savedModeId);
  setMode(saved || modes[0]);
  renderEmpty();

  const tray = $("emoji-tray");
  const insert = (ch) => {
    const box = $("chat-input");
    const at = box.selectionStart;
    box.value = box.value.slice(0, at) + ch + box.value.slice(box.selectionEnd);
    box.focus();
    box.selectionStart = box.selectionEnd = at + ch.length;
    autoGrow();
    refreshSendState();
  };

  EMOJI_GROUPS.forEach(group => {
    const head = document.createElement("p");
    head.className = "emoji-head";
    head.textContent = group.name;
    tray.appendChild(head);

    group.chars.split(" ").forEach(ch => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = ch;
      b.title = ch;
      b.addEventListener("click", () => insert(ch));
      tray.appendChild(b);
    });
  });

  buildChips();
  buildConnChips();

  $("btn-mark").addEventListener("click", toggleChat);
  $("chat-min").addEventListener("click", minimiseChat);

  $("chat-menu-btn").addEventListener("click", () => {
    const open = $("head-menu").classList.toggle("is-open");
    $("chat-menu-btn").setAttribute("aria-expanded", open ? "true" : "false");
    closeModeMenu();
  });

  $("menu-engine").addEventListener("click", () => { closeHeadMenu(); openEngine(); });
  $("menu-close").addEventListener("click", () => {
    closeHeadMenu();
    $("close-confirm").classList.add("is-open");
  });

  $("confirm-cancel").addEventListener("click", () => $("close-confirm").classList.remove("is-open"));
  $("confirm-close").addEventListener("click", closeChat);

  $("engine-x").addEventListener("click", () => $("engine-panel").classList.remove("is-open"));

  /* Engine and Voice are modals over the whole screen: a click on the
     dimmed backdrop, or Esc (the phone remote's Close too), shuts them
     without saving, like the ✕. */
  const SETTINGS_MODALS = ["voice-panel", "engine-panel"];
  SETTINGS_MODALS.forEach(id => {
    $(id).addEventListener("click", e => { if (e.target === e.currentTarget) $(id).classList.remove("is-open"); });
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const open = SETTINGS_MODALS.find(id => $(id).classList.contains("is-open"));
    if (!open) return;
    e.preventDefault();
    $(open).classList.remove("is-open");
  });
  $("engine-save").addEventListener("click", saveEngine);
  $("engine-reset").addEventListener("click", () => {
    fillEngineForm(POPPY.configDefaults());
    setEngineNote("Defaults restored — press Save to keep them.");
  });
  $("cfg-model").addEventListener("input", refreshChips);
  document.querySelectorAll("#engine-panel .keyring").forEach(wireKeyring);

  /* The Voice panel's way to its key: close Voice, open Engine at the
     Gemini key drawer. */
  $("voice-key-btn").addEventListener("click", () => {
    $("voice-panel").classList.remove("is-open");
    openEngine();
    /* The Gemini drawer: its add form when there's no key yet (it opens
       on its own then), otherwise just the drawer, in view. */
    setTimeout(() => {
      const box = document.querySelector('#engine-panel .keyring[data-provider="gemini"]');
      if (!box) return;
      const name = box.querySelector(".kr-new-name");
      if (name) name.focus();
      else box.scrollIntoView({ block: "nearest" });
    }, 60);
  });

  /* Picking from OpenRouter's free list fills the model box — no typing. */
  $("cfg-or-models").addEventListener("change", (e) => {
    if (e.target.value) $("cfg-model").value = e.target.value;
    refreshChips();
  });

  $("mode-btn").addEventListener("click", () => {
    const menu = $("mode-menu");
    const open = menu.classList.toggle("is-open");
    $("mode-btn").setAttribute("aria-expanded", open ? "true" : "false");
  });

  $("emoji-btn").addEventListener("click", () => {
    const open = $("emoji-tray").classList.toggle("is-open");
    $("emoji-btn").setAttribute("aria-expanded", open ? "true" : "false");
  });

  $("chat-send").addEventListener("click", sendMessage);

  /* dictation */
  const mic = micSupport();
  MIC.supported = mic.ok;
  MIC.reason = mic.why;
  $("mic-btn").classList.toggle("is-off", !mic.ok);
  if (!mic.ok) $("mic-btn").title = mic.why;
  $("mic-btn").addEventListener("click", toggleDictation);

  /* voice */
  migrateVoiceKey();
  if (voiceSupported()){
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  } else if (!window.POPPY_VOICE){
    $("voice-btn").classList.add("is-off");
    $("voice-btn").title = "No speech synthesis here.";
  }
  refreshVoiceButton();

  $("voice-btn").addEventListener("click", toggleVoice);
  $("menu-voice").addEventListener("click", () => { closeHeadMenu(); openVoicePanel(); });
  $("voice-x").addEventListener("click", () => $("voice-panel").classList.remove("is-open"));

  $("cfg-voice").addEventListener("change", () => {
    const before = { uri: VOICE.uri, rate: VOICE.rate, pitch: VOICE.pitch };
    VOICE.uri = $("cfg-voice").value;
    VOICE.rate = parseFloat($("cfg-rate").value) || 1;
    VOICE.pitch = parseFloat($("cfg-pitch").value) || 1;
    speak("Hi Jen, this is me.");
    Object.assign(VOICE, before);
  });

  $("cfg-rate").addEventListener("input", (e) => {
    $("rate-out").textContent = Number(e.target.value).toFixed(2) + "\u00D7";
  });
  $("cfg-pitch").addEventListener("input", (e) => {
    $("pitch-out").textContent = Number(e.target.value).toFixed(2);
  });

  $("cfg-voice-engine").addEventListener("change", (e) => showVoiceEngine(e.target.value));

  $("voice-test").addEventListener("click", () => {
    /* preview with the settings on screen, not the saved ones. speak()
       reads them synchronously, so swapping straight back is safe. */
    const next = voicePanelValues();
    const before = {};
    Object.keys(next).forEach(k => { before[k] = VOICE[k]; });
    Object.assign(VOICE, next);
    const note = $("voice-note");
    note.className = "ov-note";
    note.textContent = next.engine === "gemini" ? "Asking Gemini for " + (next.gvoice || "the default voice") + "…" : "";
    speak("Hi Jen! This is how I sound now. Better, right?", (engine, detail) => {
      if (engine === "gemini"){
        note.className = "ov-note ok";
        note.textContent = "That was Gemini — " + detail + ".";
      } else if (next.engine === "gemini"){
        note.className = "ov-note bad";
        note.textContent = "That was the BROWSER voice, not Gemini: " + (detail || "unknown reason");
      }
    });
    Object.assign(VOICE, before);
  });

  $("voice-save").addEventListener("click", () => {
    Object.assign(VOICE, voicePanelValues());
    VOICE.on = $("voice-auto").checked;
    stopSpeaking();
    refreshVoiceButton();
    saveState();
    $("voice-note").textContent = "Saved.";
    $("voice-note").className = "ov-note ok";
    setTimeout(() => $("voice-panel").classList.remove("is-open"), 500);
  });

  /* message menu — right-click, with a long-press fallback because Lively
     may consume the context-menu event before the page sees it */
  const log = $("chat-log");

  log.addEventListener("contextmenu", (e) => {
    const bubble = e.target.closest(".bubble[data-id]");
    if (!bubble) return;
    e.preventDefault();
    openMsgMenu(bubble.dataset.id, e.clientX, e.clientY);
  });

  let holdTimer = null, holdAt = null;
  const cancelHold = () => { clearTimeout(holdTimer); holdTimer = null; };

  log.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const bubble = e.target.closest(".bubble[data-id]");
    if (!bubble || bubble.classList.contains("editing")) return;
    holdAt = { x: e.clientX, y: e.clientY };
    holdTimer = setTimeout(() => {
      openMsgMenu(bubble.dataset.id, holdAt.x, holdAt.y);
      /* releasing the button fires a click straight after, which the
         dismiss handler would read as "clicked outside" — swallow it once */
      CHAT.swallowClick = true;
    }, 520);
  });
  log.addEventListener("mousemove", (e) => {
    if (!holdTimer || !holdAt) return;
    if (Math.abs(e.clientX - holdAt.x) > 6 || Math.abs(e.clientY - holdAt.y) > 6) cancelHold();
  });
  ["mouseup", "mouseleave", "scroll"].forEach(ev => log.addEventListener(ev, cancelHold));

  $("msg-menu").addEventListener("click", (e) => e.stopPropagation());

  $("chat-input").addEventListener("input", () => { autoGrow(); refreshSendState(); });
  $("chat-input").addEventListener("keydown", (e) => {
    /* Enter sends, Shift+Enter makes a new line */
    if (e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      sendMessage();
    }
  });

  /* clicking elsewhere in the panel dismisses the popovers */
  $("chat").addEventListener("click", (e) => {
    if (CHAT.swallowClick){ CHAT.swallowClick = false; return; }
    if (!e.target.closest("#mode-btn") && !e.target.closest("#mode-menu")) closeModeMenu();
    if (!e.target.closest("#chat-menu-btn") && !e.target.closest("#head-menu")) closeHeadMenu();
    if (!e.target.closest("#msg-menu")) closeMsgMenu();
    if (!e.target.closest("#emoji-btn") && !e.target.closest("#emoji-tray")){
      $("emoji-tray").classList.remove("is-open");
      $("emoji-btn").setAttribute("aria-expanded", "false");
    }
  });

  refreshSendState();
}

/* ---------------- controls wiring ---------------- */

function startControls(){
  const bar = $("controls");
  if (!bar) return;

  applyPaint();
  buildGallery();
  refreshPlayIcon();
  setLocked(false);          // never restored from storage, by design

  /* Show the bar while the pointer is near the bottom-right corner. */
  const zone = $("hotzone");
  let hideTimer = null;

  const show = () => { clearTimeout(hideTimer); bar.classList.add("is-open"); };
  const hide = () => {
    hideTimer = setTimeout(() => {
      if ($("gallery").classList.contains("is-open")) return;
      if ($("code-modal").classList.contains("is-open")) return;
      bar.classList.remove("is-open");
      closePanel("gallery");
    }, 600);
  };

  /* The logo sits above the zone, so it has to open the bar too. */
  [zone, bar, $("gallery"), $("logo-link")].forEach(el => {
    if (!el) return;
    el.addEventListener("mouseenter", show);
    el.addEventListener("mouseleave", hide);
  });

  $("ctl-lock").addEventListener("click", () => {
    if (LOCK.locked) openUnlockModal();  // releasing needs the code
    else setLocked(true);                // securing is immediate
  });

  $("ctl-paint").addEventListener("click", cyclePaint);
  $("ctl-prev").addEventListener("click", () => stepSlide(-1));
  $("ctl-next").addEventListener("click", () => stepSlide(1));

  $("ctl-play").addEventListener("click", () => {
    setPaused(!SLIDES.paused);
    refreshPlayIcon();
  });

  $("ctl-gallery").addEventListener("click", () => {
    buildGallery();
    togglePanel("gallery");
  });

  /* keypad */
  document.querySelectorAll("[data-key]").forEach(btn => {
    btn.addEventListener("click", () => pressKey(btn.dataset.key));
  });
  $("key-back").addEventListener("click", () => {
    LOCK.entered = LOCK.entered.slice(0, -1);
    renderKeypadDots();
  });
  $("lock-cancel").addEventListener("click", () => closePanel("code-modal"));

  /* a keyboard is available in a browser even though Lively won't pass one */
  document.addEventListener("keydown", (e) => {
    if (!$("code-modal").classList.contains("is-open")) return;
    if (/^[0-9]$/.test(e.key)) pressKey(e.key);
    if (e.key === "Backspace"){ LOCK.entered = LOCK.entered.slice(0, -1); renderKeypadDots(); }
    if (e.key === "Escape") closePanel("code-modal");
  });
}

/* ---------------- Lively hooks ---------------- */

function applyBackground(file){
  if (!file) return;
  document.documentElement.style.setProperty("--bg", 'url("' + file + '")');
}

/* Lively calls this whenever a property changes in the customise panel */
function livelyPropertyListener(name, val){
  switch (name){
    case "background":
      applyBackground(val.replace(/\\/g, "/"));
      break;
    case "hour12":
      CONFIG.hour12 = val;
      renderClock();
      break;
    case "unit":
      CONFIG.unit = val === 1 ? "F" : "C";
      paintFromCache();   // convert instantly, no network round trip
      fetchWeather();
      break;
    case "latitude":
      CONFIG.latitude = parseFloat(val) || CONFIG.latitude;
      fetchWeather();
      break;
    case "longitude":
      CONFIG.longitude = parseFloat(val) || CONFIG.longitude;
      fetchWeather();
      break;
    case "scrim":
      document.documentElement.style.setProperty("--scrim", val / 100);
      break;
    case "clockScale":
      document.documentElement.style.setProperty("--clock-scale", val);
      break;
    case "slideshow":
      SLIDES.enabled = val;
      restartSlideshow();
      break;
    case "theme":
      SLIDES.theme = String(val || "Default").trim();
      restartSlideshow();
      break;
    case "hoursPerSlide":
      SLIDES.hours = Math.max(1, parseInt(val, 10) || 1);
      restartSlideshow();
      break;
    case "fadeSeconds":
      document.documentElement.style.setProperty("--fade", (val / 10) + "s");
      break;
    case "shadowStrength":
      document.documentElement.style.setProperty("--shadow-strength", val / 100);
      break;
    case "logoScale":
      document.documentElement.style.setProperty("--logo-scale", val);
      break;
  }
}

/* pause network work while the wallpaper is hidden */
let wxTimer = null;
function startWeather(){
  fetchWeather();
  wxTimer = setInterval(fetchWeather, 15 * 60 * 1000);
}
function livelyWallpaperPlaybackChanged(data){
  const playing = data && data.IsPaused === false;
  if (playing && !wxTimer) startWeather();
  if (!playing && wxTimer){ clearInterval(wxTimer); wxTimer = null; }
}

/* ---------------- boot ---------------- */

/* Each step runs independently. On a wallpaper that stays up for days, one
   broken feature should never take the clock down with it. */
function boot(step, fn){
  try{ fn(); }
  catch (err){ console.error("LifeHub: " + step + " failed —", err); }
}

document.addEventListener("DOMContentLoaded", () => {
  boot("preferences", loadState);
  boot("logo", guardLogo);
  boot("clock", startClock);
  boot("slideshow", startSlideshow);
  boot("controls", startControls);
  boot("chat", startChat);
  boot("weather", () => {
    paintFromCache();   // instant paint, before any network call
    startWeather();
    window.addEventListener("online", fetchWeather);
  });
});

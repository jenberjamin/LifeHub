/* ============================================================
   LifeHub — Hydration reminder
   One card, paced through the day. Never two.

   The third kind of thing on this wallpaper, and deliberately not
   like the other two:

     nudges        a state — "you haven't logged X"
     achievements  an event — "you did X"
     this          a PACE — "you're behind for this hour"

   ── THE RULE THAT SHAPES THE WHOLE FILE ─────────────────────────
   A reminder REPLACES the one before it. It never stacks.

   Missing a drink is the normal case, not the exception, and a
   reminder per missed glass would build a column of nagging by
   lunchtime — at which point the panel stops being information and
   becomes something to avoid looking at. So there is exactly one
   hydration card in existence at any moment, and a newer one edits
   it in place rather than joining it.

   Load AFTER firebase-database-compat.js, lifehub-hydration-rules.js
   and lifehub-hydration-protocol.js.
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
     1) PACING  ← this is the part you edit
     ------------------------------------------------------------ */

  /* How long after a reminder before another may appear. The phases
     do the coarse work; this stops a card being redrawn every ten
     minutes inside one of them. */
  const COOLDOWN_MIN = 45;

  /* And how long after she actually drinks. Logging a glass should
     buy a real reprieve even if she is still behind — being told
     "still short" thirty seconds after drinking is the fastest way
     to make someone stop logging. */
  const AFTER_DRINK_MIN = 60;

  const SEEN_KEY = 'lifehub.hydration.reminder';
  const PATH     = 'Trackers/Hydration/LifeHub-tracker-hydration.html';

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyABhqON4h0GHjFbZaDT1ysSprmpdczyC6I",
    authDomain: "lifehub-cae1d.firebaseapp.com",
    databaseURL: "https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "lifehub-cae1d",
    storageBucket: "lifehub-cae1d.firebasestorage.app",
    messagingSenderId: "471522181748",
    appId: "1:471522181748:web:6861392a45fbbbec8dc721"
  };

  const PH_TZ = 'Asia/Manila';
  const PH_DATE = new Intl.DateTimeFormat('en-CA', {
    timeZone: PH_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const phToday = () => PH_DATE.format(new Date());
  const phHour = () => parseInt(new Date().toLocaleString('en-US', {
    timeZone: PH_TZ, hour12: false, hour: '2-digit'
  }), 10);

  /* ------------------------------------------------------------
     2) STYLES
     A cool blue against the achievements' gold, so which kind of
     thing it is is legible before a word is read.
     ------------------------------------------------------------ */
  const CSS = `
  #lh-water{position:fixed;left:50%;bottom:38px;transform:translateX(-50%);
    z-index:8900;pointer-events:none;
    font-family:var(--font-ui,system-ui,sans-serif)}
  #lh-water[hidden]{display:none}

  .lh-w{position:relative;pointer-events:auto;cursor:pointer;
    display:flex;align-items:center;gap:13px;
    min-width:280px;max-width:min(420px,86vw);
    padding:13px 16px 13px 15px;
    background:linear-gradient(135deg,rgba(12,20,28,.90),rgba(10,15,22,.84));
    border:1px solid rgba(120,180,220,.34);
    border-top:1px solid rgba(120,180,220,.50);
    box-shadow:0 10px 40px rgba(0,0,0,.5),inset 0 1px 0 rgba(180,220,255,.10);
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    animation:lh-w-in .42s cubic-bezier(.16,1,.3,1) both;
    transition:transform .2s ease,border-color .2s ease}
  .lh-w:hover{transform:translateY(-2px);border-color:rgba(120,180,220,.62)}

  /* Replacing the text in place gets a brief pulse instead of the
     entrance animation — it has to read as the SAME card updating,
     not a second one arriving. */
  .lh-w.is-swap{animation:lh-w-swap .5s ease-out both}

  @keyframes lh-w-in{
    from{opacity:0;transform:translateY(14px) scale(.97)}
    to{opacity:1;transform:none}}
  @keyframes lh-w-swap{
    0%{border-color:rgba(150,205,245,.85)}
    100%{border-color:rgba(120,180,220,.34)}}
  @keyframes lh-w-out{to{opacity:0;transform:translateY(8px) scale(.98)}}
  .lh-w.is-going{animation:lh-w-out .24s ease-in both;pointer-events:none}

  .lh-w-mark{flex:0 0 auto;width:28px;height:28px;
    display:grid;place-items:center;border-radius:50%;
    background:radial-gradient(circle at 38% 32%,
      rgba(170,220,255,.28),rgba(90,150,200,.10) 62%,transparent);
    border:1px solid rgba(120,180,220,.40)}
  .lh-w-mark svg{width:14px;height:14px;fill:none;
    stroke:rgba(180,225,255,.95);stroke-width:1.6;
    stroke-linecap:round;stroke-linejoin:round}

  .lh-w-body{flex:1;min-width:0}
  .lh-w-title{display:block;font-size:12.5px;font-weight:600;
    letter-spacing:.02em;color:rgba(240,250,255,.96)}
  .lh-w-sub{display:block;margin-top:3px;font-size:11px;line-height:1.4;
    color:rgba(215,235,250,.58)}

  /* The day's progress, as a hairline. It is the one piece of state
     worth showing without being asked — it turns "drink something"
     into "you are here". */
  .lh-w-bar{position:absolute;left:0;right:0;bottom:0;height:2px;
    background:rgba(120,180,220,.14);overflow:hidden}
  .lh-w-bar i{display:block;height:100%;width:0%;
    background:linear-gradient(to right,rgba(120,190,235,.75),rgba(170,225,255,.95));
    transition:width .5s cubic-bezier(.16,1,.3,1)}

  .lh-w-x{flex:0 0 auto;width:20px;height:20px;padding:0;line-height:1;
    background:none;border:0;border-radius:0;cursor:pointer;
    font-family:inherit;font-size:16px;color:rgba(200,225,245,.32);
    opacity:0;transition:opacity .18s ease,color .16s ease}
  .lh-w:hover .lh-w-x,.lh-w-x:focus-visible{opacity:1}
  .lh-w-x:hover{color:rgba(220,240,255,.92)}

  @media (prefers-reduced-motion:reduce){
    .lh-w,.lh-w.is-swap,.lh-w.is-going{animation:none}
    .lh-w:hover{transform:none}
    .lh-w-bar i{transition:none}}
  `;

  const GLASS_ICON =
    '<path d="M3.6 2h8.8l-1 11.2a1 1 0 0 1-1 .8H5.6a1 1 0 0 1-1-.8z"/>' +
    '<path d="M3.95 6.2h8.1"/>';

  /* ------------------------------------------------------------
     3) BUILD — ONE card, made once and edited thereafter
     ------------------------------------------------------------ */
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const host = document.createElement('div');
  host.id = 'lh-water';
  host.hidden = true;
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-label', 'Hydration reminder');

  const card = document.createElement('div');
  card.className = 'lh-w';

  const mark = document.createElement('span');
  mark.className = 'lh-w-mark';
  mark.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">' + GLASS_ICON + '</svg>';

  const body = document.createElement('div');
  body.className = 'lh-w-body';
  const titleEl = document.createElement('b');
  titleEl.className = 'lh-w-title';
  const subEl = document.createElement('span');
  subEl.className = 'lh-w-sub';
  body.appendChild(titleEl);
  body.appendChild(subEl);

  const x = document.createElement('button');
  x.className = 'lh-w-x';
  x.type = 'button';
  x.textContent = '×';
  x.setAttribute('aria-label', 'Dismiss until the next phase');

  const bar = document.createElement('div');
  bar.className = 'lh-w-bar';
  const barFill = document.createElement('i');
  bar.appendChild(barFill);

  card.appendChild(mark);
  card.appendChild(body);
  card.appendChild(x);
  card.appendChild(bar);
  host.appendChild(card);

  card.addEventListener('click', () => { window.location.href = PATH; });
  x.addEventListener('click', (e) => {
    e.stopPropagation();
    /* Dismissing sets the cooldown rather than hiding forever. She has
       seen it; the next phase may still have something new to say. */
    remember({ day: phToday(), at: Date.now(), phase: shownPhase, dismissed: true });
    hide();
  });

  function mount() {
    if (!host.isConnected && document.body) document.body.appendChild(host);
  }

  /* ------------------------------------------------------------
     4) MEMORY
     ------------------------------------------------------------ */
  function recall() {
    try {
      const raw = JSON.parse(localStorage.getItem(SEEN_KEY));
      return raw && raw.day === phToday() ? raw : null;
    } catch (e) { return null; }
  }
  function remember(v) {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(v)); } catch (e) {}
  }

  /* ------------------------------------------------------------
     5) WORDING
     ------------------------------------------------------------ */
  function wordFor(p) {
    const H = window.LIFEHUB_HYDRATION;
    const glasses = p.glasses + (p.glasses === 1 ? ' glass' : ' glasses');

    /* The morning sip is its own case. It is the one she says she
       already does, it pays 2.5x, and naming it is worth more than a
       number would be. */
    if (p.phase.id === 'I' && !p.hadFirstSip) {
      return {
        title: 'First glass of the day',
        sub:   'The 4–8am sip pays double and a half. ' +
               Math.round(p.target) + ' oz by ' + p.phase.to + ':00.'
      };
    }

    return {
      title: 'Time for water — ' + glasses,
      sub:   p.phase.name + ' (' + p.phase.label.toLowerCase() + '): ' +
             Math.round(p.total) + ' of ' + p.target + ' oz by ' +
             p.phase.to + ':00.  Goal ' + p.goal + '.'
    };
  }

  /* ------------------------------------------------------------
     6) SHOW / HIDE — the replace rule lives here
     ------------------------------------------------------------ */
  let shownPhase = null;
  let visible = false;
  /* When a drink last landed. Declared up here with the other view
     state rather than beside its listener — evaluate() reads it, and
     a `let` further down the file is a temporal-dead-zone trap for
     the next person who moves a call. */
  let lastDrinkAt = 0;

  function show(p) {
    mount();
    const words = wordFor(p);
    const swapping = visible;

    titleEl.textContent = words.title;
    subEl.textContent = words.sub;
    barFill.style.width = Math.min(100, (p.total / p.goal) * 100) + '%';
    card.title = 'Open the hydration tracker';

    host.hidden = false;

    /* THE REPLACEMENT. The card is never removed and re-added — the
       text is swapped inside the element that is already there, so
       there is physically no way for two to coexist. The class is
       retriggered by hand because re-adding it to an element that
       already has it does not restart a CSS animation. */
    if (swapping) {
      card.classList.remove('is-swap');
      void card.offsetWidth;
      card.classList.add('is-swap');
    } else {
      card.classList.remove('is-swap');
    }

    visible = true;
    shownPhase = p.phase.id;
    remember({ day: phToday(), at: Date.now(), phase: p.phase.id, dismissed: false });
  }

  function hide() {
    if (!visible) return;
    visible = false;
    shownPhase = null;
    card.classList.add('is-going');
    setTimeout(() => {
      host.hidden = true;
      card.classList.remove('is-going');
    }, 260);
  }

  /* ------------------------------------------------------------
     7) DECIDE
     ------------------------------------------------------------ */
  let today = null;          // today's hydration_logs entry
  let lastTotal = null;      // to notice a drink landing

  function evaluate() {
    const P = window.LIFEHUB_HYDRATION_PROTOCOL;
    if (!P || today === null) return;

    const p = P.pace(today, phHour());

    /* Outside the drinking day, or the goal is met. Either way there
       is nothing to say, and a met goal should clear the card rather
       than leave the last nag sitting there. */
    if (!p || !p.behind) { hide(); return; }

    const seen = recall();
    const now = Date.now();

    if (seen) {
      const sinceShown = (now - (seen.at || 0)) / 60000;

      /* A new PHASE always gets to speak, cooldown or not — that is
         the point of phases. Within one phase, the cooldown holds. */
      if (seen.phase === p.phase.id && sinceShown < COOLDOWN_MIN) return;
    }

    /* She just drank. Let her be, even if she is still behind. */
    if (lastDrinkAt && (now - lastDrinkAt) / 60000 < AFTER_DRINK_MIN) {
      hide();
      return;
    }

    show(p);
  }

  /* ------------------------------------------------------------
     8) READ
     ------------------------------------------------------------ */
  function start() {
    mount();

    if (!window.LIFEHUB_HYDRATION || !window.LIFEHUB_HYDRATION_PROTOCOL) {
      console.warn('[hydration] rules or protocol not loaded — no reminders.');
      return;
    }
    if (!window.firebase || !firebase.database) {
      console.warn('[hydration] firebase-database-compat.js is not loaded.');
      return;
    }

    let app;
    try { app = firebase.app('hydration'); }
    catch (e) { app = firebase.initializeApp(FIREBASE_CONFIG, 'hydration'); }
    const db = firebase.database(app);

    /* Today's node only. The reminder is about now, and watching the
       whole history on a wallpaper would be wasteful. Re-pointed at
       midnight by the ticker below. */
    let watching = null;
    let ref = null;

    function watchToday() {
      const day = phToday();
      if (watching === day) return;
      if (ref) ref.off();

      watching = day;
      lastTotal = null;
      ref = db.ref('hydration_logs/' + day);

      ref.on('value', (snap) => {
        today = snap.val() || {};
        const total = Number(today.total) || 0;

        /* A rise in the total is a drink landing. Noticed here rather
           than by watching the logs array, because Poppy, Alexa and
           the tracker all write it differently but all move the total. */
        if (lastTotal !== null && total > lastTotal) {
          lastDrinkAt = Date.now();
          hide();
        }
        lastTotal = total;

        evaluate();
      }, (err) => {
        console.warn('[hydration] could not read today:', err.message);
      });
    }

    watchToday();

    /* Every five minutes: crosses a phase boundary, expires a
       cooldown, and rolls the day over at midnight. */
    setInterval(() => { watchToday(); evaluate(); }, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { watchToday(); evaluate(); }
    });
  }

  /* ------------------------------------------------------------
     9) CONSOLE HANDLES
     ------------------------------------------------------------ */
  window.LifeHubHydration = {
    /* Draw it now regardless of pace or cooldown, to see the wording.
       Pass a phase id to see that one: preview('II'). */
    preview(phaseId, ozDrunk) {
      const P = window.LIFEHUB_HYDRATION_PROTOCOL;
      const phase = P.PHASES.find(p => p.id === (phaseId || 'I')) || P.PHASES[0];

      /* An empty day at the START of that phase, which is the state the
         reminder actually fires in. `ozDrunk` overrides it, so
         preview('II', 30) shows what a half-done afternoon reads like. */
      const p = P.pace({ total: Number(ozDrunk) || 0 }, phase.from);
      if (!p) { console.warn('[hydration] no pace for phase ' + phase.id); return; }
      show(p);
      return phase.name + ' — ' + titleEl.textContent;
    },
    /* Clear the cooldown so the next check may speak again. */
    reset() {
      try { localStorage.removeItem(SEEN_KEY); } catch (e) {}
      lastDrinkAt = 0;
      hide();
      console.log('[hydration] cooldown cleared.');
    },
    hide: hide,
    debug() {
      const P = window.LIFEHUB_HYDRATION_PROTOCOL;
      const out = {
        hour: phHour(),
        today: today,
        pace: P && today !== null ? P.pace(today, phHour()) : null,
        remembered: recall(),
        minsSinceDrink: lastDrinkAt ? Math.round((Date.now() - lastDrinkAt) / 60000) : null
      };
      console.log(out);
      return out;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

/* ============================================================
   LifeHub — Food reminder
   One card, paced through the day. Never two.

   The companion to LifeHub-homescreen-hydration.js and built the
   same way, for the same reason:

     nudges        a state — "you haven't logged X"
     achievements  an event — "you did X"
     this          a PACE — "you're behind for this hour"

   ── WHAT MAKES THIS ONE DIFFERENT ───────────────────────────────
   Jen is trying to GAIN weight. So every word here points the same
   way: eat more, eat now, eat something dense.

   It never mentions eating less, never calls a total high, and goes
   quiet the moment she is comfortably fed. The one thing it will
   warn about is sugar — family history of diabetes — and even then
   only while there is headroom left to protect. Once the limit is
   gone the day is spent, and saying so again is nagging about a
   thing she cannot change.

   ── THE RULE THAT SHAPES THE WHOLE FILE ─────────────────────────
   A reminder REPLACES the one before it. It never stacks.

   Load AFTER firebase-database-compat.js, lifehub-food-rules.js and
   lifehub-food-protocol.js.
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
     1) PACING  ← this is the part you edit
     ------------------------------------------------------------ */

  /* How long after a reminder before another may appear within the
     same phase. Longer than hydration's 45: a glass of water is a
     thirty-second fix, a meal is not, and being asked twice in an
     hour to eat is being asked to do something she is already doing. */
  const COOLDOWN_MIN = 90;

  /* And how long after she actually eats. Logging a meal should buy a
     real reprieve even if she is still short — being told "still
     behind" two minutes after lunch is the fastest way to make
     someone stop logging, which is exactly how this tracker died the
     first time. */
  const AFTER_MEAL_MIN = 90;

  const SEEN_KEY = 'lifehub.food.reminder';
  const PATH     = 'Hubs/FoodHub/FoodHub.html';

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
     A warm green against hydration's blue and the achievements'
     gold, so which kind of thing it is is legible before a word is
     read. The amber variant is the sugar warning — the only state
     this card has that isn't encouragement.
     ------------------------------------------------------------ */
  const CSS = `
  /* Same anchor as the hydration card, which is the problem: both are
     fixed to the bottom centre and would sit exactly on top of each
     other. The offset is set from script instead — see stack() — so
     this one lifts above the water card whenever that one is out, and
     drops back to the normal spot when it isn't.
     The transition is on the offset so the move reads as making room
     rather than as a jump. */
  #lh-food{position:fixed;left:50%;bottom:38px;transform:translateX(-50%);
    z-index:8890;pointer-events:none;
    transition:bottom .28s cubic-bezier(.16,1,.3,1);
    font-family:var(--font-ui,system-ui,sans-serif)}
  #lh-food[hidden]{display:none}

  .lh-f{position:relative;pointer-events:auto;cursor:pointer;
    display:flex;align-items:center;gap:13px;
    min-width:280px;max-width:min(420px,86vw);
    padding:13px 16px 13px 15px;
    background:linear-gradient(135deg,rgba(14,26,20,.90),rgba(10,18,14,.84));
    border:1px solid rgba(125,200,150,.32);
    border-top:1px solid rgba(125,200,150,.48);
    box-shadow:0 10px 40px rgba(0,0,0,.5),inset 0 1px 0 rgba(190,240,205,.10);
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    animation:lh-f-in .42s cubic-bezier(.16,1,.3,1) both;
    transition:transform .2s ease,border-color .2s ease}
  .lh-f:hover{transform:translateY(-2px);border-color:rgba(125,200,150,.60)}

  /* Sugar. The one thing on this card that is a caution rather than
     an encouragement, so it is the one thing that changes colour. */
  .lh-f.is-sugar{background:linear-gradient(135deg,rgba(30,22,10,.90),rgba(22,16,8,.84));
    border-color:rgba(230,180,90,.36);
    border-top-color:rgba(230,180,90,.52)}
  .lh-f.is-sugar:hover{border-color:rgba(230,180,90,.66)}
  .lh-f.is-sugar .lh-f-mark{border-color:rgba(230,180,90,.44);
    background:radial-gradient(circle at 38% 32%,
      rgba(255,215,140,.26),rgba(200,150,60,.10) 62%,transparent)}
  .lh-f.is-sugar .lh-f-mark svg{stroke:rgba(255,225,170,.95)}
  .lh-f.is-sugar .lh-f-bar i{background:linear-gradient(to right,
    rgba(230,180,90,.75),rgba(255,215,140,.95))}

  .lh-f.is-swap{animation:lh-f-swap .5s ease-out both}

  @keyframes lh-f-in{
    from{opacity:0;transform:translateY(14px) scale(.97)}
    to{opacity:1;transform:none}}
  @keyframes lh-f-swap{
    0%{border-color:rgba(160,230,185,.85)}
    100%{border-color:rgba(125,200,150,.32)}}
  @keyframes lh-f-out{to{opacity:0;transform:translateY(8px) scale(.98)}}
  .lh-f.is-going{animation:lh-f-out .24s ease-in both;pointer-events:none}

  .lh-f-mark{flex:0 0 auto;width:28px;height:28px;
    display:grid;place-items:center;border-radius:50%;
    background:radial-gradient(circle at 38% 32%,
      rgba(180,255,205,.26),rgba(90,170,120,.10) 62%,transparent);
    border:1px solid rgba(125,200,150,.40);transition:border-color .2s ease}
  .lh-f-mark svg{width:14px;height:14px;fill:none;
    stroke:rgba(195,250,215,.95);stroke-width:1.6;
    stroke-linecap:round;stroke-linejoin:round}

  .lh-f-body{flex:1;min-width:0}
  .lh-f-title{display:block;font-size:12.5px;font-weight:600;
    letter-spacing:.02em;color:rgba(243,255,246,.96)}
  .lh-f-sub{display:block;margin-top:3px;font-size:11px;line-height:1.4;
    color:rgba(220,245,228,.58)}

  .lh-f-bar{position:absolute;left:0;right:0;bottom:0;height:2px;
    background:rgba(125,200,150,.14);overflow:hidden}
  .lh-f-bar i{display:block;height:100%;width:0%;
    background:linear-gradient(to right,rgba(120,205,150,.75),rgba(175,245,200,.95));
    transition:width .5s cubic-bezier(.16,1,.3,1)}

  .lh-f-x{flex:0 0 auto;width:20px;height:20px;padding:0;line-height:1;
    background:none;border:0;border-radius:0;cursor:pointer;
    font-family:inherit;font-size:16px;color:rgba(205,240,215,.32);
    opacity:0;transition:opacity .18s ease,color .16s ease}
  .lh-f:hover .lh-f-x,.lh-f-x:focus-visible{opacity:1}
  .lh-f-x:hover{color:rgba(230,255,238,.92)}

  @media (prefers-reduced-motion:reduce){
    .lh-f,.lh-f.is-swap,.lh-f.is-going{animation:none}
    .lh-f:hover{transform:none}
    .lh-f-bar i{transition:none}}
  `;

  /* A plate with a fork. */
  const PLATE_ICON =
    '<circle cx="9.5" cy="8" r="5.4"/>' +
    '<path d="M2.6 2v4.2a1.4 1.4 0 0 0 2.8 0V2"/>' +
    '<path d="M4 6.4V14"/>';

  /* ------------------------------------------------------------
     3) BUILD — ONE card, made once and edited thereafter
     ------------------------------------------------------------ */
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const host = document.createElement('div');
  host.id = 'lh-food';
  host.hidden = true;
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-label', 'Food reminder');

  const card = document.createElement('div');
  card.className = 'lh-f';
  /* A div, so the phone remote (lifehub-navigation-core.js) only sees it
     as clickable with a button role and a tabindex. */
  card.setAttribute('role', 'button');
  card.tabIndex = 0;

  const mark = document.createElement('span');
  mark.className = 'lh-f-mark';
  mark.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">' + PLATE_ICON + '</svg>';

  const body = document.createElement('div');
  body.className = 'lh-f-body';
  const titleEl = document.createElement('b');
  titleEl.className = 'lh-f-title';
  const subEl = document.createElement('span');
  subEl.className = 'lh-f-sub';
  body.appendChild(titleEl);
  body.appendChild(subEl);

  const x = document.createElement('button');
  x.className = 'lh-f-x';
  x.type = 'button';
  x.textContent = '×';
  x.setAttribute('aria-label', 'Dismiss until the next phase');

  const bar = document.createElement('div');
  bar.className = 'lh-f-bar';
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
    remember({ day: phToday(), at: Date.now(), phase: shownPhase,
               kind: shownKind, dismissed: true });
    hide();
  });

  function mount() {
    if (!host.isConnected && document.body) document.body.appendChild(host);
  }

  /* ------------------------------------------------------------
     3b) STACKING
     Both paced cards are anchored bottom-centre, so if the hydration
     one is out this one has to get out of its way.

     The dependency runs ONE WAY on purpose: this file reads the
     water card's DOM, and the water card knows nothing about this
     one. Two files negotiating a position between them is how you
     get a pair that both move at once and end up swapped.
     ------------------------------------------------------------ */
  const BASE_BOTTOM = 38;
  const GAP = 12;

  function stack() {
    const water = document.getElementById('lh-water');
    const waterOut = water && !water.hidden && water.offsetHeight > 0;

    host.style.bottom = waterOut
      ? (BASE_BOTTOM + water.offsetHeight + GAP) + 'px'
      : BASE_BOTTOM + 'px';
  }

  /* The water card appears and disappears on its own schedule, so
     this has to re-measure when it does rather than only when the
     food card is drawn. Watching the attribute it toggles is cheaper
     and more exact than polling. */
  function watchWater() {
    const water = document.getElementById('lh-water');
    if (!water) return;
    new MutationObserver(stack).observe(water,
      { attributes: true, attributeFilter: ['hidden', 'style'] });
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
     Nothing here suggests eating less, and nothing calls a number
     high. The only caution is sugar.
     ------------------------------------------------------------ */
  const kcal = (n) => Math.round(n).toLocaleString();

  /* A number of calories, said as food.
     ────────────────────────────────────────────────────────────────
     "1,205" is arithmetic. "About a meal and a snack" is a decision
     she can act on without doing any. The card leads with this and
     keeps the number underneath for when she wants it.

     Vague on purpose — a meal is roughly 600 and a snack roughly 200,
     and pretending to more precision than that about food nobody has
     chosen yet would be false. */
  function asFood(n) {
    const c = Math.round(n);
    if (c <= 120)  return 'a bite or two';
    if (c <= 300)  return 'about a snack';
    if (c <= 500)  return 'a decent snack';
    if (c <= 850)  return 'about a meal';
    if (c <= 1400) return 'about a meal and a snack';
    if (c <= 2000) return 'roughly two meals';
    return 'a few solid meals';
  }

  /* ── THE TONE ────────────────────────────────────────────────
     Every line here says what there is ROOM for, never what she has
     failed to do. "710 behind" and "short with the evening left" are
     verdicts, and telling someone who struggles to eat enough that
     she is behind is a judgement dressed as information.

     So: no "behind", no "short", no "still", no "only", no
     exclamation marks, and nothing in the imperative. The numbers
     are identical — it is the framing that changes, from a deficit
     against a standard to room she has left. */
  function wordFor(p, kind) {
    if (kind === 'sugar') {
      return {
        title: Math.round(p.sugarLeft) + 'g of sugar left today',
        sub:   Math.round(p.sugar) + ' of ' + p.sugarLimit + 'g so far. ' +
               'Enough for something proper, if you save it for what you ' +
               'actually want.'
      };
    }

    /* Nothing logged. A question, not an observation — she has almost
       certainly eaten, and the gap is in the record rather than in
       the day. Saying it the other way round would be wrong as well
       as rude. */
    if (kind === 'empty') {
      return {
        title: 'Anything to log?',
        sub:   'Nothing down for today yet. A rough guess counts for more ' +
               'than a blank one.'
      };
    }

    /* Past the floor, chasing gold. Entirely optional and worded so. */
    if (kind === 'gold') {
      return {
        title: asFood(p.toGold) + ' away from a gold day',
        sub:   kcal(p.cal) + ' of ' + kcal(p.gold) + ' calories. ' +
               'Gold pays 3,000 prestige, if you fancy it.'
      };
    }

    /* The main case. Food first, numbers underneath — and every
       number carries its unit, because "1,205" on its own is a
       quantity of nothing. */
    const evening = p.phase.id === 'III';

    const protein = p.toProtein > 0
      ? ' Protein ' + Math.round(p.prot) + ' of ' +
        Math.round(p.prot + p.toProtein) + 'g.'
      : ' Protein bonus already yours.';

    return {
      title: evening
        ? asFood(p.toFloor) + ' to go, and an evening to do it in'
        : asFood(p.toFloor) + ' to go today',
      sub: kcal(p.cal) + ' of ' + kcal(p.floor) + ' calories.' + protein +
           ' Nuts, cheese or peanut butter close it quickly.'
    };
  }

  /* ------------------------------------------------------------
     6) SHOW / HIDE — the replace rule lives here
     ------------------------------------------------------------ */
  let shownPhase = null;
  let shownKind = null;
  let visible = false;
  let lastMealAt = 0;

  function show(p, kind) {
    mount();
    const words = wordFor(p, kind);
    const swapping = visible;

    titleEl.textContent = words.title;
    subEl.textContent = words.sub;

    /* The bar tracks calories against the floor for every state
       except sugar, where it tracks the sugar used — the card is
       about a different number then, and the bar should agree. */
    barFill.style.width = kind === 'sugar'
      ? Math.min(100, (p.sugar / p.sugarLimit) * 100) + '%'
      : Math.min(100, (p.cal / p.floor) * 100) + '%';

    card.classList.toggle('is-sugar', kind === 'sugar');
    card.title = 'Open FoodHub';

    host.hidden = false;
    stack();

    /* THE REPLACEMENT. The card is never removed and re-added — the
       text is swapped inside the element already there, so there is
       physically no way for two to coexist. */
    if (swapping) {
      card.classList.remove('is-swap');
      void card.offsetWidth;
      card.classList.add('is-swap');
    } else {
      card.classList.remove('is-swap');
    }

    visible = true;
    shownPhase = p.phase.id;
    shownKind = kind;
    remember({ day: phToday(), at: Date.now(), phase: p.phase.id,
               kind: kind, dismissed: false });
  }

  function hide() {
    if (!visible) return;
    visible = false;
    shownPhase = null;
    shownKind = null;
    card.classList.add('is-going');
    setTimeout(() => {
      host.hidden = true;
      card.classList.remove('is-going');
    }, 260);
  }

  /* ------------------------------------------------------------
     7) DECIDE
     ------------------------------------------------------------ */
  let today = null;          // today's dailyLogs node
  let lastCal = null;        // to notice a meal landing

  /* Which of the four things this card could be saying, or null for
     "say nothing". Order is priority. */
  function kindFor(p) {
    /* Sugar first, and ONLY while there is headroom left. Past the
       limit the day is spent and repeating it is nagging.

       This one CAN speak in the morning: 50g of sugar by eleven is
       worth knowing while the day can still be steered. */
    if (p.sugarClose) return 'sugar';

    /* ── SILENT ALL MORNING ──────────────────────────────────────
       Nothing about calories before noon. Jen is up at six, and at
       7:30am a card saying she has eaten nothing is both obvious and
       useless — there is no hour at which being told to eat is less
       welcome or less actionable.

       The morning share still counts in the pace maths, so the
       afternoon knows whether she started well. It simply doesn't
       get a voice of its own. */
    if (p.phase.id === 'I') return null;

    /* Comfortably fed and gold already reached — nothing to say. */
    if (!p.behind && p.toGold <= 0) return null;

    if (p.behind) return p.cal <= 0 ? 'empty' : 'behind';

    /* Past the pace but short of gold. Only worth saying in the
       evening, when there is still a meal in which to do it and it
       reads as encouragement rather than pestering. */
    if (p.phase.id === 'III' && p.toGold > 0) return 'gold';

    return null;
  }

  function evaluate() {
    const P = window.LIFEHUB_FOOD_PROTOCOL;
    if (!P || today === null) return;

    const p = P.pace(today, phHour());

    /* Outside the eating day. */
    if (!p) { hide(); return; }

    const kind = kindFor(p);
    if (!kind) { hide(); return; }

    const seen = recall();
    const now = Date.now();

    if (seen) {
      const sinceShown = (now - (seen.at || 0)) / 60000;

      /* A new PHASE always gets to speak, and so does a different
         KIND — a sugar warning is not the same message as "you're
         behind", and one should not be silenced by the other's
         cooldown. Within one phase saying the same thing, it holds. */
      if (seen.phase === p.phase.id && seen.kind === kind &&
          sinceShown < COOLDOWN_MIN) return;
    }

    /* She just ate. Let her be, even if she is still short — except
       for sugar, which is about what she just ate and is the one
       thing worth saying immediately. */
    if (kind !== 'sugar' && lastMealAt &&
        (now - lastMealAt) / 60000 < AFTER_MEAL_MIN) {
      hide();
      return;
    }

    show(p, kind);
  }

  /* ------------------------------------------------------------
     8) READ
     ------------------------------------------------------------ */
  function start() {
    mount();
    watchWater();
    stack();

    if (!window.LIFEHUB_FOOD || !window.LIFEHUB_FOOD_PROTOCOL) {
      console.warn('[food] rules or protocol not loaded — no reminders.');
      return;
    }
    if (!window.firebase || !firebase.database) {
      console.warn('[food] firebase-database-compat.js is not loaded.');
      return;
    }

    let app;
    try { app = firebase.app('foodcard'); }
    catch (e) { app = firebase.initializeApp(FIREBASE_CONFIG, 'foodcard'); }
    const db = firebase.database(app);

    let watching = null;
    let ref = null;

    function watchToday() {
      const day = phToday();
      if (watching === day) return;
      if (ref) ref.off();

      watching = day;
      lastCal = null;
      ref = db.ref('dailyLogs/' + day);

      ref.on('value', (snap) => {
        today = snap.val() || {};
        const cal = window.LIFEHUB_FOOD.totalsFor(today).cal;

        /* A rise in the day's calories is a meal landing. Noticed on
           the total rather than on the row count, because Poppy and
           the tracker write rows differently but both move it. */
        if (lastCal !== null && cal > lastCal) {
          lastMealAt = Date.now();
          hide();
        }
        lastCal = cal;

        evaluate();
      }, (err) => {
        console.warn('[food] could not read today:', err.message);
      });
    }

    watchToday();

    setInterval(() => { watchToday(); evaluate(); }, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { watchToday(); evaluate(); }
    });
  }

  /* ------------------------------------------------------------
     9) CONSOLE HANDLES
     ------------------------------------------------------------ */
  window.LifeHubFood = {
    /* Draw it now regardless of pace or cooldown, to see the wording.
         preview('II')            an empty afternoon
         preview('III', 1800)     1,800 kcal with the evening left
         preview('II', 1200, 52)  the sugar warning */
    preview(phaseId, calEaten, sugarEaten) {
      const P = window.LIFEHUB_FOOD_PROTOCOL;
      const phase = P.PHASES.find(p => p.id === (phaseId || 'II')) || P.PHASES[0];

      /* A synthetic day, shaped the way Firebase hands one back. */
      const fake = { '-preview': {
        foodName: 'Preview', multiplier: 1,
        macros: JSON.stringify({ cal: String(Number(calEaten) || 0),
                                 prot: '40',
                                 sugar: String(Number(sugarEaten) || 0) })
      }};

      const p = P.pace(fake, phase.from);
      if (!p) { console.warn('[food] no pace for phase ' + phase.id); return; }

      const kind = kindFor(p) || 'behind';
      show(p, kind);
      return phase.name + ' — [' + kind + '] ' + titleEl.textContent;
    },
    reset() {
      try { localStorage.removeItem(SEEN_KEY); } catch (e) {}
      lastMealAt = 0;
      hide();
      console.log('[food] cooldown cleared.');
    },
    hide: hide,
    debug() {
      const P = window.LIFEHUB_FOOD_PROTOCOL;
      const p = P && today !== null ? P.pace(today, phHour()) : null;
      const out = {
        hour: phHour(),
        totals: today !== null ? window.LIFEHUB_FOOD.totalsFor(today) : null,
        pace: p,
        kind: p ? kindFor(p) : null,
        remembered: recall(),
        minsSinceMeal: lastMealAt ? Math.round((Date.now() - lastMealAt) / 60000) : null
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

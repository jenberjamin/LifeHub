/* ============================================================
   LifeHub — Achievement toasts
   The counterpart to the nudges panel, and deliberately its opposite.

   Nudges say "you haven't." This says "you did." That difference is
   the whole design: it fires on an EVENT, never on a state, so there
   is no running score anywhere on the wallpaper and nothing to feel
   watched by. Prestige stays in the bank where it lives; the only
   time it surfaces here is the moment a tier is crossed.

   Two sources:
     Sleep streaks   consecutive days with a sleep_logs entry
     Prestige tiers  crossing into a higher tier in the ledger

   Load AFTER firebase-database-compat.js AND lifehub-prestige-ledger.js.
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
     1) WHAT COUNTS AS AN ACHIEVEMENT  ← the part you edit

     These are exactly the days tracker-sleep.js already pays a streak
     bonus for (+2,000 / +10,000 / +50,000), and that is the whole
     rule: this file ANNOUNCES prestige, it does not invent it. A toast
     for a milestone the ledger does not pay would be celebrating
     nothing — the bank would show no matching row.

     So if a milestone is added here, add the bonus in tracker-sleep.js
     to match, or it is just a popup.
     ------------------------------------------------------------ */
  const STREAK_MILESTONES = [3, 7, 30];

  /* Tiers come from the ledger, not from here. One source of truth for
     what a rank is — see JS/lifehub-prestige-ledger.js. */

  /* How many days of history to hold open for the streak walk. A live
     listener on a wallpaper, so it is bounded rather than the whole
     node — 400 covers the longest milestone with room to spare. */
  const STREAK_WINDOW = 400;

  const SEEN_KEY    = 'lifehub.achievements.seen';
  const PENDING_KEY = 'lifehub.achievements.pending';

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyABhqON4h0GHjFbZaDT1ysSprmpdczyC6I",
    authDomain: "lifehub-cae1d.firebaseapp.com",
    databaseURL: "https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "lifehub-cae1d",
    storageBucket: "lifehub-cae1d.firebasestorage.app",
    messagingSenderId: "471522181748",
    appId: "1:471522181748:web:6861392a45fbbbec8dc721"
  };

  /* ------------------------------------------------------------
     2) MANILA TIME
     Same rule as the trackers, the nudges panel and the Alexa skill:
     a date is a Philippine calendar date whatever the device says.
     ------------------------------------------------------------ */
  const PH_TZ = 'Asia/Manila';
  const PH_DATE = new Intl.DateTimeFormat('en-CA', {
    timeZone: PH_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const phToday = () => PH_DATE.format(new Date());

  /* Pure counting on the date parts — the same reason tracker-sleep.js
     stopped parsing keys into Dates: that is how UTC creeps back in and
     silently breaks a streak for part of every evening. */
  function shiftDateKey(key, days) {
    const [y, m, d] = String(key).split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
    return t.getUTCFullYear() + '-' +
           String(t.getUTCMonth() + 1).padStart(2, '0') + '-' +
           String(t.getUTCDate()).padStart(2, '0');
  }

  /* ------------------------------------------------------------
     3) STREAK

     Anchored to today if today is logged, otherwise to yesterday. Sleep
     is logged on waking, so for most of the morning today's entry does
     not exist yet — anchoring only to today would collapse a 40-day
     streak to zero every midnight and re-award it at breakfast.
     ------------------------------------------------------------ */
  function streakFrom(keys) {
    const today = phToday();
    let cursor = keys.has(today) ? today : shiftDateKey(today, -1);
    if (!keys.has(cursor)) return 0;

    let n = 0;
    /* Bounded by what we actually hold — a malformed key can't spin
       this forever. */
    while (keys.has(cursor) && n <= keys.size) {
      n++;
      cursor = shiftDateKey(cursor, -1);
    }
    return n;
  }

  /* ------------------------------------------------------------
     4) STYLES
     ------------------------------------------------------------ */
  const CSS = `
  #lh-ach{position:fixed;left:50%;bottom:38px;transform:translateX(-50%);
    z-index:9000;display:flex;flex-direction:column-reverse;gap:8px;
    align-items:center;pointer-events:none;
    font-family:var(--font-ui,system-ui,sans-serif)}
  #lh-ach:empty{display:none}

  .lh-a{position:relative;pointer-events:auto;cursor:pointer;
    display:flex;align-items:flex-start;gap:13px;
    min-width:290px;max-width:min(430px,86vw);
    padding:15px 17px 15px 16px;
    background:linear-gradient(135deg,rgba(24,20,12,.90),rgba(16,14,10,.84));
    border:1px solid rgba(212,175,55,.42);
    border-top:1px solid rgba(212,175,55,.60);
    box-shadow:0 10px 40px rgba(0,0,0,.55),
               0 0 0 1px rgba(0,0,0,.28),
               inset 0 1px 0 rgba(255,236,180,.13);
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    animation:lh-a-in .5s cubic-bezier(.16,1,.3,1) both;
    transition:transform .2s ease,border-color .2s ease}
  .lh-a:hover{transform:translateY(-2px);border-color:rgba(212,175,55,.70)}

  /* A thin gold rule that sweeps across the top on arrival. The only
     motion after the card lands — a wallpaper should not twinkle. */
  .lh-a::after{content:'';position:absolute;left:0;top:-1px;height:1px;
    width:100%;background:linear-gradient(to right,
      transparent,rgba(255,228,150,.95),transparent);
    animation:lh-a-sweep 1.5s ease-out .25s both}

  @keyframes lh-a-in{
    from{opacity:0;transform:translateY(16px) scale(.97)}
    to{opacity:1;transform:none}}
  @keyframes lh-a-sweep{
    from{transform:translateX(-100%)}
    to{transform:translateX(100%)}}
  @keyframes lh-a-out{
    to{opacity:0;transform:translateY(8px) scale(.98)}}
  .lh-a.is-going{animation:lh-a-out .26s ease-in both;pointer-events:none}

  .lh-a-mark{flex:0 0 auto;width:30px;height:30px;margin-top:1px;
    display:grid;place-items:center;border-radius:50%;
    background:radial-gradient(circle at 38% 32%,
      rgba(255,232,166,.30),rgba(212,175,55,.10) 62%,transparent);
    border:1px solid rgba(212,175,55,.45)}
  .lh-a-mark svg{width:15px;height:15px;fill:none;
    stroke:rgba(255,226,150,.95);stroke-width:1.7;
    stroke-linecap:round;stroke-linejoin:round}

  .lh-a-body{flex:1;min-width:0}
  .lh-a-kicker{display:block;font-size:8.5px;font-weight:700;
    letter-spacing:.22em;text-transform:uppercase;
    color:rgba(212,175,55,.86)}
  .lh-a-title{display:block;margin-top:5px;
    font-family:var(--font-display,Georgia,serif);
    font-size:19px;line-height:1.15;font-weight:600;
    color:rgba(255,250,240,.98)}
  .lh-a-sub{display:block;margin-top:5px;font-size:11.5px;line-height:1.45;
    color:rgba(255,244,222,.60)}

  .lh-a-x{flex:0 0 auto;width:20px;height:20px;padding:0;line-height:1;
    background:none;border:0;border-radius:0;cursor:pointer;
    font-family:inherit;font-size:16px;color:rgba(255,240,210,.34);
    opacity:0;transition:opacity .18s ease,color .16s ease}
  .lh-a:hover .lh-a-x,.lh-a-x:focus-visible{opacity:1}
  .lh-a-x:hover{color:rgba(255,240,210,.92)}

  /* A penalty is the same card with the gold swapped for a muted rust.
     Not red: this fires on a wallpaper she is looking at all day, and
     an alarm colour for "you overslept three times" would be louder
     than the fact deserves. */
  .lh-a.is-penalty{
    background:linear-gradient(135deg,rgba(26,16,14,.90),rgba(18,12,11,.84));
    border-color:rgba(198,110,86,.40);
    border-top-color:rgba(198,110,86,.58)}
  .lh-a.is-penalty:hover{border-color:rgba(198,110,86,.68)}
  .lh-a.is-penalty::after{background:linear-gradient(to right,
      transparent,rgba(240,160,130,.85),transparent)}
  .lh-a.is-penalty .lh-a-mark{
    background:radial-gradient(circle at 38% 32%,
      rgba(240,170,140,.26),rgba(198,110,86,.10) 62%,transparent);
    border-color:rgba(198,110,86,.44)}
  .lh-a.is-penalty .lh-a-mark svg{stroke:rgba(245,175,148,.95)}
  .lh-a.is-penalty .lh-a-kicker{color:rgba(216,132,106,.90)}

  @media (prefers-reduced-motion:reduce){
    .lh-a,.lh-a::after,.lh-a.is-going{animation:none}
    .lh-a:hover{transform:none}}
  `;

  const ICONS = {
    /* A crescent — the sleep tracker's own mark. */
    streak: '<path d="M13.2 1.8A6.4 6.4 0 1 0 14.2 14 7.4 7.4 0 0 1 13.2 1.8Z"/>',
    /* A rosette, for a rank rather than a habit. */
    tier:   '<path d="M8 1.6l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.4 4.2 13.4l.7-4.3-3.1-3 4.3-.6z"/>',
    /* A cup, for the Notion trophies. */
    trophy: '<path d="M4.6 2h6.8v3.2a3.4 3.4 0 0 1-6.8 0z"/>' +
            '<path d="M4.6 2.9H2.8v1.2a2.1 2.1 0 0 0 1.9 2M11.4 2.9h1.8v1.2a2.1 2.1 0 0 1-1.9 2"/>' +
            '<path d="M8 8.6V11M5.6 14h4.8l-.5-3H6.1z"/>',
    /* A struck-through ring. Penalties are the same shape family as the
       rest, deliberately — a warning triangle on a wallpaper reads as
       an error in the app rather than a fact about the week. */
    penalty: '<circle cx="8" cy="8" r="6.1"/><path d="M3.7 3.7l8.6 8.6"/>'
  };

  /* ------------------------------------------------------------
     5) BUILD
     ------------------------------------------------------------ */
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const stack = document.createElement('div');
  stack.id = 'lh-ach';
  stack.setAttribute('aria-live', 'polite');
  stack.setAttribute('aria-label', 'Achievements');

  function mount() {
    if (!stack.isConnected) document.body.appendChild(stack);
  }

  /* ------------------------------------------------------------
     6) PERSISTENCE

     `seen` is the high-water mark, so nothing is announced twice.
     `pending` is the toasts not yet dismissed — kept on disk because
     this page is a wallpaper that reloads on its own schedule, and an
     achievement she was not at the desk for should still be waiting
     when she gets back. Without it "every achievement" would really
     mean "every achievement you happened to be looking at".
     ------------------------------------------------------------ */
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { /* private mode — it just won't survive the reload */ }
  }

  const getSeen    = () => readJSON(SEEN_KEY, null);
  const setSeen    = (s) => writeJSON(SEEN_KEY, s);
  const getPending = () => readJSON(PENDING_KEY, []) || [];
  const setPending = (p) => writeJSON(PENDING_KEY, p);

  /* ------------------------------------------------------------
     7) RENDER
     ------------------------------------------------------------ */
  function dismiss(id, el) {
    setPending(getPending().filter(a => a.id !== id));
    el.classList.add('is-going');
    /* Let the exit animation finish; reduced-motion has none, so the
       timer is the only thing removing it either way. */
    setTimeout(() => el.remove(), 280);
  }

  function draw(a) {
    mount();
    if (stack.querySelector('[data-ach-id="' + CSS_escape(a.id) + '"]')) return;

    const card = document.createElement('div');
    card.className = 'lh-a' + (a.kind === 'penalty' ? ' is-penalty' : '');
    card.setAttribute('data-ach-id', a.id);
    card.title = a.path ? 'Open ' + a.where : '';

    const mark = document.createElement('span');
    mark.className = 'lh-a-mark';
    mark.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">' +
                     (ICONS[a.kind] || ICONS.tier) + '</svg>';

    const body = document.createElement('div');
    body.className = 'lh-a-body';

    const k = document.createElement('b');
    k.className = 'lh-a-kicker';
    k.textContent = a.kicker;

    const t = document.createElement('span');
    t.className = 'lh-a-title';
    t.textContent = a.title;

    const s = document.createElement('span');
    s.className = 'lh-a-sub';
    s.textContent = a.sub;

    body.appendChild(k); body.appendChild(t); body.appendChild(s);

    const x = document.createElement('button');
    x.className = 'lh-a-x';
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', 'Dismiss');
    x.addEventListener('click', (e) => { e.stopPropagation(); dismiss(a.id, card); });

    /* Clicking through marks it dismissed on the way out, so it is not
       still sitting there on return. */
    card.addEventListener('click', () => {
      setPending(getPending().filter(p => p.id !== a.id));
      if (a.path) window.location.href = a.path;
    });

    card.appendChild(mark); card.appendChild(body); card.appendChild(x);
    stack.appendChild(card);
  }

  /* Attribute selectors need the id escaped; ids here are tame but this
     is cheap insurance and older browsers lack CSS.escape.

     window.CSS spelled out in full on purpose: the stylesheet const
     above is also called CSS and shadows the global everywhere in this
     file. */
  function CSS_escape(v) {
    return (window.CSS && window.CSS.escape) ? window.CSS.escape(v)
                                             : String(v).replace(/"/g, '\\"');
  }

  function award(a) {
    const pending = getPending();
    if (pending.some(p => p.id === a.id)) return;   // already waiting
    pending.push(a);
    setPending(pending);
    draw(a);
  }

  function drawPending() {
    getPending().forEach(draw);
  }

  /* ------------------------------------------------------------
     8) WORDING
     ------------------------------------------------------------ */
  function streakAward(n) {
    const sub = n >= 30 ? n + ' nights in a row.'
              :           n + ' nights in a row. Keep it.';
    return {
      id:     'streak-' + n,
      kind:   'streak',
      kicker: 'Sleep streak',
      title:  n + '-Night Streak',
      sub:    sub,
      where:  'Sleep',
      path:   'Trackers/Sleep/LifeHub-tracker-sleep.html'
    };
  }

  /* Where each protocol's toast says it came from, and where tapping
     it goes. A table rather than a chain of ternaries, so adding the
     fourth protocol is one row here and one watcher below. */
  const PROTOCOL_SOURCES = {
    sleep:     { label: 'Sleep',
                 path: 'Trackers/Sleep/LifeHub-tracker-sleep.html' },
    hydration: { label: 'Hydration',
                 path: 'Trackers/Hydration/LifeHub-tracker-hydration.html' },
    food:      { label: 'Food',
                 path: 'Hubs/FoodHub/FoodHub.html' }
  };

  /* A protocol row, as written to prestige_system/<kind>_protocol by
     settle(). The wording is HERS — the name and the term come off
     the record rather than being rebuilt here, so the toast says
     exactly what the bank's ledger line says. */
  function protocolAward(id, row, which) {
    const penalty = Number(row.amount) < 0;
    const amt = Number(row.amount) || 0;
    const kind = which || 'sleep';

    return {
      /* The timestamp is part of the identity because a penalty can
         fire again after its run breaks and rebuilds. Keyed on the id
         alone, the second triggering would be silently deduplicated
         against the first. */
      id:     'protocol-' + kind + '-' + id + '-' + (row.at || 0),
      kind:   penalty ? 'penalty' : 'trophy',
      kicker: PROTOCOL_SOURCES[kind].label + ' protocol' +
              (penalty ? ' — penalty' : ''),
      title:  String(row.name || id),
      sub:    String(row.term || '') +
              (amt ? '  ·  ' + (amt > 0 ? '+' : '') + amt.toLocaleString() : ''),
      where:  PROTOCOL_SOURCES[kind].label,
      path:   PROTOCOL_SOURCES[kind].path
    };
  }

  function tierAward(tier) {
    return {
      id:     'tier-' + tier.id,
      kind:   'tier',
      kicker: 'Prestige tier',
      title:  tier.name,
      sub:    tier.next
                ? 'Next: ' + tier.next + ', ' +
                  Number(tier.toNext).toLocaleString() + ' to go.'
                : 'The top of the ledger. There is nothing above this.',
      where:  'the bank',
      path:   'LifeHub-prestige-bank.html'
    };
  }

  /* ------------------------------------------------------------
     9) EVALUATE

     Everything funnels through here so the first-run rule lives in one
     place: with no `seen` record, record where she stands and announce
     NOTHING. Otherwise the very first load would bury the wallpaper
     under every streak and tier she has earned since the tracker was
     built, which is the opposite of a notification.
     ------------------------------------------------------------ */
  const now = { streak: null, tierId: null, protocol: null,
                hydration: null, food: null };

  function evaluate() {
    /* The two sources are judged INDEPENDENTLY. They arrive in separate
       Firebase reads and either can fail on its own — an unreachable
       ledger must not also take the streak toasts down with it. Each
       side baselines itself the first time it is seen, so a field that
       is simply absent is "not known yet", never "zero". */
    const seen = getSeen() || {};
    let changed = false;

    /* ---- streaks ----
       The high-water mark FALLS when a run breaks. That is deliberate:
       it is what makes the next 7-night run worth announcing again. */
    if (now.streak !== null) {
      const reached = highestMilestone(now.streak);

      if (seen.streak === undefined) {
        seen.streak = reached;                       // first run: silent
        changed = true;
      } else {
        /* Only the HIGHEST newly-crossed milestone, not each one in
           between. Day to day they arrive singly anyway; several at
           once means the page was shut while the run grew, and a
           "3-Night Streak" card is simply untrue by the time she is
           standing at 7. */
        if (reached > seen.streak) award(streakAward(reached));

        if (reached !== seen.streak) {
          seen.streak = reached;
          changed = true;
        }
      }
    }

    /* ---- tiers ----
       Only ever upward. A correction that claws points back can drop
       the rank, and being told THAT on your own wallpaper is a
       punishment, not a notification — it re-baselines in silence. */
    if (now.tierId !== null && window.LIFEHUB_PRESTIGE) {
      const tiers = window.LIFEHUB_PRESTIGE.TIERS;
      const rank  = (id) => tiers.findIndex(t => t.id === id);  // 0 = highest

      if (seen.tier === undefined) {
        seen.tier = now.tierId;                      // first run: silent
        changed = true;
      } else if (now.tierId !== seen.tier) {
        if (rank(now.tierId) < rank(seen.tier)) {
          award(tierAward(window.LIFEHUB_PRESTIGE.tierFor(lifetimeCache)));
        }
        seen.tier = now.tierId;
        changed = true;
      }
    }

    /* ---- the Sleep Protocol ----
       Her Notion rewards and penalties. This surface does not re-derive
       any of them: it watches prestige_system/sleep_protocol, which the
       tracker and Poppy both write through settle(). Recomputing here
       would make a fourth opinion about what a trophy is.

       Keyed by `at` rather than by id alone, so a penalty that fires
       again after its run breaks is announced again. */
    /* Every protocol behaves identically, so they share one pass.
       `which` only decides the wording and where the card points. */
    [['protocol', 'sleep'],
     ['hydration', 'hydration'],
     ['food', 'food']].forEach(([slot, which]) => {
      if (!now[slot]) return;

      const marks = seen[slot] || null;

      if (!marks) {
        seen[slot] = {};                             // first run: silent
        Object.keys(now[slot]).forEach(id => {
          seen[slot][id] = now[slot][id].at || 0;
        });
        changed = true;
        return;
      }

      Object.keys(now[slot]).forEach(id => {
        const row = now[slot][id];
        if (!row || row.met !== true) return;         // a re-armed row
        const at = row.at || 0;
        if (at > (marks[id] || 0)) {
          award(protocolAward(id, row, which));
          marks[id] = at;
          changed = true;
        }
      });
    });

    if (changed) setSeen(seen);
  }

  function highestMilestone(streak) {
    let hit = 0;
    STREAK_MILESTONES.forEach(m => { if (streak >= m) hit = m; });
    return hit;
  }

  /* ------------------------------------------------------------
     10) READ
     ------------------------------------------------------------ */
  let lifetimeCache = 0;

  function start() {
    mount();
    drawPending();          // whatever was left un-dismissed last time

    if (!window.LIFEHUB_PRESTIGE) {
      console.warn('[achievements] lifehub-prestige-ledger.js is not loaded — no tier toasts.');
    }
    if (!window.firebase || !firebase.database) {
      console.warn('[achievements] firebase-database-compat.js is not loaded — nothing to watch.');
      return;
    }

    let app;
    try { app = firebase.app('achievements'); }
    catch (e) { app = firebase.initializeApp(FIREBASE_CONFIG, 'achievements'); }
    const db = firebase.database(app);

    /* --- sleep streak --- */
    db.ref('sleep_logs').orderByKey().limitToLast(STREAK_WINDOW)
      .on('value', (snap) => {
        const keys = new Set();
        snap.forEach(child => { if (child.val()) keys.add(child.key); });
        now.streak = streakFrom(keys);
        evaluate();
      }, (err) => {
        console.warn('[achievements] could not read sleep_logs:', err.message);
      });

    /* --- the Sleep Protocol ---
       The node settle() writes. Watched rather than recomputed, so the
       toast, the tracker's alert and the bank's ledger line are all
       reporting the same single event. */
    db.ref('prestige_system/sleep_protocol').on('value', (snap) => {
      now.protocol = snap.val() || {};
      evaluate();
    }, (err) => {
      console.warn('[achievements] could not read the sleep protocol:', err.message);
    });

    db.ref('prestige_system/hydration_protocol').on('value', (snap) => {
      now.hydration = snap.val() || {};
      evaluate();
    }, (err) => {
      console.warn('[achievements] could not read the hydration protocol:', err.message);
    });

    db.ref('prestige_system/food_protocol').on('value', (snap) => {
      now.food = snap.val() || {};
      evaluate();
    }, (err) => {
      console.warn('[achievements] could not read the food protocol:', err.message);
    });

    /* --- prestige tier ---
       The ledger replayed, exactly as the bank card does it. Reading
       the stored net_worth instead would announce tiers she never
       actually reached: that field is incremented and never
       decremented. See lifetimeFrom() in the ledger. */
    if (!window.LIFEHUB_PRESTIGE) return;

    db.ref('prestige_system/transactions').on('value', (snap) => {
      lifetimeCache = window.LIFEHUB_PRESTIGE.lifetimeFrom(snap.val());
      now.tierId = window.LIFEHUB_PRESTIGE.tierFor(lifetimeCache).id;
      evaluate();
    }, (err) => {
      console.warn('[achievements] could not read the ledger:', err.message);
    });
  }

  /* Midnight matters here too: a streak anchored to "today" changes
     meaning when the Manila date rolls over, and this page may not be
     reloaded for weeks. */
  setInterval(evaluate, 10 * 60 * 1000);

  /* ------------------------------------------------------------
     11) CONSOLE HANDLES

     These events are rare by design — a tier crossing might be monthly.
     preview() exists so the toast can be looked at without waiting for
     one, which is otherwise the only way to see it.
     ------------------------------------------------------------ */
  /* Every card the system can ever produce, built but not shown. One
     list so preview() and wordings() cannot drift apart — if a new
     milestone is added above, both pick it up for free. */
  function allAwards() {
    const out = STREAK_MILESTONES.map(streakAward);

    /* Every Sleep Protocol card, built from the same table the real
       ones come from — so previewing one shows her exactly the wording
       she will get, names and terms included. */
    if (window.LIFEHUB_SLEEP_PROTOCOL) {
      window.LIFEHUB_SLEEP_PROTOCOL.ALL.forEach(d => {
        out.push(protocolAward(d.id, {
          name: d.name, term: d.term, amount: d.xp, at: 0
        }, 'sleep'));
      });
    }

    if (window.LIFEHUB_HYDRATION_PROTOCOL) {
      window.LIFEHUB_HYDRATION_PROTOCOL.ALL.forEach(d => {
        out.push(protocolAward(d.id, {
          name: d.name, term: d.term, amount: d.xp, at: 0
        }, 'hydration'));
      });
    }

    if (window.LIFEHUB_FOOD_PROTOCOL) {
      window.LIFEHUB_FOOD_PROTOCOL.ALL.forEach(d => {
        out.push(protocolAward(d.id, {
          name: d.name, term: d.term, amount: d.xp, at: 0
        }, 'food'));
      });
    }

    if (window.LIFEHUB_PRESTIGE) {
      /* Each tier previewed AT its own floor, so "x to go" reads like
         the real thing rather than a made-up number. */
      window.LIFEHUB_PRESTIGE.TIERS.slice().reverse().forEach(t => {
        out.push(tierAward(window.LIFEHUB_PRESTIGE.tierFor(t.threshold)));
      });
    }
    return out;
  }

  /* Match on the milestone number, a tier id, or any part of a tier
     name — so preview('sterling') and preview('tier-sterling') and
     preview(7) all do the obvious thing. */
  function findAward(what) {
    const list = allAwards();
    if (what == null) return list.find(a => a.id === 'streak-7');

    if (typeof what === 'number') {
      return list.find(a => a.id === 'streak-' + what);
    }
    const q = String(what).toLowerCase();
    if (q === 'streak') return list.find(a => a.id === 'streak-7');
    if (q === 'tier')   return list.find(a => a.kind === 'tier');

    return list.find(a => a.id.toLowerCase() === q)
        || list.find(a => a.title.toLowerCase().includes(q))
        || list.find(a => a.id.toLowerCase().includes(q));
  }

  window.LifeHubAchievements = {
    /* Draws a real card, exactly as the live one is drawn — but via
       draw() rather than award(), so it is never written to the pending
       list and cannot come back on the next reload. */
    preview(what) {
      const a = findAward(what);
      if (!a) {
        console.warn('[achievements] no such card: ' + what +
                     '. Try LifeHubAchievements.wordings() for the list.');
        return;
      }
      draw(a);
      return a.title;
    },

    /* Every wording at once, as text. Thirteen cards would not fit on
       the screen, and reading them is the point. */
    wordings() {
      const call = (a) => {
        if (a.id.indexOf('streak-') === 0)   return 'preview(' + a.id.slice(7) + ')';
        if (a.id.indexOf('protocol-') === 0) {
          /* "protocol-<which>-<id>-<at>" → just the id */
          return "preview('" + a.id.replace(/^protocol-(sleep|hydration)-/, '')
                                   .replace(/-0$/, '') + "')";
        }
        return "preview('" + a.id.replace('tier-', '') + "')";
      };
      console.table(allAwards().map(a => ({
        call:   call(a),
        kicker: a.kicker,
        title:  a.title,
        sub:    a.sub
      })));
      return allAwards().length + ' cards';
    },

    /* Wipe what is on screen without touching the high-water mark —
       for clearing previews between looks. */
    clear() {
      stack.innerHTML = '';
      drawPending();      // put the genuinely un-dismissed ones back
    },

    /* Forget the high-water mark. The NEXT read re-baselines silently,
       so this does not replay history — it just stops suppressing
       what comes after. */
    reset() {
      try { localStorage.removeItem(SEEN_KEY); } catch (e) {}
      try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
      stack.innerHTML = '';
      console.log('[achievements] cleared. Re-baselines on the next read.');
    },
    debug() {
      const out = { streak: now.streak, tier: now.tierId,
                    lifetime: lifetimeCache,
                    seen: getSeen(), pending: getPending() };
      console.table(out);
      return out;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

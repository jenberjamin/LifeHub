/* ============================================================
   LifeHub — Stale activity nudges
   A quiet panel under the clock: which trackers have gone cold.

   Self-contained: builds its own DOM + styles, initialises its own
   named Firebase app. No CSS edits needed.

   Load AFTER firebase-app-compat.js AND firebase-database-compat.js.
   The trackers all live in the Realtime Database, not Firestore, so
   the homescreen needs the database SDK as well as the firestore one
   Poppy already uses.
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
     1) WHAT TO WATCH  ← this is the only part you edit

     node      Realtime Database node, keyed by YYYY-MM-DD
     path      where clicking the card takes you (relative to root)
     dueHour   Manila hour before which today's gap is NOT nagged
               about. Sleep is logged first thing on waking, upkeep at
               night — nobody wants "you haven't done the dishes"
               at 8am.
     graceDays how many days may pass before it counts as missed.
               1 = daily. Home upkeep is every other day.

     ORDER MATTERS: render() walks this list top to bottom, so the
     cards stack in the order written here. Sleep is first because it
     is the first thing logged in the day.
     counts    optional test for whether a day's entry actually means
               anything was done. Without it, the mere existence of the
               date key counts — and a tracker can create a node without
               a real entry behind it.
     ------------------------------------------------------------ */
  const WATCH = [
    /* The pill is not a habit entry like the rest of this list, so it
       does not use the generic "days since the last entry" rule. It is
       a medication on a clock, and the questions are different:

         · is a pack actually running right now?
         · is today a tablet day, or one of the seven break days?
         · has the hour she set already passed?
         · has the day been answered — including answered MISSED?

       Any of those can make the card wrong, and a wrong medication
       reminder is worse than none. So it gets its own reader
       (pillAttach) and its own verdict (pillVerdict) further down.

       It sits first because it is the only entry here that is
       time-critical rather than merely overdue. */
    { id: 'pill', label: 'Althea pill', node: 'flo_tracker', place: 'slate',
      path: 'Trackers/FLO/LifeHub-tracker-FLO.html',
      custom: true, attach: pillAttach, verdict: pillVerdict },

    /* The morning temperature, and the only card here with a closing
       time. A basal reading has to be taken at rest on waking — one
       taken at lunchtime is not a late data point, it is a wrong one,
       and it goes into the series the ovulation detection reads. So
       this opens early, says what makes the reading valid, and then
       stops rather than nagging into the afternoon.

       It sits above the sleep log because it is the one thing that
       cannot wait: the sleep log is just as true half an hour later,
       and this is not. The pill above it is an evening card, so in
       practice this is the first thing on the panel each morning. */
    { id: 'temp', label: 'Basal temp', node: 'flo_tracker', place: 'slate',
      path: 'Trackers/FLO/LifeHub-tracker-FLO.html',
      custom: true, attach: pillAttach, verdict: tempVerdict },

    /* Mood, three times a day. One card rather than three: it is
       always about the slot she is in now, and the ones she has
       already answered are not outstanding. Dismissing it hides the
       whole day's remaining check-ins, which is the right unit —
       "not today, thanks" is a coherent thing to mean. */
    { id: 'mood', label: 'Mood', node: 'flo_tracker', place: 'slate',
      path: 'Trackers/FLO/LifeHub-tracker-FLO.html?open=mood',
      custom: true, attach: pillAttach, verdict: moodVerdict },

    /* Flow, and only while a period is actually running. This is the
       one card that does not exist most of the month — asking about
       flow on a day she is not bleeding is noise, and a card that is
       usually irrelevant is a card she stops reading. It appears the
       day she logs a period start and stops when she ends it. */
    { id: 'flow', label: 'Flow', node: 'flo_tracker', place: 'slate',
      path: 'Trackers/FLO/LifeHub-tracker-FLO.html',
      custom: true, attach: pillAttach, verdict: flowVerdict },

    /* A subscription about to bill. PassHub keeps these in a third
       Firebase project of its own; see subsAttach().

       It sits here, directly under the medical cards and above
       everything else, because it is the only entry on the panel
       with a deadline that passes on its own: a chore missed today
       can be done tomorrow, and a renewal missed today has already
       taken the money. */
    { id: 'subs', label: 'Subscription', node: null, place: 'margin',
      path: 'Hubs/PassHub/PassHub-subscriptions.html',
      custom: true, attach: subsAttach, verdict: subsVerdict },

    /* Scribble's recycle bin, 30 days from deletion to destruction.
       Added 2026-09-17.

       It sits beside the subscription card for the same reason that
       one is at the top: the deadline passes on its own and takes
       something with it. A chore missed today can be done tomorrow;
       a file swept from the bin cannot be got back at all.

       Unlike every other card here it speaks on three days only —
       ten left, five left, and the day it dies — rather than every
       day of a window. Three warnings about one file across a month
       is a warning; thirty is wallpaper. See binVerdict(). */
    { id: 'bin', label: 'Recycle bin', node: null, place: 'margin',
      path: 'Hubs/Scribble/Scribble-recycle-bin.html',
      custom: true, attach: binAttach, verdict: binVerdict },

    /* The morning video — the one card here that does not open a
       tracker. Clicking it plays second_star.mp4 in place, over the
       wallpaper, because being routed to InspoHub to press play on a
       thing she watches every morning is three steps too many.

       It carries `onOpen` instead of relying on `path`; see addCard().
       `path` is still set as the honest fallback destination if the
       file ever goes missing.

       It sits below the FLO group and above the self-upkeep group: it
       is a morning ritual like the dip, but nothing is harmed by
       watching it at 8 instead of 7, so it yields to the medical
       cards above it. */
    { id: 'inspo', label: 'Morning video', node: null, place: 'slate',
      path: 'Hubs/InspoHub/InspoHub.html',
      custom: true, attach: inspoAttach, verdict: inspoVerdict,
      onOpen: openMorningVideo },

    /* The cold water facial dip — the one self-upkeep task with a
       time of day attached to it. The general "Self upkeep" card
       below asks in the evening whether anything was logged; this
       asks about one ritual, in the morning, while it can still
       happen. See dipVerdict(). */
    { id: 'dip', label: 'Cold facial dip', node: 'self_care_logs', place: 'slate',
      path: 'Trackers/Self-upkeep/LifeHub-tracker-self-upkeep.html',
      custom: true, attach: selfCareAttach, verdict: dipVerdict },

    /* Her shower, on the three days she keeps for it. */
    { id: 'bath', label: 'Shower', node: 'self_care_logs', place: 'slate',
      path: 'Trackers/Self-upkeep/LifeHub-tracker-self-upkeep.html',
      custom: true, attach: selfCareAttach, verdict: bathVerdict },

    /* Miles's bath — once a week, Friday, with Saturday as the
       second chance. Doing it Friday silences Saturday. */
    { id: 'miles', label: "Miles's bath", node: 'self_care_logs', place: 'slate',
      path: 'Trackers/Self-upkeep/LifeHub-tracker-self-upkeep.html',
      custom: true, attach: selfCareAttach, verdict: milesVerdict },

    /* Sanitation day — once a week, with three days to take it.
       Wednesday is the day; Thursday and Friday are the fallbacks.
       Doing it on any of the three silences the other two. Same
       shape as Miles's bath above, one day wider. */
    { id: 'sanitation', label: 'Sanitation day', node: 'upkeep_logs', place: 'slate',
      path: 'Trackers/Home-upkeep/LifeHub-tracker-home-upkeep.html',
      custom: true, attach: upkeepAttach, verdict: sanitationVerdict },

    /* Today's training session, if one is planned.

       This is the only card whose data lives in a different Firebase
       PROJECT — the Fitness Centre keeps its schedule in localStorage
       and mirrors it to a Firestore vault, and localStorage does not
       cross from the hub to the wallpaper. See workoutAttach().

       No plan for today means no card. A rest day is not something to
       be reminded about, and the schedule already says which days
       those are. */
    { id: 'workout', label: 'Workout', node: null, place: 'slate',
      path: 'Hubs/FitnessCentre/fitness-centre-active_session.html',
      custom: true, attach: workoutAttach, verdict: workoutVerdict },

    /* 4am, not 11. Logging last night's sleep is the first task of the
       day, so the card should already be waiting however early she is
       up. The hour is not zero because the small hours are still the
       *previous* night as far as she is concerned — a sleep reminder at
       1am would be nagging about a night still in progress. */
    { id: 'sleep',     label: 'Sleep',       node: 'sleep_logs', place: 'slate',
      path: 'Trackers/Sleep/LifeHub-tracker-sleep.html',
      dueHour: 4, graceDays: 1 },

    /* Hydration writes its node on ANY change — including flipping the
       Workout Day switch, which saves a day with total: 0. Presence of
       the key alone would then read as "logged" and the reminder would
       never appear on a day she drank nothing. */
    /* MARGIN, and deliberately: hydration is already asked properly by
       the paced card at the bottom of the screen
       (LifeHub-homescreen-hydration.js), which tracks the day as it
       goes. This one only fires at 2pm when NOTHING has been logged,
       so it is a backstop, not the ask. Two cards on one subject in
       two corners is one too many; moving this one out of the way is
       the smallest version of that fix. Delete the entry entirely if
       the paced card is doing the job. */
    { id: 'hydration', label: 'Hydration',   node: 'hydration_logs', place: 'margin',
      path: 'Trackers/Hydration/LifeHub-tracker-hydration.html',
      dueHour: 14, graceDays: 1,
      counts: (e) => (e && Number(e.total) > 0) },

    /* 14, like hydration: by mid-afternoon a day with nothing logged is
       a day that got away, and there is still time to do something
       about it. Later would be a reminder she can only agree with.

       `counts` matters here for two reasons. dailyLogs writes a
       wageProcessed flag onto the day when the wage settles, so the
       date key can exist with no food behind it at all — and a row
       without a foodName is not a meal either. Both would otherwise
       read as "logged" and the card would never appear on a day she
       forgot entirely. */
    /* MARGIN, for the same reason as hydration above — the paced food
       card owns the question during the day. */
    { id: 'food',      label: 'Food',        node: 'dailyLogs', place: 'margin',
      path: 'Hubs/FoodHub/FoodHub.html',
      dueHour: 14, graceDays: 1,
      counts: (e) => !!e && Object.keys(e).some(
        k => k !== 'wageProcessed' && e[k] && e[k].foodName) },

    /* MARGIN. This asks "how long since ANY self-care entry", which is
       an observation rather than a job — the three cards that name a
       real task (dip, bath, miles) are all in the Slate above. */
    { id: 'self',      label: 'Self upkeep', node: 'self_care_logs', place: 'margin',
      path: 'Trackers/Self-upkeep/LifeHub-tracker-self-upkeep.html',
      dueHour: 20, graceDays: 1 },

    /* MARGIN, same shape as self upkeep: sanitation day is the card
       that names the actual work. */
    { id: 'home',      label: 'Home upkeep', node: 'upkeep_logs', place: 'margin',
      path: 'Trackers/Home-upkeep/LifeHub-tracker-home-upkeep.html',
      dueHour: 20, graceDays: 2 }
  ];

  /* ------------------------------------------------------------
     THE TWO PLACES
     Added 2026-09-17.

     Every entry above carries `place`, and it answers one question:

         Does this mean I have to do something today?

     'slate'   — yes. Under the clock, where it has always been.
                 A routine: a tablet, a shower, last night's sleep.
     'margin'  — no. Behind the icon by the magnifying glass, as a
                 number. Worth knowing, asks nothing.

     An entry with no `place` falls to the Slate, so a card added
     later and forgotten about is loud rather than lost.

     ── PROMOTION ─────────────────────────────────────────────
     A Margin verdict may also return `promote: true`, and that card
     is rendered into the Slate instead for as long as it says so.
     The rule, in one line: promote when the deadline passes on its
     own and takes something with it. Money gone, files destroyed.
     Not "important" — irreversible.

     Today that is the subscription card on billing day and the
     recycle bin card at zero days left. Nothing else qualifies, and
     nothing else should without meeting that same test.
     ------------------------------------------------------------ */
  const placeOf = (spec) => (spec && spec.place === 'margin') ? 'margin' : 'slate';

  /* The FLO CYCLE is deliberately absent, and the pill above is not a
     way in for it. A cycle is not a daily habit — "you haven't logged
     FLO in 6 days" is normal, and a card that is usually wrong teaches
     you to stop reading the panel. The tablet is the opposite case: it
     is due at a known hour on a known day, so it can be said exactly. */

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyABhqON4h0GHjFbZaDT1ysSprmpdczyC6I",
    authDomain: "lifehub-cae1d.firebaseapp.com",
    databaseURL: "https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "lifehub-cae1d",
    storageBucket: "lifehub-cae1d.firebasestorage.app",
    messagingSenderId: "471522181748",
    appId: "1:471522181748:web:6861392a45fbbbec8dc721"
  };

  /* The Fitness Centre is a SEPARATE Firebase project, and a Firestore
     one. Its schedule never reaches the Realtime Database above, so
     the workout card reads it from here instead. Same keys the
     gatekeeper uses; a named app so it cannot collide with anything. */
  const FITNESS_CONFIG = {
    apiKey: "AIzaSyAOgtrNsZFu0LaKW7uzHc61kBCNcBc2XSE",
    authDomain: "fitness-centre-aabaa.firebaseapp.com",
    projectId: "fitness-centre-aabaa",
    storageBucket: "fitness-centre-aabaa.firebasestorage.app",
    messagingSenderId: "706584906698",
    appId: "1:706584906698:web:0469958c2564db64775d33"
  };

  /* Scribble is a fourth project, Firestore, and the ONLY one here
     that is guarded — its rules refuse anyone who is not signed in.

     This page has a session only because Scribble leaves a copy of
     one behind for the app name "scribble-nudge"; see binAttach()
     and Hubs/Scribble/js/scribble-passage.js. Without that copy the
     bin read is refused, the card never appears, and nothing else on
     this panel is affected.

     Byte-identical to the config in Hubs/Scribble/js/scribble-db.js. */
  const SCRIBBLE_CONFIG = {
    apiKey:            "AIzaSyDNJnwrYVsfkiEwG_mvE-eJLaGgpso62tE",
    authDomain:        "lifehub---scribble.firebaseapp.com",
    projectId:         "lifehub---scribble",
    storageBucket:     "lifehub---scribble.firebasestorage.app",
    messagingSenderId: "806581871178",
    appId:             "1:806581871178:web:7ed5d73f3b1d619eccbcb3"
  };

  /* PassHub is a third project again, Realtime Database this time.
     Byte-identical to Hubs/PassHub/js/passhub-firebase.js. */
  const PASSHUB_CONFIG = {
    apiKey: "AIzaSyD4AwI1GwDvtx8y6yx6We-oSzV92GGCEvE",
    authDomain: "access-vault-a3d09.firebaseapp.com",
    databaseURL: "https://access-vault-a3d09-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "access-vault-a3d09",
    storageBucket: "access-vault-a3d09.firebasestorage.app",
    messagingSenderId: "43855013406",
    appId: "1:43855013406:web:6a954853b8c14ec785b00f"
  };

  /* Cold once a week has gone by — the case you actually asked about. */
  const COLD_DAYS = 7;
  const DISMISS_KEY = 'lifehub.nudges.dismissed';

  /* ------------------------------------------------------------
     2) MANILA TIME
     Same rule as the trackers and the Alexa skill: every date is a
     Philippine calendar date regardless of what the device clock says.
     ------------------------------------------------------------ */
  const PH_TZ = 'Asia/Manila';
  const PH_DATE = new Intl.DateTimeFormat('en-CA', {
    timeZone: PH_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  });

  const phToday = () => PH_DATE.format(new Date());

  const phHour = () => parseInt(new Date().toLocaleString('en-US', {
    timeZone: PH_TZ, hour12: false, hour: '2-digit'
  }), 10);

  const phMinute = () => parseInt(new Date().toLocaleString('en-US', {
    timeZone: PH_TZ, minute: '2-digit'
  }), 10);

  /* "21:00" → "9:00 PM". The tracker says the hour this way too. */
  function prettyTime(hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  /* Minutes → "3h 12m" / "45m". */
  function spanWords(mins) {
    const t = Math.max(0, Math.round(mins));
    const h = Math.floor(t / 60), m = t % 60;
    if (!h) return m + 'm';
    return m ? h + 'h ' + m + 'm' : h + 'h';
  }

  /* Whole days between two YYYY-MM-DD keys. Pure counting on the date
     parts — parsing them into local Dates is what lets a timezone creep
     back in and shift the answer by one. */
  function daysBetween(fromKey, toKey) {
    const p = (k) => {
      const [y, m, d] = String(k).split('-').map(Number);
      return Date.UTC(y, m - 1, d);
    };
    return Math.round((p(toKey) - p(fromKey)) / 86400000);
  }

  /* ------------------------------------------------------------
     3) STYLES
     ------------------------------------------------------------ */
  const CSS = `
  #lh-nudges-wrap{margin-top:20px;max-width:min(340px,32vw);
    font-family:var(--font-ui,system-ui,sans-serif)}
  #lh-nudges-wrap[hidden]{display:none}

  /* Collapse toggle — reads as a section label, not a control, until
     you go near it. */
  #lh-n-toggle{display:flex;align-items:center;gap:7px;
    margin:0 0 7px 1px;padding:2px 2px 3px 0;
    background:none;border:0;cursor:pointer;
    font-family:inherit;font-size:9.5px;font-weight:600;letter-spacing:.16em;
    text-transform:uppercase;color:rgba(255,255,255,.42);
    transition:color .18s ease}
  #lh-n-toggle:hover,#lh-n-toggle:focus-visible{color:rgba(255,255,255,.82)}
  #lh-n-toggle svg{width:9px;height:9px;flex:0 0 auto;
    fill:none;stroke:currentColor;stroke-width:2.4;
    stroke-linecap:round;stroke-linejoin:round;
    transition:transform .22s ease}
  #lh-nudges-wrap.is-collapsed #lh-n-toggle svg{transform:rotate(-90deg)}
  #lh-nudges-wrap.is-collapsed #lh-nudges{display:none}

  /* Near-flush stack: sharp corners and a 3px gap, so the cards read as
     one column of entries rather than four separate pills. */
  /* Shared by BOTH stacks — the Slate under the clock and the Margin
     behind the corner icon. A card looks the same wherever it is; only
     the question of which stack it belongs in differs. */
  .lh-stack{display:flex;flex-direction:column;gap:3px}
  .lh-stack:empty{display:none}
  /* The card itself carries no background. The glass plate is a masked
     pseudo-element underneath, so it can dissolve toward the right while
     the label and text on top of it stay fully crisp — masking the whole
     card would fade the words out with it. */
  .lh-stack .lh-n{position:relative;display:flex;align-items:flex-start;gap:10px;
    padding:10px 14px 10px 11px;cursor:pointer;
    transition:transform .18s ease;
    animation:lh-n-in .32s ease-out both}
  .lh-stack .lh-n::before{
    content:'';position:absolute;inset:0;z-index:0;pointer-events:none;
    border-radius:0;
    background:linear-gradient(to right,rgba(12,12,16,.40),rgba(12,12,16,.26));
    border:1px solid rgba(255,255,255,.13);
    border-left:2px solid var(--n-tone,rgba(255,255,255,.5));
    backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);
    /* Solid down the accent edge, gone by the right end. Takes the
       border and the blur with it, so there is no hard cut-off — the
       card just stops being there. */
    -webkit-mask-image:linear-gradient(to right,#000 42%,rgba(0,0,0,.55) 74%,transparent 99%);
            mask-image:linear-gradient(to right,#000 42%,rgba(0,0,0,.55) 74%,transparent 99%);
    transition:background .18s ease,border-color .18s ease,
               -webkit-mask-image .18s ease,mask-image .18s ease}
  .lh-stack .lh-n:hover{transform:translateX(2px)}
  /* On hover the plate reaches further right, so the × has something to
     sit on instead of floating on bare wallpaper. */
  .lh-stack .lh-n:hover::before{
    background:linear-gradient(to right,rgba(20,20,26,.56),rgba(20,20,26,.44));
    border-color:rgba(255,255,255,.26);
    -webkit-mask-image:linear-gradient(to right,#000 78%,rgba(0,0,0,.8) 92%,transparent 100%);
            mask-image:linear-gradient(to right,#000 78%,rgba(0,0,0,.8) 92%,transparent 100%)}
  .lh-stack .lh-n:hover::before{border-left-color:var(--n-tone,rgba(255,255,255,.5))}
  @keyframes lh-n-in{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
  /* Everything below rides above the masked plate. */
  .lh-stack .lh-n-dot{position:relative;z-index:1;
    width:5px;height:5px;border-radius:50%;margin-top:6px;
    background:var(--n-tone,#fff);flex:0 0 auto}
  .lh-stack .lh-n-body{position:relative;z-index:1;flex:1;min-width:0}
  .lh-stack .lh-n-title{display:block;font-size:11.5px;font-weight:600;
    letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.94)}
  .lh-stack .lh-n-sub{display:block;margin-top:3px;font-size:11px;line-height:1.45;
    color:rgba(255,255,255,.64);letter-spacing:.01em}
  /* Hidden until hover, but it keeps its box — fading it in rather than
     inserting it stops the text reflowing under the cursor. */
  .lh-stack .lh-n-x{position:relative;z-index:1;
    flex:0 0 auto;width:18px;height:18px;padding:0;line-height:1;
    background:none;border:0;color:rgba(255,255,255,.42);cursor:pointer;
    font-size:15px;font-family:inherit;border-radius:0;
    opacity:0;transition:opacity .18s ease,color .16s ease}
  .lh-stack .lh-n:hover .lh-n-x,
  .lh-stack .lh-n-x:focus-visible{opacity:1}
  .lh-stack .lh-n-x:hover{color:rgba(255,255,255,.9)}

  /* ---- THE MARGIN --------------------------------------------
     Added 2026-09-17.

     The quiet half of the panel: things worth knowing that ask
     nothing of you today. It lives behind an icon beside the
     magnifying glass rather than on the wallpaper, because a
     standing column of text you can do nothing about is furniture
     within a week — and furniture is invisible.

     What makes you look is the number. The badge deliberately wears
     the same soft tone as the icons beside it and never turns red:
     red is for things that cannot be undone, and those do not live
     here — they are promoted to the Slate under the clock. Keeping
     red rare is the only thing that keeps it meaning anything.
  ------------------------------------------------------------- */
  #lh-m-btn{position:relative}
  #lh-m-btn[hidden]{display:none}
  #lh-m-badge{position:absolute;top:-1px;right:-3px;
    min-width:14px;height:14px;padding:0 3px;box-sizing:border-box;
    display:flex;align-items:center;justify-content:center;
    border-radius:7px;
    background:rgba(255,255,255,.90);color:rgba(10,10,14,.92);
    font-family:var(--font-ui,system-ui,sans-serif);
    font-size:9px;font-weight:700;line-height:1;letter-spacing:.02em;
    box-shadow:0 1px 4px rgba(0,0,0,.45);
    pointer-events:none}

  /* Drops from the corner, right-aligned to the icon it belongs to.
     Same glass and spacing as the Slate; it is the same panel, just
     kept behind a door. */
  #lh-margin-wrap{position:fixed;z-index:3;
    top:calc(var(--pad-y) + 44px);right:var(--pad-x);
    width:min(340px,32vw);
    font-family:var(--font-ui,system-ui,sans-serif);
    animation:lh-m-in .2s ease-out both}
  #lh-margin-wrap[hidden]{display:none}
  @keyframes lh-m-in{from{opacity:0;transform:translateY(-6px)}
                     to{opacity:1;transform:none}}
  /* ---- AND HOW A MARGIN CARD DIFFERS FROM A SLATE ONE --------
     The cards are built by the same function and carry the same
     markup; everything below is presentation.

     A Slate card sits on bare wallpaper, so it brings its own glass
     plate and fades out to the right — it has to hold itself
     together against a photograph. A Margin card is inside a panel
     that already does that, so it drops the plate entirely and
     becomes a row: one sheet of glass, hairline rules between
     entries, quieter type.

     The accent bar and the coloured dot go too. Those say "this is
     how urgent it is", and urgency is not a thing the Margin has —
     anything urgent has already been promoted out of it. A uniform
     grey dot is the honest version. To put the colour back, delete
     the two .lh-n-dot lines below.

     (No backticks anywhere in this block: it is inside a template
     string, and one backtick ends the whole stylesheet early.)
  ------------------------------------------------------------- */
  #lh-margin{gap:0;
    background:linear-gradient(to bottom,rgba(6,6,9,.84),rgba(6,6,9,.76));
    border:1px solid rgba(255,255,255,.14);
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    box-shadow:0 18px 50px rgba(0,0,0,.45)}
  /* No plate, no mask, no accent edge — the panel is the plate. */
  #lh-margin .lh-n::before{display:none}
  #lh-margin .lh-n{padding:9px 13px;animation:none}
  #lh-margin .lh-n + .lh-n{border-top:1px solid rgba(255,255,255,.075)}
  /* Rows highlight in place. Sliding sideways is a card's gesture; a
     list row has nowhere to go. */
  #lh-margin .lh-n:hover{transform:none;background:rgba(255,255,255,.055)}
  #lh-margin .lh-n-dot{width:4px;height:4px;margin-top:5px;
    background:rgba(255,255,255,.32)}
  #lh-margin .lh-n-title{font-size:10px;letter-spacing:.11em;
    color:rgba(255,255,255,.74)}
  #lh-margin .lh-n-sub{margin-top:2px;font-size:10.5px;
    color:rgba(255,255,255,.5)}
  /* The dismiss × stays visible here. On the wallpaper it hides until
     hover so the Slate stays clean; inside a list you have already
     opened on purpose, hunting for a control you cannot see is worse
     than one more faint glyph. */
  #lh-margin .lh-n-x{opacity:.5}
  #lh-margin .lh-n-x:hover{opacity:1}

  /* ---- MORNING VIDEO PLAYER ----------------------------------
     Plays over the wallpaper rather than navigating anywhere. Built
     once, on the first open, and then hidden and reused. */
  #lh-vid{position:fixed;inset:0;z-index:9000;display:none;
    align-items:center;justify-content:center;
    background:rgba(6,6,9,.90);
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    font-family:var(--font-ui,system-ui,sans-serif);
    animation:lh-vid-in .26s ease-out both}
  #lh-vid.is-open{display:flex}
  @keyframes lh-vid-in{from{opacity:0}to{opacity:1}}

  #lh-vid-frame{position:relative;display:flex;flex-direction:column;
    gap:14px;width:min(1100px,86vw)}
  #lh-vid video{width:100%;max-height:74vh;background:#000;
    border-radius:3px;display:block;
    box-shadow:0 30px 90px rgba(0,0,0,.6)}

  /* Controls read as one quiet row, same restraint as the cards. */
  #lh-vid-bar{display:flex;align-items:center;gap:16px}
  #lh-vid .lh-vb{flex:0 0 auto;display:flex;align-items:center;
    justify-content:center;width:42px;height:42px;padding:0;
    background:rgba(255,255,255,.07);
    border:1px solid rgba(255,255,255,.18);border-radius:50%;
    color:rgba(255,255,255,.92);cursor:pointer;
    transition:background .18s ease,border-color .18s ease}
  #lh-vid .lh-vb:hover,#lh-vid .lh-vb:focus-visible{
    background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.4)}
  #lh-vid .lh-vb svg{width:15px;height:15px;fill:currentColor;
    pointer-events:none}
  /* The play triangle is optically left-heavy in a circle. */
  #lh-vid .lh-vb[data-state="paused"] svg{margin-left:2px}

  #lh-vid-seek{flex:1;height:3px;border-radius:2px;cursor:pointer;
    background:rgba(255,255,255,.16);overflow:hidden}
  #lh-vid-fill{height:100%;width:0;background:rgba(255,255,255,.82)}
  #lh-vid-time{flex:0 0 auto;font-size:11px;letter-spacing:.06em;
    color:rgba(255,255,255,.55);font-variant-numeric:tabular-nums}

  #lh-vid-close{position:absolute;top:-38px;right:0;
    padding:4px 2px;background:none;border:0;cursor:pointer;
    font-family:inherit;font-size:10px;font-weight:600;letter-spacing:.16em;
    text-transform:uppercase;color:rgba(255,255,255,.45);
    transition:color .18s ease}
  #lh-vid-close:hover,#lh-vid-close:focus-visible{color:rgba(255,255,255,.9)}

  #lh-vid-miss{padding:40px;text-align:center;font-size:12.5px;
    line-height:1.7;color:rgba(255,255,255,.6)}
  #lh-vid-miss code{color:rgba(255,255,255,.85);font-size:12px}
  `;

  /* Tone by how overdue it is. Deliberately muted — this sits on a
     wallpaper, and a red badge on your own desktop every morning stops
     being information and starts being wallpaper of its own. */
  const TONES = {
    due:   'rgba(255,255,255,.45)',
    stale: 'rgba(240,190,120,.85)',
    cold:  'rgba(240,140,140,.9)'
  };

  /* ------------------------------------------------------------
     4) BUILD
     ------------------------------------------------------------ */
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const host = document.querySelector('.corner.top-left');
  if (!host) return;                    // not the homescreen — do nothing

  const wrap = document.createElement('div');
  wrap.id = 'lh-nudges-wrap';
  wrap.hidden = true;                   // nothing to show until a read lands

  /* Collapsed is a standing preference, not a per-day dismissal: if Jen
     shuts the panel it stays shut across reloads until she opens it. */
  const COLLAPSE_KEY = 'lifehub.nudges.collapsed';
  let collapsed = false;
  try { collapsed = localStorage.getItem(COLLAPSE_KEY) === '1'; } catch (e) {}

  const toggle = document.createElement('button');
  toggle.id = 'lh-n-toggle';
  toggle.type = 'button';
  toggle.innerHTML =
    '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>' +
    '<span id="lh-n-count"></span>';

  const panel = document.createElement('div');
  panel.id = 'lh-nudges';
  panel.className = 'lh-stack';
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-label', "Today's routine");

  function applyCollapsed() {
    wrap.classList.toggle('is-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch (e) {}
    applyCollapsed();
  });

  applyCollapsed();
  wrap.appendChild(toggle);
  wrap.appendChild(panel);
  host.appendChild(wrap);

  /* ------------------------------------------------------------
     THE MARGIN — icon, number, and the list behind it
     Added 2026-09-17.

     Built alongside the Slate above rather than in a file of its
     own: the two stacks share every card, every verdict and every
     tone, and splitting them across files would mean maintaining
     one panel in two places.

     If the corner is missing — some other page loaded this script —
     the Margin is simply not built, and margin cards fall through
     to the Slate so nothing is ever silently dropped. See render().
     ------------------------------------------------------------ */
  const corner = document.querySelector('.corner.top-right');

  let marginBtn = null, marginBadge = null, marginWrap = null, marginList = null;
  let marginOpen = false;

  if (corner) {
    marginBtn = document.createElement('button');
    marginBtn.id = 'lh-m-btn';
    marginBtn.type = 'button';
    marginBtn.className = 'icon-btn';      // her corner styling, inherited
    marginBtn.hidden = true;               // nothing to show until a read lands
    marginBtn.setAttribute('aria-label', 'Reminders');
    marginBtn.setAttribute('aria-expanded', 'false');
    marginBtn.title = 'Reminders';
    /* A bell, drawn rather than imported: same 24x24 box and the same
       stroke as the search and menu icons beside it, so it inherits
       your .icon-btn rules instead of bringing its own look.

       Two paths — the body and the clapper below it — because a bell
       drawn as one outline reads as a blob at this size. */
    marginBtn.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
      '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
      '</svg><span id="lh-m-badge"></span>';

    marginBadge = marginBtn.querySelector('#lh-m-badge');

    /* Before the magnifying glass, so the order reads
       reminders → search → menu, quietest first. */
    corner.insertBefore(marginBtn, corner.firstChild);

    marginWrap = document.createElement('div');
    marginWrap.id = 'lh-margin-wrap';
    marginWrap.hidden = true;

    marginList = document.createElement('div');
    marginList.id = 'lh-margin';
    marginList.className = 'lh-stack';
    marginList.setAttribute('aria-live', 'polite');
    marginList.setAttribute('aria-label', 'Reminders');
    marginWrap.appendChild(marginList);
    document.body.appendChild(marginWrap);

    function setMarginOpen(open) {
      marginOpen = open;
      marginWrap.hidden = !open;
      marginBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    marginBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMarginOpen(!marginOpen);
    });

    /* Click anywhere else, or press Escape, and it closes. A dropdown
       that needs the same small button clicked again to dismiss is a
       dropdown you leave open by accident. */
    document.addEventListener('click', (e) => {
      if (!marginOpen) return;
      if (marginWrap.contains(e.target) || marginBtn.contains(e.target)) return;
      setMarginOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && marginOpen) setMarginOpen(false);
    });
  }

  /* id → { days, never } for each watched tracker, or null while its
     first read is still in flight. Rendering reads this whole object,
     so a card can't appear before its own data has arrived. */
  const state = {};

  /* ------------------------------------------------------------
     5) DISMISSAL
     Dismissing hides a card for the rest of the Manila day. It does not
     mark anything as done — the tracker is still the only thing that
     can do that, and it will be back tomorrow if it stays unlogged.
     ------------------------------------------------------------ */
  function dismissed() {
    try {
      const raw = JSON.parse(localStorage.getItem(DISMISS_KEY)) || {};
      return raw.day === phToday() ? (raw.ids || []) : [];
    } catch (e) { return []; }
  }

  function dismiss(id) {
    try {
      const ids = dismissed();
      if (ids.indexOf(id) === -1) ids.push(id);
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ day: phToday(), ids }));
    } catch (e) { /* private mode — it just won't persist */ }
    render();
  }

  /* ------------------------------------------------------------
     6) WORDING
     ------------------------------------------------------------ */
  function describe(spec, info) {
    if (info.never) {
      return { tone: 'cold', sub: 'No entries yet.' };
    }
    const d = info.days;
    if (d >= COLD_DAYS) {
      const weeks = Math.floor(d / 7);
      return {
        tone: 'cold',
        sub: weeks === 1 ? "Nothing for a week now." : `Nothing for ${weeks} weeks.`
      };
    }
    if (d >= 2) return { tone: 'stale', sub: `${d} days since the last entry.` };
    return { tone: 'due', sub: "Nothing logged today." };
  }

  /* ------------------------------------------------------------
     6b) THE PILL

     Two small reads rather than the generic ten-row scan: the pack
     settings, and today's day record. Nothing else in flo_tracker
     bears on whether a tablet is owed right now, and this runs on a
     wallpaper that stays open for weeks.
     ------------------------------------------------------------ */
  /* Both FLO cards read the same two places — the pack settings and
     today's day record — so they share one pair of listeners rather
     than opening four. */
  const pill = { pack: null, day: null, dayKey: null, periodActive: false };
  let floAttached = null;

  /* How long before the hour the card appears. Half an hour: long
     enough to finish what you are doing and still take it on time,
     short enough that the card is not sitting on the wallpaper for
     most of the evening. The panel re-renders every ten minutes, so
     the countdown moves in ten-minute steps. */
  const LEAD_MINS = 30;

  function pillAttach(db, onChange) {
    /* Called once per FLO spec; the second call gets the same handle. */
    if (floAttached) return floAttached;

    const warn = (e) => console.warn('[nudges] flo read failed:', e.message);

    db.ref('flo_tracker/pillPack').on('value', (s) => {
      pill.pack = s.val();
      /* First read in — all three FLO cards may now render. They
         share this one object; each verdict reads the part it needs. */
      state.pill = pill;
      state.temp = pill;
      state.mood = pill;
      state.flow = pill;
      onChange();
    }, warn);

    /* The live period switch, from the root rather than the day. The
       day's own isMenstrual stamp is only written while the FLO page
       is open, so on day three of a period — with nothing but the
       wallpaper running — it may not be there yet. This is set the
       moment she logs the start and stays set until she ends it. */
    db.ref('flo_tracker/isPeriodActive').on('value', (s) => {
      pill.periodActive = !!s.val();
      onChange();
    }, warn);

    /* When it started, so the flow card can say which day this is. */
    db.ref('flo_tracker/lastPeriodDate').on('value', (s) => {
      pill.periodStart = s.val();
      onChange();
    }, warn);

    /* The day record is read by key, so the listener has to be moved
       at midnight. render() runs every ten minutes anyway, which is
       what calls this. */
    let dayRef = null;
    function pointAtToday() {
      const key = phToday();
      if (pill.dayKey === key) return;
      if (dayRef) dayRef.off();
      pill.dayKey = key;
      pill.day = null;
      dayRef = db.ref('flo_tracker/' + key);
      dayRef.on('value', (s) => { pill.day = s.val(); onChange(); }, warn);
    }
    pointAtToday();

    floAttached = {
      repoint: pointAtToday,
      resync() {
        db.ref('flo_tracker/pillPack').once('value')
          .then(s => {
            pill.pack = s.val();
            state.pill = pill; state.temp = pill;
            state.mood = pill; state.flow = pill;
            onChange();
          })
          .catch(warn);
        db.ref('flo_tracker/isPeriodActive').once('value')
          .then(s => { pill.periodActive = !!s.val(); onChange(); })
          .catch(warn);
        db.ref('flo_tracker/lastPeriodDate').once('value')
          .then(s => { pill.periodStart = s.val(); onChange(); })
          .catch(warn);
        if (dayRef) dayRef.once('value')
          .then(s => { pill.day = s.val(); onChange(); })
          .catch(warn);
      }
    };
    return floAttached;
  }

  /* null means "say nothing", and most of this function is reasons to
     say nothing. That is deliberate: the card has to be silent on the
     break week, silent before the hour she set, and silent the moment
     the day is answered — otherwise it is telling her to take a
     tablet she has already taken, or isn't due. */
  function pillVerdict(info) {
    const pack = info && info.pack;
    if (!pack || !pack.active || !pack.startKey) return null;

    const A = window.FloAnalysis;
    if (!A || !A.packPosition) return null;     // maths not loaded
    const p = A.packPosition(pack, phToday());
    if (!p || p.onBreak) return null;           // no tablet due today

    /* Answered is answered. A logged MISSED is a decision, not a gap,
       and repeating the card after it would be nagging about something
       she has already told the tracker. */
    if (info.day && info.day.pill) return null;

    const where = 'Tablet ' + p.tabletNumber + ' of ' + p.activeDays;
    const due = pack.doseTime;

    /* No hour set yet. Fall back to an evening check — the same shape
       as the other cards, and it is the prompt to go and set one. */
    if (!due) {
      if (phHour() < 20) return null;
      return { tone: 'due', sub: where + ' — nothing logged today.',
               title: 'Open FLO' };
    }

    const [dh, dm] = String(due).split(':').map(Number);
    if (isNaN(dh) || isNaN(dm)) return null;

    /* Both sides are Manila minutes-into-today, so past midnight this
       goes negative by hours and the card falls silent. That is the
       intent: the tablet then belongs to yesterday, and a medication
       reminder at 2am is about a dose she can no longer usefully act
       on. The gap is still in the tracker either way. */
    const late = (phHour() * 60 + phMinute()) - (dh * 60 + dm);
    if (late < -LEAD_MINS) return null;         // too early to matter

    /* Ahead of the hour. This is the half of the card that is actually
       a reminder — once the time has passed it is only a record of
       being late, which is no use for taking a tablet on time. */
    if (late < 0) {
      return { tone: 'due',
               sub: 'Due at ' + prettyTime(due) + ' · in ' + spanWords(-late) + '.',
               title: where + ' — open FLO' };
    }

    /* Tone by how long it has been owed. Six hours is where a combined
       pill stops being merely late, so that is where the warm tone
       gives way to the cold one. */
    const tone = late >= 360 ? 'cold' : late >= 120 ? 'stale' : 'due';
    const sub = late < 5
      ? 'Due now. ' + where + '.'
      : 'Due at ' + prettyTime(due) + ' · ' + spanWords(late) + ' ago.';

    return { tone, sub, title: where + ' — open FLO' };
  }

  /* ------------------------------------------------------------
     6c) THE MORNING TEMPERATURE

     Unlike everything else in this panel, this card has a CLOSING
     time as well as an opening one, and the closing time is the
     important half.

     A basal temperature is a resting reading. It has to be taken on
     waking, before getting up, before drinking, before really moving
     — those all raise it by more than the shift the chart is looking
     for. So a reading taken at eleven is not a slightly worse data
     point than one taken at six; it is a wrong one, and it goes into
     the same series that detectTempShift() reads to decide when she
     ovulated. Noise there does not just fail to help, it can invent a
     shift or hide a real one.

     Which is why the card goes quiet at CLOSE_HOUR rather than
     nagging all day like the others. Once the window has passed the
     honest thing is to let the day go.
     ------------------------------------------------------------ */

  /* Manila hours. Opens with the hydration first-sip window, because
     that is when she is already up and at the machine. */
  const TEMP_OPEN_HOUR  = 4;
  const TEMP_CLOSE_HOUR = 10;

  function tempVerdict(info) {
    const day = info && info.day;

    /* Already taken. Nothing to say — and note this reads the day
       record directly, so it clears the moment she logs from the
       tracker, Alexa or Poppy. */
    if (day && day.temp) return null;

    const hour = phHour();
    if (hour < TEMP_OPEN_HOUR || hour >= TEMP_CLOSE_HOUR) return null;

    /* The card carries the method, not just the poke. "Take your
       temperature" is a reminder; "before you're up and about" is the
       thing that makes the reading worth having, and she will not
       remember it every morning unaided. */
    const left = TEMP_CLOSE_HOUR - hour;

    let sub;
    if (hour < 7) {
      sub = "Best taken before you're up and about — moving and drinking both raise it.";
    } else if (left > 1) {
      sub = 'Still worth taking. Sit down for a minute first — the reading wants you at rest.';
    } else {
      sub = 'Last useful hour for a resting reading today.';
    }

    return {
      tone: left > 1 ? 'due' : 'stale',
      sub: sub,
      title: 'Log basal temp — open FLO'
    };
  }

  /* ------------------------------------------------------------
     6d) THE MOOD CHECK-IN

     Asked three times: morning, afternoon, evening. One card, not
     three — it is always about the slot she is in now, and the two
     she has already answered are not outstanding.

     The slots and their hours live in JS/lifehub-flo-vocab.js, so the
     card, the tracker's modal and Poppy all agree on when the
     afternoon starts.
     ------------------------------------------------------------ */
  function moodVerdict(info) {
    const V = window.LIFEHUB_FLO_VOCAB;
    if (!V || !V.moodSlotAt) return null;

    const slot = V.moodSlotAt(phHour());
    /* Small hours. Being asked how your morning is going at 3am is
       not a check-in, it is a machine talking to itself. */
    if (!slot) return null;

    const day = (info && info.day) || {};
    const done = V.moodSlotsDone(day);
    if (done.indexOf(slot.id) !== -1) return null;   // this one's answered

    /* The wording is the check-in itself, so the card reads as being
       asked rather than being chased. The sub carries the only fact
       worth knowing: whether this is the first of the day or a
       continuation. */
    const earlier = done.length;
    let sub;
    if (!earlier) {
      sub = slot.id === 'morning'
        ? 'A word for how you woke up.'
        : 'Nothing down for today yet — how are you doing?';
    } else if (earlier === 1) {
      sub = 'One check-in down today.';
    } else {
      sub = 'Two down. This is the last one.';
    }

    return { tone: 'due', sub: sub, title: slot.ask + ' — open FLO' };
  }

  /* ------------------------------------------------------------
     6e) FLOW, WHILE A PERIOD IS RUNNING

     The only card here that exists conditionally: it appears when she
     has logged a period start and not yet marked it ended, and it
     goes away entirely the rest of the month. Asking about flow on a
     day she is not bleeding is not a reminder, it is noise — and the
     card that is usually irrelevant is the card she stops reading.

     Unlike the temperature this has no closing hour. Flow is
     loggable whenever she notices it, and a reading at eight in the
     evening is as true as one at eight in the morning.
     ------------------------------------------------------------ */

  /* Not at 5am. Flow on waking is a guess; by mid-morning it is an
     observation, and the morning is already busy with the
     temperature and the first mood check-in. */
  const FLOW_OPEN_HOUR  = 9;
  const FLOW_CLOSE_HOUR = 23;

  function flowVerdict(info) {
    /* No period running — the card does not exist today. */
    if (!info || !info.periodActive) return null;

    const day = info.day || {};
    if (day.flow) return null;                 // answered

    const hour = phHour();
    if (hour < FLOW_OPEN_HOUR || hour >= FLOW_CLOSE_HOUR) return null;

    /* Day-of-period, when the record can tell us. "Day 4" is the
       difference between a prompt and a form, and it is also the
       thing she would otherwise have to count on her fingers. */
    const dayNum = periodDayNumber(info.periodStart);
    const levels = 'Spotting, light, normal, heavy or very heavy.';

    return {
      tone: hour >= 18 ? 'stale' : 'due',
      sub: dayNum ? 'Day ' + dayNum + '. ' + levels : levels,
      title: 'Log today\'s flow — open FLO'
    };
  }

  /* Which day of the current period today is, counted from the start
     stamp. Null rather than a guess: past a fortnight the switch was
     almost certainly left on rather than the period still running,
     and "day 23" would be a confident piece of nonsense. */
  function periodDayNumber(startedAt) {
    if (!startedAt) return null;
    const key = String(startedAt).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;

    const n = daysBetween(key, phToday()) + 1;
    return (n >= 1 && n <= 14) ? n : null;
  }

  /* ------------------------------------------------------------
     6f) THE COLD FACIAL DIP

     The one self-upkeep task Jen calls mandatory, and the only one
     with a time of day attached to it. Everything else in that
     tracker is covered by the "Self upkeep" card further down, which
     asks once in the evening whether the day was logged at all —
     too late and too vague for a thing that belongs to the morning.

     fc1 is its id in Trackers/Self-upkeep/js/tracker-self-upkeep.js.
     It is hardcoded here because the homescreen does not load that
     tracker's task table, and a test asserts the id still exists and
     still means this.
     ------------------------------------------------------------ */
  const DIP_TASK_ID = 'fc1';

  /* 5 to noon, the same bounds the mood check-in calls "morning", so
     the wallpaper does not disagree with itself about when the
     morning is. It closes rather than running all day: this is a
     morning ritual, and asking about it at eight in the evening is
     asking about something that is no longer available. */
  const DIP_OPEN_HOUR  = 5;
  const DIP_CLOSE_HOUR = 12;

  function dipVerdict() {
    if (didTask(phToday(), DIP_TASK_ID)) return null;      // done

    const hour = phHour();
    if (hour < DIP_OPEN_HOUR || hour >= DIP_CLOSE_HOUR) return null;

    let sub;
    if (hour < 8)       sub = 'First thing, before the day gets going.';
    else if (hour < 10) sub = 'Still worth it while the morning is here.';
    else                sub = 'Last of the morning for it.';

    return {
      tone: hour >= 10 ? 'stale' : 'due',
      sub: sub,
      title: 'Cold water facial dip — open Self Upkeep'
    };
  }

  /* ------------------------------------------------------------
     A WINDOW OF SELF-CARE DAYS

     Shared by the three task cards below. A single day was enough
     for the dip, but Miles's bath is a weekly thing with a fallback
     day — answering "has he been bathed this week" needs Friday as
     well as Saturday.

     An explicit key range, NOT limitToLast. The last N *recorded*
     days is a different thing from the last N calendar days the
     moment there is a gap, and a gap is exactly the case these
     cards exist for.
     ------------------------------------------------------------ */
  const selfCare = { days: {}, anchor: null };
  let selfCareAttached = null;

  /* YYYY-MM-DD shifted by whole days, on the date parts only. */
  function shiftKey(key, days) {
    const [y, m, d] = String(key).split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
    return t.getUTCFullYear() + '-' +
           String(t.getUTCMonth() + 1).padStart(2, '0') + '-' +
           String(t.getUTCDate()).padStart(2, '0');
  }

  /* 0 = Sunday … 6 = Saturday, for a Manila date key. Built from the
     parts and read back in UTC, so the local clock cannot shift it. */
  function weekdayOf(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  /* Was this task logged on that date? */
  function didTask(key, id) {
    const day = selfCare.days[key];
    const tasks = day && Array.isArray(day.tasks) ? day.tasks : [];
    return tasks.indexOf(id) !== -1;
  }

  function selfCareAttach(db, onChange) {
    if (selfCareAttached) return selfCareAttached;
    const warn = (e) => console.warn('[nudges] self-care read failed:', e.message);
    let ref = null;

    function pointAtToday() {
      const today = phToday();
      if (selfCare.anchor === today) return;
      if (ref) ref.off();
      selfCare.anchor = today;

      /* Eight days back covers this week and the edge of the last,
         which is all any of these cards ask about. */
      ref = db.ref('self_care_logs').orderByKey()
              .startAt(shiftKey(today, -8)).endAt(today);

      ref.on('value', (s) => {
        selfCare.days = s.val() || {};
        state.dip = selfCare;
        state.miles = selfCare;
        state.bath = selfCare;
        onChange();
      }, warn);
    }
    pointAtToday();

    selfCareAttached = {
      repoint: pointAtToday,
      resync() {
        if (ref) ref.once('value')
          .then(s => {
            selfCare.days = s.val() || {};
            state.dip = selfCare; state.miles = selfCare; state.bath = selfCare;
            onChange();
          })
          .catch(warn);
      }
    };
    return selfCareAttached;
  }

  /* ------------------------------------------------------------
     MILES'S BATH — once a week, Friday, Saturday as the backup

     mc1 in the Miles Care list. Friday is the day; if Friday goes by
     unbathed, Saturday is the second chance. Bathing him on Friday
     silences Saturday, because the point is once a week and not
     twice.
     ------------------------------------------------------------ */
  const MILES_BATH_ID = 'mc1';
  const MILES_OPEN_HOUR  = 9;
  const MILES_CLOSE_HOUR = 20;

  function milesVerdict() {
    const today = phToday();
    const wd = weekdayOf(today);
    if (wd !== 5 && wd !== 6) return null;        // not Friday or Saturday

    const friday   = wd === 5 ? today : shiftKey(today, -1);
    const saturday = wd === 6 ? today : shiftKey(today, 1);

    /* Either day counts — he only needs the one bath. */
    if (didTask(friday, MILES_BATH_ID)) return null;
    if (didTask(saturday, MILES_BATH_ID)) return null;

    const hour = phHour();
    if (hour < MILES_OPEN_HOUR || hour >= MILES_CLOSE_HOUR) return null;

    return wd === 5
      ? { tone: 'due',
          sub: 'Bath day. Tomorrow works too if today gets away.',
          title: "Miles's bath — open Self Upkeep" }
      : { tone: 'stale',
          sub: 'Friday came and went — this is the week\'s bath.',
          title: "Miles's bath — open Self Upkeep" };
  }

  /* ------------------------------------------------------------
     HER SHOWER — Tuesday, Thursday, Saturday

     sc1, Full Body Shower. Three fixed days rather than a weekly
     allowance with a fallback, so each one stands on its own and a
     missed Tuesday does not follow her to Wednesday.
     ------------------------------------------------------------ */
  const BATH_ID = 'sc1';
  const BATH_DAYS = [2, 4, 6];                    // Tue, Thu, Sat
  const BATH_OPEN_HOUR  = 9;
  const BATH_CLOSE_HOUR = 22;

  function bathVerdict() {
    const today = phToday();
    if (BATH_DAYS.indexOf(weekdayOf(today)) === -1) return null;
    if (didTask(today, BATH_ID)) return null;

    const hour = phHour();
    if (hour < BATH_OPEN_HOUR || hour >= BATH_CLOSE_HOUR) return null;

    return {
      tone: hour >= 19 ? 'stale' : 'due',
      sub: hour >= 19 ? 'Still one of your shower days.'
                      : 'One of your three shower days.',
      title: 'Full body shower — open Self Upkeep'
    };
  }

  /* ------------------------------------------------------------
     SUBSCRIPTIONS — money about to leave the account

     PassHub stores these under `subscriptions` in its own Realtime
     Database project. Each entry:

         { name, category, cost, currency, cycle, startDate,
           status, method, shareCost, shareWith, notes }

     Only the name, what it costs and when it bills ever reach the
     wallpaper. `method` (the card), `notes` and everything else stay
     in the vault where they belong — this panel sits on a desktop
     that is visible to whoever is in the room.

     Cancelled subscriptions are skipped outright. A free trial is
     kept and flagged, because a trial about to end is the one case
     where knowing a day early actually saves money.
     ------------------------------------------------------------ */
  const SUBS_LEAD_DAYS = 3;                 // how far ahead to speak up
  const SUBS_OPEN_HOUR = 8;
  const SUBS_CLOSE_HOUR = 22;

  const subs = { list: null };

  function pad2(n) { return String(n).padStart(2, '0'); }

  /* A date key for y-m-d, clamping the day to the length of the
     month. The 31st of a 30-day month is the 30th, and — because the
     anchor day is kept rather than overwritten — the month after
     goes back to the 31st. PassHub's own getNextBillDate() uses
     setMonth(), which rolls Jan 31 forward to Mar 3 and then keeps
     drifting; this does not. */
  function monthKey(y, m, day) {
    while (m > 12) { m -= 12; y += 1; }
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return y + '-' + pad2(m) + '-' + pad2(Math.min(day, last));
  }

  /* First billing date on or after today. */
  function nextBillKey(startKey, cycle, todayKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startKey || ''))) return null;
    const [y, m, d] = startKey.split('-').map(Number);
    if (!y || !m || !d) return null;

    if (cycle === 'Weekly') {
      let k = startKey, guard = 0;
      while (k < todayKey && guard++ < 600) k = shiftKey(k, 7);
      return guard >= 600 ? null : k;
    }

    /* Monthly is the default here exactly as it is in PassHub —
       an entry saved before the cycle field existed bills monthly. */
    const step = cycle === 'Yearly' ? 12 : 1;
    let yy = y, mm = m, k = monthKey(yy, mm, d), guard = 0;
    while (k < todayKey && guard++ < 600) {
      mm += step;
      while (mm > 12) { mm -= 12; yy += 1; }
      k = monthKey(yy, mm, d);
    }
    return guard >= 600 ? null : k;
  }

  let subsAttached = null;

  function subsAttach(db, onChange) {
    if (subsAttached) return subsAttached;
    const warn = (e) => console.warn('[nudges] subscriptions read failed:', e.message);

    let app;
    try { app = firebase.app('passhub-nudge'); }
    catch (e) { app = firebase.initializeApp(PASSHUB_CONFIG, 'passhub-nudge'); }

    const ref = firebase.database(app).ref('subscriptions');

    function apply(snap) {
      const raw = (snap && snap.val()) || {};
      subs.list = Object.keys(raw).map(k => raw[k]).filter(Boolean);
      state.subs = subs;
      onChange();
    }

    ref.on('value', apply, (e) => {
      warn(e);
      subs.list = [];              // loaded, and empty — never a stuck card
      state.subs = subs;
      onChange();
    });

    subsAttached = {
      /* Nothing is keyed by date; the verdict recomputes against
         today every time it runs. */
      repoint() {},
      resync() { ref.once('value').then(apply).catch(warn); }
    };
    return subsAttached;
  }

  function subsVerdict(info) {
    if (!info || !Array.isArray(info.list)) return null;   // first read pending

    const hour = phHour();
    if (hour < SUBS_OPEN_HOUR || hour >= SUBS_CLOSE_HOUR) return null;

    const today = phToday();
    const soon = [];

    info.list.forEach(s => {
      if (!s || !s.name) return;
      /* A cancelled subscription is not going to bill. */
      if (String(s.status || '').toLowerCase() === 'cancelled') return;

      const key = nextBillKey(s.startDate, s.cycle, today);
      if (!key) return;

      const days = daysBetween(today, key);
      if (days < 0 || days > SUBS_LEAD_DAYS) return;

      soon.push({
        name: String(s.name).trim(),
        days,
        trial: String(s.status || '').toLowerCase() === 'free trial',
        /* What actually leaves her account: her share if it is a
           shared plan, the full price otherwise. Same rule PassHub
           uses for its monthly burn total. */
        price: money(s.currency, s.shareCost || s.cost)
      });
    });

    if (!soon.length) return null;
    soon.sort((a, b) => a.days - b.days);

    const first = soon[0];
    const when = first.days <= 0 ? 'today'
               : first.days === 1 ? 'tomorrow'
               : 'in ' + first.days + ' days';

    let sub = first.trial
      ? first.name + ' trial ends ' + when +
        (first.price ? ' — ' + first.price + ' after.' : '.')
      : first.name + ' renews ' + when +
        (first.price ? ' — ' + first.price + '.' : '.');

    const others = soon.length - 1;
    if (others > 0) sub += ' +' + others + ' more.';

    const tone = first.days <= 0 ? 'cold'
               : first.days === 1 ? 'stale'
               : first.trial ? 'stale' : 'due';

    /* Promoted on the day itself: the money leaves whether or not the
       panel was opened, and there is no doing it tomorrow. */
    return { tone, sub, title: 'Open PassHub subscriptions',
             promote: first.days <= 0 };
  }

  /* "₱549" from the pieces PassHub stores, or '' if there is no
     usable number — a subscription with no cost is still worth
     announcing, just without a figure. */
  function money(currency, cost) {
    const n = parseFloat(cost);
    if (!isFinite(n)) return '';
    const sym = String(currency || '').trim();
    const amount = Number.isInteger(n) ? String(n) : n.toFixed(2);
    return sym ? sym + amount : amount;
  }

  /* ------------------------------------------------------------
     SCRIBBLE RECYCLE BIN — files with a countdown on them
     Added 2026-09-17.

     Scribble soft-deletes into a `bin` collection and destroys what
     it finds there after 30 days. Each entry carries:

         { name, groupId, deletedAt, deletedAtLocalMs, ... }

     Only the name and the countdown ever reach the wallpaper.

     ── THE THREE DAYS ────────────────────────────────────────
     Ten left, five left, and nothing left. Not a window like the
     subscription card's three-day run-up: a file sits in the bin for
     a month, and a card that spoke every day for the last ten would
     be furniture inside a week.

     ── WHY IT NEEDS A SESSION AND THE OTHERS DON'T ───────────
     Scribble is guarded. This read is refused unless the passage is
     open — see LIFEHUB_SCRIBBLE_PASSAGE below and the two files it
     names. Refused means the card stays silent; nothing else here
     is touched.

     ── A GROUP IS ONE THING ──────────────────────────────────
     Deleting a project with forty files writes forty bin rows that
     all expire together. They share a groupId, and the bin page
     restores and destroys by group, so this counts groups too — one
     card entry per thing you deleted, not per file inside it.
     ------------------------------------------------------------ */
  const BIN_RETENTION_DAYS = 30;     // must match Scribble's own sweep
  const BIN_SPEAK_AT       = [10, 5, 0];
  const BIN_OPEN_HOUR      = 8;
  const BIN_CLOSE_HOUR     = 22;

  const bin = { list: null };

  /* Firestore hands back a Timestamp once the write has reached the
     server and null until then, so a thing deleted offline would read
     as deleted in 1970 and count as long expired. Scribble writes a
     plain millisecond stamp alongside for exactly this reason; the
     bin page and the sweep both read it the same way. */
  function binWhenMs(row) {
    if (!row) return 0;
    const v = row.deletedAt;
    if (v && typeof v.toDate === 'function') {
      try { return v.toDate().getTime(); } catch (e) {}
    }
    return row.deletedAtLocalMs || 0;
  }

  let binAttached = null;

  function binAttach(db, onChange) {
    if (binAttached) return binAttached;
    const warn = (e) => console.warn('[nudges] Scribble bin read failed:', e.message);

    let app;
    try { app = firebase.app('scribble-nudge'); }
    catch (e) { app = firebase.initializeApp(SCRIBBLE_CONFIG, 'scribble-nudge'); }

    const coll = firebase.firestore(app).collection('bin');

    function apply(snap) {
      const rows = [];
      snap.forEach(d => {
        const data = d.data();
        if (data) rows.push({ id: d.id, ...data });
      });
      bin.list = rows;
      state.bin = bin;
      onChange();
    }

    /* Loaded, and empty. A card that never resolves is worse than no
       card: the panel would wait on it forever. */
    function fail(e) {
      warn(e);
      bin.list = [];
      state.bin = bin;
      onChange();
    }

    /* The session has to be in hand before the first read goes out —
       a read fired early is refused in exactly the same words as one
       with no session at all. Resolves to null when the passage is
       shut, and then the read below is simply denied and the card
       stays quiet, which is the correct behaviour for a locked hub. */
    const ready = window.LIFEHUB_SCRIBBLE_PASSAGE
      ? LIFEHUB_SCRIBBLE_PASSAGE.ready(app)
      : Promise.resolve(null);

    ready.then(() => { coll.onSnapshot(apply, fail); }).catch(fail);

    binAttached = {
      /* Nothing is keyed by date; the verdict recomputes against
         today every time it runs. */
      repoint() {},
      resync() {
        ready.then(() => coll.get().then(apply).catch(warn)).catch(warn);
      }
    };
    return binAttached;
  }

  function binVerdict(info) {
    if (!info || !Array.isArray(info.list)) return null;   // first read pending

    const hour = phHour();
    if (hour < BIN_OPEN_HOUR || hour >= BIN_CLOSE_HOUR) return null;

    const now = Date.now();
    const groups = new Map();

    info.list.forEach(row => {
      const ms = binWhenMs(row);
      /* No usable stamp at all. Scribble's sweep deliberately leaves
         these alone rather than destroying them, so there is no
         deadline to warn about either. */
      if (!ms) return;

      const left = Math.max(0, BIN_RETENTION_DAYS -
                               Math.floor((now - ms) / 86400000));

      const gid  = row.groupId || row.id;
      const seen = groups.get(gid);
      if (seen) {
        seen.size++;
        if (left < seen.left) seen.left = left;
        return;
      }
      groups.set(gid, {
        name: String(row.name || 'Untitled').trim(),
        left: left,
        size: 1
      });
    });

    /* Filtered after grouping, not before: the group's deadline is
       its soonest member's, and that can only be known once every
       row has been counted into it. */
    const due = [];
    groups.forEach(g => {
      if (BIN_SPEAK_AT.indexOf(g.left) !== -1) due.push(g);
    });

    if (!due.length) return null;
    due.sort((a, b) => a.left - b.left);

    const first = due[0];
    const what  = first.name + (first.size > 1
                                ? ' (' + first.size + ' items)'
                                : '');

    /* Day zero is not a warning, it is an obituary — Scribble's sweep
       destroys anything at zero the next time the bin page opens, so
       by the time this is said there is nothing left to do about it.
       It is here so a loss is never silent, not so it can be stopped.
       Ten and five are the days that can still be acted on. */
    let sub;
    if (first.left === 0) {
      sub = what + ' expired — the bin destroys it on its next open.';
    } else {
      sub = what + ' leaves the bin in ' + first.left + ' days.';
    }

    const others = due.length - 1;
    if (others > 0) sub += ' +' + others + ' more.';

    /* cold is this panel's most severe tone, and day zero is the one
       state of this card that would be promoted under the clock once
       there is somewhere else for the quiet ones to live. */
    const tone = first.left === 0 ? 'cold'
               : first.left <= 5  ? 'stale'
               : 'due';

    /* Ten and five days out this sits quietly in the Margin. On the
       day itself it moves under the clock — not because anything can
       still be done, but because something is being lost and a loss
       should never happen behind a closed door. */
    return { tone, sub, title: 'Open the Scribble recycle bin',
             promote: first.left === 0 };
  }

  /* ------------------------------------------------------------
     SANITATION DAY — once a week: Wednesday, Thursday or Friday

     Home Upkeep splits its checklist in two, and the ids say which
     is which: sanitation is s1…s32, general upkeep is u1…u28. There
     is no single "sanitation day" task to look for the way Miles's
     bath is one box, so the question this card asks is "has any
     sanitation work been logged on any of the three days" — the
     occasion, not a quota. Wiping one thing and calling it the week
     is hers to decide; the card's job is to remember the week.

     Its own reader, because the generic `home` card below asks a
     different question (days since ANY upkeep entry) and answers it
     with a ten-row scan that cannot see which tasks were ticked.
     ------------------------------------------------------------ */
  const upkeep = { days: {}, anchor: null };
  let upkeepAttached = null;

  /* s1…s32 are the sanitation half of the checklist. */
  const SANITATION_ID = /^s\d+$/;
  const SANITATION_DAYS = [3, 4, 5];              // Wed, Thu, Fri
  const SANITATION_OPEN_HOUR = 9;
  const SANITATION_CLOSE_HOUR = 21;

  function didSanitationOn(key) {
    const day = upkeep.days[key];
    const tasks = day && Array.isArray(day.tasks) ? day.tasks : [];
    return tasks.some(id => SANITATION_ID.test(String(id)));
  }

  function upkeepAttach(db, onChange) {
    if (upkeepAttached) return upkeepAttached;
    const warn = (e) => console.warn('[nudges] upkeep read failed:', e.message);
    let ref = null;

    function pointAtToday() {
      const today = phToday();
      if (upkeep.anchor === today) return;
      if (ref) ref.off();
      upkeep.anchor = today;

      /* An explicit key range rather than limitToLast, for the same
         reason the self-care reader uses one: the last N *recorded*
         days stop being the last N calendar days the moment there is
         a gap, and a gap is the whole point of this card.

         Eight back covers Wednesday as seen from Friday with room to
         spare. Days still ahead are simply absent, which reads as
         "not done yet" — exactly right. */
      ref = db.ref('upkeep_logs').orderByKey()
              .startAt(shiftKey(today, -8)).endAt(today);

      ref.on('value', (s) => {
        upkeep.days = s.val() || {};
        state.sanitation = upkeep;
        onChange();
      }, warn);
    }
    pointAtToday();

    upkeepAttached = {
      repoint: pointAtToday,
      resync() {
        if (ref) ref.once('value')
          .then(s => {
            upkeep.days = s.val() || {};
            state.sanitation = upkeep;
            onChange();
          })
          .catch(warn);
      }
    };
    return upkeepAttached;
  }

  function sanitationVerdict() {
    const today = phToday();
    const wd = weekdayOf(today);
    if (SANITATION_DAYS.indexOf(wd) === -1) return null;

    /* This week's Wednesday, whichever of the three days it is now. */
    const wed = shiftKey(today, 3 - wd);
    const days = [wed, shiftKey(wed, 1), shiftKey(wed, 2)];

    /* Any one of the three settles the week — but only days that have
       actually happened. The reader's range already ends at today, so
       a future day is normally just absent; the tracker has a date
       picker though, and a day ticked in advance must not be able to
       call the week done before it arrives. Cheaper to say it here
       than to depend on the shape of a query defined elsewhere. */
    if (days.filter(d => d <= today).some(didSanitationOn)) return null;

    const hour = phHour();
    if (hour < SANITATION_OPEN_HOUR || hour >= SANITATION_CLOSE_HOUR) return null;

    const title = 'Sanitation day — open Home Upkeep';
    if (wd === 3) return { tone: 'due',
      sub: 'Sanitation day. Thursday or Friday work too.', title };
    if (wd === 4) return { tone: 'due',
      sub: 'Still unwiped this week — Friday is the last of the three.', title };
    return { tone: 'stale',
      sub: 'Last of the three sanitation days this week.', title };
  }

  /* ------------------------------------------------------------
     TODAY'S WORKOUT — from the Fitness Centre's schedule

     The Fitness Centre keeps `lh_templates` in localStorage, which the
     wallpaper cannot see: localStorage is per-origin and per-page, and
     nothing about being on the same disk shares it. What it DOES do is
     mirror everything to a Firestore vault on its own project
     (LifeHub_Backups/Jen_Data), and that is readable from anywhere.

     So the schedule arrives here as `templates_backup` — a JSON STRING
     of the template array, stringified deliberately at the far end to
     get nested arrays past Firestore. Each entry:

         { id, name, folder, date: 'YYYY-MM-DD', isCompleted,
           exercises: [...] }

     One consequence worth stating plainly: this card is only as fresh
     as the last time the Fitness Centre was open, because that is when
     syncToCloud() runs. For a SCHEDULE that is fine — sessions are
     planned in advance, so the plan is already in the vault by the
     time the card wants it.
     ------------------------------------------------------------ */
  const WORKOUT_OPEN_HOUR = 8;
  const WORKOUT_CLOSE_HOUR = 22;
  const WORKOUT_WARM_HOUR = 18;     // evening: still undone, tone warms

  const workout = { today: null, graced: false, loaded: false, synced: null };

  /* An ISO timestamp → the Manila calendar day it happened on. The
     Fitness Centre's own logs are stamped in UTC. */
  function phDayOf(stamp) {
    const t = new Date(stamp);
    return isFinite(t) ? PH_DATE.format(t) : null;
  }

  let workoutAttached = null;

  function workoutAttach(db, onChange) {
    if (workoutAttached) return workoutAttached;

    /* This one needs Firestore, which start() does not check for —
       it only requires the Realtime Database the other cards use. */
    if (!window.firebase || !firebase.firestore) {
      console.warn('[nudges] firebase-firestore-compat.js is not loaded — no workout card.');
      return null;
    }

    let app;
    try { app = firebase.app('fitness-nudge'); }
    catch (e) { app = firebase.initializeApp(FITNESS_CONFIG, 'fitness-nudge'); }

    const doc = firebase.firestore(app)
                        .collection('LifeHub_Backups').doc('Jen_Data');

    function apply(snap) {
      workout.loaded = true;
      workout.today = null;
      workout.graced = false;
      state.workout = workout;

      const data = snap && snap.exists ? snap.data() : null;
      if (!data) { onChange(); return; }

      workout.synced = data.lastSync || null;
      const today = phToday();

      /* templates_backup is a string. A hub mid-upgrade could still
         hand back an array, so accept either rather than throwing. */
      let list = [];
      try {
        const raw = data.templates_backup;
        list = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
      } catch (e) {
        console.warn('[nudges] the workout schedule would not parse:', e.message);
      }
      if (!Array.isArray(list)) list = [];

      /* An unfinished session wins over a finished one on the same
         day, so a second workout planned for today still shows. */
      const mine = list.filter(t => t && t.date === today);
      workout.today = mine.find(t => !t.isCompleted) || mine[0] || null;

      /* The Fitness Centre's grace protocol is an explicit "excused
         today". Nagging through one would be exactly the kind of
         card that teaches her to stop reading the panel. */
      const logs = (data.userProfile && data.userProfile.systemLogs) || [];
      workout.graced = Array.isArray(logs) && logs.some(
        l => l && l.type === 'grace' && phDayOf(l.date) === today);

      onChange();
    }

    const stop = doc.onSnapshot(apply, (e) => {
      console.warn('[nudges] workout schedule read failed:', e.message);
      workout.loaded = true;
      state.workout = workout;
      onChange();
    });

    workoutAttached = {
      /* Nothing here is keyed by date, so the rollover only needs a
         re-read of the same document. */
      repoint() {},
      resync() { doc.get().then(apply).catch(() => {}); },
      stop
    };
    return workoutAttached;
  }

  function workoutVerdict(info) {
    if (!info || !info.loaded) return null;        // first read still in flight
    if (info.graced) return null;                  // excused today
    const t = info.today;
    if (!t) return null;                           // rest day — say nothing
    if (t.isCompleted) return null;                // done

    const hour = phHour();
    if (hour < WORKOUT_OPEN_HOUR || hour >= WORKOUT_CLOSE_HOUR) return null;

    const name = String(t.name || 'Session').trim() || 'Session';
    const count = Array.isArray(t.exercises) ? t.exercises.length : 0;
    const moves = count === 1 ? '1 exercise' : count + ' exercises';
    const late = hour >= WORKOUT_WARM_HOUR;

    return {
      tone: late ? 'stale' : 'due',
      sub: late ? name + ' — still on for today.'
                : name + (count ? ' — ' + moves + '.' : ' — planned for today.'),
      title: name + ' — open the Fitness Centre'
    };
  }

  /* ------------------------------------------------------------
     THE MORNING VIDEO — 5am, every day but Sunday

     The one card that plays something instead of going somewhere.
     second_star.mp4 is a motivation video Jen made for herself and
     watches to start the day, so the card opens it over the
     wallpaper: no navigation, no InspoHub, no second press of play.

     "Watched" lives in the database, at morning_video/watched (the
     Manila date it was last seen through). It used to be localStorage
     only, which meant watching it on the TV left the card up on the
     laptop and phone all morning. localStorage is still written too,
     so the device that played it hides the card at once even if the
     write is slow or offline.
     ------------------------------------------------------------ */
  const INSPO_SRC = 'Hubs/InspoHub/videos/jen/second_star.mp4';
  const INSPO_HOUR = 5;                    // opens at 5am Manila
  const INSPO_CLOSE_HOUR = 12;             // a "morning" video, so it stops at noon
  const INSPO_WATCHED_KEY = 'lifehub.inspo.watched';
  const INSPO_NODE = 'morning_video/watched';

  let inspoRef = null;                     // set by inspoAttach()
  let inspoSharedDay = null;               // what the database says

  function inspoWatchedToday() {
    const today = phToday();
    if (inspoSharedDay === today) return true;
    try {
      const raw = JSON.parse(localStorage.getItem(INSPO_WATCHED_KEY)) || {};
      return raw.day === today;
    } catch (e) { return false; }
  }

  function markInspoWatched() {
    const today = phToday();
    try {
      localStorage.setItem(INSPO_WATCHED_KEY, JSON.stringify({ day: today }));
    } catch (e) { /* private mode — it just won't persist */ }
    inspoSharedDay = today;
    if (inspoRef) inspoRef.set(today).catch((e) =>
      console.warn('[nudges] morning video: could not save "watched":', e.message));
    render();
  }

  /* Milliseconds until the next 5:00:00 Manila. The panel's own tick
     is every 10 minutes, which would have the card turning up at some
     point in the 5 o'clock hour rather than at 5 — fine for "you
     haven't done the dishes", not for a thing she asked to happen at
     a specific time. */
  function msUntilInspoHour() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: PH_TZ, hour12: false,
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date());
    const get = (t) => Number(parts.find(p => p.type === t).value);
    const h = get('hour') % 24;            // en-US hour12:false can report 24
    const nowMs = (h * 3600 + get('minute') * 60 + get('second')) * 1000;
    let delay = INSPO_HOUR * 3600 * 1000 - nowMs;
    if (delay <= 0) delay += 86400000;
    return delay;
  }

  let inspoTimer = null;
  function armInspoTimer(onChange) {
    if (inspoTimer) clearTimeout(inspoTimer);
    /* A second past the hour, so phHour() has definitely rolled. */
    inspoTimer = setTimeout(function fire() {
      onChange();
      inspoTimer = setTimeout(fire, msUntilInspoHour() + 1000);
    }, msUntilInspoHour() + 1000);
  }

  let inspoAttached = null;
  function inspoAttach(db, onChange) {
    if (inspoAttached) return inspoAttached;

    /* render() skips any spec whose state is still falsy, so it needs
       something to stand on before the first read lands. */
    state.inspo = { kind: 'morning-video' };
    armInspoTimer(onChange);

    /* One tiny value, listened to live: watching it on any screen
       takes the card off all the others. */
    const warn = (e) => console.warn('[nudges] morning video read failed:', e.message);
    const apply = (s) => { inspoSharedDay = s.val(); onChange(); };
    inspoRef = db.ref(INSPO_NODE);
    inspoRef.on('value', apply, warn);

    inspoAttached = {
      /* The timer re-arms itself, so this only matters if one was
         ever lost — re-arming on every tick would keep clearing a
         pending wake-up and could walk straight over 5am. */
      repoint() { if (!inspoTimer) armInspoTimer(onChange); },
      resync() { inspoRef.once('value').then(apply).catch(warn); }
    };
    return inspoAttached;
  }

  function inspoVerdict() {
    if (weekdayOf(phToday()) === 0) return null;      // Sundays off
    if (inspoWatchedToday()) return null;

    const hour = phHour();
    if (hour < INSPO_HOUR || hour >= INSPO_CLOSE_HOUR) return null;

    return {
      tone: hour >= 10 ? 'stale' : 'due',
      sub: hour >= 10 ? 'Second Star — the morning is still yours.'
                      : 'Second Star. Press play.',
      title: 'Play the morning video here'
    };
  }

  /* ---- the player ---------------------------------------------
     Built once on the first open, then hidden and reused. It lives
     on document.body, not in the nudges panel, because it covers
     the screen and the panel is a 340px column in the corner.
     -------------------------------------------------------------- */
  const ICON_PLAY  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';

  let vid = null;          // { root, video, btn, fill, time }

  function clock(s) {
    if (!isFinite(s) || s < 0) return '0:00';
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  function syncPlayButton() {
    if (!vid) return;
    const paused = vid.video.paused;
    vid.btn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    vid.btn.setAttribute('data-state', paused ? 'paused' : 'playing');
    vid.btn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    vid.btn.title = paused ? 'Play' : 'Pause';
  }

  function togglePlay() {
    if (!vid) return;
    if (vid.video.paused) vid.video.play().catch(() => syncPlayButton());
    else vid.video.pause();
  }

  function buildPlayer() {
    const root = document.createElement('div');
    root.id = 'lh-vid';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Morning video');

    const frame = document.createElement('div');
    frame.id = 'lh-vid-frame';

    const close = document.createElement('button');
    close.id = 'lh-vid-close';
    close.type = 'button';
    close.textContent = 'Close';

    const video = document.createElement('video');
    video.id = 'lh-vid-el';
    video.src = INSPO_SRC;
    video.preload = 'metadata';
    video.setAttribute('playsinline', '');

    const bar = document.createElement('div');
    bar.id = 'lh-vid-bar';

    const btn = document.createElement('button');
    btn.className = 'lh-vb';
    btn.type = 'button';

    const seek = document.createElement('div');
    seek.id = 'lh-vid-seek';
    const fill = document.createElement('div');
    fill.id = 'lh-vid-fill';
    seek.appendChild(fill);

    const time = document.createElement('span');
    time.id = 'lh-vid-time';
    time.textContent = '0:00';

    bar.appendChild(btn);
    bar.appendChild(seek);
    bar.appendChild(time);
    frame.appendChild(close);
    frame.appendChild(video);
    frame.appendChild(bar);
    root.appendChild(frame);
    document.body.appendChild(root);

    vid = { root, video, btn, fill, time, bar, frame };

    btn.addEventListener('click', togglePlay);
    video.addEventListener('click', togglePlay);
    video.addEventListener('play', syncPlayButton);
    video.addEventListener('pause', syncPlayButton);

    video.addEventListener('timeupdate', () => {
      const d = video.duration;
      if (isFinite(d) && d > 0) fill.style.width = (video.currentTime / d * 100) + '%';
      time.textContent = clock(video.currentTime) +
        (isFinite(d) && d > 0 ? ' / ' + clock(d) : '');
    });

    seek.addEventListener('click', (e) => {
      const d = video.duration;
      if (!isFinite(d) || d <= 0) return;
      const box = seek.getBoundingClientRect();
      video.currentTime = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1) * d;
    });

    /* Watching it through is what marks the day done. Closing early
       deliberately does not — the card is still true, and the × on
       it is already the way to say "not today".

       'ended' alone was not enough on the TV: BrowseHere can take the
       video into its own player and stop on the last frame without
       ever firing it. So a pause (or a last timeupdate) within half a
       second of the end counts as the end too. */
    function finished() {
      if (vid.done) return;
      vid.done = true;
      markInspoWatched();
      closePlayer();
    }
    const atEnd = () => {
      const d = video.duration;
      return isFinite(d) && d > 0 && video.currentTime >= d - 0.5;
    };
    video.addEventListener('ended', finished);
    video.addEventListener('pause', () => { if (atEnd()) finished(); });
    video.addEventListener('timeupdate', () => { if (atEnd() && video.paused) finished(); });

    /* The file is 34MB and lives outside this folder, so a missing or
       moved clip has to say so rather than showing a black rectangle
       — the same failure InspoHub's three empty themes used to have. */
    video.addEventListener('error', () => {
      bar.style.display = 'none';
      const miss = document.createElement('div');
      miss.id = 'lh-vid-miss';
      miss.innerHTML = 'That clip would not load.<br><code></code>';
      miss.querySelector('code').textContent = INSPO_SRC;
      video.replaceWith(miss);
    });

    close.addEventListener('click', closePlayer);
    root.addEventListener('click', (e) => { if (e.target === root) closePlayer(); });

    return vid;
  }

  function onPlayerKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closePlayer(); }
    else if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); togglePlay(); }
  }

  function closePlayer() {
    if (!vid) return;
    const v = vid.video;
    v.pause();

    /* Leave any fullscreen the browser put the video into. */
    try {
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (fs) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      if (v.webkitDisplayingFullscreen && v.webkitExitFullscreen) v.webkitExitFullscreen();
    } catch (e) {}

    /* Hiding the overlay is not enough on the TV: BrowseHere pins its
       own fullscreen and × buttons to a video for as long as that
       video holds a source. Dropping the source releases it, and those
       buttons with it. openMorningVideo() puts it back. */
    v.removeAttribute('src');
    try { v.load(); } catch (e) {}

    vid.root.classList.remove('is-open');
    document.removeEventListener('keydown', onPlayerKey);
  }

  function openMorningVideo() {
    if (!vid) buildPlayer();
    vid.done = false;
    if (!vid.video.getAttribute('src')) vid.video.src = INSPO_SRC;
    vid.root.classList.add('is-open');
    document.addEventListener('keydown', onPlayerKey);

    /* Start from the top each morning, and play straight away — the
       card click IS the play press, so the browser counts this as a
       user gesture and will allow the sound. */
    try { vid.video.currentTime = 0; } catch (e) {}
    vid.video.play().catch(() => { /* leave it paused; the button works */ });
    syncPlayButton();
    vid.btn.focus();
  }

  function render() {
    const today = phToday();
    const hour = phHour();
    const hidden = dismissed();

    panel.innerHTML = '';
    if (marginList) marginList.innerHTML = '';
    const shown = [];
    const inMargin = [];
    let hasPromoted = false;

    WATCH.forEach(spec => {
      const info = state[spec.id];
      if (!info) return;                       // still loading
      if (hidden.indexOf(spec.id) !== -1) return;

      /* A custom watcher answers for itself. The guards below are the
         "days since the last entry" rule, which the pill does not use. */
      if (spec.custom) {
        const v = spec.verdict(info);
        if (!v) return;
        addCard(spec, v.tone, v.sub, v.title || ('Open ' + spec.label), v.promote);
        shown.push({ id: spec.id, label: spec.label, tone: v.tone,
                     days: null, last: null, summary: v.sub,
                     place: v.promote ? 'slate' : placeOf(spec) });
        return;
      }

      /* Never logged at all. There is no last-entry date to count from,
         so graceDays cannot apply — but the quiet hours still should.
         This used to fall through both guards below and put a red card
         on the wallpaper at any hour, including 1am. */
      if (info.never && hour < spec.dueHour) return;

      /* Logged recently enough — nothing to say. */
      if (!info.never && info.days < spec.graceDays) return;

      /* Only today's gap is outstanding, and it isn't late yet. Sleep
         is logged in the morning and upkeep at night, so nagging on a
         shared schedule would make half the cards permanently wrong. */
      if (!info.never && info.days === spec.graceDays && hour < spec.dueHour) return;

      const { tone, sub } = describe(spec, info);
      addCard(spec, tone, sub, info.never
        ? `Open ${spec.label}`
        : `Last entry ${info.last} — open ${spec.label}`);

      shown.push({
        id: spec.id, label: spec.label, tone,
        days: info.never ? null : info.days,
        last: info.last, summary: sub, place: placeOf(spec)
      });
    });

    /* One card. Split out so the pill's own verdict builds exactly the
       same thing the generic rule does. */
    function addCard(spec, tone, sub, hoverTitle, promoted) {
      const card = document.createElement('div');
      card.className = 'lh-n';
      /* A div, so the phone remote (lifehub-navigation-core.js) only sees it
         as clickable with a button role and a tabindex. */
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.style.setProperty('--n-tone', TONES[tone]);
      card.title = hoverTitle;

      const dot = document.createElement('span');
      dot.className = 'lh-n-dot';

      const body = document.createElement('div');
      body.className = 'lh-n-body';
      const t = document.createElement('b');
      t.className = 'lh-n-title';
      t.textContent = spec.label;
      const s = document.createElement('span');
      s.className = 'lh-n-sub';
      s.textContent = sub;
      body.appendChild(t);
      body.appendChild(s);

      const x = document.createElement('button');
      x.className = 'lh-n-x';
      x.type = 'button';
      x.textContent = '×';
      x.setAttribute('aria-label', 'Dismiss until tomorrow');
      x.addEventListener('click', (e) => { e.stopPropagation(); dismiss(spec.id); });

      /* Most cards are a way into a tracker, so clicking navigates.
         A spec carrying onOpen handles the click itself and stays on
         the page — the morning video plays here rather than sending
         her to InspoHub to press play a second time. */
      card.addEventListener('click', () => {
        if (typeof spec.onOpen === 'function') spec.onOpen();
        else window.location.href = spec.path;
      });

      card.appendChild(dot);
      card.appendChild(body);
      card.appendChild(x);

      /* THE SPLIT — the one line that decides where a card lives.
         Margin unless it is a Slate entry, or a Margin entry whose
         verdict promoted it today. With no corner to build a Margin
         in, everything falls to the Slate rather than vanishing. */
      const goesToMargin = marginList && !promoted && placeOf(spec) === 'margin';
      if (goesToMargin) { marginList.appendChild(card); inMargin.push(spec.id); }
      else              { panel.appendChild(card); if (promoted) hasPromoted = true; }
    }

    /* Each stack disappears on its own when it has nothing in it. The
       Slate takes its toggle with it — a toggle for an empty list is
       just clutter on a wallpaper. */
    const slateCount = shown.length - inMargin.length;
    wrap.hidden = slateCount === 0;

    /* A promoted card forces the Slate open for as long as it is there.
       This is the one place the panel overrules you, and it is the
       narrowest case: something is being lost today, and a card you
       cannot see is the same as no card at all.

       It does NOT touch your stored preference — only the class that
       draws the collapse. Once the promoted card clears, the panel
       goes straight back to however you left it. */
    wrap.classList.toggle('is-collapsed', collapsed && !hasPromoted);
    document.getElementById('lh-n-count').textContent =
      slateCount + (slateCount === 1 ? ' reminder' : ' reminders');

    /* The Margin's icon hides entirely at zero rather than showing a
       nought: an icon with nothing behind it is a button that lies. */
    if (marginBtn) {
      marginBtn.hidden = inMargin.length === 0;
      marginBadge.textContent = inMargin.length ? String(inMargin.length) : '';
      marginBtn.setAttribute('aria-label',
        inMargin.length + (inMargin.length === 1 ? ' reminder' : ' reminders'));
      marginBtn.title = marginBtn.getAttribute('aria-label');

      /* Open, and then the last thing in it was dismissed or stopped
         being true. Close rather than leave an empty box hanging off a
         button that is no longer there. */
      if (!inMargin.length && marginOpen && marginWrap) {
        marginOpen = false;
        marginWrap.hidden = true;
      }
    }

    /* Kept current for Poppy, so she can be asked what's outstanding
       without repeating any of this. Only the cards actually on screen —
       a dismissed or not-yet-due tracker isn't outstanding. */
    window.LifeHubNudges.current = shown;
  }

  /* ------------------------------------------------------------
     7) READ
     ------------------------------------------------------------ */
  /* One watcher's query. Built once per spec so the live listener and the
     re-sync below are demonstrably reading the same thing. */
  const queries = {};

  /* id → whatever a custom watcher handed back (a repoint and a
     resync). Same two jobs the generic query does, done its own way. */
  const custom = {};

  /* Snapshot → state. Shared by the live listener and the re-sync, so a
     forced re-read can never disagree with a pushed update. */
  function applySnap(spec, snap) {
    const rows = [];
    snap.forEach(child => { rows.push({ key: child.key, val: child.val() }); });

    /* Newest first, then take the first row that counts. */
    rows.reverse();
    const test = spec.counts || ((e) => !!e);
    const hit = rows.find(r => test(r.val));

    state[spec.id] = hit
      ? { never: false, last: hit.key, days: daysBetween(hit.key, phToday()) }
      : { never: true, last: null, days: Infinity };
  }

  function start() {
    if (!window.firebase || !firebase.database) {
      console.warn('[nudges] firebase-database-compat.js is not loaded — no reminders.');
      return;
    }

    /* A NAMED app, so this can never collide with the default app that
       lifehub-navigation-core.js initialises if it is ever added here. */
    let app;
    try { app = firebase.app('nudges'); }
    catch (e) { app = firebase.initializeApp(FIREBASE_CONFIG, 'nudges'); }
    const db = firebase.database(app);

    WATCH.forEach(spec => {
      /* A custom watcher brings its own reads. */
      if (spec.custom) {
        custom[spec.id] = spec.attach(db, render);
        return;
      }

      /* Date keys sort lexicographically the same way they sort
         chronologically, so the last keys ARE the most recent entries.
         Ten rows rather than the whole history — this runs on a
         wallpaper that stays open all day.

         Ten, not one, because the newest key isn't always a real entry:
         a tracker can write an empty day (see `counts` above), and the
         scan below has to be able to step past a few of those to find
         the last day something actually happened. */
      const q = db.ref(spec.node).orderByKey().limitToLast(10);
      queries[spec.id] = q;

      q.on('value', (snap) => {
        applySnap(spec, snap);
        render();
      }, (err) => {
        console.warn('[nudges] could not read ' + spec.node + ':', err.message);
        state[spec.id] = null;
      });
    });

    watchForReturn();
  }

  /* ------------------------------------------------------------
     8) RE-SYNC ON RETURN

     The live listener is the normal path: log sleep in the tracker and
     the card here disappears on its own. But this page is a wallpaper
     that sits open for days, and the two ways it can miss that push are
     both routine — the socket dies while the laptop is asleep and the
     SDK reconnects a beat late, or the log was written from the phone
     while this tab was backgrounded.

     So whenever the page becomes visible again, re-read once. A stale
     "Nothing logged today" that survives an actual log is the one thing
     that would teach her to stop reading the panel.
     ------------------------------------------------------------ */
  let lastSync = 0;

  function resync() {
    /* Focus and visibilitychange both fire on a single alt-tab. One read
       per second is plenty for a panel measured in days. */
    const now = Date.now();
    if (now - lastSync < 1000) return;
    lastSync = now;

    WATCH.forEach(spec => {
      if (spec.custom) {
        const c = custom[spec.id];
        if (c) { c.repoint(); c.resync(); }
        return;
      }
      const q = queries[spec.id];
      if (!q) return;
      q.once('value')
        .then(snap => { applySnap(spec, snap); render(); })
        .catch(err => console.warn('[nudges] re-sync failed for ' +
                                   spec.node + ':', err.message));
    });
  }

  function watchForReturn() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) resync();
    });
    window.addEventListener('focus', resync);
    /* Coming back via the browser's back button can restore this page
       from the bfcache, where no listener ever fired and the DOM is
       exactly as it was left — including a card for a tracker that has
       since been logged. */
    window.addEventListener('pageshow', (e) => { if (e.persisted) resync(); });
  }

  /* Midnight rolls the day over. Without this the panel would keep
     yesterday's arithmetic until the page was reloaded — and this page
     is a wallpaper that may not be reloaded for weeks. Re-rendering
     every 10 minutes also lets a dueHour arrive on its own. */
  setInterval(() => {
    /* A custom watcher may be listening to a key that contains today's
       date, so the rollover has to move it. */
    Object.keys(custom).forEach(id => {
      if (custom[id] && custom[id].repoint) custom[id].repoint();
    });
    render();
  }, 10 * 60 * 1000);

  window.LifeHubNudges = {
    current: [],
    /* refresh() re-draws from what is already known; resync() goes back
       to the database first. Poppy wants the cheap one. */
    refresh: render,
    resync: resync,
    /* LifeHubNudges.debug() in the console — what it thinks it knows. */
    debug() { console.table(state); return state; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

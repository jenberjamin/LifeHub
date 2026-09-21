/* ============================================================
   LifeHub — Search
   Wires #btn-search to a launcher for your other HTML apps.
   Self-contained: builds its own DOM + styles. No CSS edits needed.
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
     1) THE REGISTRY  ← this is the only part you edit
     path : relative to LifeHub-HomeScreen.html (or a full file:/// path)
     tags : extra words you might type to find it
     local: true = only on the PC. Left out of the deployed site (it's
            gitignored — see .gitignore), so on the TV it would be a 404.
     ------------------------------------------------------------ */
  /* The deployed site is https; the PC is file:// (Lively) or localhost. */
  const ON_WEB = location.protocol === 'https:';

  const APPS = [
    { name: 'LifeHub',   group: 'Home Screen',    path: './LifeHub-HomeScreen.html',        tags: 'Wallpaper, Reception Area, AI Powered, Poppy' },

    { name: 'LifeHub',   group: 'Lobby',    path: './LifeHub.html',        tags: 'Home, Lobby, Lounge' },

    { name: 'LifeHub',   group: 'Portal',     path: './LifeHub-hubs.html',     tags: 'hubs, apps, launcher, index, trackers, softwares, tools' },

    { name: 'LifeHub',   group: 'Trackers',   path: './LifeHub-trackers.html',   tags: 'Trackers, Logs, Daily logs, to log, Sleep, Hydration, FLO, Food, Workout, Upkeep, Break Habit' },

    { name: 'LifeHub',   group: 'Remote',   path: './LifeHub-remote.html',   tags: 'Remote, Remote control, TV remote, Controller, Phone, Mobile, Clicker, D-pad, Keyboard, Type on TV' },

    { name: 'Poppy',   group: 'Phone Chat',   path: './LifeHub-poppy-phone.html',   tags: 'Poppy, Chat, Talk, Assistant, AI Powered, Phone, Mobile, Voice, Mic' },

    { name: 'Prestige Bank',   group: 'App',   path: './LifeHub-prestige-bank.html',   tags: 'Prestige, Bank, Wallet, Balance, Money, Wage, Earnings, Rewards, Penalties, Rank, Tier, Points, Finance, to check' },

    { name: 'Prestige Bank',   group: 'Net Worth',   path: './LifeHub-prestige-bank-networth.html',   tags: 'Prestige, Bank, Net Worth, Balance, Money, Wealth, Savings, Charts, Graphs, Stats, Finance, to check' },

    { name: 'Prestige Bank',   group: 'Transactions',   path: './LifeHub-prestige-bank-transactions.html',   tags: 'Prestige, Bank, Transactions, Ledger, History, Records, Statement, Receipts, Earnings, Penalties, Logs, Finance, to check' },

    { name: 'Scribble',         group: 'Workshop',   path: './Hubs/Scribble/Scribble.html',                  tags: 'Workshop, Annex, Vault, Records, Databases, Collections, Repository, Repositories, Depot, Project Manager, Dev Organizer, Code, Coding, Library, Warehouse, Files, Protected data, Documentation, Classified Files, Restricted Files, Safety Net, ' },

    { name: 'Scribble',         group: 'Archive',   path: './Hubs/Scribble/Scribble-archive.html',                  tags: 'Archive, Storage, Retainer, Repository, Repositories, Retention, Preservation' },

    { name: 'Scribble',         group: 'Recycle Bin',   path: './Hubs/Scribble/Scribble-recycle-bin.html',    tags: 'Bin, Recycling bin, Salvage, Recovery bin, Trashcan' },

    { name: 'PassHub',         group: 'App',   path: './Hubs/PassHub/PassHub.html',    tags: 'Password Manager, Credentials, Vault, Key Manager, Auth Store, authentication storage, Lockbox, Identity Safe, Gated, Secured, Security, Classified, Restricted, Sensitive, Legal, Records, Personal File, Profile, Informations, Infos, Certifications, Identification, Protected data, Documentation, Financial Records, Billing Records, ' },

    { name: 'PassHub',         group: 'About Me',   path: './Hubs/PassHub/PassHub-about.html',    tags: 'My Profile, Personal Informations, Profile, Informations, Biography, Family Info, Health Info, Education Info, Educational Attainment, Records, Employment Records, Personal File, Identity, Vault,  Documentation, Sensitive Records, Character Sheet' },

    { name: 'PassHub',         group: 'Logins',   path: './Hubs/PassHub/PassHub-logins.html',    tags: 'My Accounts, Credentials, Accounts, Access Keys, Passwords, Platform Logins, Emails, Informations, Usernames, Records, Personal File, Vault, Gmail, Social Medias, google, Protected data, Classified Records, Restricted information, Confidential records,  Documentation, Sensitive Records, Key Manager, Authentications' },

    { name: 'PassHub',         group: 'Documents',   path: './Hubs/PassHub/PassHub-docs.html',    tags: 'My Documents, My Papers, Files, Credentials, Government Records, Official Documents, Docs, Certifications, Identification Cards, IDs, Access Keys, Cards, Diplomas, Important Papers, Confidential records, Informations, Records, Personal File, Vault, Classified documents, Restricted information, Security, Protected data, Legal Context, Documentation, Sensitive Documents, Banking' },

    { name: 'PassHub',         group: 'Subscriptions',   path: './Hubs/PassHub/PassHub-subscriptions.html',    tags: 'Accounts, Platforms, Informations, Records, Vault, Protected data, Classified Records, Restricted information, Confidential records,  Sensitive Records, Recurring, Bills, Finance, Financial Records, Trackers, Billing Tracker, to check, Expenses, Expenditures, Budgeting, streaming, Schedule, calendar' },

    { name: 'PassHub',         group: 'Contacts',   path: './Hubs/PassHub/PassHub-connections.html',    tags: 'Connections, Informations, Records, Vault, Protected data, Classified Records, Restricted information, Confidential records,  Sensitive Records, Contacts, Address Book, Network, Contact Book, People, whereabouts, phonebook, Emergency contacts' },

    { name: 'PassHub',         group: 'Secure Notes',   path: './Hubs/PassHub/PassHub-notes.html',    tags: 'Notes, Informations, Records, Vault, Protected data, Classified Records, Restricted information, Confidential records,  Sensitive Records, My Notes, Directories, Hard Drive, Safety Net, Tracker' },

    { name: 'PassHub',         group: 'Entries',   path: './Hubs/PassHub/PassHub-entry.html',    tags: 'Journal, Informations, Records, Vault, Protected data, Classified Records, Restricted information, to log, Confidential records,  Sensitive Records, Diary, Blog, My Journal, Private Journal, Daily log, My Entries, Thoughts, memoir, scrapbook, memoire' },

    { name: 'Fitness Centre',         group: 'App',   path: './Hubs/FitnessCentre/FITNESS-CENTRE.html',    tags: 'Workout Tracker, Trackers, Training Log, Body Log, Gym, Fit Log, My Fitness, Exercises' },

    { name: 'Fitness Centre',         group: 'History Dashboard',   path: './Hubs/FitnessCentre/fitness-centre-history_log.html',    tags: 'Workout Tracker, Trackers, Training History, Activity Feed, Gym, Fit Log, My Fitness, Logbook, Dashboard, Console, Reports, logs, Metrics, Progress, Performance Report, Exercises records' },

    { name: 'Fitness Centre',         group: 'Measurements',   path: './Hubs/FitnessCentre/fitness-centre-measurement.html',    tags: 'Workout Tracker, Trackers, Training, Gym, Fit Log, My Fitness, to log, Body Stats, Statistics, Stats Board, Body Monitor, Physical Stats, Body Check, Body Record' },

    { name: 'Fitness Centre',         group: 'Gallery',   path: './Hubs/FitnessCentre/fitness-centre-gallery.html',    tags: 'Workout Tracker, Trackers, Training, Gym, Fit Log, My Fitness, to log, Body Monitor, Body Check, Progress Gallery, Photo Log, Body Gallery, Visual Log, Progress Shots, fitness journey, Exercises photos' },

    { name: 'Fitness Centre',         group: 'Exercises Index',   path: './Hubs/FitnessCentre/fitness-centre-exercise_index.html',    tags: 'Workout Tracker, Trackers, Training Index, Gym, Fit Log, My Fitness, Exercise Library, Workout Glossary, list' },

    { name: 'Fitness Centre',         group: 'Calendar',   path: './Hubs/FitnessCentre/fitness-centre-calendar.html',    tags: 'Workout Tracker, Trackers, Training Index, Gym, Fit Log, My Fitness, to check, Fit Calendar, Schedule, Training Schedule, Fit Planner, Planner' },

    { name: 'Fitness Centre',         group: 'Active Session',   path: './Hubs/FitnessCentre/fitness-centre-active_session.html',    tags: 'Workout Tracker, Trackers, Training Mode, Gym, Workout Builder, My Fitness, Live Session, Workout Mode, Active Training, Real-time session' },

    { name: 'Fitness Centre',         group: 'Workout Deck',   path: './Hubs/FitnessCentre/fitness-centre-training_deck.html',    tags: 'Workout Tracker, Trackers, Training Logs, Gym, to check, to log, Workout Builder, Workout Planner, Training Planner, Planners, Exercise Templates, Schedule, Scheduling, Audit, Log Workout, Logs' },

    { name: 'Fitness Centre',         group: 'Progress Tracker',   path: './Hubs/FitnessCentre/fitness-centre-progress_tracker.html',    tags: 'Workout Tracker, Trackers, Gym, Workout Progress, My Fitness, to check, Rank Board, My Stats, Fitness Profile, My Progress, Character Sheet, Stats, Statistics, Charts, Graphs, Analytics, Analysis, Breakdown' },

    { name: 'See You Latte',         group: 'App',   path: './Standalone/SEE-YOU-LATTE/See-You-Latte.html', local: true,    tags: 'Thomas Thompson, Tom, SYL, Cafe, Coffee, Interactive Chat, AI Powered, role-playing, RP, role playing, Interactive Storytelling, generative AI, standalone, Lobby, Reception Area, Roleplay, Companion, dopamine hit'},

    { name: 'See You Latte',         group: 'Rooms',   path: './Standalone/SEE-YOU-LATTE/See-You-Latte-Rooms.html', local: true,    tags: 'Thomas Thompson, Tom, SYL, Cafe, Coffeehouses, Conversations, Room List, Chat Window' },

    { name: 'See You Latte',         group: 'Chats',   path: './Standalone/SEE-YOU-LATTE/See-You-Latte-Chats.html', local: true,    tags: 'Thomas Thompson, Tom, SYL, Conversations, chat environment' },

    { name: 'See You Latte',         group: 'Worldbuilding',   path: './Standalone/SEE-YOU-LATTE/See-You-Latte-World.html', local: true,    tags: 'Thomas Thompson, Tom, SYL' },

    { name: 'See You Latte',         group: 'Studio',   path: './Standalone/SEE-YOU-LATTE/See-You-Latte-Studio.html', local: true,    tags: 'Thomas Thompson, Tom, SYL, Cafe, Coffee, Coffeehouse, Casts, Assets, environment, history, Characters, worldbuilding, records, archives, characters vault' },

    { name: 'See You Latte',         group: 'Library',   path: './Standalone/SEE-YOU-LATTE/See-You-Latte-Library.html', local: true,    tags: 'Thomas Thompson, Tom, SYL, Cafe, Coffee, Coffeehouse, Safety Net, Reading Room, vault, add collection, logs, records, repositories, collections, stories, story archives, archive' },

    { name: 'See You Latte',         group: 'Meta',   path: './Standalone/SEE-YOU-LATTE/migrate-rooms-meta.html', local: true,    tags: 'Thomas Thompson, Tom, SYL, Rooms' },

    { name: 'LibraryHub',         group: 'App',   path: './Hubs/LibraryHub/LibraryHub.html',    tags: 'Books, Lobby, bookhouse, media center, add collection' },

    { name: 'LibraryHub',         group: 'Collections',   path: './Hubs/LibraryHub/LibraryHub-Collections.html',    tags: 'Books, Reading Room, Book Collections, archive, vault, records, bookhouse, media center' },

    { name: 'LibraryHub',         group: 'Reading Room',   path: './Hubs/LibraryHub/Reading_Room.html',    tags: 'Books, Reading Room, media center' },

    { name: 'CinemaHub',         group: 'App',   path: './Hubs/CinemaHub/CinemaHub.html',    tags: 'Movies, media center, theatre, film, add collection' },

    { name: 'CinemaHub',         group: 'Collections',   path: './Hubs/CinemaHub/CinemaHub-Collections.html',    tags: 'Movies, media center, film, movie collections, vault, records, archive, collections' },

    { name: 'FoodHub',         group: 'App',   path: './Hubs/FoodHub/FoodHub.html',    tags: 'Calorie counter, Food Log, Trackers, Meal Tracker, Nutrition Tracker, Daily Log, to log, Log Food, Log Meal, Food Intake, Anabolic, Audit, to log' },

    { name: 'FoodHub',         group: 'Food List',   path: './Hubs/FoodHub/food-list.html',    tags: 'Calorie counter, Food Log, Trackers, Meal Tracker, Nutrition Tracker, Lists, food categories, add collection, food records, food archives, food database' },

    { name: 'FoodHub',         group: 'Statistics',   path: './Hubs/FoodHub/food-statistics.html',    tags: 'Stats, to check, Charts, Graphs, Analytics, Analysis, nutrition database, Monthly Stats, Monthly Report, Monthly Review, Monthly Overview, Nutrition Analytics, Breakdown, Metrics, Progress Report' },

    { name: 'FoodHub',         group: 'History',   path: './Hubs/FoodHub/food-history.html',    tags: 'Calorie counter, Food Log, Trackers, Meal Tracker, Nutrition Tracker, food records, food database, Food History, Monthly Log, Records, Meal Entries, Daily Breakdown' },

    { name: 'InspoHub',         group: 'App',   path: './Hubs/InspoHub/InspoHub.html',    tags: 'new york, 2nd star, insparations, daily motivation, motivational videos, roadmap, to watch, add collection, reels collections, records, daily watch, NYC, my second star, ceo energy, database, archive, vault, dopamine hit' },

    { name: 'Sleep',         group: 'Tracker',   path: './Trackers/Sleep/LifeHub-tracker-sleep.html',    tags: 'daily logs, records, database, metrics, breakdown, to log, Sleep Debt, Charts, Graphs,nap, energy, sleep factors, battery log' },

    { name: 'Sleep',         group: 'Mobile Version',   path: './Trackers/Sleep/LifeHub-mobile-sleep.html',        tags: ' ' },

    { name: 'Hydration',         group: 'Tracker',   path: './Trackers/Hydration/LifeHub-tracker-hydration.html',    tags: 'daily logs, records, database, metrics, breakdown, to log, Charts, Graphs, fluids, water intake, 8 glasses' },

    { name: 'Hydration',         group: 'Mobile Version',   path: './Trackers/Hydration/LifeHub-mobile-hydration.html',        tags: ' ' },

    { name: 'FLO',         group: 'Tracker',   path: './Trackers/FLO/LifeHub-tracker-FLO.html',    tags: 'daily logs, records, database, metrics, breakdown, to log, Chart, Graph, Cycle phase engine, Period logging, Pill tracking, Cycle tracker, Ovulation tracker, fertility tracker, basal temp, Menstrual Phase, to check, calendar, sickness, symptoms log, medicine log, body check, health check, discharge tracker, stats' },

    { name: 'FLO',         group: 'Mobile Version',   path: './Trackers/FLO/LifeHub-mobile-flo.html',        tags: ' ' },

    { name: 'Home Upkeep',         group: 'Tracker',   path: './Trackers/Home-upkeep/LifeHub-tracker-home-upkeep.html',    tags: 'records, database, metrics, breakdown, to log, Charts, Graphs, stats, to check, chores, hygiene, sanitizers, sanitizing, laundry, Housework, Cleaning, Upkeep, Maintenance, Sanitation' },

    { name: 'Home Upkeep',         group: 'Mobile Version',   path: './Trackers/Home-upkeep/LifeHub-mobile-home-upkeep.html',        tags: ' ' },

    { name: 'Self Upkeep',         group: 'Tracker',   path: './Trackers/Self-upkeep/LifeHub-tracker-self-upkeep.html',    tags: 'daily logs, records, database, metrics, breakdown, to log, Charts, Graphs, stats, to check, hygiene, self care, miles care, family care, morning routines, night routine, hair care, facial care, skin care, dental care' },

    { name: 'Self Upkeep',         group: 'Mobile Version',   path: './Trackers/Self-upkeep/LifeHub-mobile-self-upkeep.html',        tags: ' ' },

    { name: 'Sims 4 HQ',         group: 'App',   path: './Standalone/Sims4_HQ/Sims4-HQ.html',    tags: 'Sims, The Sims, dopamine hit, games, gaming, lobby, mods, cc, custom content' },

    { name: 'Sims 4 HQ',         group: 'Mods',   path: './Standalone/Sims4_HQ/Sims4-Mods.html',    tags: 'Sims, The Sims, games, gaming, mods, mod list, cc, custom content, database, vault' },

    { name: 'Sims 4 HQ',         group: 'Mods Collections',   path: './Standalone/Sims4_HQ/Sims4-Mods-Collections.html',    tags: 'Sims, The Sims, games, gaming, mods, collections, add collection, cc, custom content, archive' },

    { name: 'Sims 4 HQ',         group: 'Old Gallery',   path: './Standalone/Sims4-HQ/OLD VERSIONS/Sims_4_Gallery -Version_14 - Gameplay Path.html',    tags: 'Sims, dopamine hit, games, tracker, database, vault, tracker, important, heavy, monolit, old version, gallery' },

    { name: 'Gemini Entry Counter',         group: 'Tool',   path: './Tools/Gemini-entry-counter/gemini-entry-counter.html',        tags: ' ' },

    { name: 'Poppy Engine Editor',         group: 'Tool',   path: './Tools/Poppy-engine-editor/PoppyEngine-Editor.html',        tags: ' ' },

    { name: 'Chronicle',         group: 'Tool',   path: './Tools/Chronicle/chronicle_v7.html', tags: 'advance worldbuilding, world building, editor, Zara Carlington' },

    { name: 'Word Book',         group: 'Tool',   path: './Tools/WordBook/WordBook.html', tags: 'personal dictionary, vault, database, to check' },

    { name: 'Icons & Fonts',         group: 'Tool',   path: './Tools/Icons&Fonts-tool/Icons&Fonts-tool.html', tags: 'icons, fonts, css helper, font awesome, typography, design' },

    { name: 'TagBook Editor',         group: 'Tool',   path: './Tools/WordBook/TagBook-editor.html' },

    { name: 'Fine Tuning Gemini Editor',         group: 'Tool',   path: './Tools/FineTuning-gemini-editor/gemini-json-builder.html' }

  ].filter(a => !(a.local && ON_WEB));

  /* ------------------------------------------------------------
     2) OPTIONS
     ------------------------------------------------------------ */
  const OPEN_IN = 'same';   // 'same' = navigate this window · 'new' = window.open
  const MAX_RESULTS = 10;
  const MIN_CHARS = 1;   // nothing renders until you've typed this many
  const ALLOW_MID_WORD = false;   // true = also match inside words (looser)
  const STORE_KEY = 'lifehub.search.freq';

  /* ------------------------------------------------------------
     3) STYLES
     ------------------------------------------------------------ */
  const CSS = `
  #lh-search{position:fixed;inset:0;z-index:9000;display:none;
    background:rgba(8,8,10,.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
  #lh-search.on{display:block}
  #lh-search .lh-wrap{position:absolute;left:50%;top:22vh;transform:translateX(-50%);
    width:min(620px,88vw);animation:lh-rise .18s ease-out}
  @keyframes lh-rise{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
  #lh-search .lh-bar{display:flex;align-items:center;gap:12px;padding:14px 18px;
    background:rgba(20,20,24,.82);border:1px solid rgba(255,255,255,.13);border-radius:14px;
    box-shadow:0 24px 60px rgba(0,0,0,.5)}
  #lh-search .lh-bar svg{width:20px;height:20px;flex:0 0 auto;fill:none;
    stroke:rgba(255,255,255,.55);stroke-width:1.8;stroke-linecap:round}
  #lh-search input{flex:1;background:none;border:0;outline:0;color:#fff;
    font:400 17px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:.2px}
  #lh-search input::placeholder{color:rgba(255,255,255,.35)}
  #lh-search .lh-list{margin-top:10px;max-height:46vh;overflow:auto;
    background:rgba(20,20,24,.82);border:1px solid rgba(255,255,255,.13);border-radius:14px;
    box-shadow:0 24px 60px rgba(0,0,0,.5)}
  #lh-search .lh-list:empty{display:none}
  #lh-search .lh-row{display:flex;align-items:baseline;gap:10px;padding:11px 18px;cursor:pointer;
    border-bottom:1px solid rgba(255,255,255,.05)}
  #lh-search .lh-row:last-child{border-bottom:0}
  #lh-search .lh-row.sel,#lh-search .lh-row:hover{background:rgba(255,255,255,.08)}
  #lh-search .lh-name{color:#fff;font:400 15px/1.3 system-ui,-apple-system,'Segoe UI',sans-serif}
  #lh-search .lh-name b{color:#fff;font-weight:700}
  #lh-search .lh-group{margin-left:auto;color:rgba(255,255,255,.4);
    font:400 11px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase}
  #lh-search .lh-empty{padding:14px 18px;color:rgba(255,255,255,.45);font:400 14px system-ui,sans-serif}
  `;

  /* ------------------------------------------------------------
     4) BUILD
     ------------------------------------------------------------ */
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'lh-search';
  root.innerHTML =
    '<div class="lh-wrap">' +
      '<div class="lh-bar">' +
        '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle>' +
        '<line x1="16.2" y1="16.2" x2="21" y2="21"></line></svg>' +
        '<input id="lh-search-input" type="text" spellcheck="false" autocomplete="off" placeholder="Search LifeHub\u2026">' +
      '</div>' +
      '<div class="lh-list" id="lh-search-list"></div>' +
    '</div>';
  document.body.appendChild(root);

  const input = root.querySelector('#lh-search-input');
  const list  = root.querySelector('#lh-search-list');
  let results = [], sel = 0;

  /* ------------------------------------------------------------
     5) FREQUENCY (recently/often used float to the top)
     ------------------------------------------------------------ */
  function freq() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  /* Counted per page. It used to be per name, so every "LifeHub" and
     every "PassHub" page shared one count and couldn't be told apart. */
  function bump(path) {
    try {
      const f = freq();
      f[path] = (f[path] || 0) + 1;
      localStorage.setItem(STORE_KEY, JSON.stringify(f));
    } catch (e) {}
  }

  /* ------------------------------------------------------------
     6) MATCHING — subsequence match on name, then tags
     ------------------------------------------------------------ */
  function score(app, q) {
    if (!q) return 1;
    const name  = app.name.toLowerCase();
    const parts = name.split(/[\s\-_]+/).filter(Boolean);
    const tags  = ((app.tags || '') + ' ' + (app.group || ''))
                    .toLowerCase().split(/[,\s]+/).filter(Boolean);

    const groupWords = (app.group || '').toLowerCase().split(/[\s\-_]+/).filter(Boolean);

    const words = q.split(/[,\s]+/).filter(Boolean);
    let total = 0;

    for (const w of words) {
      let best = 0;

      if (name === w) best = 2000;                    // exact name
      else if (name.startsWith(w)) best = 1200;       // start of the whole name

      if (!best) {                                    // start of any word in the name
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].startsWith(w)) { best = 900 - i * 80; break; }
        }
      }

      // The page's own label ("Trackers", "Remote") before its tags, so
      // "trackers" finds the Trackers page ahead of every page merely
      // tagged with the word.
      if (!best) {
        for (const g of groupWords) {
          if (g === w) { best = 700; break; }
          if (g.startsWith(w)) best = Math.max(best, 600);
        }
      }

      if (!best) {                                    // tags
        for (const t of tags) {
          if (t === w) { best = 500; break; }
          if (t.startsWith(w)) { best = Math.max(best, 400); }
        }
      }

      if (!best && ALLOW_MID_WORD) {                  // loose fallback, off by default
        if (name.includes(w)) best = 200;
        else if (tags.some(t => t.includes(w))) best = 120;
      }

      if (!best) return 0;
      total += best;
    }
    return total / words.length;
  }

  function render() {
    const q = input.value.trim().toLowerCase();
    if (q.length < MIN_CHARS) { results = []; sel = 0; list.innerHTML = ''; return; }
    const f = freq();
    results = APPS
      .map(a => ({ app: a, s: score(a, q) }))
      .filter(r => r.s > 0)
      .sort((x, y) => (y.s - x.s) || ((f[y.app.path] || 0) - (f[x.app.path] || 0)) || x.app.name.localeCompare(y.app.name))
      .slice(0, MAX_RESULTS)
      .map(r => r.app);

    sel = 0;
    if (!results.length) {
      list.innerHTML = '<p class="lh-empty">Nothing matches that.</p>';
      return;
    }
    list.innerHTML = results.map((a, i) =>
      '<div class="lh-row' + (i === 0 ? ' sel' : '') + '" data-i="' + i + '">' +
        '<span class="lh-name">' + highlight(a.name, q) + '</span>' +
        '<span class="lh-group">' + (a.group || '') + '</span>' +
      '</div>'
    ).join('');
  }

  function highlight(name, q) {
    if (!q) return name;
    q = q.split(/[,\s]+/).filter(Boolean)[0] || '';
    const i = name.toLowerCase().indexOf(q);
    if (i < 0) return name;
    return name.slice(0, i) + '<b>' + name.slice(i, i + q.length) + '</b>' + name.slice(i + q.length);
  }

  function move(d) {
    if (!results.length) return;
    sel = (sel + d + results.length) % results.length;
    list.querySelectorAll('.lh-row').forEach((el, i) => el.classList.toggle('sel', i === sel));
    const row = list.querySelector('.lh-row.sel');
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  /* ------------------------------------------------------------
     7) LAUNCH
     ------------------------------------------------------------ */
  function launch(app) {
    if (!app) return;
    bump(app.path);
    close();
    if (OPEN_IN === 'new') window.open(app.path, '_blank');
    else window.location.href = app.path;
  }

  /* ------------------------------------------------------------
     8) OPEN / CLOSE
     ------------------------------------------------------------ */
  function open() {
    root.classList.add('on');
    input.value = '';
    render();
    setTimeout(() => input.focus(), 0);
  }
  function close() {
    root.classList.remove('on');
    input.blur();
  }

  const btn = document.getElementById('btn-search');
  if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); open(); });

  root.addEventListener('mousedown', function (e) {
    if (!e.target.closest('.lh-wrap')) close();
  });

  list.addEventListener('click', function (e) {
    const row = e.target.closest('.lh-row');
    if (row) launch(results[+row.dataset.i]);
  });

  input.addEventListener('input', render);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter')  { e.preventDefault(); launch(results[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });

  // Expose, in case Poppy should be able to open it later
  window.LifeHubSearch = { open: open, close: close, apps: APPS };
})();

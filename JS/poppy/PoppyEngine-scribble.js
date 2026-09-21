/* LifeHub — Poppy's write layer.
   ────────────────────────────────────────────────────────────────
   Everything Poppy can DO outside the wallpaper lives here.

   LifeHub-homescreen.js owns LIFEHUB_ACTIONS and its four wallpaper actions
   (lock, next, paint, theme). This file wraps that object rather
   than editing it, so LifeHub-homescreen.js stays closed and every new app
   is a block added below.

   Load LAST, after JS/homescreen/LifeHub-homescreen.js — it needs
   LIFEHUB_ACTIONS to already exist.

   ── ADDING AN ACTION ─────────────────────────────────────────────
   Add an entry to ACTIONS. Each one is:

     spec   the lines shown to Poppy so she knows it exists
     run    what actually happens; returns the chip label

   `run` may be async. Throw an Error to refuse — the message is
   shown to Jen as-is, so write it for her, not for a log.
*/

(function () {

  const prior = window.LIFEHUB_ACTIONS;
  if (!prior || typeof prior.describe !== "function") {
    console.error("[Poppy actions] LIFEHUB_ACTIONS missing — load this after LifeHub-homescreen.js.");
    return;
  }

  /* ══════════════════════════════════════════════════════
     Finding a project by the name Jen said
     ══════════════════════════════════════════════════════
     POPPY_FETCH.ids was filled moments ago by the buckets read
     that ran before this message was sent, so this is a lookup
     against fresh data rather than another round trip.

     Matching widens in steps and stops at the first that hits,
     so an exact name can never be beaten by a loose one. */
  function findProject(said) {
    const map = (window.POPPY_FETCH && window.POPPY_FETCH.ids) || {};
    const names = Object.keys(map);

    if (!names.length) {
      /* ── REWORDED 2026-09-18 ──────────────────────────────────
         Was "I couldn't read your Scribble projects just now",
         which covered two unrelated situations and helped with
         neither.

         Being locked out is no longer one of them: run() checks
         the passage before any action gets here and refuses with
         its own sentence, so by this line access is established.
         What is left is a read that returned nothing — the list
         is genuinely empty, or the buckets read that fills
         POPPY_FETCH.ids did not run this turn. */
      throw new Error(
        "I can get into Scribble, but no project list reached me this " +
        "turn. If you have projects, ask me once more — the list is " +
        "read fresh each time. If that keeps happening, the read is " +
        "failing rather than the sign-in.");
    }

    const want = String(said || "").trim().toLowerCase();
    if (!want) throw new Error("Which project?");

    if (map[want]) return map[want];

    let hits = names.filter(n => n.startsWith(want));
    if (!hits.length) hits = names.filter(n => n.includes(want));

    /* Initials: "syl" → "see you latte" */
    if (!hits.length && want.length >= 2 && !want.includes(" ")) {
      hits = names.filter(n => {
        const initials = n.split(/\s+/).map(w => w[0]).join("");
        return initials === want;
      });
    }

    if (hits.length === 1) return map[hits[0]];
    if (hits.length > 1) {
      throw new Error("That matches " + hits.length + " projects — which one?");
    }
    throw new Error("I couldn't find a project called \u201C" + said + "\u201D.");
  }

  function scribbleDb() {
    if (!window.POPPY_FETCH || typeof window.POPPY_FETCH.db !== "function") {
      throw new Error("Poppy's Firebase layer isn't loaded.");
    }
    return window.POPPY_FETCH.db("scribble");
  }

  /* ══════════════════════════════════════════════════════
     THE PASSAGE — added 2026-09-18

     Scribble's rules refuse anyone without a session. This
     page has one only because Scribble leaves a copy of
     yours behind under the app name "scribble", and Firebase
     needs a moment after load to find that copy.

     ── WHY THIS IS HERE AND NOT SOMEWHERE TIDIER ────────
     Before today the wait lived in ONE place:
     LifeHub-poppy-firebase-fetch.js, on the READ path. The
     writes below never waited at all.

     Most of them got away with it by accident. They call
     findProject(), which reads POPPY_FETCH.ids — filled by
     the buckets read that already did the waiting. So the
     session was always there by the time they looked.

     scribble_create was the exception. It names no existing
     project, so it never calls findProject, so on a cold
     page it could outrun the session restore and be refused
     — and a refused write reads exactly like a write that
     had no session at all. Rare, silent, and confusing.

     ── WHY AT run() AND NOT IN EACH ACTION ──────────────
     Putting it in the one place every action passes through
     means a new action cannot forget it. ready() is memoised
     per app name and settles once, so every call after the
     first is free — this costs nothing to leave switched on.

     Resolves to null when there is no session (signed out,
     or the passage removed). We do not throw on that: the
     write goes out, Firestore refuses it, and the refusal is
     Scribble's own words rather than a guess made here.

     See: JS/poppy/LifeHub-poppy-scribble-passage.js
          Hubs/Scribble/js/scribble-passage.js
  ══════════════════════════════════════════════════════ */
  function passageReady(actionName) {
    /* ui_* actions talk to whatever screen is open through the
       poppy project — a different Firebase project entirely,
       which the passage has nothing to do with. */
    if (String(actionName || "").indexOf("scribble_") !== 0) {
      return Promise.resolve({ ok: true, why: "not-scribble" });
    }

    if (!window.LIFEHUB_SCRIBBLE_PASSAGE) {
      return Promise.resolve({ ok: false, why: "no-passage" });
    }

    /* Building the Firestore handle is also what creates the named
       app the session belongs to, so this has to come first. */
    let app;
    try { app = scribbleDb().app; }
    catch (e) { return Promise.resolve({ ok: false, why: "no-firebase" }); }

    return window.LIFEHUB_SCRIBBLE_PASSAGE.ready(app)
      .then(user => user
        ? { ok: true,  why: "open", who: user.email || user.uid }
        : { ok: false, why: "no-session" })
      .catch(() => ({ ok: false, why: "no-session" }));
  }


  /* ══════════════════════════════════════════════════════
     SAYING WHICH DOOR IS SHUT — added 2026-09-18

     ── THE PROBLEM ──────────────────────────────────────
     Every way of being locked out used to arrive as the
     same shrug. "I couldn't read your Scribble projects
     just now." "That didn't work." "I can't tell which
     screen you're on." All true, none of them actionable,
     and all three have completely different fixes.

     There are THREE separate doors and they fail apart:

       1. Scribble's own data (lifehub---scribble).
          Shut when no session copy reached this page.
          Fix: sign in at Scribble's gate, reload here.

       2. The command channel (poppy-e510a).
          A different Firebase project, unaffected by 1.
          Shut when its rules refuse the surface write or
          the commands listener.
          Fix: the corner dot on the Scribble page says so.

       3. The page itself.
          Channel fine, but nothing is listening — Scribble
          is closed, or on another device.
          Fix: open the page and try again.

     Being told the wrong one costs an afternoon: fixing a
     session that was never the problem while the channel
     sits refused. So each answer names its own door and
     what to do about it, and never guesses between them.
  ══════════════════════════════════════════════════════ */

  /* Firestore's refusal, in the two shapes it arrives in. Checked by
     code first — the message is human text and may be localised. */
  function isDenied(err) {
    if (!err) return false;
    if (err.code === "permission-denied" ||
        err.code === "PERMISSION_DENIED") return true;
    const m = String(err.message || "").toLowerCase();
    return m.indexOf("insufficient permissions") !== -1 ||
           m.indexOf("permission-denied")        !== -1 ||
           m.indexOf("permission denied")        !== -1;
  }

  /* Door 1. The same sentence wherever Scribble's data is refused, so
     the fix does not depend on which command happened to hit it. */
  function scribbleLockedOut(why) {
    if (why === "no-firebase") {
      return "Poppy's Firebase layer isn't loaded on this screen, so I " +
             "can't reach Scribble at all. Reload the home screen.";
    }
    if (why === "no-passage") {
      return "I have no way in to Scribble from here — the passage script " +
             "isn't on this page. It's LifeHub-poppy-scribble-passage.js, " +
             "and it needs firebase-auth-compat.js loaded with it.";
    }
    return "I don't have access to Scribble right now. Your archive only " +
           "opens for the account that owns it, and no session of yours " +
           "has reached me. Open Scribble, sign in at the gate, then " +
           "reload this screen and ask me again. " +
           "To check it yourself: SCRIBBLE_PASSAGE.check() on a Scribble " +
           "page says whether a session was handed out, and " +
           "LIFEHUB_SCRIBBLE_PASSAGE.check() here says whether it arrived.";
  }

  /* Door 2. Nothing the passage does can help this one — different
     Firebase project, and nothing signs in to it at all. */
  function channelLockedOut() {
    return "I can see what to do but I can't send it. My own command " +
           "channel is refusing me — that's a different Firebase project " +
           "from your archive, so this isn't your Scribble sign-in. " +
           "The dot in the corner of the Scribble page tells you which: " +
           "amber means the channel is down, green means it's fine.";
  }

  /* Door 3. The channel works; nobody is listening on it. */
  function pageNotListening(appName) {
    return (appName || "That screen") + " isn't answering. It has to be " +
           "open on this device for me to act on it — if it is open, the " +
           "corner dot will be green. Grey means the page isn't live.";
  }

  /* Scribble's own togglePin writes exactly this one field — mirrored
     here so a pin from Poppy and a pin from the app are the same
     write, and the open page picks it up through its own listener. */
  async function setPinned(said, pinned) {
    const p = findProject(said);

    if (p.deleted)  throw new Error("\u201C" + p.name + "\u201D is in the bin.");
    if (p.archived) throw new Error("\u201C" + p.name + "\u201D is archived.");

    if (p.pinned === pinned) {
      return p.name + (pinned ? " is already pinned" : " wasn't pinned");
    }

    await scribbleDb().collection("projects").doc(p.id).update({ pinned: pinned });
    return (pinned ? "Pinned " : "Unpinned ") + p.name;
  }


  /* Mirrors createProject() in scribble-firebase.js: same fields,
     the projectId back-write, a project log line and a global log line.
     Anything less and the project looks subtly different from one made
     by hand on the page. */
  async function createProject(name, description){
    const clean = String(name == null ? "" : name).trim();
    if (!clean) throw new Error("I need a name for it.");

    const db = scribbleDb();

    /* ── NAME CLASH, added 2026-09-18 ──────────────────────
       This was missing, and the comment above claimed the
       function mirrored the page "exactly" while the page
       refused duplicates and this did not. Poppy could make
       a second "LifeHub" that the page would never have let
       you type.

       Project names are scoped GLOBALLY — one read of
       projects covers live, archived AND binned, because a
       soft delete leaves the document where it is and only
       sets a flag. Matching is case-blind and nothing else,
       exactly as normName() does it in scribble-db.js.

       Mirrors findProjectByName() in scribble-firebase.js. */
    const target = clean.toLowerCase();
    const all    = await db.collection("projects").get();
    for (const d of all.docs) {
      const data = d.data() || {};
      if (String(data.name || "").trim().toLowerCase() !== target) continue;
      const where = data.deleted  ? " — it's in the bin"
                  : data.archived ? " — it's archived"
                  : "";
      throw new Error("There's already a project called “" +
                      (data.name || clean) + "”" + where + ".");
    }

    /* ── TIMESTAMPS, corrected 2026-09-18 ──────────────────
       Was a bare serverTimestamp() on all four stamps below.
       serverTimestamp() reads back NULL until the write
       reaches Firestore, so Scribble writes every stamp as a
       PAIR — the server clock plus a local millisecond
       companion — and reads it with whenMs(). See nowFields()
       in Hubs/Scribble/js/scribble-db.js.

       Without the companion a project made from Poppy while
       offline showed a date of "—" and sorted as the oldest
       thing Jen owns, because updatedAtMs() had nothing to
       read. The same correction was made to every other
       write in this file — see stampFields() below. */
    const ms = Date.now();

    const ref = await db.collection("projects").add(Object.assign({
      name:        clean,
      description: String(description == null ? "" : description).trim(),
      pinned:      false,
      pinnedAt:    null
    }, stampFields("createdAt", ms), stampFields("updatedAt", ms)));

    await ref.update({ projectId: ref.id });

    await db.collection("projects").doc(ref.id).collection("logs").add(
      Object.assign({ action: "Created the project." }, stampFields("timestamp", ms)));

    await db.collection("logs").add(
      Object.assign({ filename: clean }, stampFields("timestamp", ms)));

    return "Created " + clean;
  }


  /* ══════════════════════════════════════════════════════
     Shared plumbing for the rest of the actions
     ══════════════════════════════════════════════════════ */

  /* Every one of Scribble's own writes stamps the server clock, never
     the browser's. Jen's machines disagree by a few seconds and the
     landing page sorts on updatedAt — a local clock would reorder her
     cards for no reason. */
  function stamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  /* ── THE LOCAL COMPANION, added 2026-09-18 ──────────────
     stamp() alone is only half of what Scribble writes.

     serverTimestamp() reads back NULL until the write
     actually reaches Firestore, so every stamp on the page
     side goes down as a PAIR — the server clock plus a plain
     millisecond number written here and now — and is read
     back with whenMs(), which takes the server value when it
     has landed and the companion until it does. That is
     nowFields() in Hubs/Scribble/js/scribble-db.js.

     Everything in this file wrote the bare server value, so
     anything Poppy touched while offline had a date of "—"
     and sorted as the oldest thing Jen owns.

     Worse than the dates: a rename from Poppy used to write
     a bare updatedAt over a pair, leaving the stale
     updatedAtLocalMs of the PREVIOUS write beside it. The
     card would then sort by a time that had already passed.

     `ms` is passed in where one action stamps several fields,
     so they agree with each other exactly rather than by a
     millisecond or two. */
  function stampFields(field, ms) {
    const o = {};
    o[field]             = stamp();
    o[field + "LocalMs"] = (ms == null ? Date.now() : ms);
    return o;
  }

  function projects() { return scribbleDb().collection("projects"); }

  /* Both log lines, exactly as writeProjectLog/writeGlobalLog do them.
     A project changed by Poppy has to leave the same trail as one
     changed by hand, or the activity log quietly becomes a log of
     everything-except-Poppy. */
  async function logProject(pid, action) {
    await projects().doc(pid).collection("logs").add(
      Object.assign({ action: action }, stampFields("timestamp")));
  }

  async function logGlobal(filename) {
    await scribbleDb().collection("logs").add(
      Object.assign({ filename: filename }, stampFields("timestamp")));
  }

  /* Mirrors buildPathFb: "LIFEHUB/CSS/lifehub.css". The `seen` set is
     hers and it matters — a section whose parent chain loops would
     otherwise hang the whole delete. */
  function buildPath(projectName, parentId, allItems, selfName) {
    const parts = [];
    let currentId = parentId;
    const seen = new Set();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const anc = allItems.find(x => x.id === currentId);
      if (!anc) break;
      parts.unshift(anc.name || "Untitled");
      currentId = anc.parentId || null;
    }
    const chain = [projectName].concat(parts);
    if (selfName) chain.push(selfName);
    return chain.join("/");
  }

  /* Mirrors buildParentChainFb: typed ancestors, project root first. */
  function buildParentChain(projectId, projectName, targetParentId, allItems) {
    const parts = [];
    let currentId = targetParentId;
    const seen = new Set();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const anc = allItems.find(x => x.id === currentId);
      if (!anc) break;
      parts.unshift({ id: anc.id, name: anc.name || "Untitled", type: anc._type });
      currentId = anc.parentId || null;
    }
    return [{ id: projectId, name: projectName, type: "PROJECT" }].concat(parts);
  }

  /* The three content subcollections, read together. Used by delete,
     duplicate and merge — all three need the same picture. */
  async function readContents(pid) {
    const base = projects().doc(pid);
    const [mods, secs, files] = await Promise.all([
      base.collection("modules").get(),
      base.collection("sections").get(),
      base.collection("files").get()
    ]);
    const grab = (snap, subcol, type) => snap.docs.map(d =>
      Object.assign({ id: d.id, _subcol: subcol, _type: type }, d.data()));
    return {
      modules:  grab(mods,  "modules",  "MODULE"),
      sections: grab(secs,  "sections", "SECTION"),
      files:    grab(files, "files",    "FILE")
    };
  }


  /* ══════════════════════════════════════════════════════
     The writes
     ══════════════════════════════════════════════════════ */

  async function renameProject(said, newName) {
    const p = findProject(said);
    const clean = String(newName == null ? "" : newName).trim();

    if (!clean) throw new Error("What should I rename it to?");
    if (p.deleted)  throw new Error("\u201C" + p.name + "\u201D is in the bin.");
    if (clean === p.name) return p.name + " is already called that";

    await projects().doc(p.id).update(
      Object.assign({ name: clean }, stampFields("updatedAt")));
    await logProject(p.id, "Rename: '" + p.name + "' to '" + clean + "'");
    await logGlobal(clean);

    return "Renamed " + p.name + " to " + clean;
  }


  async function setDescription(said, description) {
    const p = findProject(said);
    if (p.deleted) throw new Error("\u201C" + p.name + "\u201D is in the bin.");

    /* An empty string is a legitimate instruction — she may be clearing
       one. Only a missing field is a refusal. */
    if (description == null) throw new Error("What should the description say?");

    await projects().doc(p.id).update(Object.assign({
      description: String(description).trim()
    }, stampFields("updatedAt")));
    await logProject(p.id, "Updated project description.");

    return "Updated " + p.name + "'s description";
  }


  /* Mirrors duplicateProject: the copy carries the content and the log
     history, but not the pin — a duplicate arriving pre-pinned to the
     top of the page is not what anyone means by "duplicate". */
  async function duplicateProject(said) {
    const p = findProject(said);
    if (p.deleted) throw new Error("\u201C" + p.name + "\u201D is in the bin.");

    const src = await projects().doc(p.id).get();
    if (!src.exists) throw new Error("\u201C" + p.name + "\u201D no longer exists.");
    const data = src.data();
    const copyName = (data.name || "Project") + " (copy)";

    const copyMs = Date.now();
    const ref = await projects().add(Object.assign({
      name:        copyName,
      description: data.description || "",
      pinned:      false,
      pinnedAt:    null
    }, stampFields("createdAt", copyMs), stampFields("updatedAt", copyMs)));
    await ref.update({ projectId: ref.id });

    const contents = await readContents(p.id);
    for (const sub of ["modules", "sections", "files"]) {
      for (const item of contents[sub]) {
        const row = Object.assign({}, item);
        delete row.id; delete row._subcol; delete row._type;
        row.projectId = ref.id;
        await projects().doc(ref.id).collection(sub).add(row);
      }
    }

    const logs = await projects().doc(p.id).collection("logs").get();
    for (const d of logs.docs) {
      await projects().doc(ref.id).collection("logs").add(d.data());
    }

    await logProject(ref.id, "Duplicated from '" + (data.name || "Project") + "'.");
    await logGlobal(copyName);

    return "Duplicated " + p.name;
  }


  /* Mirrors archiveProject. The archive row carries its own copy of the
     name and description, so the shelf still reads correctly if the
     project is later renamed or emptied. */
  async function archiveProject(said, note) {
    const p = findProject(said);

    /* The index is only as fresh as the last buckets read. For a write
       that can't be undone by repeating it, that isn't good enough —
       so the state is re-read from the document itself. */
    const snap = await projects().doc(p.id).get();
    if (!snap.exists) throw new Error("That project no longer exists.");
    const data = snap.data();

    if (data.deleted)  throw new Error("\u201C" + p.name + "\u201D is in the bin.");
    if (data.archived) throw new Error("\u201C" + p.name + "\u201D is already archived.");

    /* One millisecond for the whole action, so the archive row,
       the project flag and the log line all agree exactly. */
    const ms = Date.now();

    await scribbleDb().collection("archive").add(Object.assign({
      type: "PROJECT", itemId: p.id, projectId: p.id,
      projectName: data.name || "Project", parentId: null,
      groupId: p.id, groupSize: 1,
      name: data.name || "Project", fileType: null, colour: data.colour || null,
      isSymlink: false, originalPath: "All Projects",
      note: note || "",
      data: { name: data.name || "", description: data.description || "" }
    }, stampFields("archivedAt", ms)));

    await projects().doc(p.id).update(
      Object.assign({ archived: true }, stampFields("archivedAt", ms)));

    /* Her own archive writes a schema-2 log line, not the plain one.
       Wrapped because a failed log must not leave the project shelved
       but un-logged — and hers swallows it the same way. */
    try {
      await projects().doc(p.id).collection("logs").add(Object.assign({
        action: "Project archived.", kind: "archive", weight: 3,
        actorId: "local", actorName: "Poppy", actorSurface: "wallpaper",
        schema: 2
      }, stampFields("timestamp", ms)));
    } catch (err) { /* shelved is what matters */ }

    return "Archived " + p.name;
  }


  /* Mirrors softDeleteProject. Every item gets its own bin row carrying
     the path it came from, because that is the only record of where to
     put it back — the item's own document keeps only a parentId, and by
     restore time its ancestors may be gone too. */
  async function binProject(said) {
    const p = findProject(said);

    const snap = await projects().doc(p.id).get();
    if (!snap.exists) throw new Error("That project no longer exists.");
    const data = snap.data();
    if (data.deleted) throw new Error("\u201C" + p.name + "\u201D is already in the bin.");

    const name = data.name || "Unknown";
    /* One millisecond for the whole delete. Restore groups rows by
       groupId, but the bin LISTS them by deletedAt — so rows a few
       milliseconds apart would straddle a sort and show one delete
       as two. */
    const ms   = Date.now();
    const bin  = scribbleDb().collection("bin");

    const c = await readContents(p.id);
    const allItems = c.modules.concat(c.sections, c.files).filter(x => !x.deleted);
    const groupSize = 1 + allItems.length;

    await bin.add(Object.assign({
      type: "PROJECT", itemId: p.id, projectId: p.id, projectName: name,
      parentId: null, groupId: p.id, name: name,
      fileType: null, colour: null,
      originalPath: name,
      parentChain: [],
      groupSize: groupSize,
      data: {
        name: data.name || "", description: data.description || "",
        pinned: data.pinned || false, projectId: data.projectId || p.id,
        createdAt: data.createdAt || null, updatedAt: data.updatedAt || null
      }
    }, stampFields("deletedAt", ms)));

    for (const item of allItems) {
      await bin.add(Object.assign({
        type: item._type, itemId: item.id, projectId: p.id, projectName: name,
        parentId: item.parentId || null, groupId: p.id,
        name: item.name || "Untitled",
        fileType: item._type === "FILE" ? (item.type || null) : null,
        colour: item.colour || null,
        originalPath: buildPath(name, item.parentId, allItems, item.name || "Untitled"),
        parentChain: buildParentChain(p.id, name, item.parentId, allItems),
        groupSize: groupSize,
        data: {
          name: item.name || "", description: item.description || "",
          parentId: item.parentId || null,
          createdAt: item.createdAt || null, updatedAt: item.updatedAt || null,
          type: item.type || null, colour: item.colour || null
        }
      }, stampFields("deletedAt", ms)));
      await projects().doc(p.id).collection(item._subcol).doc(item.id)
        .update(Object.assign({ deleted: true }, stampFields("deletedAt", ms)));
    }

    await projects().doc(p.id).update(
      Object.assign({ deleted: true }, stampFields("deletedAt", ms)));
    await logProject(p.id, "Moved to recycle bin" +
      (groupSize > 1 ? " (" + groupSize + " items total)" : "") + ".");
    await logGlobal(name);

    return "Moved " + name + " to the bin" +
           (groupSize > 1 ? " (" + groupSize + " items)" : "");
  }


  /* Mirrors mergeProjects — and this is the one that does not soft-delete.
     The source project is removed outright at the end, exactly as hers is.
     There is no bin entry and no undo, so the guards below are the only
     thing between a misheard project name and losing a project. */
  async function mergeProjects(sourceSaid, targetSaid, newName) {
    const src = findProject(sourceSaid);
    const tgt = findProject(targetSaid);

    if (src.id === tgt.id) throw new Error("That's the same project twice.");

    /* Both documents are re-read before a single write happens. This one
       ends by deleting the source outright, so every reason to refuse has
       to be found while refusing still costs nothing. */
    const [srcDoc, tgtDoc] = await Promise.all([
      projects().doc(src.id).get(),
      projects().doc(tgt.id).get()
    ]);
    if (!srcDoc.exists || !tgtDoc.exists) throw new Error("One of those no longer exists.");

    const srcData = srcDoc.data(), tgtData = tgtDoc.data();
    if (srcData.deleted  || tgtData.deleted)  throw new Error("One of those is in the bin.");
    if (srcData.archived || tgtData.archived) throw new Error("One of those is archived.");

    const srcName = srcData.name || "Unknown";

    const srcContents = await readContents(src.id);
    const tgtContents = await readContents(tgt.id);

    /* Two modules of the same name would silently sit on top of each
       other in the tree, so a clashing name gets numbered instead. */
    const taken = new Set(tgtContents.modules.map(m => (m.name || "").toLowerCase()));
    function resolveConflict(name) {
      if (!taken.has(name.toLowerCase())) { taken.add(name.toLowerCase()); return name; }
      let i = 2, n = name + " (2)";
      while (taken.has(n.toLowerCase())) { i++; n = name + " (" + i + ")"; }
      taken.add(n.toLowerCase());
      return n;
    }

    const tgtRef = projects().doc(tgt.id);

    /* Modules first, then sections, then files — each level's new ids
       have to exist before the level below can point at them. */
    const idMap = {};
    for (const mod of srcContents.modules) {
      const row = Object.assign({}, mod);
      delete row.id; delete row._subcol; delete row._type;
      row.name = resolveConflict(mod.name || "module");
      row.projectId = tgt.id;
      const ref = await tgtRef.collection("modules").add(row);
      idMap[mod.id] = ref.id;
    }

    const secMap = {};
    for (const sec of srcContents.sections) {
      const row = Object.assign({}, sec);
      delete row.id; delete row._subcol; delete row._type;
      row.parentId  = idMap[sec.parentId] || sec.parentId || null;
      row.projectId = tgt.id;
      const ref = await tgtRef.collection("sections").add(row);
      secMap[sec.id] = ref.id;
    }

    for (const file of srcContents.files) {
      const row = Object.assign({}, file);
      delete row.id; delete row._subcol; delete row._type;
      row.parentId  = idMap[file.parentId] || secMap[file.parentId] || file.parentId || null;
      row.projectId = tgt.id;
      await tgtRef.collection("files").add(row);
    }

    const logs = await projects().doc(src.id).collection("logs").get();
    for (const d of logs.docs) {
      await tgtRef.collection("logs").add(d.data());
    }

    const merged = String(newName == null ? "" : newName).trim();
    if (merged) {
      await tgtRef.update(Object.assign({ name: merged }, stampFields("updatedAt")));
      await logProject(tgt.id, "Renamed to '" + merged + "' after merge from '" + srcName + "'.");
    }

    await logProject(tgt.id, "Merged from project '" + srcName + "'.");
    await tgtRef.update(stampFields("updatedAt"));
    await logGlobal(merged || srcName);

    await projects().doc(src.id).delete();

    return "Merged " + srcName + " into " + (merged || tgt.name);
  }


  /* ══════════════════════════════════════════════════════
     ACTIONS
     ══════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════
     UI COMMANDS — the channel to the Scribble page
     ══════════════════════════════════════════════════════
     Everything above this writes data, and Scribble's own onSnapshot
     listeners redraw on their own. Opening a modal is different: there
     is no data to change, so there is nothing for a listener to notice.

     So a command becomes a document. Poppy drops one in `commands`,
     the open Scribble page picks it up, calls the function, and writes
     back whether it worked. Nothing is called across windows directly —
     the wallpaper and the page never share a JavaScript context.

     Poppy WAITS for that write-back rather than assuming. Surface
     detection says Scribble was open ninety seconds ago; the ack says
     it is open now, and it's the only one of the two that can be
     wrong in the safe direction. No ack means Jen is told the page
     isn't open, instead of a cheerful "Opened it" over a closed app.

     LifeHub-surface.js owns the channel and carries the guards; the
     Scribble page just registers what it can do. */

  const ACK_TIMEOUT_MS = 4000;

  /* The four modals all hang off a project and all take its id. They
     also all read from the page's live project list, which excludes
     archived and binned ones — so a modal asked for on either would
     open empty. Refusing here gives Jen a reason instead.

     These ride the same device-addressed channel as close and confirm.
     Scribble used to run a second listener on its own project, which
     meant two copies of the age guards, the claim set and the ack
     protocol. One channel, one set of rules. */
  async function openProjectModal(said, action, verb) {
    const p = findProject(said);
    if (p.deleted)  throw new Error("\u201C" + p.name + "\u201D is in the bin.");
    if (p.archived) throw new Error("\u201C" + p.name + "\u201D is archived.");

    await uiCommand(action, verb, { projectId: p.id, projectName: p.name });
    return verb + " for " + p.name;
  }


  /* ══════════════════════════════════════════════════════
     UI COMMANDS to whichever screen Jen is looking at
     ══════════════════════════════════════════════════════
     The Scribble commands above go to Scribble's own project, because
     they name a Scribble project id. Close and save name nothing —
     they act on whatever is in front of her, in any app. So they ride
     the poppy project instead, addressed to the one device the surface
     read picked, and every page carrying LifeHub-surface.js can answer.

     Addressed, not broadcast. Two screens open means two pages
     listening, and a close that shut both would be its own bug. */
  function uiCommand(action, label, payload) {
    const live = window.POPPY_FETCH && window.POPPY_FETCH.active;
    if (!live || !live.device) {
      /* ── WHY THIS IS NOT "I can't tell which screen you're on" ────
         Added 2026-09-18. That was true and useless: it sounds like
         Jen is on the wrong page, when the usual cause is that no
         page could WRITE its surface record at all — the same rules
         that would refuse the command. One symptom, two causes, and
         the old wording pointed at neither. */
      throw new Error(
        "No screen has told me it's open. Either nothing with LifeHub " +
        "on it is running, or my channel is refusing their check-ins — " +
        "the corner dot says which: grey means the page isn't live, " +
        "amber means the channel is down.");
    }

    const db = window.POPPY_FETCH.db("poppy");
    const doc = Object.assign({
      action: action,
      device: live.device,
      status: "pending",
      at:     Date.now()
    }, payload || {});

    /* The send itself can be refused — this is the poppy project, which
       nothing signs in to, so its rules are the one thing standing
       between a correct command and silence. Caught here so it reads as
       a shut door rather than a Firestore string. */
    return db.collection("commands").add(doc).catch(err => {
      if (isDenied(err)) throw new Error(channelLockedOut());
      throw err;
    }).then(ref => {
      return new Promise((resolve, reject) => {
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          stop();
          ref.delete().catch(() => {});
          reject(new Error(pageNotListening(live.app)));
        }, ACK_TIMEOUT_MS);

        const stop = ref.onSnapshot(snap => {
          const d = snap.data();
          if (!d || d.status === "pending" || settled) return;
          settled = true;
          clearTimeout(timer);
          stop();
          ref.delete().catch(() => {});
          /* ── THE PAGE MAY HAVE ANSWERED ──────────────────────
             Added 2026-09-17, alongside the change in
             LifeHub-surface.js that lets a handler return a string.

             `result` is the page's own sentence and it always wins
             over the generic label: a locate has something specific
             to say ("Drafts / Chapter 2 / notes.txt · ref f3K9qL"),
             a sort does not. Read BEFORE ref.delete() below, which
             is why this branch does not reorder. */
          if (d.status === "done") {
            resolve(d.result
              ? d.result
              : label + (live.app ? " in " + live.app : ""));
          }
          else reject(new Error(d.error || "That didn't work."));
        }, err => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          /* Losing the ack listener is the channel, not the page: the
             command may well have been delivered and run. Say that
             rather than implying nothing happened. */
          reject(new Error(isDenied(err)
            ? channelLockedOut()
            : "I lost the line to that screen before it answered, so I " +
              "can't tell you whether it went through. Check the page."));
        });
      });
    });
  }


  /* ══════════════════════════════════════════════════════
     ACTIONS
     ══════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════
     ASKING OUTRIGHT — added 2026-09-18
     "Can you get into Scribble?"

     The refusals above only speak when something is already
     being attempted. This is for the other moment: before
     asking for anything, or after a run of odd answers, when
     the question is simply whether the doors are open.

     Reports all three separately and never merges them —
     door 1 open and door 2 shut is the normal state while
     poppy-e510a's rules are unresolved, and a single
     yes/no would hide exactly that.

     Proves door 1 rather than asserting it: it says how many
     projects it can actually see. A claim of access that
     cannot name a number is not worth much.
  ══════════════════════════════════════════════════════ */
  async function accessReport() {
    const lines = [];

    /* ── Door 1: Scribble's own data ── */
    const state = await passageReady("scribble_check");
    if (state.ok) {
      const map = (window.POPPY_FETCH && window.POPPY_FETCH.ids) || {};
      const n   = Object.keys(map).length;
      lines.push("Scribble: yes" +
        (state.who ? ", signed in as " + state.who : "") +
        (n ? " — I can see " + n + " project" + (n === 1 ? "" : "s") + "."
           : " — though no project list reached me this turn."));
    } else {
      lines.push("Scribble: NO. " + scribbleLockedOut(state.why));
    }

    /* ── Doors 2 and 3: the channel, and whether anything is on it ──
       Deliberately not tested by sending something. A probe command
       would either open a panel on a screen Jen is using or leave a
       stray document behind, and neither is acceptable for a question
       she only asked out of doubt. The surface read already tells us
       what it can. */
    const live = window.POPPY_FETCH && window.POPPY_FETCH.active;
    if (live && live.device) {
      lines.push("Your screen: yes — " +
        (live.app || "something") + (live.surface ? " / " + live.surface : "") +
        " is open, so I can act on it.");
    } else {
      lines.push("Your screen: no — nothing has told me it's open. " +
        "Grey dot means the page isn't live; amber means my channel is " +
        "refusing it, which is a different Firebase project from your " +
        "archive and nothing to do with your Scribble sign-in.");
    }

    return lines.join(" ");
  }

  const ACTIONS = {

    scribble_access: {
      spec: '{"action":"scribble_access"} — reports whether you can actually reach Scribble\'s data and whether a screen is open to act on. Takes nothing. Use it whenever Jen asks if you have access, if you can get into Scribble, why something is not working, or whether she is signed in — and use it INSTEAD of guessing when a Scribble command has just failed for a reason you could not name.',
      run: () => accessReport()
    },

    scribble_create: {
      spec: '{"action":"scribble_create","name":"Passcode","description":""} — creates a new project in Scribble. description may be empty; never invent one.',
      run: (cmd) => createProject(cmd.name, cmd.description)
    },

    scribble_pin: {
      spec: '{"action":"scribble_pin","project":"Scribble Mobile"} — pins a project in Scribble',
      run: (cmd) => setPinned(cmd.project, true)
    },

    scribble_unpin: {
      spec: '{"action":"scribble_unpin","project":"Scribble Mobile"} — unpins a project in Scribble',
      run: (cmd) => setPinned(cmd.project, false)
    },

    scribble_rename: {
      spec: '{"action":"scribble_rename","project":"Opus","name":"Sonnet"} — renames a project. `project` is what it is called now, `name` is what it becomes. If she only named one of the two, ask which — send no action.',
      run: (cmd) => renameProject(cmd.project, cmd.name)
    },

    scribble_describe: {
      spec: '{"action":"scribble_describe","project":"Passcode","description":"A password manager."} — sets a project\'s description to exactly what she dictated. Use her words verbatim; never tidy or expand them. An empty string clears it.',
      run: (cmd) => setDescription(cmd.project, cmd.description)
    },

    scribble_duplicate: {
      spec: '{"action":"scribble_duplicate","project":"LifeHub"} — copies a project and its contents. The copy is named "<name> (copy)"; you do not choose the name.',
      run: (cmd) => duplicateProject(cmd.project)
    },

    scribble_archive: {
      spec: '{"action":"scribble_archive","project":"Old Site","note":""} — shelves a project to the Archive. `note` is optional and only if she gave a reason; never invent one.',
      run: (cmd) => archiveProject(cmd.project, cmd.note)
    },

    scribble_bin: {
      spec: '{"action":"scribble_bin","project":"Old Site"} — moves a project and everything in it to the recycle bin. Recoverable for 30 days.',
      run: (cmd) => binProject(cmd.project)
    },

    scribble_merge: {
      spec: '{"action":"scribble_merge","source":"Drafts","target":"LifeHub","name":""} — merges source INTO target. Everything in source moves across and SOURCE IS PERMANENTLY DELETED — there is no bin entry and no undo. `name` optionally renames the target afterwards; leave it empty otherwise. If which one is being absorbed is at all unclear, ask her and send no action.',
      run: (cmd) => mergeProjects(cmd.source, cmd.target, cmd.name)
    },

    /* These four open a panel on the Scribble page. They change nothing
       and read nothing back — she is asking to LOOK at something, so
       don't summarise what's in it. Opening it is the whole job. */
    scribble_view_contents: {
      spec: '{"action":"scribble_view_contents","project":"LifeHub"} — opens the View Contents panel for a project in Scribble. Requires the Scribble page to be open.',
      run: (cmd) => openProjectModal(cmd.project, "view_contents", "Opened contents")
    },

    scribble_show_logs: {
      spec: '{"action":"scribble_show_logs","project":"LifeHub"} — opens the activity log panel for a project in Scribble. Requires the Scribble page to be open.',
      run: (cmd) => openProjectModal(cmd.project, "show_logs", "Opened the log")
    },

    scribble_show_records: {
      spec: '{"action":"scribble_show_records","project":"LifeHub"} — opens the Records panel for a project in Scribble. Requires the Scribble page to be open.',
      run: (cmd) => openProjectModal(cmd.project, "show_records", "Opened records")
    },

    scribble_show_general_records: {
      spec: '{"action":"scribble_show_general_records","project":"LifeHub"} — opens the General Record sheet for a project in Scribble, listing every file\'s storage record. Requires the Scribble page to be open.',
      run: (cmd) => openProjectModal(cmd.project, "show_general_records", "Opened the general record")
    },

    /* Not Scribble-specific. These go to whichever screen the surface
       read says is live, and work on any app carrying
       LifeHub-surface.js — which is all of them. */
    ui_close: {
      spec: '{"action":"ui_close"} — closes, cancels or dismisses whatever panel is open on the screen Jen is looking at. Works in any app. Takes nothing: it acts on the active surface. Use for “close it”, “cancel”, “dismiss”, “never mind”.',
      run: () => uiCommand("close", "Closed it")
    },

    ui_confirm: {
      spec: '{"action":"ui_confirm"} — presses the save or confirm button on the panel open in front of Jen. Works in any app. Takes nothing. Use for “save it”, “confirm”, “go ahead” when a panel is open. Never use this to confirm one of YOUR transactions — those are confirmed by her words to you, not by a button.',
      run: () => uiCommand("confirm", "Saved it")
    },

    /* ── Driving the Scribble page itself ──────────────────────
       No project id, no Firebase write. These change what is on screen
       and nothing else, so they need no confirmation and leave no log. */
    ui_sort: {
      spec: '{"action":"ui_sort","mode":"name_asc"} — sorts the list on whatever app Jen is looking at. In Scribble that is the projects grid. mode is exactly one of: name_asc, name_desc, accessed, added, size. Pinned projects stay on top regardless.',
      run: (cmd) => uiCommand("sort", "Sorted", { mode: cmd.mode })
    },

    ui_filter: {
      spec: '{"action":"ui_filter","query":"hub"} — types into the search box on whatever app Jen is looking at and filters the list. In Scribble that is Find Projects. Send an empty query to clear it and show everything again.',
      run: (cmd) => uiCommand("filter",
        (cmd.query ? "Filtered to \u201C" + cmd.query + "\u201D" : "Cleared the filter"),
        { query: cmd.query || "" })
    },

    scribble_logs_sort: {
      spec: '{"action":"scribble_logs_sort","mode":"today"} — changes the sort inside the activity log panel, which must already be open. mode is one of: newest, oldest, today, yesterday, lastweek.',
      run: (cmd) => uiCommand("logs_sort", "Sorted the log", { mode: cmd.mode })
    },

    scribble_logs_minor: {
      spec: '{"action":"scribble_logs_minor","show":true} — shows or hides content edits in the open activity log panel. show:true reveals them, show:false hides them.',
      run: (cmd) => uiCommand("logs_minor",
        (cmd.show === false ? "Hid content edits" : "Showing content edits"),
        { show: cmd.show !== false })
    },

    scribble_logs_page: {
      spec: '{"action":"scribble_logs_page","delta":1} — turns a page in the open activity log. delta is 1 for next, -1 for previous. Nothing else.',
      run: (cmd) => uiCommand("logs_page",
        (Number(cmd.delta) < 0 ? "Back a page" : "Next page"),
        { delta: Number(cmd.delta) || 1 })
    },

    scribble_recent: {
      spec: '{"action":"scribble_recent","open":false} — collapses or expands the Recent panel in the Scribble sidebar. open:false collapses, open:true expands. Leave `open` out to just flip whichever way it is.',
      run: (cmd) => uiCommand("toggle_recent",
        (cmd.open === false ? "Collapsed Recent"
          : cmd.open === true ? "Opened Recent" : "Toggled Recent"),
        (typeof cmd.open === "boolean" ? { open: cmd.open } : {}))
    },

    scribble_clear_recent: {
      spec: '{"action":"scribble_clear_recent"} — clears the Recent list in the Scribble sidebar. This only hides the entries from that panel; the activity logs themselves are untouched and nothing is deleted.',
      run: () => uiCommand("clear_recent", "Cleared Recent")
    },

    scribble_copy_path: {
      spec: '{"action":"scribble_copy_path"} — copies the Scribble path to the clipboard from the open Records panel. The panel has to be open.',
      run: () => uiCommand("copy_path", "Copied the path")
    }

  };


  /* ══════════════════════════════════════════════════════
     Wrapping, not replacing
     ══════════════════════════════════════════════════════ */

  window.LIFEHUB_ACTIONS = {

    describe() {
      const own = Object.keys(ACTIONS).map(k => "  " + ACTIONS[k].spec);
      return prior.describe() + "\n\n" + [
        "You can also act on Scribble. Same fenced block, these actions:",
        ""
      ].concat(own).concat([
        "",
        "Use the project name exactly as Jen said it — don't correct it or",
        "guess an id. If she named something that isn't in the project list,",
        "say so instead of sending an action."
      ]).join("\n");
    },

    run(cmd) {
      const name = cmd && cmd.action;
      if (ACTIONS[name]) {
        /* Errors become the message Jen sees, so a refusal reads like a
           sentence rather than a stack trace. */
        return Promise.resolve()
          .then(() => passageReady(name))
          .then(state => {
            /* ── REFUSED BEFORE IT IS ATTEMPTED — 2026-09-18 ──────
               We already know the door is shut. Sending the write
               anyway would come back as Firestore's own wording,
               which names a rule rather than a fix — and for a READ
               it does not even do that: a denied read returns the
               quiet string "(scribble/projects.count unavailable)",
               so Poppy simply knew nothing and said so vaguely.

               Checked here rather than in each action because this
               is the one place every one of them passes through. */
            /* scribble_access is the exception, and it has to be: its
               whole job is to report a shut door, so refusing it for a
               shut door would silence the one answer Jen asked for. */
            if (!state.ok && name !== "scribble_access") {
              throw new Error(scribbleLockedOut(state.why));
            }
            return ACTIONS[name].run(cmd);
          })
          .catch(err => {
            /* The door was open when we looked and shut by the time we
               wrote — or the rules changed under us. Same sentence
               either way: what Jen does about it is identical. */
            if (isDenied(err)) {
              throw new Error(String(name).indexOf("scribble_") === 0
                ? scribbleLockedOut("no-session")
                : channelLockedOut());
            }
            throw new Error(err.message || "That didn't work.");
          });
      }
      return prior.run(cmd);
    }
  };

  /* Anything else wallpaper.js hung on the object stays reachable. */
  Object.keys(prior).forEach(k => {
    if (!(k in window.LIFEHUB_ACTIONS)) window.LIFEHUB_ACTIONS[k] = prior[k];
  });

})();

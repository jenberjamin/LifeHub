# Scribble — architecture, rules, and the Poppy layer

**Written 2026-09-17**, re-verified against the code **2026-09-18** (added the
seven missing files to §3, and §5's two routes + vocabulary gap).
From a full read of every file in `Hubs/Scribble`
(~15,500 lines) plus `JS/poppy/PoppyEngine-scribble.js` and the Scribble
portion of `JS/poppy/PoppyEngine-core.js`.

Read this before changing Scribble. It records the things that are **not
visible from any single file** — the rules that span files, the traps, and why
several odd-looking decisions are correct.

---

## 1. THE FOUR TIERS

```
projects/{pid}                     ← PROJECT
  ├─ modules/{id}                  ← MODULE        (folder)
  ├─ sections/{id}                 ← SECTION       (folder)
  ├─ files/{id}                    ← DOCUMENT FILE (leaf)
  │    └─ versions/{vid}           ← snapshots, one subcollection deep
  └─ logs/{id}                     ← per-project activity log
logs/{id}                          ← global feed: {filename, timestamp} only
bin/{id}                           ← recycle bin rows
archive/{id}                       ← archive rows
scribble-auth/credentials          ← gate hashes
scribble-access-log/{id}           ← gate events, append-only
scribble-devices/{deviceId}        ← device register
```

**Modules, sections and files are three sibling subcollections, not one tree.**
Hierarchy is a `parentId` pointer that may aim at a module OR a section.

Tier is carried in code as:
- `itemType` — `'module' | 'section' | 'file'`, singular lowercase
- `COLL = { module:'modules', section:'sections', file:'files' }` in
  `scribble-project-firebase.js` — **the tier map**
- `_type` in bin/archive rows — `'MODULE' | 'SECTION' | 'FILE' | 'PROJECT'`

**These four are never interchangeable.** Jen distinguishes them deliberately;
never collapse them into "item" in code, action names or conversation.

### Tier constraints that are real, and enforced in two places each
| rule | enforced by |
|---|---|
| a module can only live at a project's ROOT | `isValidDrop` refuses every module drop; the move wizard gives modules no parent step |
| a section's parent can only be a module or the root | section-onto-section refused in `isValidDrop` |
| only modules can be promoted to a project | `ctxPromoteModule` rendered for modules only |
| only folders (module/section) can merge | `isFolderType` gate on the MERGE menu row |
| only document files have versions, exports, tags, records, side notes | menu rows gated on `itemType === 'file'` |

### ROOMS — a view, NOT a fifth tier (added 2026-09-21)
A **room** is which grid a project appears on. There are two — **All
Projects** and **Deployment** — and they are the *same* thing: an ordinary
project document in `projects/{pid}`, carrying `room: 'all' | 'deploy'`.

**Do not call a room a tier.** The four tiers are unchanged. A Deployment
project is a PROJECT: it opens the same workspace page, holds the same
modules, sections and document files, and goes to the same bin and archive.

| | |
|---|---|
| where | one field on the project document, in the one `projects` collection |
| who reads it | `listenProjects(room, cb)` and `createProject(name, desc, room)` in `scribble-firebase.js`; `_room` + `ROOM_TEXT` in `scribble-app.js` |
| missing field | reads as `'all'` via `roomOf()` — **no backfill**, nothing written before 2026-09-21 moved |
| why not a second collection | the project page, editor, symlinks, bin, archive and `firestore.rules` all address a project as `projects/{pid}`; a `deployments/` collection would mean teaching every one of them about two |

**Two traps, both already paid for:**
1. **Never filter rooms with a Firestore `where`.** A document that *lacks*
   the field matches no value for it, so `where('room','==','all')` returns
   **none** of the existing projects. `listenProjects` filters in memory —
   it already reads every document to drop the deleted and archived ones.
2. **`data` in a bin row is a whitelist**, and the bin's restore rebuilds
   from it when the project document is gone. `room` is in it. Leaving it
   out sends a restored Deployment project back into All Projects.

**Names are unique across BOTH rooms** — `findProjectByName` is deliberately
not room-scoped, because the bin and the archive are shared and two projects
with one name would be indistinguishable there. **Settled 2026-09-21.**

**Poppy consequence:** `PoppyEngine-scribble.js` keeps its *own* mirrored
`createProject`, which writes no room — so a project created by voice lands
in All Projects. Correct by default, and the only fix needed if that ever
matters is one field there.

---

## 2. THE FIVE NON-OBVIOUS RULES

### 2.1 Never read a timestamp field directly
`serverTimestamp()` reads back **null** until the write reaches Firestore. So
every stamp is written as a **pair**:

```js
nowFields('createdAt')  →  { createdAt: serverTimestamp(), createdAtLocalMs: Date.now() }
```

Read with `whenMs(data, 'createdAt')` / `whenDate(...)` from `scribble-db.js`,
never `.toDate()` or `.seconds`. Classic scripts reach it via
`window.SCRIBBLE_TIME.whenMs` — there are local `_ms()` helpers in
`scribble-app.js` and `scribble-project-app.js` for exactly this.

Getting this wrong means anything created offline is dated `—` and sorts as the
oldest thing you own. **This was wrong in eleven places and was fixed 2026-09-17.**

### 2.2 Never `await` a raw Firestore write
`setDoc`/`updateDoc`/`deleteDoc`/`addDoc` resolve on **server ack**, so
`await` hangs *forever* offline and everything after it never runs. Use the
wrappers in `scribble-db.js`, which resolve on **queue**:

| use | not |
|---|---|
| `save(ref, data)` | `setDoc` |
| `merge(ref, patch)` | `updateDoc` |
| `remove(ref)` | `deleteDoc` |
| `add(coll, data)` / `newRef(coll)` | `addDoc` |
| `commit(batch)` | `batch.commit()` |

`newRef()` mints the id **locally**, which is why create works offline.

**Consequence worth knowing:** `merge()` is `updateDoc`, which *fails* on a
missing document — and because it resolves on queue, that failure arrives long
after the caller's try/catch has finished. Both restore paths read before
writing for this reason.

### 2.3 Name comparison is case-blind, and nothing else
```js
normName(s) = String(s).trim().toLowerCase()
```
- `Notes` / `notes` / `nOtEs` → the same name
- `Life Hub` / `LifeHub` → different
- `Life Hub` / `Life  Hub` → different (whitespace runs are NOT collapsed)

Stored value is always exactly as typed; only the comparison is loose.

**Scope differs by tier.** Projects are **global** (checked across live +
archived + bin). Items are scoped to **their folder**. A file's identity is
**name + extension**, so `notes.txt` and `notes.md` coexist.

Four functions implement this and must agree: `findProjectByName`,
`findItemClash`, the bin's `resolveNameConflict`, the archive's `resolveName`.

### 2.4 ⭐ THE PORTAL — two project ids, and they diverge
| | |
|---|---|
| `_projectId` | the project in the URL (`?id=`). Fixed for the page's life. |
| `_viewProjectId` | **the project whose contents are on screen right now.** |

Opening a **symlinked module or section** navigates *into the target project*:
`navigateDown` sets `_viewProjectId` and re-subscribes to a different project's
contents. The breadcrumb shows a link tag.

**Every write must name `_viewProjectId`.** Five did not — pin, rename, move,
copy, merge, delete — and inside a portal they silently did nothing at all
(the id didn't exist in the project being written to; `merge()` rejected and
the rejection was swallowed). Fixed 2026-09-17.

`viewProjectName()` returns the on-screen project's name by walking `_path`
backwards for `portalProjectName`. It sits next to `updateBreadcrumb()`, which
does the same walk, so the two can't drift.

### 2.5 ⭐ SYMLINKS
A symlink is a **thin pointer document in the DESTINATION project's own
subcollection** (same three collections as real items):

```js
{ isSymlink: true, targetProjectId, targetProjectName, targetId, targetType,
  name /* COPIED from the target */, parentId, projectId }
```

Stored in the collection matching its **target's tier** — a link to a file is in
`files`, a link to a module is in `modules`.

**The consequence that shapes everything:** pointers live in the destination, so
a `parentId` walk can *never* find them. `findSymlinksToAny(ids)` hunts them in
**three `collectionGroup` queries**, with a documented fallback to a
per-project walk when the index isn't built.

| operation | what happens to inbound links |
|---|---|
| soft delete (bin) | **cascade** — pointers follow into the same `groupId`, flagged `isSymlinkPointer` |
| archive | **cascade** (added 2026-09-17) — in the same atomic batch |
| same-project move | nothing needed; the id doesn't change |
| `copyItem` | nothing needed; deletes nothing |
| cross-project move | **repointed** (added 2026-09-17) — `repointSymlinks` follows them to the new ids |
| `promoteModule` | children repointed; the module **shell** can't be (a symlink can't target a project) → `flagBrokenSymlinks` logs the break |
| permanent purge | can't be saved → logged in the host project (added 2026-09-17) |

Other symlink facts:
- `createSymlink` **refuses** on a name clash (no "Copy of" fallback — a link
  carries its target's name and renaming it would make it lie) and refuses a
  second link to the same target in one folder
- `deleteSymlink` is a **hard delete, no bin row** — a pointer isn't content
- links are excluded from storage records: *"a link has no storage of its own"*
- `promoteModule` refuses symlinks outright
- `openFile` resolves a symlink to the real document and marks it
  `_overridePid`, so read/save/versions all aim at the source project.
  **Every editor call must respect `_overridePid`** — see `_fileProjectId()`

---

## 3. FILE MAP

| file | what it owns |
|---|---|
| `scribble-db.js` | the ONE Firebase init; offline cache; the write wrappers; `nowFields`/`whenMs` |
| `scribble-boot.js` | top-level `await authReady` — held by every `*-firebase.js` so no query fires before the token attaches |
| `scribble-session.js` | the Firebase account (email/password, IndexedDB persistence) |
| `scribble-auth.js` | gate credentials: PBKDF2 ×120,000, salted, 20 questions |
| `scribble-gate.js` | name+passcode → one random question. 3 rerolls, 3 answers |
| `scribble-guard.js` | 30-minute idle lock, 15s warning, cross-tab via `localStorage` |
| `scribble-passage.js` | **copies the Firebase session to Poppy's app name** — see §5 |
| `scribble-firebase.js` | landing-page data layer (project CRUD, `softDeleteProject`) |
| `scribble-app.js` | `Scribble.html` — the projects grid, the 10 project verbs |
| `scribble-project-firebase.js` | item CRUD, symlinks, logs, paths, `touchAncestors` |
| `scribble-project-app.js` | the project workspace: tree, portal, wizards, drag-drop |
| `scribble-editor-app.js` | the editor (~5,300 ln): code mode, tables, search, side notes |
| `scribble-editor-firebase.js` | file content + version history |
| `scribble-archive-firebase.js` / `-archive.js` | the shelf |
| `scribble-recycle-bin-firebase.js` / `-recycle-bin.js` | the bin, restore, purge |
| `scribble-bin-expiry.js` | 30-day sweep; runs on the workshop AND the bin page |
| `scribble-recent.js` | shared Recent panel — **stands down where the page has its own** |
| `scribble-session-tabs.js` | cross-page "open documents" strip (localStorage, names+ids only) |
| `scribble-backup.js` | whole-archive JSON export. **Restore deliberately not built** |
| `scribble-setup.js` | runs `Scribble-setup.html` once; refuses if credentials exist |
| `scribble-access-log.js` | `record(event, detail)` — every gate event, fire-and-forget |
| `scribble-devices.js` | the device register **and the honest note**: the client SDK cannot list or revoke other sessions; that needs the Admin SDK |
| `scribble-menu.js` | the header overflow menu — access history, backup |
| `scribble-name-clash.js` | the shared refused-name dialog. Its point is the **where** — bin or archive — and it offers to take you there |
| `scribble-export.js` | any file → text / Word / PDF. Editor toolbar + item menu |
| `scribble-sw-register.js` | registers `../sw.js`; https or localhost only |
| **`firestore.rules`** | **Scribble's actual security rules, in the repo.** Every rule routes through `signedIn()`, pinned to ONE uid (not `!= null` — anyone can make an account). `saneShape()` caps a document at 60 fields; rules cannot measure bytes. `scribble-access-log` is the one collection anyone may **create** in, deliberately: a failed sign-in is by definition unauthenticated, so requiring a session would log only your own fumbles. Reads still require you. Paste target: console → Firestore → Rules |
| `dev-server.js`, `make-icons.js`, `vercel.json` | local serving, icon generation, deploy config |
| `css/` ×6 | `scribble`, `-project`, `-editor`, `-archive`, `-recycle-bin`, `-gate` (~6,900 lines) |
| `LifeHub-surface.js` | the Poppy channel — see §5 |
| `scribble-poppy-commands.js` | Poppy on the **workshop** (project tier) |
| `scribble-project-poppy-commands.js` | Poppy **inside a project** — Modules, Sections, Document Files. See §5 |

### Log taxonomy
`LOG_RULES` in `scribble-project-firebase.js` classifies by regex at **write**
time. weight 3 = milestone, 2 = normal, 1 = content autosave (written, hidden by
default, never dropped). `schema: 2`; docs without `kind` are `legacy` and
rendered as-is — **no backfill**. Kinds: create, rename, move, copy, link,
version, record, tag, merge, delete, restore, **archive**, content, meta, legacy.

### The gates that protect data
- **bin / archive a project** → two steps, second makes you **type the project name**
- **permanent delete, 5+ items** → type the item's **name**, then type `DELETE`
- **permanent delete, under 5** → type `DELETE`
- **merge projects** → checkbox only. **SETTLED — do not propose changing it.**

---

## 4. WHAT WAS FIXED 2026-09-17 (`sw.js` v32 → v41)

All of these were found by reading, not by symptoms.

1. **The portal bug** — 5 verbs wrote to the wrong project inside a portal
2. **Archive name rule** — `resolveName` was case-*sensitive*, contradicting
   its own comment and every other name check; a restore could put `notes`
   beside a live `Notes`
3. **Symlinks orphaned** by cross-project move and promote → `repointSymlinks`
4. **Archive didn't cascade symlinks** → now atomic with the content
5. **Purge left orphans** — bin/archive rows for a deleted project stayed
   listed with working Restore buttons; inbound links now logged
6. **`getFileSymlinks`** — 1+N reads per Details open → 3 collection-group
7. **Offline timestamps** — 11 sites
8. **Two Recent renderers** fought over `#recent-list` on the project page
9. **`kind:'archive'`** existed but no reader knew it → shown as "Other",
   filtered out by any specific kind
10. **Merge dialog lied** — said the source goes to the bin; it's hard-deleted
11. **`_overridePid` ignored** by side notes, `copyFileLink`, export
12. **Grammar check** silently uploaded the document to `languagetool.org` →
    now asks once, remembered
13. **`LIFEHUB_SURFACE.current`** never existed; every access-log row recorded
    `surface: null`
14. **`loadSDK` had no memoisation** → the "Firebase is already defined" warning
15. **The dot lied** — green even when Poppy was unreachable → grey/amber/green
16. **`LifeHub-Wallpaper.html`** in the PAGES map — a file that doesn't exist
17. Five dead things removed: `doArchive`, `doSoftDelete`, `_findItem`,
    `_activePid`, the second `_refreshFile`
18. Five stale comments corrected; bin's "Coming Soon" Archive button retitled;
    group-delete button wired up; `scribble-devices` added to the backup;
    all four page headers got the Home Screen / Lobby pair

### And in `JS/poppy/PoppyEngine-core.js` — gate fixes, same day
**Two Scribble entries could never fire**, both from copy-paste in `requireAny`
(and `gatesPass` is a hard reject, so the guidelines were never even read):
- `Project: Merge` gated on `["archive","storage"]` — so *"merge A into B"* was
  thrown out. The one action that deletes a project outright was unreachable.
- `Project: Description` gated on `["logs","log","timeline","history"]` — so
  *"set the description of…"* was thrown out, and when it *did* fire it
  collided with the real Show Logs entry, which had identical gates.

Also, across all nine Scribble project entries:
- `requireNone: ["module","section"]` → `["module*","section*","file*","document*","doc","docs"]`
  — `hasTerm` is whole-word, so **every plural walked through the fence**, and
  the file words were absent entirely
- `requireAll: ["project"]` → `["project*"]`

**No prompt text was changed.** Gate arrays and two headers only.
Still open (deleting an entry, not fixing one): `Projects: Logs Control`
duplicates `Projects: Sort & Filter`, and `Projects: Recent panel (copy)` is
byte-identical to its original.

---

## 5. THE POPPY LAYER

### Three layers, and they only work in order

**Layer 1 — the channel.** `LifeHub-surface.js` talks to **`poppy-e510a`**, a
*different* Firebase project from Scribble's `lifehub---scribble`. **Nothing
signs in to it** — the SDK list loads app + firestore only, no auth module. So
every read and write is unauthenticated, and that project's rules currently
**refuse them**.

> **This is the open blocker.** Until it's resolved the corner dot is amber and
> **no voice command is delivered, ever**, no matter how good the prompts are.
> **`poppy-e510a`'s** rules live only in its Firebase console — there is no
> rules file for that project anywhere in the repo (checked 2026-09-18).
>
> **Scribble's own rules ARE in the repo** — `Hubs/Scribble/firestore.rules`,
> and they are the reason the passage exists. See §3.

**Layer 2 — the page half.** Built and live. Independent of Layer 1.

### ⭐ THE PASSAGE — how Poppy is let in (traced 2026-09-18)
Scribble's rules allow one signed-in account. Poppy builds her own handle to the
**same Firebase project** under the app name `"scribble"`, and Firebase files a
session **per app name**:

```
firebase:authUser:<apiKey>:[DEFAULT]   ← Scribble signs in here
firebase:authUser:<apiKey>:scribble    ← Poppy looks here
```

Same project, same account, same browser — **different name**, so no session, so
refused. The passage copies the record across. Two halves:

| half | file | job |
|---|---|---|
| hands out | `Hubs/Scribble/js/scribble-passage.js` | on `onAuthStateChanged`, copies `[DEFAULT]`'s record to `scribble` + `scribble-nudge`, rewriting `appName` inside it. Sign-out deletes every copy from **both** IndexedDB and localStorage |
| picks up | `JS/poppy/LifeHub-poppy-scribble-passage.js` | one memoised promise per app name that settles when Firebase has restored the copy. 5s give-up |

**It cannot let itself in.** No password, no sign-in call. Signed out → no copy →
refused, exactly as before the passage existed.

**Three things it depends on:**
1. **One origin.** Sessions are filed by address; served over `http://` every page
   shares one. Opened as `file://` each page is walled off and no copy is found.
2. **`firebase-auth-compat.js` on the consuming page.** Without it the pick-up
   half warns once and resolves null forever. It is on `LifeHub-HomeScreen.html`.
3. **Firebase's internal key format**, which is undocumented. Stable across v9/v10
   and every LifeHub script is v10 — but if Poppy ever goes quiet about projects
   after an SDK upgrade, look here first.

Check: `SCRIBBLE_PASSAGE.check()` on a Scribble page (was a card handed out?),
`LIFEHUB_SCRIBBLE_PASSAGE.check()` on the homescreen (was it picked up?).

**Where the wait is, and isn't.** `ready()` is awaited in the **read** path only
(`LifeHub-poppy-firebase-fetch.js`, in `dbFor`'s caller). `scribbleDb()` in
`PoppyEngine-scribble.js` does **not** await it. Most writes are covered anyway,
transitively: they call `findProject()`, which reads `POPPY_FETCH.ids`, filled by
the buckets read that already waited. **`scribble_create` is the exception** — it
never calls `findProject`, so on a cold page it can outrun the session restore.

**The passage covers `lifehub---scribble` ONLY.** `poppy-e510a` — the command
channel — is a *different project* and gets nothing from it. See Layer 1.

### ⭐ THE TWO ROUTES — verified 2026-09-18
> **A word about "item tier".** There is no such tier. There are **four** —
> Project, Module, Section, Document File — and three of them happen to live in
> subcollections of the fourth. The code's own shorthand for those three is
> `itemType` / `COLL`, and it is a *storage* word, not a tier. Written out, the
> two routes below are: **the Project route**, and **the Module / Section /
> Document File route**. Every action name still names its own tier —
> `module_bin`, never `item_bin`.

Commands reach Scribble by **two completely different paths**, and the
difference is the single most important thing to know before adding vocabulary.

| | PROJECT | MODULE / SECTION / DOCUMENT FILE |
|---|---|---|
| where the work happens | **inside Poppy** | **on the Scribble page** |
| how | `PoppyEngine-scribble.js` opens Scribble's own Firestore via `POPPY_FETCH.db("scribble")` and writes directly | `uiCommand` → `commands` doc → the page's handler |
| needs Scribble open? | **no** — create, rename, archive, bin, merge all work with every tab closed | **yes, always** |
| can it destroy data unattended? | **yes** | **no, by construction** |

So `scribble-poppy-commands.js` on `Scribble.html` registers only **14**
handlers, and not one of them writes: four panels, sort, filter, the three log
controls, recent ×2, copy path. It looks thin because the project verbs never
come through it — they were already done in Poppy before the page heard
anything.

`scribble-project-poppy-commands.js` is the opposite and deliberately so:
**10 actions per tier × 3 tiers, plus 11 page-level**, and *every* destructive
one only opens the page's own prefilled dialog and stops. Jen presses the
button via `ui_confirm`.

**Do not "unify" these.** The project route predates the channel and is the
reason voice works with Scribble closed; the item route is what makes
`_locate`-before-destroy and the five-step name resolution possible at all.

### ⭐ THE VOCABULARY GAP — the live one, 2026-09-18
`ACTIONS` in `PoppyEngine-scribble.js` holds **23 entries**, and they are:

- 9 project writes — create, pin, unpin, rename, describe, duplicate,
  archive, bin, merge
- 4 project panels — view contents, logs, records, general records
- 4 log / recent controls + copy path
- 4 generic — `ui_close`, `ui_confirm`, `ui_sort`, `ui_filter`

**Not one of them names a Module, a Section or a Document File.** The project
page registers ~41 handlers that
Poppy has no word for — `module_locate`, `file_bin`, `section_rename`,
`file_versions`, `where`, `up`, `root` and the rest are all live, all reachable
from `LIFEHUB_SURFACE.test(...)`, and all unreachable by voice.

That is the actual next build: an `ACTIONS` entry per item command whose `run`
calls `uiCommand('<tier>_<verb>', …)`, plus its registry entry in
`PoppyEngine-core.js`. Seeds for these are drafted in
`JS/poppy/PoppyEngine-scribble-item-seeds.md`.

**Layer 3 — the vocabulary.** `PoppyEngine-scribble.js` `ACTIONS` +
`PoppyEngine-core.js` registry. Seeds in
`JS/poppy/PoppyEngine-scribble-item-seeds.md`.

### How the channel works
Poppy writes a doc to `commands` in `poppy-e510a`, addressed to **one device**
(the one the `surface` read says is live). The page picks it up, runs the
handler, and writes back `status: done|failed`. Guards in `runCommand`:
commands older than the page load, or older than 30 seconds, are ignored —
*"firing late is worse than not firing"*.

**A handler's returned string reaches Poppy as `result`** (added 2026-09-17).
That is what makes `_locate` possible. `uiCommand` resolves `d.result` in
preference to its generic label.

### The three rules the Module / Section / Document File commands are built on
1. **The tier is in the action name** — `file_bin`, `module_bin`,
   `section_bin`; never `bin` with a tier field. Because the router gates on
   the *words Jen said*, one entry per tier means one guidelines block per
   tier, and a tier-ambiguous command **cannot be sent**.
2. **Names resolve on the page, not in Poppy.** Items are a tree with repeating
   names; `_contents` is live in memory and can't be stale. `resolve(tier,said)`
   widens in five steps and **prefers the folder you're standing in**.
3. **Nothing destructive travels with a spoken name.** Destructive commands take
   a `ref` from a prior `_locate`. By the time anything destructive happens the
   spoken name is out of the loop.

**And the property worth keeping: Poppy cannot write.** Every destructive
handler *opens the page's own dialog*, prefilled, and stops. Jen confirms with
`ui_confirm`, which presses the real button. So every existing guard stays in
the loop. The only exception is the pin toggle.

### Testing without Poppy
```js
LIFEHUB_SURFACE.can()                                    // what this page knows
LIFEHUB_SURFACE.current                                  // "Scribble / Project"
LIFEHUB_SURFACE.reachable                                // true / false / null
await LIFEHUB_SURFACE.test('where')
await LIFEHUB_SURFACE.test('file_locate', { name: 'notes' })
```
`test()` runs the same handler with the same argument and returns the same
sentence, skipping Firestore. Without it a broken handler and a blocked channel
look identical.

### The registry, in `PoppyEngine-core.js`
`gatesPass` is a **hard reject**, not a score: `requireAny` / `requireAll` /
`requireNone`. `hasTerm` is **whole-word** — `"module"` does NOT match
`"modules"`; use the `module*` suffix form.

---

## 6. STILL OPEN

**Blocker:** `poppy-e510a` rules (Layer 1). Everything else is downstream —
*except* the item vocabulary, which can be written and reviewed now and simply
won't fire until the rules are fixed.

**The next build (2026-09-18):** `ACTIONS` + registry entries for Modules,
Sections and Document Files — one per tier per verb. The
page half is done; Poppy has no word for any of it. See §5.

**Not built — no page handler yet, so not seeded:**
- item **create** (module / section / document file)
- item **merge** (folders only)
- item **description**

**Known, low priority:**
- `confirmPermanentDeleteGroup`'s sibling `_showDeleteModal` heavy gate fires at
  `HEAVY_ITEM_COUNT = 5` — tune in `scribble-recycle-bin.js`
- `moveItem`'s `"Received from another project."` log line resolves before the
  index is invalidated, so it lands without a name or path
- `getFileSymlinks` returns links to files only — correct, because only files
  have a Details panel
- two copies of `LifeHub-surface.js` (`Hubs/Scribble/js/` and `JS/poppy/`) are
  **code-identical as of 2026-09-17** and differ only in comments. Keep them so.

**Settled — do not re-raise:** the merge gate; auth/rules as a suggestion.

---

## 7. HOUSE RULES FOR EDITING THIS CODEBASE
- Never rewrite files with PowerShell — it destroys the box-drawing and emoji
- Dated inline note on every edit to an existing file, saying what it was before
- Bump `SHELL_VERSION` in `sw.js` for any change to a precached file, and add a
  `/* vNN — date: what changed */` line
- `node --check` everything before claiming it works
- Comments in this codebase are load-bearing. **A wrong comment is a bug** —
  several were, and are now corrected

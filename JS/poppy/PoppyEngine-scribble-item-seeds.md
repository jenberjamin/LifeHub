# PoppyEngine — Scribble ITEM TIER seeds
**Rewritten 2026-09-17.**

## What this is, and what it is not

Your nineteen Scribble entries in `PoppyEngine-core.js` (lines 551–807) **stand
exactly as written.** Nothing here replaces a word of them.

Every guideline below is **your** guideline, carried across from the
project-tier entry that already says it, with only the pointers corrected:

| your project entry | what it becomes here | what actually changed |
|---|---|---|
| `Projects: Pin/Unpin` | `File/Module/Section: Pin/Unpin` | the noun, the action name, the gates, and "buckets line" → "Active surface line" |
| `Project: Rename` | `*: Rename` | the same, plus a locate step, because an item rename needs a ref |
| `Project: Show Logs` | `*: Show Logs` | the noun and the action name; the two RULES are verbatim |
| `Project: Show Records` | `*: Show Records` | the same |
| `Project: View Content` | `File: Details` | the same |
| `Projects: Duplicate` | `*: Duplicate` | the same |
| `Project: Move to Recycle Bin` | `*: Move to Recycle Bin` | your five-STEP shape kept; STEP 4's 4-digit code becomes the page's own dialog (see the note there) |
| `Project: Move to Archive` | `*: Move to Archive` | the same |
| `Project: General Inquiries` | `*: Locate` | read-only, and your "Not on either line → say so, nothing else" discipline carried over |

**Two things I did not seed**, because the page half does not exist yet and a
prompt for a command that cannot be sent is worse than none: item **create**,
and item **merge** / **description**. Say the word and I will build the handlers
first.

---

## The one genuinely new idea, and why it is not a rewrite

Your project entries take a **name** and Poppy resolves it against the buckets
line. Item names cannot work that way — the same `notes` lives in six projects,
the same `index.html` in four modules — so the **page** resolves them against
what is actually on screen.

That means your project flow:

> she names it → find it in buckets → read it back → confirm → act

becomes, for an item:

> she names it → **`_locate` asks the page** → read back the path it found →
> confirm → act **on the ref the page gave you**

Same five beats. One of them moved from Poppy to the page, because only the page
knows the tree. And it buys something your project flow already has by other
means: **nothing destructive ever travels with a spoken name.**

---

# PART A — `PoppyEngine-scribble.js` → `ACTIONS`

Written out for **document files**. Modules and sections are the swap table in
Part C.

```js
    /* ══════════════════════════════════════════════════
       DOCUMENT FILES — the item tier
       Names are resolved by the PAGE. findProject() cannot
       help here: item names repeat across folders, so there
       is no flat name→id map to look one up in.
    ══════════════════════════════════════════════════ */

    scribble_file_locate: {
        spec: '{"action":"scribble_file_locate","name":"notes"} — finds ONE document file in the project she is looking at and reports its full path plus a `ref`. Changes nothing. Use her name for it exactly as she said it; include the extension only if she did. The answer is the ONLY place a ref comes from — quote it back verbatim in any follow-up, and never invent one.',
        run: (cmd) => uiCommand('file_locate', 'Found it', { name: cmd.name || '' })
    },

    scribble_file_open: {
        spec: '{"action":"scribble_file_open","name":"notes"} — opens a document file in the editor. Takes a name, not a ref: opening the wrong one costs a click.',
        run: (cmd) => uiCommand('file_open', 'Opened it', { name: cmd.name || '' })
    },

    scribble_file_pin: {
        spec: '{"action":"scribble_file_pin","name":"notes"} — pins a document file to the top of its folder.',
        run: (cmd) => uiCommand('file_pin', 'Pinned it', { name: cmd.name || '' })
    },

    scribble_file_unpin: {
        spec: '{"action":"scribble_file_unpin","name":"notes"} — unpins a document file.',
        run: (cmd) => uiCommand('file_unpin', 'Unpinned it', { name: cmd.name || '' })
    },

    scribble_file_logs: {
        spec: '{"action":"scribble_file_logs","name":"notes"} — opens one document file\'s own activity log. Requires the project page to be open.',
        run: (cmd) => uiCommand('file_logs', 'Opened the log', { name: cmd.name || '' })
    },

    scribble_file_records: {
        spec: '{"action":"scribble_file_records","name":"notes"} — opens a document file\'s Records panel: its Scribble path, cloud link and hard drive path.',
        run: (cmd) => uiCommand('file_records', 'Opened records', { name: cmd.name || '' })
    },

    scribble_file_details: {
        spec: '{"action":"scribble_file_details","name":"notes"} — opens a document file\'s Details panel: size, word count, saved versions, records, inbound links and tags.',
        run: (cmd) => uiCommand('file_details', 'Opened details', { name: cmd.name || '' })
    },

    scribble_file_versions: {
        spec: '{"action":"scribble_file_versions","name":"notes"} — opens a document file\'s version history. Document files are the only tier that has one.',
        run: (cmd) => uiCommand('file_versions', 'Opened version history', { name: cmd.name || '' })
    },

    scribble_file_export: {
        spec: '{"action":"scribble_file_export","name":"notes"} — opens the export dialog for a document file. She picks the format on screen; you do not choose it.',
        run: (cmd) => uiCommand('file_export', 'Opened export', { name: cmd.name || '' })
    },

    scribble_file_duplicate: {
        spec: '{"action":"scribble_file_duplicate","name":"notes"} — opens the duplicate dialog for a document file. The copy is named for you; you do not choose the name.',
        run: (cmd) => uiCommand('file_duplicate', 'Opened duplicate', { name: cmd.name || '' })
    },

    /* ── These three take a REF, never a name ────────────────── */

    scribble_file_rename: {
        spec: '{"action":"scribble_file_rename","ref":"<from a locate>","name":"Draft 2"} — opens the rename box for a document file with the new name already typed in. `ref` MUST come from a scribble_file_locate answer in this conversation. `name` is what it becomes, in her words, untidied. It does not commit — she says save.',
        run: (cmd) => uiCommand('file_rename', 'Opened rename',
                                { ref: cmd.ref || '', name: cmd.name || '' })
    },

    scribble_file_bin: {
        spec: '{"action":"scribble_file_bin","ref":"<from a locate>"} — opens Scribble\'s own Move to Bin dialog for a document file. `ref` MUST come from a locate answer. This does NOT delete: it puts the dialog on screen and tells you what it says. Recoverable for 30 days.',
        run: (cmd) => uiCommand('file_bin', 'Opened the bin dialog', { ref: cmd.ref || '' })
    },

    scribble_file_archive: {
        spec: '{"action":"scribble_file_archive","ref":"<from a locate>"} — opens the Archive dialog for a document file. `ref` MUST come from a locate answer. Nothing on the shelf expires.',
        run: (cmd) => uiCommand('file_archive', 'Opened the archive dialog', { ref: cmd.ref || '' })
    },

    /* ══════════════════════════════════════════════════
       INSIDE A PROJECT — no tier involved
    ══════════════════════════════════════════════════ */

    scribble_where: {
        spec: '{"action":"scribble_where"} — asks the project page where it is: which project, which folder, how many modules, sections and document files are in view, and whether she walked in through a link. Read-only. Ask this FIRST rather than guessing which project she means.',
        run: () => uiCommand('where', 'Checked')
    },

    scribble_up: {
        spec: '{"action":"scribble_up"} — goes up one folder inside the project. Refuses at the root and says so.',
        run: () => uiCommand('up', 'Went up')
    },

    scribble_root: {
        spec: '{"action":"scribble_root"} — jumps back to the project root from any depth.',
        run: () => uiCommand('root', 'Back at the root')
    },

    scribble_activity: {
        spec: '{"action":"scribble_activity"} — opens the project-wide Activity log on the project page. Opens a panel; it reads nothing back to you.',
        run: () => uiCommand('activity', 'Opened activity')
    },

    scribble_project_general_record: {
        spec: '{"action":"scribble_project_general_record"} — opens the General Record sheet on the project page: every document file in the project with its storage paths. Opens a panel only.',
        run: () => uiCommand('general_record', 'Opened the general record')
    },
```

### `sort` and `filter` need no new action

`ui_sort` and `ui_filter` already send the bare `sort` and `filter`, and the
project page now registers handlers for both. Same words, two implementations.
Only the existing `ui_sort` **spec** needs one line widened, since it currently
claims the projects grid is the only list:

> sorts whatever list is on the screen Jen is looking at. On Scribble's
> workshop that is the projects grid; on a project page it is that project's
> modules, sections and document files.

---

# PART B — `PoppyEngine-core.js` registry

Your keywords. Your sentences. Corrected pointers.

## B1 — File: Pin/Unpin
*Carried from your `Projects: Pin/Unpin`. Rules 1 and 2 and the closing
paragraph are yours verbatim.*

```js
        {
            // File: Pin/Unpin
            keywords:     ["pin","unpin"],
            intent:       "CONTROLLER",
            fetchTargets: ["poppy/surface"],
            writeFields:  ["action","name"],
            priority:     4,
            window:       3,
            guidelines:   "═══════════════════════════════════════════════════════════════\n🕹️ Jen wants to pin/unpin a 'Document File' in Scribble ; scribble_file_pin\n═══════════════════════════════════════════════════════════════\nTWO RULES.\n1. Two actions here, not one. Pinning is scribble_file_pin, unpinning is scribble_file_unpin. Read which she asked for.\n2. Use her name for it exactly as she said it. Don't correct it, don't expand it, don't send an id.\n\nLIVE DATA gives you the Active surface line: which project and which folder the page is showing. You do NOT need a project id — the page finds the file itself, in the folder she is standing in first, then the rest of the project.\n\nSend her words as `name` and let the page answer.\n\nNo such file: the action says so. Pass it on and stop. No near-matches, no suggestions.\nThe name fits more than one: the action lists their paths. Read those back and ask which. Don't pick.\nNot on a project page: the action says so. She has to open the project first.\n\nAlready in the state she asked for, send the action anyway. It comes back saying so, and that's a truer answer than you guessing.\n═══════════════════════════════════════════════════════════════",
            requireAny:   ["file*","document*","doc","docs"],
            requireAll:   ["pin"],
            requireNone:  ["module*","section*","project*"],
        },
```

> `requireAll: ["pin"]` matches both "pin" and "unpin" only if you use `pin*`.
> As written it matches "pin" alone. Use `["pin*"]` if you want one entry to
> cover both words — your project entry relies on `keywords` for that.

## B2 — File: Locate
*Carried from your `Project: General Inquiries` — same read-only discipline,
same "Not on either line → say so, nothing else".*

```js
        {
            // File: Locate
            keywords:     ["which","where","what","find","locate","look for","show me","point me to","identify","get"],
            intent:       "CONTROLLER",
            fetchTargets: ["poppy/surface"],
            writeFields:  ["action","name"],
            priority:     4,
            window:       3,
            guidelines:   "═══════════════════════════════════════════════════════════════\n🕹️ Jen wants to find a 'Document File' in Scribble ; scribble_file_locate\n═══════════════════════════════════════════════════════════════\nTHREE RULES.\n1. This changes nothing. It is a question, not an action — send it freely, no confirmation, ever.\n2. The answer carries a `ref`. That ref is the ONLY way to rename, bin or archive this file afterwards. Keep it and quote it back verbatim. Never invent one, and never pass a name where a ref is asked for.\n3. Use her name for it exactly as she said it. Include the extension only if she did — the page matches both \"notes\" and \"notes.txt\".\n\nLIVE DATA gives you the Active surface line: which project and which folder. The page resolves the name against what is on screen, so you do not need a project id and should not ask for one.\n\nHOW THE PAGE CHOOSES: the folder she is standing in FIRST, then the whole project. So \"the notes file\" means the one in front of her.\n\nWHAT COMES BACK is a path, some detail, and a ref:\n  LIFEHUB / CSS / notes.txt · 4 items inside · pinned · ref f3K9qLm2\nRead her the path. The ref is for you, not for saying out loud.\n\nThe name fits more than one: it lists their paths. Read them back and ask which. DON'T PICK — two files with one name in different folders is normal in Scribble, and guessing is how the wrong one gets deleted later.\n\nNo such file: \"That's not in this project.\" Nothing else. No near-matches, no suggestions.\n═══════════════════════════════════════════════════════════════",
            requireAny:   ["file*","document*","doc","docs"],
            requireNone:  ["module*","section*","project*"],
        },
```

## B3 — File: Move to Recycle Bin
*Your five-STEP shape, kept. Rules 1–2 and 4 are yours. **STEP 4 is the one real
change** and it is explained inside the prompt.*

```js
        {
            // File: Move to Recycle Bin
            keywords:     ["remove","delete","move to","nuke","scrap","dump","purge","trash","get rid of"],
            intent:       "OPERATIONAL",
            fetchTargets: ["poppy/surface"],
            writeFields:  ["action","ref"],
            priority:     4,
            window:       7,
            guidelines:   "═══════════════════════════════════════════════════════════════\n⚙️ Jen wants to 'Remove a Document File' in Scribble. » scribble_file_bin\n═══════════════════════════════════════════════════════════════\n\nFOUR RULES. These outrank anything below them.\n1. Send no action block until she has said yes. Withholding it IS the confirmation — a block written beside the question runs before she answers.\n2. This action takes `ref` ONLY. A ref comes from one place: a scribble_file_locate answer earlier in this conversation. No ref in view means you locate FIRST and this action waits.\n3. Every number you say comes from the action's own answer. Never estimate how many nested items go with it.\n4. This action does not delete anything. It opens Scribble's own Move to Bin dialog. Nothing leaves until she confirms.\n\nLIVE DATA gives you the Active surface line: which project and folder the page is showing.\n\nSTEP 1 — She names a document file.\nNo ref for it yet: send scribble_file_locate with her words, and stop. Continue at STEP 2 once you have the answer.\nSeveral matched and she hasn't chosen: read the paths back, ask which. No action.\n\nSTEP 2 — Read it back from the locate answer.\n\"I have {path}. Move it to the bin?\" Wait.\n\nSTEP 3 — Her answer.\nNo, or a change of subject: \"Gotcha. Anything else?\" Transaction over.\nYes: go to STEP 4.\n\nSTEP 4 — SEND THE ACTION BLOCK NOW.\nThis is where your project flow issues a 4-digit code. It is not needed here, and here is why: the dialog this opens IS the second factor. Scribble asks for it on screen — and for five items or more it makes her type the file's name before the delete button will even arm. Inventing a code on top would be a third gate on a file that is recoverable for 30 days anyway.\nThe answer tells you exactly what is on screen, nested count included. Say it back short, and finish with what she does next:\n\"Bin dialog is up for {path}. Say confirm to move it, or close to back out.\"\n\nSTEP 5 — Her reply.\nConfirm / yes / go ahead → ui_confirm. That presses the dialog's real button.\nClose / cancel / never mind → ui_close.\nAnything else: answer it in one line, then repeat the two choices. The dialog stays open; nothing is lost by waiting.\n\nIf the ref has gone stale — she moved or deleted it between the locate and now — the action says so. Locate it again. Do not guess a new ref.\n\nA document file in the bin is recoverable for 30 days. Say so if she hesitates. Don't talk her out of it.\n═══════════════════════════════════════════════════════════════",
            requireAny:   ["bin","recycle bin","trashcan","delete","remove"],
            requireAll:   ["file*"],
            requireNone:  ["module*","section*","project*"],
        },
```

> `requireAll: ["file*"]` is the fence that keeps this off a project. If she
> says "document" instead of "file" it will not fire — add
> `requireAll: []` and rely on `requireAny` if you would rather be looser.

## B4 — File: Show Logs
*Your `Project: Show Logs`, two RULES verbatim.*

```js
        {
            // File: Show Logs
            keywords:     ["show","display","Present","open","modal","view"],
            intent:       "CONTROLLER",
            fetchTargets: ["poppy/surface"],
            writeFields:  ["action","name"],
            priority:     4,
            window:       3,
            guidelines:   "═══════════════════════════════════════════════════════════════\n🕹️ Jen wants to view a Document File's log in Scribble ; scribble_file_logs\n═══════════════════════════════════════════════════════════════\nTWO RULES.\n1. This opens a panel. It doesn't read anything back to you. Don't describe what's inside, don't summarise it, don't guess at counts — opening it is the whole job.\n2. The project page has to be open. If it isn't, the action comes back saying so. Don't claim you opened something you didn't.\n\nLIVE DATA gives you the Active surface line: which project and folder. Send her words as `name`; the page finds the file.\n\nNo such file: the action says so. Pass it on and stop.\nThe name fits more than one: it lists the paths. Read them back and ask which.\n═══════════════════════════════════════════════════════════════",
            requireAny:   ["logs","log","timeline","history"],
            requireAll:   ["file*"],
            requireNone:  ["module*","section*","project*"],
        },
```

Records, Details, Duplicate, Rename and Archive follow the same substitution —
your entry, noun and action name swapped, `buckets line` → `Active surface
line`, and a locate step in front of Rename and Archive because they take a ref.

---

# PART C — the swap table

| | document file | module | section |
|---|---|---|---|
| action prefix | `scribble_file_` | `scribble_module_` | `scribble_section_` |
| wire action | `file_*` | `module_*` | `section_*` |
| spoken noun | Document File | Module | Section |
| `requireAny` | `["file*","document*","doc","docs"]` | `["module*"]` | `["section*"]` |
| `requireNone` | `["module*","section*","project*"]` | `["section*","file*","document*","project*"]` | `["module*","file*","document*","project*"]` |

**Tier-exclusive — do not generate for the wrong tier:**

| verb | tiers |
|---|---|
| `_versions`, `_export`, `_details` | file only |
| `_promote` (takes a ref) | module only |

---

# PART D — read/write out of sync ✅ **APPLIED 2026-09-17**

**These are done, in `PoppyEngine-core.js`. Do not redo them.**
Gate arrays and two headers only — **not one word of your prompt text was
touched.** Each carries a dated inline comment saying what it used to be and
why it could not work. Verified against `gatesPass` (a hard reject) and
`hasTerm` (whole-word matching); the file parses.

| | before | after |
|---|---|---|
| `Project: Merge` requireAny | `["archive","storage"]` | `["merge","combine","absorb","fold into","roll into","merged"]` |
| `Project: Description` requireAny | `["logs","log","timeline","history"]` | `["description","describe","summary","summarise","summarize","blurb","what it is","what it's for","about"]` |
| `Project: Description` header | *"view a Project's log"* | *"set a Project's description"* |
| every fence (9 entries) | `["module","section"]` | `["module*","section*","file*","document*","doc","docs"]` |
| every `requireAll` (9 entries) | `["project"]` | `["project*"]` |

**Still not done — your call, because both mean deleting an entry:**
- `Projects: Logs Control` carries a logs header over the **Sort & Filter**
  body, duplicating the entry above it
- `Projects: Recent panel (copy)` is byte-identical to `Projects: Recent panel`

Neither adds a match the other doesn't. I left them because removing an entry
is a different kind of edit from fixing a gate.

## The original diagnosis, kept for the record

### D1 — `Project: Description` (line 714) can never fire
```js
requireAny:   ["logs","log","timeline","history"],   // ← copied from Show Logs
```
Its guideline names `scribble_describe`, but the gate only opens on a log word.
*"Set the description of project PassHub"* contains none, so the entry is
rejected outright. Its header also reads *"view a Project's log"*.

```js
// header:     ⚙️ Jen wants to set a Project's description ; scribble_describe
requireAny:   ["description","describe","summary","blurb","what it is","about"],
```

### D2 — `Project: Merge Projects` (line 700) can never fire
```js
requireAny:   ["archive","storage"],   // ← copied from Move to Archive
```
*"Merge Drafts into LifeHub"* contains neither word. For the one action that
**permanently deletes the source**, that is the wrong way to fail.

```js
requireAny:   ["merge","combine","absorb","fold into","roll into"],
```

### D3 — every fence misses its plurals, and all of the file words
`hasTerm` is whole-word, so `"module"` does **not** match `"modules"`.

```js
requireNone:  ["module","section"],                                        // today
requireNone:  ["module*","section*","file*","document*","doc","docs"],     // needed
```
And `requireAll: ["project"]` → `["project*"]`, or *"bin one of my projects"*
does not match it.

### D4 — two duplicates
`Projects: Logs Control` (775) carries a logs header over the **Sort & Filter**
body, duplicating the entry at 752. `Projects: Recent panel (copy)` (798) is
byte-identical to 786. Both are safe to delete; neither adds a match the other
does not.

**I have not touched `PoppyEngine-core.js`.** These are diffs for your editor —
you said those entries stand, and I am not editing hours of your work on my own
reading of it.

---

# PART E — test the page half first, with no Poppy at all

```js
LIFEHUB_SURFACE.can()                                   // what this page knows
await LIFEHUB_SURFACE.test('where')
await LIFEHUB_SURFACE.test('file_locate', { name: 'notes' })
await LIFEHUB_SURFACE.test('file_bin',    { ref: '<the ref from above>' })
```

Same handler, same argument, same sentence Poppy would say — Firestore skipped.
Worth doing before writing a word of vocabulary: it settles the wording of every
refusal while it is still cheap to change.

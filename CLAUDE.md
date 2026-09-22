# LifeHub: notes for Claude

Personal project by jenberjamin (solo; no collaborators). Plain HTML/CSS/JS,
no build step. Deployed from GitHub **jenberjamin/LifeHub** to **Vercel**. The
main target is the HomeScreen on a TCL Google TV (BrowseHere browser).

Read these before deployment, image or TV work:
- `Documentations/DEPLOYMENT.md`: commit/push routine, what's excluded and why, TV setup, troubleshooting
- `Documentations/IMAGE-OPTIMIZATION.md`: the pre-commit image/video optimizer

## Rules

- **Don't push from a Claude session.** It can't sign in to GitHub. Give the
  user the command; they run `git push` in the VS Code terminal.
- **Never add a gitignored path to the repo** without checking its reason in
  `.gitignore` first (API key in See-You-Latte, copyrighted books, personal
  files, SimStead is a separate project).
- **Images are WebP; icons stay PNG.** Don't reference `.png`/`.jpg` for
  photos. The pre-commit hook converts new ones and rewrites links.
- **File paths are case-sensitive on Vercel** even though Windows isn't.
  Match real folder/file capitals exactly (`CSS/`, not `css/`, at the root).
- **Use relative paths** in manifests and links, never ones starting with `/`.
- `JS/homescreen/LifeHub-homescreen-slides.js` is generated. Rebuild it with
  `node "JS/homescreen/LifeHub-homescreen-server.js" --scan`; don't edit it by hand.
- `sw.js` only registers on https (see `JS/lifehub-sw-register.js`). Bump
  `VERSION` in `sw.js` to force devices to drop old caches.
- `LifeHub-remote.html` is the phone remote. It writes presses to
  `lifehub_remote/<screen id>`; section 4 of `JS/lifehub-navigation-core.js`
  acts on them, so only pages that load that file respond to it.
  It installs as its own phone app: `remote-manifest.json`, `icons/remote-*`,
  and `remote-sw.js` (scoped to that page only, separate from `sw.js`; bump
  its `VERSION` to force phones to drop the remote's old caches).
  Its screen pick is sticky: a screen blips offline on every page change,
  so the remote never switches away on its own (that made it bounce
  between TV and computer). It lists only screens that are on, and
  removes `lifehub_screens` rows offline for over a week.
- Poppy talks to Gemini straight from the browser (connection "gemini" in
  `JS/poppy/LifeHub-poppy.js`), with the AI Studio key saved per browser. The
  local server (`LifeHub-poppy-server.js`) is only needed for Vertex.
  `LifeHub-poppy-phone.html` is her phone chat: same engines, no wallpaper.
  Both chats read action blocks with `JS/poppy/LifeHub-poppy-actions.js`.
  Her wallpaper actions (theme, paint, next…) take `on` like navigate and
  reach another screen through the remote channel as key `wallpaper`
  (`PoppyEngine-navigate.js` → navigation core → `LIFEHUB_WALLPAPER` in
  `LifeHub-homescreen.js`). Paint names live in `LifeHub-homescreen-paints.js`.
  Her `refresh` action sends the remote's `reload` press the same way.
- **Whenever you add or change a Poppy command, update the seeds too, and
  run them yourself; don't hand the user steps.** An action only reaches
  her when a dictionary entry with `writeFields: ["action"]` matches the
  message, so a new command with no entry is invisible to her.
  `JS/poppy/PoppyEngine-core.js` is generated; never edit it by hand.
  1. Add or extend the entry in the matching
     `Tools/Poppy-engine-editor/seed-*-entries.html` (the seed is the record).
  2. Write it into the editor's database (`lifehub---light` RTDB, plain
     REST, no login) the way the seed's button does, but **only add missing
     entries**: existing ones may have been tuned in the editor since.
     To change an existing entry, patch only the fields that need it.
     Dry-run first.
  3. Rebuild with `node Tools/Poppy-engine-editor/pull-engine.js` (it
     keeps a `.bak.js`), then check phrases through
     `PoppyEngine.evaluate()`: ones that should unlock the action and ones
     that shouldn't.
- The user isn't a Git expert. Explain in plain words and verify before
  claiming something works.

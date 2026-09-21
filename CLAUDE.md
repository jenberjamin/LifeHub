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
- Poppy's chat calls `http://localhost:3000`, so it doesn't work from the
  deployed site yet.
- The user isn't a Git expert. Explain in plain words and verify before
  claiming something works.

# Deploying LifeHub: how it works

*Written September 2026, when LifeHub first went online. Read this if it's
been a while and you've forgotten.*

---

## The one-sentence version

You **commit** your changes (a save point on your PC), then **push** them
(send them to GitHub). Vercel sees the push and updates the live site by itself.

---

## Where everything lives

| What | Where |
|---|---|
| Your working copy | `Desktop\LifeHub (Deployment)\` (this folder) |
| The copy on GitHub | **github.com/jenberjamin/LifeHub** |
| The live site | Vercel, which rebuilds from GitHub on every push. *(Add your `…vercel.app` address here once it's live.)* |
| The TV | TCL Google TV, BrowseHere. The site's plain address opens the HomeScreen. |

GitHub only has what you've **pushed**. Vercel only has what's on GitHub. So
if a change doesn't show up on the TV, the first question is always "did I
commit *and* push it?"

---

## The routine, every time you change something

### Option A: VS Code buttons (easiest)

1. Click **Source Control** in the left sidebar (the icon that looks like a
   branching line).
2. Type a short message in the box at the top, saying what you changed
   (e.g. `New FoodHub statistics page`).
3. Click **Commit**. If it asks whether to stage all changes, say **Yes**.
4. Click **Sync Changes** (or **Push**).

### Option B: the terminal

Open the terminal with **Ctrl + `**, then:

```
git add -A
git commit -m "what you changed"
git push
```

That's all. The live site updates a minute or two after the push.

---

## What happens along the way

**When you commit**, the image optimizer runs automatically (see
[IMAGE-OPTIMIZATION.md](IMAGE-OPTIMIZATION.md)):
- New PNG/JPG/GIF files become WebP, and links to them are updated.
- New videos are re-encoded if that saves 25% or more.
- Icons stay PNG.
- You'll see its report in the terminal or the VS Code output.

If a commit seems to **pause for a few minutes**, it's encoding a new video.
That's normal. Let it finish.

**When you push**, GitHub stores the new version, and Vercel rebuilds the
live site from it.

---

## Good habits

- **Commit often, with small, clear messages.** Every commit is a save point
  you can go back to. "Fixed hydration tracker colours" is better than
  "stuff".
- **Commit before trying something risky.** If it goes wrong, the last
  commit is your undo.
- **Check the message box before committing.** VS Code won't commit an empty
  message.

---

## What is deliberately NOT on GitHub

These stay on your PC only. They're listed in `.gitignore`, which is why Git
never picks them up:

| What | Why |
|---|---|
| `SimStead - Desktop (Prototype)` folders | A separate project that just lives in this folder |
| `Standalone\SEE-YOU-LATTE\` | Its `server.js` contains an API key that's tied to billing |
| LibraryHub books (`shared-library\*.pdf`, `*.txt`) | Copyrighted novels |
| `Documentations\*.xlsx`, `poppy-core-prompt.txt` | Personal |
| `_originals-backup\` | Your uncompressed originals, kept as a safety net |
| `Tools\image-optimizer\.venv\` | The optimizer's own Python setup; rebuilds itself |

**Never paste an API key, password or token into a file that gets committed.**
Git keeps everything forever. Deleting it later doesn't remove it from
history. If a key ever does get committed and pushed, treat it as leaked:
cancel it and make a new one.

---

## The TV

- The site's plain address (`https://<your-project>.vercel.app/`) opens the
  HomeScreen. `index.html` is the door that sends you there.
- `JS\lifehub-tv-frame.js` makes pages lay out at 1920 wide on the TV.
  Add `?tv=debug` to any address to see what the TV reports.
- `sw.js` keeps the HomeScreen running when the Wi-Fi drops. It only runs on
  the live https site, never on localhost or in Lively.
  - **If the TV acts strangely after an update**, open the address with
    `?sw=off` on the end, then reload normally.
  - Offline, the slideshow can only show photos it has already displayed.
- **Poppy's chat doesn't work from the TV yet.** It talks to a server on your
  PC (`localhost:3000`). Making it work means hosting that server online, for
  example as a Vercel function with the API key stored in Vercel's settings,
  not in the code.
- Plan for a proper TV display: **Fully Kiosk Browser** (Play Store), pointed
  at the site. It gives you full screen, opens when the TV turns on, and keeps
  the screen awake.

---

## When something goes wrong

**"Commit stopped: image-optimizer is not set up on this computer yet"**
Double-click `Tools\image-optimizer\optimize.bat` once, then commit again.
This happens on a new computer, or if the `.venv` folder was deleted.

**The commit says an image "could not be converted"**
The commit stopped on purpose, so an uncompressed image doesn't slip in.
Open the file to check it isn't broken, or replace it, then commit again.

**Push asks you to sign in**
Normal the first time on a computer. Choose "Sign in with your browser".

**Push says "rejected" / "fetch first"**
GitHub has something your PC doesn't (for example, you edited a file on
github.com). Run `git pull`, then `git push` again.

**The live site didn't change**
1. Did you commit *and* push? In VS Code, Source Control should show nothing
   waiting, and no number next to Sync.
2. Check the Vercel dashboard. The latest deployment should say *Ready*.
3. On the TV: reload, or try `?sw=off` once.

**A page works on your PC but is broken online**
Almost always capital letters. Windows ignores them, Vercel doesn't:
`css/files/x.webp` is not `CSS/files/x.webp`. Make links match the real
folder and file names exactly.

**Git says "LF will be replaced by CRLF"**
Harmless. It's just Git tidying line endings on Windows.

---

## Setting up on a new computer

1. Install **Git** (`winget install Git.Git`), **Python** (python.org, tick
   "Add to PATH") and, for videos, **ffmpeg** (`winget install Gyan.FFmpeg`).
2. `git clone https://github.com/jenberjamin/LifeHub.git`
3. Set your commit identity inside the folder:
   ```
   git config user.name "jenberjamin"
   git config user.email "246217556+jenberjamin@users.noreply.github.com"
   ```
   (That's GitHub's private address, so your Gmail stays hidden.)
4. Double-click `Tools\image-optimizer\install-git-hook.bat`, then
   `optimize.bat` once.
5. The files that aren't on GitHub (see the table above) need copying over
   separately if you want them there too.

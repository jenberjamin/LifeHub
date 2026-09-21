# Images & videos in LifeHub — how this works

*Written September 2026. Read this if it's been a while and you've forgotten.*

---

## The one-sentence version

Images get converted to **WebP** before they reach GitHub, automatically when
you commit. You don't normally have to do anything.

---

## Why any of this exists

LifeHub was 783 MB, and 707 MB of that was pictures. Some were 8K wallpapers
being shown on a 1080p screen. One "logo" was a 6.5 MB PNG hiding inside an
SVG file.

GitHub Pages — the thing that serves your site — stops working past **1 GB**.
So the images had to come down. Converting them to WebP took the image folder
from **554 MB to 195 MB**, about 65% off, with no visible quality loss.

The alternative was uploading every photo to Imgur and linking to them. That
was rejected: Imgur deletes images and blocks hotlinking, so the slideshow
would have broken eventually with no way to fix it.

---

## The rule that actually matters

> **Never commit an uncompressed image.**

Git keeps everything forever. If a 23 MB PNG gets committed today and you
compress it next month, the repository *still contains both copies* — permanently.
Anyone cloning it downloads the whole history.

You can't fix this afterwards without rewriting history. So the compression
has to happen **before** the commit, which is exactly what the hook does.

---

## Normal use

Just work. Paste images wherever you want, whatever format. When you commit,
they get converted automatically and the commit proceeds with the WebP versions.

If the hook is installed, there is nothing to remember.

---

## Doing it by hand

In `Tools\image-optimizer\` there are three files you can double-click:

| File | What it does |
|---|---|
| **preview-only.bat** | Lists what *would* change. Changes nothing. Always safe. |
| **optimize.bat** | Actually converts. |
| **install-git-hook.bat** | Sets up the automatic-on-commit behaviour. Run once. |

Start with `preview-only.bat` if you're unsure. It cannot break anything.

First run of `optimize.bat` takes an extra minute — it builds its own small
Python environment in `Tools\image-optimizer\.venv\`. That folder is ignored by
Git and can be deleted at any time; it just rebuilds itself next run.

---

## What it does to your files

- `photo.png` becomes `photo.webp`
- The original is **moved**, not deleted, to `_originals-backup\` in the project
  root. That folder is excluded from Git. Delete it once you're happy.
- Every mention of `photo.png` in your `.html`, `.css` and `.js` is updated to
  `photo.webp` automatically.
- Web addresses (`https://...`) are left alone. Those are other people's
  images — TMDB posters, OpenLibrary covers — and were never yours to compress.

**Running it twice is harmless.** Once a file is `photo.webp` it no longer
matches PNG/JPG/GIF, so it can't be picked up again. This matters: WebP is
lossy, and re-compressing the same image over and over would slowly destroy it.
The rename is what prevents that.

**Icons always stay PNG.** Anything used in a `<link rel="icon">` /
`apple-touch-icon` tag, or listed in a `manifest.json` / `.webmanifest`, is
skipped automatically. iPhones won't use a WebP home-screen icon, and PWA
manifests expect PNG. Icons are tiny anyway, so nothing is lost.

**Links are only changed if they really point at the converted file.** Just
sharing a name isn't enough: converting `2.png` must not touch a link to
`icon_2.png`. Links that were already broken are left exactly as they were.

**Sometimes the original wins.** Some animated GIFs and some already-tight
JPEGs come out *bigger* as WebP. When that happens the original is kept
untouched, and its name goes in `Tools\image-optimizer\kept-originals.txt` so
it isn't re-tried every commit. That file **should** be committed. If you swap
one of those images for a different one, it's automatically tried again. In
the first big run, 106 of 971 images stayed as originals this way.

---

## The settings

In `optimize.py`, near the top:

```python
MAX_EDGE       = 1920   # longest side; anything bigger gets scaled down
QUALITY        = 82     # 0-100. Higher = better looking, bigger file
LOSSLESS_UNDER = 512    # small images (icons) use lossless mode instead

VIDEO_CRF        = 23   # video quality. LOWER = better looking, bigger file
VIDEO_MIN_SAVING = 0.25 # only replace a video if it gets 25%+ smaller
```

If a converted image ever looks bad, raise `QUALITY` to 88 or 90 and re-run it
against the original from `_originals-backup\`. Going below 75 starts to show.

---

## Videos

Videos (`.mp4`, `.mov`, `.m4v`) are handled too, using a tool called
**ffmpeg** (installed September 2026 with `winget install Gyan.FFmpeg`).

- They're re-encoded to H.264 `.mp4`, which plays in every browser.
- The new version is **only used if it's at least 25% smaller.** Videos
  straight off a phone usually shrink a lot. Ones that are already tight are
  left exactly as they are, because re-compressing an already-compressed
  video only loses quality.
- A `.mov` becomes `.mp4`, and links to it are updated like images.
- Every video that's been dealt with, either way, is listed in
  `Tools\image-optimizer\videos-done.txt`, so it's never re-encoded twice.
  That file **should** be committed.
- **HDR videos** (iPhone "HDR" / Dolby Vision) are left alone. A simple
  re-encode would make their colours look washed out.
- Encoding takes a while: roughly as long as the video itself. So a commit
  with a new 3-minute video pauses for a few minutes. That's normal.

The four videos in InspoHub were checked by hand when this was set up.
`second_star.mp4` (32.7 MB) was already tightly compressed by the phone, so
re-encoding saved almost nothing, and it was kept as-is. That's fine: GitHub
only warns about files over 50 MB, and the optimizer tells you if a video gets
close to that.

If ffmpeg is ever missing (a new computer, say), the optimizer still converts
images and just tells you that videos weren't checked.

---

## What is *not* handled

**PDFs.** Also skipped. The ones in LibraryHub are commercial novels, so the
question there isn't file size — it's that publishing them in a public repo
means redistributing copyrighted books. They're excluded from Git for that
reason.

**SVGs.** Left alone, because LifeHub's own SVGs total only 0.7 MB. But the
optimizer *warns* you if it finds an SVG with a picture embedded inside it —
that's what made SimStead's logo 6.5 MB, and it's an easy trap to fall into
when exporting from design tools.

---

## Things that are deliberately excluded from GitHub

Listed in `.gitignore`:

- **SimStead** — a separate project that only lives in this folder so you don't
  have to keep two windows open. Not part of LifeHub, not deployed with it.
- **`_originals-backup\`** — your uncompressed originals. The entire point is to
  keep these *out* of the repo.
- **`.venv\`** — the optimizer's private Python environment. Rebuilds itself.
- **The LibraryHub books** (PDF and .txt) — see above.
- **See-You-Latte** (`Standalone\SEE-YOU-LATTE\`) — its `server.js` contains a
  Gemini API key, which is tied to billing. It stays on your PC only.
- **Personal documents** — the spreadsheets in `Documentations\` and
  `poppy-core-prompt.txt`.

---

## If the slideshow breaks

`JS\homescreen\LifeHub-homescreen-slides.js` is **generated, not written by hand**.
Editing it directly gets overwritten. To rebuild it:

```
node "JS/homescreen/LifeHub-homescreen-server.js" --scan
```

The scanner already understands `.webp`, so this works unchanged.

---

## If something goes wrong

Everything is recoverable:

1. Your originals are in `_originals-backup\`, in the same folder layout.
   Code files as they were *before* the first big conversion are in
   `_originals-backup\_code-before-webp\`.
2. Once Git is set up, `git status` shows exactly what changed and
   `git checkout -- .` undoes uncommitted changes.
3. The optimizer never touches anything outside this folder.

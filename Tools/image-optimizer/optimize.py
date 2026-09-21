"""
LifeHub image optimizer.
-----------------------
Finds any PNG / JPG / JPEG / GIF in the LifeHub folder, converts it to WebP,
and updates every reference to it in the .html / .css / .js files.

Safe to run as often as you like. Converting renames the file (photo.png ->
photo.webp), so a file that has already been done can never be picked up a
second time -- there is no risk of re-compressing an image into mush.

If the WebP would come out BIGGER than the original (this happens with some
animated GIFs and already-tight JPEGs), the original is kept and noted in
kept-originals.txt so it isn't re-tried every run. Replace that image with a
different one and it gets tried again.

Videos (.mp4 / .mov / .m4v) are re-encoded to H.264 MP4, which plays in every
browser -- but only kept if that saves at least 25%. Phone videos usually
shrink a lot; ones that are already tight are left exactly as they are. Every
video that has been dealt with either way is listed in videos-done.txt, so it
is never re-encoded twice. HDR videos (e.g. iPhone Dolby Vision) are left
alone, because a simple re-encode would wash out their colours. Needs ffmpeg.

Originals are moved to _originals-backup/ (not deleted, not committed).

Run it with optimize.bat, or:  python optimize.py
Preview without changing anything:  python optimize.py --dry-run
Used by the Git pre-commit hook:   python optimize.py --changed-list FILE
  (writes every path it touched into FILE, so the hook stages only those)
"""
import os, sys, re, io, glob, json, shutil, subprocess, time
from urllib.parse import unquote

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow is not installed. Run optimize.bat instead of this file.")

Image.MAX_IMAGE_PIXELS = None

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BACKUP = os.path.join(ROOT, "_originals-backup")
KEPT   = os.path.join(HERE, "kept-originals.txt")
VIDEOS_DONE = os.path.join(HERE, "videos-done.txt")

MAX_EDGE       = 1920   # nothing on a screen needs to be wider than this
QUALITY        = 82     # WebP quality for photos (82 is visually lossless-ish)
LOSSLESS_UNDER = 512    # small images (icons) use lossless WebP instead

VIDEO_CRF         = 23     # H.264 quality. Lower = better looking, bigger file
VIDEO_MIN_SAVING  = 0.25   # only replace a video if the new one is 25%+ smaller
VIDEO_WARN_MB     = 40     # GitHub warns at 50 MB per file and refuses 100 MB

RASTER = {".jpg", ".jpeg", ".png", ".gif"}
VIDEO  = {".mp4", ".mov", ".m4v"}
CODE   = {".html", ".css", ".js"}

# Folders that are never touched. SimStead is a separate project that just
# happens to live in this folder; node_modules and .git are not ours.
SKIP_DIRS    = {".git", "node_modules", ".vscode", "_originals-backup"}
SKIP_PREFIX  = ("SimStead",)

DRY = "--dry-run" in sys.argv
CHANGED_LIST = (sys.argv[sys.argv.index("--changed-list") + 1]
                if "--changed-list" in sys.argv else None)
CHANGED = set()     # project-relative paths this run added, removed or edited


def touched(path):
    CHANGED.add(os.path.relpath(path, ROOT).replace("\\", "/"))

# App / browser icons stay PNG: iPhone home-screen icons and PWA manifests
# don't accept WebP, and icons are tiny so there's nothing to gain anyway.
ICON_LINK = re.compile(r"""<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*>""", re.I)
HREF      = re.compile(r"""href=["']([^"']+)["']""", re.I)
JSON_IMG  = re.compile(r""""([^"]+\.(?:png|jpe?g|gif|webp))\"""", re.I)


def walk(exts):
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames
                       if d not in SKIP_DIRS and not d.startswith(SKIP_PREFIX)]
        for fn in filenames:
            if os.path.splitext(fn)[1].lower() in exts:
                yield os.path.join(dirpath, fn)


def icon_names():
    """Lower-case file names (no extension) of images used as icons: anything
    in a <link rel="...icon..."> tag, or listed in a .json / .webmanifest."""
    names = set()
    for path in walk({".html"}):
        try:
            text = open(path, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        for tag in ICON_LINK.findall(text):
            m = HREF.search(tag)
            if m:
                names.add(os.path.splitext(os.path.basename(m.group(1)))[0].lower())
    for path in walk({".json", ".webmanifest"}):
        try:
            text = open(path, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        for ref in JSON_IMG.findall(text):
            names.add(os.path.splitext(os.path.basename(ref))[0].lower())
    return names


def load_ledger(path):
    """{relative path: size} from a ledger file (kept-originals / videos-done)."""
    entries = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "|" in line:
                rel, size = line.rsplit("|", 1)
                entries[rel] = int(size)
    return entries


def save_ledger(path, entries, header):
    touched(path)
    with open(path, "w", encoding="utf-8") as f:
        for h in header:
            f.write(f"# {h}\n")
        for rel in sorted(entries):
            f.write(f"{rel}|{entries[rel]}\n")


def load_kept():
    return load_ledger(KEPT)


def save_kept(kept):
    save_ledger(KEPT, kept, [
        "Images where the original was already smaller than WebP.",
        "The optimizer skips these. Format: path|size-in-bytes",
        "If you replace one of these images, it is tried again."])


def encode(src):
    """Encode src to WebP in memory. Returns the bytes."""
    buf = io.BytesIO()
    with Image.open(src) as im:
        if getattr(im, "n_frames", 1) > 1:          # animated GIF
            im.save(buf, "WEBP", save_all=True, quality=70, method=4)
            return buf.getvalue()

        im = ImageOps.exif_transpose(im)             # fix sideways photos
        alpha = im.mode in ("RGBA", "LA") or (
            im.mode == "P" and "transparency" in im.info)
        im = im.convert("RGBA" if alpha else "RGB")

        w, h = im.size
        if max(w, h) > MAX_EDGE:
            sc = MAX_EDGE / max(w, h)
            im = im.resize((round(w * sc), round(h * sc)), Image.LANCZOS)

        if max(im.size) < LOSSLESS_UNDER:
            im.save(buf, "WEBP", lossless=True, method=6)
        else:
            im.save(buf, "WEBP", quality=QUALITY, method=6)
    return buf.getvalue()


def convert(src):
    """Returns (orig_bytes, new_bytes, converted?). Keeps the original if
    the WebP would not be smaller."""
    orig = os.path.getsize(src)
    data = encode(src)
    if len(data) >= orig:
        return orig, orig, False
    if not DRY:
        with open(os.path.splitext(src)[0] + ".webp", "wb") as f:
            f.write(data)
    return orig, len(data), True


RETIRED = [0]


def retire(src):
    """Move the original into _originals-backup, keeping its folder layout."""
    rel = os.path.relpath(src, ROOT)
    dest = os.path.join(BACKUP, rel)
    if os.path.exists(dest):            # an earlier original with the same name
        stem, ext = os.path.splitext(dest)
        dest = f"{stem}.{time.strftime('%Y%m%d-%H%M%S')}{ext}"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.move(src, dest)
    RETIRED[0] += 1


def find_ffmpeg():
    """(ffmpeg, ffprobe) paths, or (None, None). Looks on PATH, then in the
    place winget installs it."""
    ff = shutil.which("ffmpeg")
    if not ff:
        hits = glob.glob(os.path.join(os.environ.get("LOCALAPPDATA", ""),
                         "Microsoft", "WinGet", "Packages", "*FFmpeg*",
                         "**", "bin", "ffmpeg.exe"), recursive=True)
        ff = hits[0] if hits else None
    if not ff:
        return None, None
    probe = os.path.join(os.path.dirname(ff),
                         "ffprobe.exe" if ff.lower().endswith(".exe") else "ffprobe")
    return ff, (probe if os.path.exists(probe) else shutil.which("ffprobe"))


def video_info(ffprobe, src):
    """(width, height, is_hdr) of the first video stream."""
    out = subprocess.run([ffprobe, "-v", "quiet", "-print_format", "json",
                          "-select_streams", "v:0", "-show_streams", src],
                         capture_output=True, text=True, check=True).stdout
    s = json.loads(out)["streams"][0]
    hdr = s.get("color_transfer") in ("smpte2084", "arib-std-b67")
    return int(s["width"]), int(s["height"]), hdr


def encode_video(ffmpeg, src, dst, w, h):
    cmd = [ffmpeg, "-y", "-v", "error", "-i", src]
    if max(w, h) > MAX_EDGE:
        cmd += ["-vf", f"scale='if(gt(iw,ih),{MAX_EDGE},-2)':'if(gt(iw,ih),-2,{MAX_EDGE})'"]
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", str(VIDEO_CRF),
            "-profile:v", "high", "-pix_fmt", "yuv420p",
            "-fps_mode", "passthrough",          # keep phone timing: A/V stays in sync
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",           # starts playing before fully loaded
            "-f", "mp4", dst]
    subprocess.run(cmd, check=True, capture_output=True)


def optimize_videos(renamed):
    """Re-encode new videos. Adds {old rel: '.mp4'} to `renamed` for any whose
    extension changed (e.g. .mov). Returns a list of notes to print."""
    done = load_ledger(VIDEOS_DONE)
    todo = []
    for src in walk(VIDEO):
        rel = os.path.relpath(src, ROOT)
        if done.get(rel) != os.path.getsize(src):
            todo.append(src)
    if not todo:
        return []

    notes = []
    if DRY:
        return [f"Would check {len(todo)} new video(s): " +
                ", ".join(os.path.relpath(s, ROOT) for s in todo)]

    ffmpeg, ffprobe = find_ffmpeg()
    if not ffmpeg or not ffprobe:
        return [f"ffmpeg not found - {len(todo)} new video(s) were not checked."]

    MB = 1048576
    changed = False
    for src in todo:
        rel = os.path.relpath(src, ROOT)
        orig = os.path.getsize(src)
        try:
            w, h, hdr = video_info(ffprobe, src)
            if hdr:
                done[rel] = orig; changed = True
                notes.append(f"Left as-is (HDR video; re-encoding would wash out colours): {rel}")
                continue
            print(f"  Encoding video {rel} ({orig/MB:.1f} MB) - this can take a few minutes...",
                  flush=True)
            tmp = src + ".optimizing"
            encode_video(ffmpeg, src, tmp, w, h)
            new = os.path.getsize(tmp)
            final = os.path.splitext(src)[0] + ".mp4"
            if new > orig * (1 - VIDEO_MIN_SAVING):
                os.remove(tmp)
                done[rel] = orig; changed = True
                notes.append(f"Kept original ({orig/MB:.1f} MB; re-encoding only reached "
                             f"{new/MB:.1f} MB): {rel}")
                continue
            if os.path.normcase(final) != os.path.normcase(src) and os.path.exists(final):
                os.remove(tmp)
                notes.append(f"Skipped - {os.path.basename(final)} already exists: {rel}")
                continue
            retire(src)
            os.replace(tmp, final)
            touched(src); touched(final)
            done[os.path.relpath(final, ROOT)] = new; changed = True
            if os.path.normcase(final) != os.path.normcase(src):
                renamed[rel] = ".mp4"
            notes.append(f"Video {orig/MB:.1f} MB -> {new/MB:.1f} MB: "
                         f"{os.path.relpath(final, ROOT)}")
        except Exception as e:
            if os.path.exists(src + ".optimizing"):
                os.remove(src + ".optimizing")
            notes.append(f"Video could not be processed ({str(e)[:80]}): {rel}")
    if changed:
        save_ledger(VIDEOS_DONE, done, [
            "Videos the optimizer has already dealt with (re-encoded, or kept",
            "because re-encoding wasn't worth it). Format: path|size-in-bytes",
            "If you replace one of these videos, it is checked again."])
    return notes


def points_at(ref, file_dir, targets):
    """The target `ref` refers to, or None. `ref` is written inside a file in
    file_dir; `targets` is a set of normalised project-relative paths. Tries
    the file's own folder, then each parent up to the project root -- the same
    places a browser could resolve it from, depending on which page loads it."""
    ref = unquote(ref.strip().split("?")[0].split("#")[0]).replace("\\", "/")
    if ref.startswith("/"):
        bases = [ROOT]
    else:
        bases, d = [], file_dir
        while True:
            bases.append(d)
            if os.path.normcase(d) == os.path.normcase(ROOT):
                break
            parent = os.path.dirname(d)
            if parent == d:
                break
            d = parent
    for base in bases:
        full = os.path.normpath(os.path.join(base, ref.lstrip("/")))
        rel = os.path.normcase(os.path.relpath(full, ROOT))
        if rel in targets:
            return rel
        if os.path.exists(full):
            return None         # resolves to some other file that wasn't converted
    return None


def rewrite_references(renamed):
    """Point .html/.css/.js at the new names. `renamed` maps each converted
    file's old project-relative path to its new extension ('.webp', '.mp4').
    A reference is only changed if it really resolves to a converted file --
    matching on the name alone would also hit e.g. 'icon_2.png' when '2.png'
    was converted."""
    if not renamed:
        return 0, 0
    targets = {os.path.normcase(os.path.normpath(r)): ext for r, ext in renamed.items()}
    names = sorted({os.path.basename(o) for o in renamed}, key=len, reverse=True)
    # a candidate starts after a quote, bracket, '=' or line start; may contain
    # spaces (folders like "New York") but never quotes, brackets or newlines
    pattern = re.compile(
        r"""(?:^|(?<=["'(=`]))([^"'()<>`\n]*?(?:""" +
        "|".join(re.escape(n) for n in names) + r"""))(?![\w])""",
        re.M | re.I)

    files_changed = refs_changed = 0
    for path in walk(CODE):
        try:
            text = open(path, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue

        hits = [0]
        here = os.path.dirname(path)

        def sub(m):
            ref = m.group(1)
            if ref.strip().startswith(("http://", "https://", "data:", "//")):
                return ref
            hit = points_at(ref, here, targets)
            if hit is None:
                return ref
            hits[0] += 1
            return os.path.splitext(ref)[0] + targets[hit]

        new = pattern.sub(sub, text)
        if hits[0] and new != text:
            if not DRY:
                open(path, "w", encoding="utf-8", newline="").write(new)
                touched(path)
            files_changed += 1
            refs_changed += hits[0]
    return files_changed, refs_changed


def warnings():
    out = []
    for path in walk({".svg"}):
        try:
            with open(path, "rb") as f:
                if b"base64" in f.read(8000):
                    mb = os.path.getsize(path) / 1048576
                    if mb > 0.2:
                        out.append(f"SVG holds an embedded image "
                                   f"({mb:.1f} MB): {os.path.relpath(path, ROOT)}")
        except OSError:
            pass
    for path in walk(VIDEO | {".webm"}):
        mb = os.path.getsize(path) / 1048576
        if mb > VIDEO_WARN_MB:
            out.append(f"Video close to GitHub's 50 MB file limit ({mb:.1f} MB): "
                       f"{os.path.relpath(path, ROOT)}")
    return out


def main():
    print("LifeHub image optimizer" + ("  [DRY RUN - nothing will change]" if DRY else ""))
    print(f"Folder: {ROOT}\n")

    kept = load_kept()
    icons = icon_names()
    todo, failed = [], []
    for src in walk(RASTER):
        rel = os.path.relpath(src, ROOT)
        if kept.get(rel) == os.path.getsize(src):
            continue                    # already tried; original was smaller
        if os.path.splitext(os.path.basename(src))[0].lower() in icons:
            continue                    # used as an app/browser icon: stays PNG
        todo.append(src)

    renamed = {}            # old relative path -> new extension
    if not todo:
        print("No new images.")
    else:
        print(f"Found {len(todo)} new image(s).\n")
        before = after = 0
        kept_now = []
        t0 = time.time()

        for i, src in enumerate(todo, 1):
            rel = os.path.relpath(src, ROOT)
            try:
                o, n, converted = convert(src)
                before += o
                after += n
                if converted:
                    if not DRY:
                        retire(src)
                        touched(src)
                        touched(os.path.splitext(src)[0] + ".webp")
                    renamed[rel] = ".webp"
                else:
                    kept_now.append(rel)
                    kept[rel] = o
                if len(todo) <= 40 or i % 50 == 0:
                    print(f"  [{i}/{len(todo)}] {rel}")
            except Exception as e:
                failed.append((rel, str(e)[:90]))

        MB = 1048576
        verb = "Would convert" if DRY else "Converted"
        print(f"\n{verb} {len(renamed)} image(s) in {time.time()-t0:.0f}s")
        if kept_now:
            print(f"Kept {len(kept_now)} original(s) - WebP would have been bigger.")
        if before:
            print(f"{before/MB:.1f} MB -> {after/MB:.1f} MB "
                  f"({100*(before-after)/before:.0f}% smaller)")
        for rel, err in failed:
            print(f"  FAILED: {rel} - {err}")
        if not DRY and kept_now:
            save_kept(kept)

    video_notes = optimize_videos(renamed)
    for n in video_notes:
        print(f"  {n}")
    if not video_notes:
        print("No new videos.")

    if renamed:
        fc, rc = rewrite_references(renamed)
        print(f"{'Would update' if DRY else 'Updated'} {rc} reference(s) "
              f"across {fc} file(s).")
    if RETIRED[0]:
        print(f"{RETIRED[0]} original(s) moved to: {os.path.relpath(BACKUP, ROOT)}")

    for w in warnings():
        print(f"\n  NOTE: {w}")

    slides = os.path.join(ROOT, "JS", "homescreen", "LifeHub-homescreen-server.js")
    if os.path.exists(slides) and not CHANGED_LIST:
        print("\nIf you added or removed slideshow images, regenerate the list:")
        print("   node \"JS/homescreen/LifeHub-homescreen-server.js\" --scan")

    if CHANGED_LIST:
        with open(CHANGED_LIST, "w", encoding="utf-8", newline="\n") as f:
            f.writelines(p + "\n" for p in sorted(CHANGED))

    if todo and failed:
        # an image that failed to convert would otherwise be committed as-is
        sys.exit(f"\n{len(failed)} image(s) could not be converted - see above.")


if __name__ == "__main__":
    main()

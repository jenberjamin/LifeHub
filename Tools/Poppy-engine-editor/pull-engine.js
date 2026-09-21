/* LifeHub — pull the PoppyEngine dictionary out of Firebase and
   regenerate JS/poppy/PoppyEngine-core.js.
   ────────────────────────────────────────────────────────────────
   Replaces the copy-paste. Run it after editing in the editor:

     node Tools/Poppy-engine-editor/pull-engine.js
     node Tools/Poppy-engine-editor/pull-engine.js --dry

   ── WHY THIS EXISTS ──────────────────────────────────────────────
   The editor's Export button builds the same file in the browser,
   but getting it onto disk meant selecting 150KB of textarea and
   pasting it over a file the Home Screen loads synchronously. One
   truncated paste and Poppy loses her whole dictionary.

   ── WHAT IT MIRRORS ──────────────────────────────────────────────
   buildDict() and buildFullFile() in PoppyEngine-Editor.html, field
   for field, so the output is what the Export button would have
   produced. Two deliberate differences, both fixes:

     · INTENT_LIMIT, WINDOW_DEPTH and FALLBACK_INTENT are READ BACK
       from the existing file rather than hardcoded. The editor's
       exporter still writes INTENT_LIMIT: 4; the live file runs 12,
       and a full export would silently roll that back.

     · Entry order is always manual `order`, never the editor's
       localStorage sort setting. Dictionary order breaks scoring
       ties, so it should not depend on how the list happened to be
       sorted in a browser at export time.

   evaluate() is copied verbatim from the editor's <script
   id="evaluateSrc"> block — the same source the Export button uses,
   so there is still exactly one copy of the engine logic.
*/

const fs   = require("fs");
const path = require("path");

const ROOT   = path.resolve(__dirname, "..", "..");
const EDITOR = path.join(__dirname, "PoppyEngine-Editor.html");
const TARGET = path.join(ROOT, "JS", "poppy", "PoppyEngine-core.js");
const BACKUP = path.join(ROOT, "JS", "poppy", "PoppyEngine-core.bak.js");

/* The editor's Firebase — a different project from the app's own
   (lifehub-cae1d). Kept in step with PoppyEngine-Editor.html. */
const RTDB = "https://lifehub---light-default-rtdb.asia-southeast1.firebasedatabase.app";

const DRY = process.argv.includes("--dry");

/* --out lets the result be written somewhere harmless and inspected
   before it goes anywhere near the file the Home Screen loads. */
const OUT_FLAG = process.argv.indexOf("--out");
const OUT = OUT_FLAG !== -1 ? process.argv[OUT_FLAG + 1] : null;

/* Firebase drops empty arrays entirely and returns sparse ones as
   objects, so nothing coming back over REST can be trusted to still
   be an array. */
function toArr(v) {
  if (Array.isArray(v)) return v.filter(x => x != null);
  if (v && typeof v === "object") return Object.keys(v).map(k => v[k]).filter(x => x != null);
  return v == null ? [] : [v];
}

async function read(node) {
  const res = await fetch(RTDB + "/poppyEngine/" + node + ".json");
  if (!res.ok) throw new Error(node + ": Firebase said " + res.status + " " + res.statusText);
  return res.json();
}


/* ══════════════════════════════════════════════════════
   The dictionary — mirrors buildDict()
   ══════════════════════════════════════════════════════ */

function buildDict(entries) {
  const list = Object.keys(entries)
    .map(id => entries[id])
    .filter(e => e && e.intent && e.hidden !== true)
    .sort((a, b) =>
      ((a.order == null ? 9e9 : a.order) - (b.order == null ? 9e9 : b.order)) ||
      String(a.name || "").localeCompare(String(b.name || "")));

  if (!list.length) return "        // No entries yet (or all are excluded)";

  return list.map(e => {
    const lines = [];
    lines.push(`        {`);
    if (e.name) lines.push(`            // ${e.name}`);
    lines.push(`            keywords:     ${JSON.stringify(toArr(e.keywords))},`);
    lines.push(`            intent:       "${e.intent}",`);
    lines.push(`            fetchTargets: ${JSON.stringify(toArr(e.fetchTargets))},`);
    lines.push(`            writeFields:  ${JSON.stringify(toArr(e.writeFields))},`);
    lines.push(`            priority:     ${e.priority || 3},`);
    if (e.window)   lines.push(`            window:       ${e.window},`);
    if (e.cooldown) lines.push(`            cooldown:     ${e.cooldown},`);
    if (e.blockType && e.blockType !== "instruction")
      lines.push(`            blockType:    ${JSON.stringify(e.blockType)},`);
    if ((e.guidelines || "").trim())
      lines.push(`            guidelines:   ${JSON.stringify(e.guidelines.trim())},`);
    if (toArr(e.requireAny).length)  lines.push(`            requireAny:   ${JSON.stringify(toArr(e.requireAny))},`);
    if (toArr(e.requireAll).length)  lines.push(`            requireAll:   ${JSON.stringify(toArr(e.requireAll))},`);
    if (toArr(e.requireNone).length) lines.push(`            requireNone:  ${JSON.stringify(toArr(e.requireNone))},`);
    if (toArr(e.notAll).length)      lines.push(`            notAll:       ${JSON.stringify(toArr(e.notAll))},`);

    const shifts = toArr(e.Shifts);
    if (shifts.length) {
      lines.push(`            Shifts: [`);
      shifts.forEach(s => {
        const parts = [`title: ${JSON.stringify(s.title || "")}`];
        if (toArr(s.keywords).length)    parts.push(`keywords: ${JSON.stringify(toArr(s.keywords))}`);
        if (toArr(s.requireAny).length)  parts.push(`requireAny: ${JSON.stringify(toArr(s.requireAny))}`);
        if (toArr(s.requireNone).length) parts.push(`requireNone: ${JSON.stringify(toArr(s.requireNone))}`);
        parts.push(`guidelines: ${JSON.stringify(s.guidelines || "")}`);
        lines.push(`                { ${parts.join(", ")} },`);
      });
      lines.push(`            ],`);
    }
    lines.push(`        }`);
    return lines.join("\n");
  }).join(",\n\n");
}


/* ══════════════════════════════════════════════════════
   evaluate() — lifted from the editor, not retyped
   ══════════════════════════════════════════════════════ */

function evaluateSrc() {
  const html = fs.readFileSync(EDITOR, "utf8");
  const m = html.match(/<script type="text\/plain" id="evaluateSrc">([\s\S]*?)<\/script>/);
  if (!m) {
    throw new Error("Couldn't find the evaluateSrc block in PoppyEngine-Editor.html. " +
                    "If that script tag was renamed, this script needs the new name.");
  }
  return m[1].trim();
}


/* ══════════════════════════════════════════════════════
   Settings carried over from the file being replaced
   ══════════════════════════════════════════════════════
   These three are tuned by hand in PoppyEngine-core.js and are not
   in the editor's UI at all, so a regenerate must not invent them. */

function carriedSettings() {
  const fallback = { INTENT_LIMIT: 12, WINDOW_DEPTH: 6, FALLBACK_INTENT: "null" };
  let old;
  try { old = fs.readFileSync(TARGET, "utf8"); } catch { return fallback; }

  const grab = (key, re) => {
    const hit = old.match(re);
    return hit ? hit[1].trim() : fallback[key];
  };
  return {
    INTENT_LIMIT:    grab("INTENT_LIMIT",    /INTENT_LIMIT:\s*([^,\n]+)/),
    WINDOW_DEPTH:    grab("WINDOW_DEPTH",    /WINDOW_DEPTH:\s*([^,\n]+)/),
    FALLBACK_INTENT: grab("FALLBACK_INTENT", /FALLBACK_INTENT:\s*([^,\n]+)/)
  };
}

/* The core prompt is the one piece of live text that is NOT reliably
   in Firebase. poppyEngine/core is currently an empty string, while
   the file carries Jen's whole identity block — so a full export,
   from the editor's own button just as much as from here, would wipe
   it. When Firebase has nothing, the file's own core: literal is
   carried across untouched. Saving the Core Prompt panel in the
   editor puts Firebase back in charge. */
function carriedCore() {
  let old;
  try { old = fs.readFileSync(TARGET, "utf8"); } catch { return null; }
  const m = old.match(/^\s*core:\s*("(?:[^"\\]|\\.)*")\s*,\s*$/m);
  if (!m) return null;
  const text = JSON.parse(m[1]);
  return text.trim() ? m[1] : null;   // the literal, re-emitted verbatim
}


/* ══════════════════════════════════════════════════════
   The file — mirrors buildFullFile()
   ══════════════════════════════════════════════════════ */

function buildFullFile(entries, corePrompt, count) {
  const s = carriedSettings();
  const coreLiteral = String(corePrompt || "").trim()
    ? JSON.stringify(corePrompt)
    : (carriedCore() || JSON.stringify(""));
  return [
    `/* LifeHub — PoppyEngine.`,
    `   ────────────────────────────────────────────────────────────────`,
    `   THIS FILE IS GENERATED. Don't hand-edit it — change it in the`,
    `   PoppyEngine editor, then run:`,
    ``,
    `     node Tools/Poppy-engine-editor/pull-engine.js`,
    ``,
    `   Anything typed in here directly is lost on the next pull.`,
    ``,
    `   Generated ${new Date().toLocaleDateString("en-US")} · ${count} entries`,
    ``,
    `   ── What this is ────────────────────────────────────────────────`,
    `   A filter, not a brain. It reads the current message, decides which`,
    `   entries the keywords let through, and returns only their text.`,
    `   Nothing here describes how Poppy sounds — that lives in`,
    `   js/LifeHub-poppy-modes.js.`,
    ``,
    `   ── What evaluate() gives back ──────────────────────────────────`,
    `     intent        the highest-scoring match, or FALLBACK_INTENT`,
    `     identity[]    standing facts about her or Jen`,
    `     context[]     background that only matters sometimes`,
    `     rules[]       what to do about THIS message`,
    `     fetchTargets  paths to read before answering`,
    `     writeFields   field names she's allowed to set`,
    `     prompt        the above, already assembled`,
    `     intents[]     every match, with its own fields`,
    ``,
    `   ── Window and cooldown ─────────────────────────────────────────`,
    `     window     how many recent messages an entry may match against.`,
    `                Defaults to WINDOW_DEPTH. Set 1 for actions.`,
    `     cooldown   turns the entry stays quiet after firing. A fresh`,
    `                mention in the current message always fires anyway.`,
    ``,
    `   ── Usage ───────────────────────────────────────────────────────`,
    `     const result = PoppyEngine.evaluate([{ content: userMessage }]);`,
    ``,
    `   Load this BEFORE js/LifeHub-poppy.js.`,
    `*/`,
    ``,
    `window.PoppyEngine = {`,
    ``,
    `    INTENT_LIMIT: ${s.INTENT_LIMIT},        // max intents returned per message`,
    `    WINDOW_DEPTH: ${s.WINDOW_DEPTH},        // how many recent messages keywords may match`,
    `    FALLBACK_INTENT: ${s.FALLBACK_INTENT},  // returned when nothing matches`,
    ``,
    `    // Call this when the chat is cleared — forgets every cooldown.`,
    `    resetMemory: function () { this._fired = {}; this._turn = 0; },`,
    ``,
    `    // Always-on. Edited in the Core Prompt panel.`,
    `    core: ${coreLiteral},`,
    ``,
    `    dictionary: [`,
    ``,
    buildDict(entries),
    ``,
    `    ],`,
    ``,
    `    ` + evaluateSrc(),
    ``,
    `};`,
    ``
  ].join("\n");
}


/* ══════════════════════════════════════════════════════
   Run
   ══════════════════════════════════════════════════════ */

(async () => {
  try {
    console.log("Reading " + RTDB.replace(/^https:\/\//, "") + " …");

    const [entries, corePrompt] = await Promise.all([read("entries"), read("core")]);

    if (!entries || typeof entries !== "object" || !Object.keys(entries).length) {
      throw new Error("poppyEngine/entries came back empty. Refusing to write an " +
                      "empty dictionary over a working one.");
    }

    const all      = Object.keys(entries).length;
    const shipped  = Object.keys(entries)
                       .filter(id => entries[id] && entries[id].intent && entries[id].hidden !== true).length;

    const out = buildFullFile(entries, corePrompt, shipped);

    /* A dictionary this file's size doesn't shrink by two thirds
       because of a legitimate edit. That is what a half-read node
       looks like. */
    let old = "";
    try { old = fs.readFileSync(TARGET, "utf8"); } catch {}
    if (old && out.length < old.length * 0.5) {
      throw new Error("The new file is " + Math.round(out.length / old.length * 100) +
                      "% the size of the current one. That looks wrong — nothing written. " +
                      "Re-run with --dry to inspect.");
    }

    const s = carriedSettings();
    console.log("  " + all + " entries in Firebase, " + shipped + " shipped (" +
                (all - shipped) + " hidden or intentless)");
    console.log("  INTENT_LIMIT " + s.INTENT_LIMIT + " · WINDOW_DEPTH " + s.WINDOW_DEPTH);

    if (String(corePrompt || "").trim()) {
      console.log("  core prompt from Firebase — " + corePrompt.length + " chars");
    } else if (carriedCore()) {
      console.log("  core prompt: poppyEngine/core is EMPTY, so the file's own was kept.");
      console.log("               Paste it into the editor's Core Prompt panel and save,");
      console.log("               or it stays invisible to the editor.");
    } else {
      console.log("  core prompt: empty in Firebase and in the file — Poppy ships without one.");
    }
    console.log("  " + out.length.toLocaleString("en-US") + " bytes" +
                (old ? " (was " + old.length.toLocaleString("en-US") + ")" : ""));

    if (DRY) {
      console.log("\n--dry — nothing written.");
      return;
    }

    if (OUT) {
      fs.writeFileSync(path.resolve(OUT), out, "utf8");
      console.log("\nWrote " + path.resolve(OUT) + " (PoppyEngine-core.js untouched)");
      return;
    }

    if (old) fs.writeFileSync(BACKUP, old, "utf8");
    fs.writeFileSync(TARGET, out, "utf8");

    console.log("\nWrote JS/poppy/PoppyEngine-core.js");
    if (old) console.log("Previous version kept at JS/poppy/PoppyEngine-core.bak.js");

  } catch (err) {
    console.error("\nFailed: " + err.message);
    console.error("Nothing was written.");
    process.exitCode = 1;
  }
})();

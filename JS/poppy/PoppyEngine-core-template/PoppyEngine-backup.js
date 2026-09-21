/* LifeHub — PoppyEngine.
   ────────────────────────────────────────────────────────────────
   THIS FILE IS GENERATED. Don't hand-edit it — open the PoppyEngine
   editor, change it there, re-export, and paste over this file.
   Anything typed in here directly is lost on the next export.

   Generated 8/7/2026 · 49 entries

   ── What this is ────────────────────────────────────────────────
   A filter, not a brain. It reads the current message, decides which
   entries the keywords let through, and returns only their text.
   Nothing here describes how Poppy sounds — that lives in
   js/LifeHub-poppy-modes.js.

   ── What evaluate() gives back ──────────────────────────────────
     intent        the highest-scoring match, or FALLBACK_INTENT
     identity[]    standing facts about her or Jen
     context[]     background that only matters sometimes
     rules[]       what to do about THIS message
     fetchTargets  paths to read before answering
     writeFields   field names she's allowed to set
     prompt        the above, already assembled
     intents[]     every match, with its own fields

   ── Window and cooldown ─────────────────────────────────────────
     window     how many recent messages an entry may match against.
                Defaults to WINDOW_DEPTH. Set 1 for actions.
     cooldown   turns the entry stays quiet after firing. A fresh
                mention in the current message always fires anyway.

   ── Usage ───────────────────────────────────────────────────────
     const result = PoppyEngine.evaluate([{ content: userMessage }]);

   Load this BEFORE js/LifeHub-poppy.js.
*/

window.PoppyEngine = {

    INTENT_LIMIT: 12,        // max intents returned per message
    WINDOW_DEPTH: 6,        // how many recent messages keywords may match
    FALLBACK_INTENT: null,  // returned when nothing matches

    // Call this when the chat is cleared — forgets every cooldown.
    resetMemory: function () { this._fired = {}; this._turn = 0; },

    // Always-on. Edited in the Core Prompt panel.
    core: "\n══════════\nAbout Jen\n══════════\n\n── Identity ──\nFull Name: Jenieca Berjamin (goes by \"Jen\")\nBirthday: July 12, 1996\nAge: 30\nBirthplace: Panay, Capiz, Philippines\nCurrent Location / Address: Panay, Capiz, Philippines\nNationality: Filipino\nRelationship Status: Single\n\n── Background ──\nFormer elementary school teacher with ESL and IELTS teaching experience\nHolds a teaching license (obtained 2016)\nBachelor's degree in Elementary Education, Colegio de la Purisima Concepcion (graduated 2016)\n\n",

dictionary: [

       
],
    evaluate: function(chatHistory) {

        // ── 1. INPUT NORMALIZATION ──────────────────────────
        function _str(x) { return (x == null ? "" : String(x)); }
        function _normalize(s) {
            return _str(s).toLowerCase()
                .replace(/[^a-z0-9_\s-]/g, " ")
                .replace(/[-_]+/g, " ")
                .replace(/\s+/g, " ").trim();
        }

        // The current message, plus a rolling window of recent ones so
        // context stays loaded while you talk casually. An entry's own
        // `window` overrides the engine default. window: 1 = this
        // message only, for actions that must never read stale words.
        const msgs  = Array.isArray(chatHistory) ? chatHistory : [];
        const DEPTH = Math.max(1, this.WINDOW_DEPTH || 1);

        // accepts either {content} or {text} message shapes
        function textOf(m) {
            if (!m) return "";
            return _str(m.content != null ? m.content : m.text);
        }

        const _hayCache = {};
        function hayFor(n) {
            const d = Math.max(1, Math.min(50, (isFinite(n) && n) ? +n : DEPTH));
            if (!_hayCache[d]) {
                _hayCache[d] = " " + msgs.slice(-d).map(m => _normalize(textOf(m))).join(" ") + " ";
            }
            return _hayCache[d];
        }

        const HAY  = hayFor(1);   // the current message, on its own
        const self = this;

        // Firing memory. Survives between calls so cooldowns can count turns.
        if (!this._fired) this._fired = {};
        this._turn = (this._turn || 0) + 1;
        const TURN = this._turn;

        // ── 2. UTILITIES ────────────────────────────────────
        function arr(x) { return Array.isArray(x) ? x : (x == null ? [] : [x]); }
        function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
        function hasTerm(term, hay) {
            const H = hay || HAY;
            let t = _str(term).toLowerCase().trim();
            if (!t) return false;
            if (t.endsWith("*")) {
                return new RegExp("(?:^|\\s)" + reEsc(t.slice(0, -1)) + "[a-z]*?(?=\\s|$)").test(H);
            }
            return new RegExp("(?:^|\\s)" + reEsc(t) + "(?=\\s|$)").test(H);
        }

        function prio(e) {
            let p = (e && isFinite(e.priority)) ? +e.priority : 3;
            return Math.max(1, Math.min(5, p));
        }

        // How far back this entry is allowed to look.
        function depthOf(e) {
            const n = (e && isFinite(e.window)) ? +e.window : DEPTH;
            return Math.max(1, Math.min(50, n || DEPTH));
        }

        // How many turns it stays quiet after firing. 0 = never quiet.
        function coolOf(e) {
            const n = (e && isFinite(e.cooldown)) ? +e.cooldown : 0;
            return Math.max(0, Math.min(50, n));
        }

        // ── 3. GATES ────────────────────────────────────────
        // Every LoreEngine alias maps to the same gate, so entries
        // written in that dialect paste in and just work.
        function collectGates(e) {
            const r = (e && e.requires) ? e.requires : {};
            return {
                any:  [].concat(arr(e && e.requireAny),  arr(e && e.andAny),  arr(r.any)),
                all:  [].concat(arr(e && e.requireAll),  arr(e && e.andAll),  arr(r.all)),
                none: [].concat(arr(e && e.requireNone), arr(e && e.notAny),  arr(r.none),
                                arr(e && e.block),       arr(e && e.Block)),
                nall: [].concat(arr(e && e.notAll),      arr(r.nall))
            };
        }

        function gatesPass(e, hay) {
            const H = hay || HAY;
            const g = collectGates(e);
            if (g.any.length  && !g.any.some(t  => hasTerm(t, H)))  return false;
            if (g.all.length  && !g.all.every(t => hasTerm(t, H)))  return false;
            if (g.none.length &&  g.none.some(t => hasTerm(t, H)))  return false;
            if (g.nall.length &&  g.nall.every(t => hasTerm(t, H))) return false;
            return true;
        }

        // ── 4. FALLBACK DEFINITION ──────────────────────────
        // A fallback has nothing that CAN match — no keywords and
        // no positive gates. Gate-only entries are real matches.
        function isFallback(e) {
            // Identity and context with no keywords are ALWAYS on — they
            // describe standing truths, not a last resort. Only a
            // keywordless instruction is a fallback.
            if (e && e.blockType && e.blockType !== "instruction") return false;
            const g = collectGates(e);
            return !arr(e && e.keywords).length && !g.any.length && !g.all.length;
        }

        // ── 5. SCORING ──────────────────────────────────────
        const matched   = [];
        const fallbacks = [];

        this.dictionary.forEach((entry, i) => {
            if (!entry || !entry.intent) return;

            const key = entry.intent + "#" + i;
            const HW  = hayFor(depthOf(entry));     // this entry's window
            if (!gatesPass(entry, HW)) return;

            const kws   = arr(entry.keywords);
            const hits  = kws.filter(t => hasTerm(t, HW));    // anywhere in window
            const fresh = kws.filter(t => hasTerm(t, HAY));   // in this message

            if (isFallback(entry)) {
                fallbacks.push({ entry, key, matched: [], score: prio(entry) });
                return;
            }

            if (kws.length === 0 || hits.length > 0) {
                // COOLDOWN. Saying it again in the current message always
                // fires and resets the clock. A stale hit inside the window
                // stays quiet until the cooldown runs out.
                const cd   = coolOf(entry);
                const last = self._fired[key] || 0;
                if (cd > 0 && !fresh.length && last && (TURN - last) <= cd) {
                    console.log(
                        `%c   \u23f8 ${entry.intent} on cooldown%c ${cd - (TURN - last) + 1} more`,
                        "color:#999;font-weight:bold;", "color:#bbb;"
                    );
                    return;
                }

                matched.push({
                    entry, key,
                    matched: hits,
                    score: prio(entry) * 100 + Math.min(hits.length, 20)
                                             + (fresh.length ? 50 : 0)
                });
            }
        });

        // ── 6. SELECTION ────────────────────────────────────
        let pool = matched.length ? matched : fallbacks;
        pool.sort((a, b) => b.score - a.score);

        const seen = {}, selected = [];
        for (const c of pool) {
            if (selected.length >= (this.INTENT_LIMIT || 4)) break;
            if (seen[c.entry.intent]) continue;
            seen[c.entry.intent] = 1;
            selected.push(c);
        }

        // Remember what fired, so cooldowns have something to count from.
        selected.forEach(c => { if (c.key) self._fired[c.key] = TURN; });

        if (!selected.length) {
            // No match still gets the core prompt — Poppy should never
            // arrive with no identity at all.
            return { intent: this.FALLBACK_INTENT || null, intents: [],
                     fetchTargets: [], writeFields: [],
                     identity: [], context: [], rules: [],
                     prompt: (this.core || "").trim() };
        }

        // ── 7. REPORT ───────────────────────────────────────
        selected.forEach(c => {
            const kw = c.matched.length ? c.matched.join(", ") : "(gate/fallback)";
            console.log(
                `%c🎯 PoppyEngine → [${c.entry.intent}]%c via: "${kw}"  p${prio(c.entry)}`,
                "color:#b8866f;font-weight:bold;", "color:#aaa;"
            );
        });

        // ── 8. PAYLOAD ──────────────────────────────────────
        const primary = selected[0].entry;
        const uniq = a => [...new Set(a)];

        const intents = selected.map(c => {
            const e = c.entry;
            let guide  = e.guidelines || "";
            let fetch  = arr(e.fetchTargets);
            let write  = arr(e.writeFields);
            const firedShifts = [];

            // SHIFTS — sub-layers that stack onto a parent entry.
            // A shift only runs if its parent was selected, then it
            // needs its own keyword hit (or no keywords = always).
            arr(e.Shifts).forEach(sh => {
                if (!sh) return;
                if (!gatesPass(sh)) return;
                const skws = arr(sh.keywords);
                const shits = skws.filter(hasTerm);
                if (skws.length && !shits.length) return;

                if (sh.guidelines) guide += "\n\n" + sh.guidelines;
                fetch = fetch.concat(arr(sh.fetchTargets));
                write = write.concat(arr(sh.writeFields));
                firedShifts.push(sh.title || "(untitled shift)");

                console.log(`%c   ↳ shift: ${sh.title || "(untitled)"}%c ${shits.length ? '"' + shits.join(", ") + '"' : "(always)"}`,
                    "color:#c98aa8;font-weight:bold;", "color:#aaa;");
            });

            return {
                intent:       e.intent,
                priority:     prio(e),
                blockType:    e.blockType || "instruction",
                matched:      c.matched,
                fetchTargets: [...new Set(fetch)],
                writeFields:  [...new Set(write)],
                guidelines:   guide,
                shifts:       firedShifts
            };
        });

        // Group text by what KIND of thing it is, so the assembled
        // prompt reads as sections instead of one pile of orders.
        const byType = t => intents.filter(x => x.blockType === t && x.guidelines)
                                   .map(x => x.guidelines);

        const identity = byType("identity");
        const context  = byType("context");
        const rules    = intents.filter(x => (x.blockType || "instruction") === "instruction" && x.guidelines)
                                .map(x => `[${x.intent}]\n${x.guidelines}`);

        // Ready-to-send prompt. core is set on the engine object.
        let prompt = (this.core || "").trim();
        if (identity.length) prompt += "\n\n## ABOUT YOU\n"            + identity.join("\n\n");
        if (context.length)  prompt += "\n\n## CONTEXT\n"              + context.join("\n\n");
        if (rules.length)    prompt += "\n\n## FOR THIS MESSAGE\n"     + rules.join("\n\n");

        return {
            intent:       primary.intent,
            fetchTargets: uniq(intents.flatMap(x => x.fetchTargets)),
            writeFields:  uniq(intents.flatMap(x => x.writeFields)),
            identity, context, rules,
            prompt:       prompt.trim(),
            intents
        };
    }

};
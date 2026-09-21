/* LifeHub — Poppy engine.
   The seam between the chat panel and whatever backs it.

   Prompt CONTENT lives in js/LifeHub-poppy-modes.js. Nothing in this file
   describes how Poppy sounds — it only assembles and dispatches.

   To connect a backend, replace the body of send(). Everything above it
   can stay as it is.
*/

(function(){

  const P = () => window.POPPY_PROMPTS || { persona: "", alwaysRules: [], modes: {} };

  /* Turn a list into a labelled block, skipping anything empty so the
     finished prompt never contains a dangling heading. */
  function section(title, body){
    if (!body) return "";
    const text = Array.isArray(body)
      ? body.filter(Boolean).map(x => "- " + x).join("\n")
      : String(body).trim();
    return text ? title + "\n" + text : "";
  }

  /* ── Authority ─────────────────────────────────────────────────
     What the active mode may DO with what the engine hands it, as
     opposed to how it sounds. The wording lives in the prompts file;
     this only picks which set applies.

     An unknown or missing mode resolves to "aware", which is the
     restrained one. A mode has to say "act" out loud to get to act. */

  const AUTHORITY_FALLBACK = {
    act:   { header: "## FOR THIS MESSAGE", intro: "", actionGate: "", ps: "" },
    aware: { header: "## BACKGROUND — CONTEXT ONLY, DO NOT ACT",
             intro: "Context so you follow her. Don't raise it, don't act on it.",
             actionGate: "Only send an action block if this message plainly asked for it.",
             ps: "Act only on what she plainly asked for in this message." }
  };

  function authorityOf(mode){
    const id = (mode && mode.authority === "act") ? "act" : "aware";
    const set = (P().authority || {})[id];
    return Object.assign({ id }, AUTHORITY_FALLBACK[id], set || {});
  }

  /* Icons get their own block rather than living in alwaysRules. A row
     with no meaning is skipped — an icon Poppy can't interpret is worse
     than one she's never heard of.

     The key itself is the same in every mode; the paragraph above it is
     not. Under `act` it's a command vocabulary that outranks her own
     instinct. Under `aware` it's a legend — enough to read a 🕹️ row in
     the background block instead of skipping it as noise, and nothing
     more. Withholding the key from the quiet modes never protected them:
     the icons arrived in the guidelines regardless, just unreadable. */
  function iconBlock(icons, auth){
    if (!Array.isArray(icons)) return "";
    const rows = icons
      .filter(x => x && x.icon && String(x.means || "").trim())
      .map(x => "- " + x.icon + "  →  " + String(x.means).trim());
    if (!rows.length) return "";

    const preamble = (auth && auth.id === "act")
      ? "These symbols are instructions, not decoration. If one appears in her " +
        "message, acting on it takes priority over your own read of what the " +
        "reply should be. If an icon you don't recognise appears, say so rather " +
        "than guessing."
      : "READ-ONLY IN THIS MODE. This is a legend, so that a symbol below reads " +
        "as something rather than as noise. The meanings describe what these " +
        "mark operationally — they are not instructions to you here, and an " +
        "icon appearing anywhere does not authorise you to do the thing it " +
        "describes.";

    return "## ICONS\n" + preamble + "\n" + rows.join("\n");
  }

  /* PoppyEngine is optional. If the file isn't loaded, everything below
     still works — you just lose the keyword-driven parts. */
  function engineFor(messages){
    if (!window.PoppyEngine || typeof window.PoppyEngine.evaluate !== "function") return null;
    try{
      return window.PoppyEngine.evaluate(messages);
    } catch (err){
      console.error("PoppyEngine.evaluate() threw — carrying on without it.", err);
      return null;
    }
  }

  /* Order matters more than it looks. Facts first so she knows who she's
     talking to, tone next, and the engine's per-message rules last —
     the closer to the end, the more weight they carry. */
  function buildSystemPrompt(modeId, ev){
    const prompts = P();

    /* Mode isolation: this is the only place a mode's block is read, and
       it reads exactly one. Nothing here iterates prompts.modes, so no
       mode's tone, rules, avoid, ps or examples can reach another mode's
       prompt. An unknown id yields a prompt with no mode block at all
       rather than a merged or defaulted one. */
    const mode = (modeId && Object.prototype.hasOwnProperty.call(prompts.modes || {}, modeId))
      ? prompts.modes[modeId]
      : null;

    const auth = authorityOf(mode);

    const parts = [String(prompts.persona || "").trim()];

    if (ev && window.PoppyEngine && window.PoppyEngine.core){
      parts.push(String(window.PoppyEngine.core).trim());
    }

    parts.push(section("Always:", prompts.alwaysRules));
    parts.push(section("Never, in any mode:", prompts.alwaysAvoid));

    /* usesIcons decides whether the key ships at all; authority decides
       how it's framed once it does. */
    if (mode && mode.usesIcons) parts.push(iconBlock(prompts.icons, auth));

    if (ev){
      if (ev.identity && ev.identity.length) parts.push("## ABOUT YOU\n" + ev.identity.join("\n\n"));
      if (ev.context && ev.context.length)   parts.push("## CONTEXT\n" + ev.context.join("\n\n"));
    }

    if (mode){
      parts.push(section("Tone for this mode:", mode.tone));
      parts.push(section("In this mode:", mode.rules));
      parts.push(section("Avoid:", mode.avoid));
    }

    /* The matched entries. Same text in every mode — the engine has no
       idea which mode it's feeding — but the heading above them and the
       paragraph that follows it decide whether they read as orders or as
       background she happens to know. That framing IS the feature: the
       entries were always arriving here, and with nothing above them
       saying what they were for, the quiet modes just dropped them. */
    if (ev && ev.rules && ev.rules.length){
      parts.push([auth.header, String(auth.intro || "").trim(), ev.rules.join("\n\n")]
        .filter(Boolean).join("\n\n"));
    }

    /* The action spec only ships when the engine has actually unlocked the
       `action` field — otherwise every message would carry it.

       It ships under `aware` too, on purpose: "add a glass" said outright
       in Casual should work rather than bounce her to another mode. What
       stops the accidental write is the gate above it, not the absence of
       the spec.

       `actions:false` is the absence of the spec, and it's absolute — a
       mode that doesn't get it cannot navigate, paint, lock or write a
       tracker no matter how plainly it was asked. Deep and Challenge use
       it. Task, Casual and Friend drive. */
    if (mode && mode.actions === false){
      /* nothing — this mode operates nothing */
    } else if (ev && ev.writeFields && ev.writeFields.indexOf("action") !== -1 &&
        window.LIFEHUB_ACTIONS && typeof window.LIFEHUB_ACTIONS.describe === "function"){
      const gate = String(auth.actionGate || "").trim();
      parts.push(gate ? gate + "\n\n" + window.LIFEHUB_ACTIONS.describe()
                      : window.LIFEHUB_ACTIONS.describe());
    }

    /* Dead last — below the engine's per-message rules and the action
       spec. Nothing is appended after this. Global P.S., then the mode's
       own, then the authority's, so the line that decides whether she may
       act lands in final position and outranks the tone above it. */
    const ps = [String(prompts.postscript || "").trim(),
                String((mode && mode.ps) || "").trim(),
                String(auth.ps || "").trim()].filter(Boolean);
    if (ps.length) parts.push("P.S. — before you send this reply:\n" + ps.join("\n"));

    return parts.filter(Boolean).join("\n\n");
  }

  /* Examples are returned separately rather than glued into the system text,
     because most APIs place them better as prior turns than as instructions. */
  function buildExamples(modeId){
    const mode = P().modes[modeId];
    if (!mode || !Array.isArray(mode.examples)) return [];
    return mode.examples
      .filter(e => e && e.user && e.poppy)
      .flatMap(e => [
        { role: "user", text: e.user },
        { role: "poppy", text: e.poppy }
      ]);
  }

  /* The panel needs a flat list; the prompts file is keyed by id. */
  function modeList(){
    const modes = P().modes;
    return Object.keys(modes).map(id => ({
      id,
      label: modes[id].label || id,
      blurb: modes[id].blurb || "",
      config: modes[id]
    }));
  }

  /* ── Engine configuration ──────────────────────────────────────
     Kept here rather than in the prompts file: this is plumbing, not
     character. Persisted locally so it survives a reload. */

  const CONFIG_KEY = "lifehub.engine";

  const CONFIG_DEFAULTS = {
    /* "server"     → your Express server (required for Vertex)
       "gemini"     → straight to Google's API with a key, no server
       "openrouter" → straight to OpenRouter with a key, no server */
    connection: "gemini",
    serverUrl: "http://localhost:3000/api/chat",
    apiKey: "",          // blank = let the server use its own
    model: "gemini-2.5-flash",
    tokenLimit: 30000,   // context budget the server slices history against
    maxTokens: 8000      // cap on reply length
  };

  let config = Object.assign({}, CONFIG_DEFAULTS);

  /* A config saved before the direct routes existed still says
     connection: "server", and a saved value always beats a default —
     so the new default alone would never take effect. This moves an
     old config across once, keeping the key and everything else. */
  const MIGRATION_KEY = "lifehub.engine.direct";

  function migrateConfig(){
    try{
      if (localStorage.getItem(MIGRATION_KEY)) return;
      if (config.connection === "server"){
        config.connection = "gemini";
        if (!config.model || config.model === "gemini-2.5-pro"){
          config.model = "gemini-2.5-flash";
        }
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      }
      localStorage.setItem(MIGRATION_KEY, "1");
    } catch (err){ /* storage unavailable — the default stands this session */ }
  }

  function loadConfig(){
    try{
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) config = Object.assign({}, CONFIG_DEFAULTS, JSON.parse(raw));
    } catch (err){ /* unreadable — defaults stand */ }
    migrateConfig();
    return config;
  }

  function saveConfig(next){
    config = Object.assign({}, config, next || {});
    try{
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (err){ /* storage unavailable — config lasts this session only */ }
    return config;
  }

  loadConfig();

  /* ── Context trimming ─────────────────────────────────────────
     Your server slices history against the token budget. The direct
     routes have no server to do that, so it happens here instead —
     same approach, roughly four characters per token, newest kept. */

  function trimHistory(turns, systemText, budget){
    const cost = (t) => Math.ceil((t || "").length / 4);
    let used = cost(systemText);
    const kept = [];
    for (let i = turns.length - 1; i >= 0; i--){
      const c = cost(turns[i].content);
      if (used + c > budget) break;
      kept.unshift(turns[i]);
      used += c;
    }
    return kept;
  }

  async function readError(res){
    let detail = "";
    try{
      const data = await res.json();
      detail = (data && data.error && (data.error.message || data.error)) || "";
      if (typeof detail === "object") detail = JSON.stringify(detail);
    } catch (err){ /* body wasn't JSON */ }
    return detail || ("HTTP " + res.status);
  }

  /* ── Direct: Google Generative Language API ─────────────────── */
  async function sendViaGemini({ system, turns, temperature, signal }){
    if (!config.apiKey) throw new Error("Direct Gemini needs an API key — add one in Engine configuration.");

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
                encodeURIComponent(config.model) + ":generateContent";

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        })),
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: config.maxTokens,
          topP: 0.9,
          topK: 40
        }
      })
    });

    if (!res.ok) throw new Error(await readError(res));

    const data = await res.json();
    const parts = data && data.candidates && data.candidates[0] &&
                  data.candidates[0].content && data.candidates[0].content.parts;
    const text = parts ? parts.map(x => x.text || "").join("") : "";

    if (!text){
      /* a blocked or truncated response comes back well-formed but empty */
      const why = data && data.candidates && data.candidates[0] && data.candidates[0].finishReason;
      throw new Error(why ? "No reply (" + why + ")." : "The model returned an empty reply.");
    }
    return text;
  }

  /* ── Direct: OpenRouter ─────────────────────────────────────── */
  async function sendViaOpenRouter({ system, turns, temperature, signal }){
    if (!config.apiKey) throw new Error("OpenRouter needs an API key — add one in Engine configuration.");

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.apiKey,
        "X-Title": "LifeHub Poppy"
      },
      signal,
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "system", content: system }].concat(turns),
        temperature: temperature,
        max_tokens: config.maxTokens,
        top_p: 0.9,
        frequency_penalty: 0.4,
        presence_penalty: 0.3
      })
    });

    if (!res.ok) throw new Error(await readError(res));

    const data = await res.json();
    const text = data && data.choices && data.choices[0] &&
                 data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error("The model returned an empty reply.");
    return text;
  }

  /* ── Your Express server ────────────────────────────────────── */
  async function sendViaServer({ system, turns, temperature, signal }){
    let res;
    try{
      res = await fetch(config.serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify(Object.assign({
          messages: [{ role: "system", content: system }].concat(turns),
          model: config.model,
          tokenLimit: config.tokenLimit,
          maxTokens: config.maxTokens,
          temperature: temperature
        }, config.apiKey ? { apiKey: config.apiKey } : {}))
      });
    } catch (err){
      if (err && err.name === "AbortError") throw err;
      /* fetch only rejects on network failure, so this is almost always
         "the server isn't running" rather than a bad response */
      throw new Error("Can't reach the engine at " + config.serverUrl +
                      ". Is the server running?");
    }

    if (!res.ok) throw new Error(await readError(res));

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || data.error);

    const text = data && data.choices && data.choices[0] &&
                 data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error("The engine returned an empty reply.");

    if (typeof data.retainedContextCount === "number"){
      console.debug("Poppy: server kept " + data.retainedContextCount + " message(s) of context.");
    }
    return text;
  }

  window.POPPY = {

    get modes(){ return modeList(); },

    buildSystemPrompt,
    buildExamples,
    lastEval: null,

    /* POPPY.dryRun("lock my wallpaper") shows what the engine would add
       for a message without sending it. Note it does advance the engine's
       turn counter, same as a real message would.

       Pass a mode to see the difference authority makes:
         POPPY.dryRun("add a glass of water", "task")
         POPPY.dryRun("add a glass of water", "casual")
       Same matched entries both times — different heading, different
       gate, different final P.S. */
    dryRun(text, modeId){
      const ev = engineFor([{ content: text }]);
      const id = modeId || "casual";
      const cfg = (P().modes || {})[id];
      console.log("intent:", ev ? ev.intent : "(engine not loaded)");
      console.log("authority   :", authorityOf(cfg).id,
                  "· liveData:", cfg && cfg.liveData !== false);
      if (ev){
        console.log("fetchTargets:", ev.fetchTargets);
        console.log("writeFields :", ev.writeFields);
        console.log("matched     :", ev.intents.map(i => i.intent));
      }
      const full = buildSystemPrompt(id, ev);
      console.log("-".repeat(58) + "\n" + full + "\n" + "-".repeat(58));
      return { intent: ev && ev.intent, prompt: full };
    },

    /* POPPY.preview("friend") in the console prints the assembled prompt,
       so a prompt can be checked without sending anything. */
    preview(modeId){
      const text = buildSystemPrompt(modeId);
      const examples = buildExamples(modeId);
      console.log("-".repeat(58) + "\n" + text +
        (examples.length ? "\n\n[" + (examples.length / 2) + " example exchange(s) attached]" : "") +
        "\n" + "-".repeat(58));
      return text;
    },

    /* ── Dispatch ─────────────────────────────────────────────────
       Builds the prompt once, then hands it to whichever route is
       configured. Only the server route can reach Vertex. */
    async send({ text, mode, history, signal }){
      const cfg = (mode && mode.config) || {};
      const examples = buildExamples(mode && mode.id);
      const temperature = cfg.temperature;

      /* Modes flagged remembers:false start clean every message. */
      const context = cfg.remembers === false ? [] : (history || []);

      /* Exactly one evaluate() per message — it advances the turn counter
         that cooldowns are measured in, so calling it twice would age
         entries out early.

         JEN'S WORDS ONLY. Poppy's replies used to go in too, and a reply
         is full of the same vocabulary the entries key on — "Moving this
         project to the Bin will remove the Symlinks" carries four command
         keywords she never typed. That let entries fire on Poppy's own
         phrasing, and inflated hit counts, which is what decides ties
         between two entries competing for the same intent.

         It also makes `window` mean what you'd expect. It counts messages,
         so a window of 3 used to reach back barely one exchange. Now it is
         three things Jen actually said. */
      const asked = context.filter(m => {
        const r = m && m.role;
        return r !== "poppy" && r !== "assistant" && r !== "model";
      });

      const ev = engineFor(asked.map(m => ({ content: m.text })).concat([{ content: text }]));
      window.POPPY.lastEval = ev;

      let system = buildSystemPrompt(mode && mode.id, ev);

      /* liveData:false skips the Firebase round trip for this mode. The
         engine still ran, so she keeps the topic and the guidelines —
         she just doesn't get the numbers. Deep and Challenge use it:
         those are conversations, and a philosophical thread about rest
         is not improved by last night's hours being in the prompt.

         evaluate() is deliberately still called for those modes. Skipping
         it would desync the turn counter that cooldowns count in, and
         she'd stop understanding what Jen was referring to at all. */
      if (cfg.liveData !== false &&
          ev && ev.fetchTargets && ev.fetchTargets.length && window.POPPY_FETCH){
        const live = await window.POPPY_FETCH.run(ev.fetchTargets);
        if (live) system += "\n\n" + live;
      }

      const asRole = (m) => (m.role === "poppy" || m.role === "assistant" || m.role === "model")
        ? "assistant" : "user";

      let turns = examples.map(m => ({ role: asRole(m), content: m.text }))
        .concat(context.map(m => ({ role: asRole(m), content: m.text })))
        .concat([{ role: "user", content: text }]);

      /* The server does its own slicing; the direct routes don't have one. */
      if (config.connection !== "server"){
        turns = trimHistory(turns, system, config.tokenLimit);
        if (!turns.length) turns = [{ role: "user", content: text }];
      }

      const payload = { system, turns, temperature, signal };

      if (config.connection === "gemini")     return sendViaGemini(payload);
      if (config.connection === "openrouter") return sendViaOpenRouter(payload);
      return sendViaServer(payload);
    },

    getConfig(){ return Object.assign({}, config); },
    setConfig(next){ return saveConfig(next); },
    configDefaults(){ return Object.assign({}, CONFIG_DEFAULTS); }
  };

})();

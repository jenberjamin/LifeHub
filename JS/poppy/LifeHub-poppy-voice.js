/* LifeHub — Poppy's natural voice (Gemini text-to-speech).
   ────────────────────────────────────────────────────────────────
   The browser's own voices depend on where the page runs. Edge has
   Microsoft's neural ones; Chrome and Lively mostly have David and
   Zira, which is the station-announcement sound. This sends the reply
   to Gemini's speech models instead and plays back what comes out.

   ── WHY IT'S A SEPARATE FILE ────────────────────────────────────
   The last attempt at a new voice went into LifeHub-homescreen.js
   and nearly took the chat with it. This file only ever returns a
   promise: it resolves when she's finished talking and rejects with
   a sayable reason otherwise. The homescreen catches that and falls
   back to the browser voice, so the worst a broken voice can do is
   sound like it used to.

   Not loaded? The homescreen notices and uses the browser voice.

   ── THE KEY ─────────────────────────────────────────────────────
   The Gemini key in Engine configuration — shared with the chat, and
   used whichever connection the chat is on. It must be an AI Studio
   key; a Firebase key is refused (403 "…are blocked").

   ── QUOTA ───────────────────────────────────────────────────────
   Streamed (3.1 Flash at speed 1.00): one request per reply. Otherwise
   up to three, in growing pieces. A 429 (out of quota) rejects straight
   away so the browser voice takes over for that reply. Your real
   limits are on AI Studio's rate-limit page.

   ── IN THE CONSOLE ──────────────────────────────────────────────
     POPPY_VOICE.say("Hi Jen")               — speak with saved settings
     POPPY_VOICE.say("Hi", { voice: "Leda" }) — try a voice
*/

(function () {

  /* All 30, with Google's own one-word character for each. The first
     group is the ones that fit Poppy's brief best (bright, warm,
     friendly); the rest are still worth an audition. */
  const VOICES = [
    ["Zephyr", "Bright"], ["Aoede", "Breezy"], ["Leda", "Youthful"],
    ["Sulafat", "Warm"], ["Autonoe", "Bright"], ["Laomedeia", "Upbeat"],
    ["Callirrhoe", "Easy-going"], ["Despina", "Smooth"], ["Achernar", "Soft"],
    ["Vindemiatrix", "Gentle"], ["Sadachbia", "Lively"], ["Kore", "Firm"],
    ["Erinome", "Clear"], ["Pulcherrima", "Forward"], ["Gacrux", "Mature"],

    ["Puck", "Upbeat"], ["Charon", "Informative"], ["Fenrir", "Excitable"],
    ["Orus", "Firm"], ["Enceladus", "Breathy"], ["Iapetus", "Clear"],
    ["Umbriel", "Easy-going"], ["Algieba", "Smooth"], ["Algenib", "Gravelly"],
    ["Rasalgethi", "Informative"], ["Alnilam", "Firm"], ["Schedar", "Even"],
    ["Achird", "Friendly"], ["Zubenelgenubi", "Casual"], ["Sadaltager", "Knowledgeable"]
  ].map(([name, feel], i) => ({ name, feel, suggested: i < 15 }));

  const MODELS = [
    { id: "gemini-3.1-flash-tts-preview", label: "3.1 Flash — newest" },
    { id: "gemini-2.5-flash-preview-tts", label: "2.5 Flash" },
    { id: "gemini-2.5-pro-preview-tts",   label: "2.5 Pro — richest, slowest" }
  ];

  const DEFAULTS = {
    voice: "Zephyr",
    model: MODELS[0].id,
    style: "Speak warmly and naturally, like a close friend who's happy to help — upbeat, relaxed, never robotic.",
    key: ""
  };

  /* The Gemini key from Engine configuration — the one place keys live
     now, shared with the chat. The same key works whichever connection
     the chat uses, so there's no need to be on "Gemini" for the voice. */
  function keyFor(opts) {
    if (opts.key) return opts.key;
    const cfg = (window.POPPY && typeof window.POPPY.getConfig === "function")
      ? window.POPPY.getConfig() : {};
    if (cfg.keys && cfg.keys.gemini) return cfg.keys.gemini;
    if (cfg.connection === "gemini" && cfg.apiKey) return cfg.apiKey;   // pre-2026-09-21 config
    return "";
  }

  /* ── PCM → something an <audio> can play ───────────────────────
     Gemini hands back raw 16-bit mono samples with no header. A WAV
     header is 44 bytes in front of them, which is less code and less
     to go wrong than routing it through the Web Audio API. */
  function wavFromPcm(bytes, rate) {
    const head = new ArrayBuffer(44);
    const v = new DataView(head);
    const text = (at, s) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
    text(0, "RIFF"); v.setUint32(4, 36 + bytes.length, true);
    text(8, "WAVE"); text(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    text(36, "data"); v.setUint32(40, bytes.length, true);
    return new Blob([head, bytes], { type: "audio/wav" });
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* The audio part, wherever the response put it. */
  function audioPart(data) {
    const parts = data && data.candidates && data.candidates[0] &&
                  data.candidates[0].content && data.candidates[0].content.parts;
    return (parts || []).map(p => p.inlineData || p.inline_data).find(d => d && d.data) || null;
  }

  function endpoint(opts, method) {
    return "https://generativelanguage.googleapis.com/v1beta/models/" +
           encodeURIComponent(opts.model) + ":" + method;
  }

  /* Same request for both routes. The style line is a direction, not part
     of the script — the "Say cheerfully:" shape is the one Google's
     examples use. */
  function requestBody(text, opts) {
    const prompt = (opts.style ? opts.style.trim().replace(/[:.]?$/, ":") + "\n" : "") + text;
    return JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice } } }
      }
    });
  }

  /* Google's error for a refused request, in words Jen can act on. Shared
     by both routes so they say the same thing about the same problem. */
  async function refusal(res) {
    let why = "";
    try { const j = await res.json(); why = (j.error && j.error.message) || (j[0] && j[0].error && j[0].error.message) || ""; } catch (e) {}
    /* final: the key or the quota — the other route would get the same
       answer, so don't spend a second request. A 400 isn't final: it may
       only mean this model won't stream, and the pieces route can still
       work. */
    const final = res.status === 401 || res.status === 403 || res.status === 429;
    let err;
    if (res.status === 429) err = new Error("Gemini voice is out of quota for now.");
    else if (res.status === 403) {
      err = new Error(/blocked/i.test(why)
        ? "That key isn't allowed to use Gemini (it's restricted — a Firebase key?). Make one at aistudio.google.com/apikey."
        : "Gemini refused the voice key" + (why ? ": " + why : "."));
    } else err = new Error("Gemini voice: " + (why || "HTTP " + res.status));
    err.final = final;
    return err;
  }

  async function fetchClip(text, opts, signal) {
    const key = keyFor(opts);
    if (!key) {
      throw new Error("No Gemini key for the voice. Add one in Engine configuration — the chat and the voice share it.");
    }

    const url = endpoint(opts, "generateContent");
    const body = requestBody(text, opts);

    /* Google says these models fail at random now and then. One retry
       on a server-side error; never on quota or a bad key. */
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body, signal
        });
      } catch (err) {
        if (err && err.name === "AbortError") throw err;
        throw new Error("Couldn't reach Gemini for the voice.");
      }

      /* 403 "…GenerateContent are blocked" means the key is real but has
         API restrictions that leave Gemini out — typically a Firebase key.
         refusal() says that plainly, because Google's wording sounds like
         an outage. */
      if (res.status >= 500 && attempt === 0) continue;
      if (!res.ok) throw await refusal(res);

      const part = audioPart(await res.json());
      if (!part) {
        if (attempt === 0) continue;
        throw new Error("Gemini sent back no audio.");
      }
      const rate = +((String(part.mimeType || part.mime_type || "").match(/rate=(\d+)/) || [])[1]) || 24000;
      return wavFromPcm(b64ToBytes(part.data), rate);
    }
    throw new Error("Gemini voice failed twice.");
  }

  /* ── Pieces, growing ────────────────────────────────────────────
     The first piece is what she waits on before making a sound, and
     Gemini's time grows with the length of the clip — packing up to 160
     characters into it is what made the first ~2 seconds silent.

     But a short first piece only helps if the next one is ready by the
     time it finishes, or the silence just moves to the middle. So the
     pieces grow, and all of them are requested at once:

       1. the first sentence (a lone "Hi Jen!" takes the next one too)
       2. up to ~160 more characters — ready while 1 is playing
       3. everything else          — ready while 2 is playing

     Short replies are one or two requests, same as before. Only long
     ones use a third. */
  const LIMITS = [
    { min: 25,  max: 160 },
    { min: 160, max: 160 }
  ];

  function split(text) {
    const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) || [text];
    const pieces = [];
    let i = 0;
    LIMITS.forEach(lim => {
      let buf = "";
      while (i < sentences.length && buf.length < lim.min &&
             (!buf || (buf + sentences[i]).length <= lim.max)) buf += sentences[i++];
      if (buf.trim()) pieces.push(buf.trim());
    });
    const rest = sentences.slice(i).join("").trim();
    if (rest) pieces.push(rest);
    return pieces.length ? pieces : [text];
  }

  /* ── Streaming — the fast route ─────────────────────────────────
     Measured 2026-09-21 on the HomeScreen, same sentence, 3.1 Flash:
       generateContent (whole clip, then play)   6.7 s before a sound
       streamGenerateContent?alt=sse             1.0 s to first audio
     So the reply goes out as ONE streamed request and plays as it
     arrives. Cheaper too: one request per reply instead of up to three.

     Google's documented streaming route (/interactions) needs an
     Api-Revision header, and Google's CORS refuses that header from a
     web page — checked with a preflight. This route needs no extra
     header, which is why it's the one used.

     The audio arrives as raw 16-bit samples in ~200 small chunks. Each
     becomes an AudioBuffer scheduled to start exactly where the last one
     ends, so it plays as one continuous stream.

     Only for 3.1+ models (Google: streaming starts at 3.1) and speed
     1.0 — Web Audio can only speed a clip up by raising its pitch too.
     Anything else uses the pieces route below. */

  let audioCtx = null;

  function ctxFor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx || audioCtx.state === "closed") audioCtx = new AC();
    return audioCtx;
  }

  function canStream(opts) {
    return !!(window.TextDecoder && (window.AudioContext || window.webkitAudioContext)) &&
           /gemini-3/i.test(opts.model) && (+opts.rate || 1) === 1;
  }

  /* Gemini opens every clip with silence — the first chunk measured was
     nothing but zeros. Skipping it until the first real sound is free
     latency. A few ms are kept before the onset so the first syllable
     doesn't clip. */
  const SILENCE = 300;          // of 32768
  const ONSET_KEEP = 240;       // samples, ~10 ms at 24 kHz
  const LEAD = 0.12;            // s of cushion against network jitter

  async function streamSay(text, opts, session) {
    const key = keyFor(opts);
    if (!key) {
      throw Object.assign(new Error("No Gemini key for the voice. Add one in Engine configuration — the chat and the voice share it."), { final: true });
    }

    const ac = ctxFor();
    if (!ac) throw new Error("This browser has no Web Audio.");
    if (ac.state !== "running") {
      /* resume() can sit pending forever when the browser wants a click
         first, so it gets 300 ms and no more. */
      await Promise.race([ac.resume().catch(() => {}), new Promise(r => setTimeout(r, 300))]);
      if (ac.state !== "running") throw new Error("The browser blocked audio until the page is clicked.");
    }

    let res;
    try {
      res = await fetch(endpoint(opts, "streamGenerateContent") + "?alt=sse", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: requestBody(text, opts),
        signal: session.abort.signal
      });
    } catch (err) {
      if (err && err.name === "AbortError") throw err;
      throw new Error("Couldn't reach Gemini for the voice.");
    }
    if (!res.ok) throw await refusal(res);
    if (!res.body || !res.body.getReader) throw new Error("This browser can't read a stream.");

    let started = false, nextAt = 0, rate = 24000, carry = null;

    function schedule(bytes) {
      /* A chunk can end halfway through a sample. Keep the odd byte for
         the front of the next one. */
      if (carry) {
        const joined = new Uint8Array(carry.length + bytes.length);
        joined.set(carry); joined.set(bytes, carry.length);
        bytes = joined; carry = null;
      }
      if (bytes.length % 2) { carry = bytes.slice(-1); bytes = bytes.slice(0, -1); }
      if (!bytes.length) return;

      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
      const n = bytes.length / 2;
      let from = 0;
      if (!started) {
        while (from < n && Math.abs(view.getInt16(from * 2, true)) < SILENCE) from++;
        if (from === n) return;                       // still silence — drop it
        from = Math.max(0, from - ONSET_KEEP);
      }

      const buf = ac.createBuffer(1, n - from, rate);
      const ch = buf.getChannelData(0);
      for (let i = from; i < n; i++) ch[i - from] = view.getInt16(i * 2, true) / 32768;

      const src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(ac.destination);

      const now = ac.currentTime;
      if (!started) { started = true; nextAt = now + LEAD; }
      if (nextAt < now + 0.01) nextAt = now + 0.01;   // fell behind: carry on, never overlap
      src.start(nextAt);
      nextAt += buf.duration;
      session.sources.push(src);
    }

    function handle(event) {
      const json = event.split(/\r?\n/)
        .filter(l => l.startsWith("data:")).map(l => l.slice(5)).join("").trim();
      if (!json) return;
      let data;
      try { data = JSON.parse(json); } catch (e) { return; }
      if (data.error) {
        throw Object.assign(new Error("Gemini voice: " + (data.error.message || "the stream failed")), { started });
      }
      const c = data.candidates && data.candidates[0];
      const parts = (c && c.content && c.content.parts) || [];
      parts.forEach(p => {
        const d = p.inlineData || p.inline_data;
        if (!d || !d.data) return;
        const r = +((String(d.mimeType || d.mime_type || "").match(/rate=(\d+)/) || [])[1]);
        if (r) rate = r;
        schedule(b64ToBytes(d.data));
      });
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let pending = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        /* Stopped. Don't trust the aborted fetch to end the read on every
           browser — once she's told to be quiet, nothing more is scheduled. */
        if (current !== session) {
          try { reader.cancel(); } catch (e) {}
          throw Object.assign(new Error("stopped"), { name: "AbortError" });
        }
        if (done) break;
        pending += dec.decode(value, { stream: true });
        const events = pending.split(/\r?\n\r?\n/);
        pending = events.pop();
        events.forEach(handle);
      }
      if (pending.trim()) handle(pending);
    } catch (err) {
      if (err && (err.name === "AbortError" || "started" in err)) throw err;
      throw Object.assign(new Error("The voice stream broke off."), { started });
    }

    if (!started) throw new Error("Gemini sent back no audio.");

    /* Everything is scheduled; wait for the last of it to be heard. A
       timer rather than onended, so stop() has one thing to cancel. */
    await new Promise((resolve, reject) => {
      if (current !== session) return reject(Object.assign(new Error("stopped"), { name: "AbortError" }));
      session.reject = reject;
      session.timer = setTimeout(() => { session.reject = null; resolve(); },
        Math.max(0, nextAt - ac.currentTime) * 1000 + 40);
    });
  }

  /* ── Playback ─────────────────────────────────────────────── */

  let current = null;   // { audio, abort, url, reject, sources, timer }

  function stop() {
    if (!current) return;
    const c = current;
    current = null;
    try { c.abort.abort(); } catch (e) {}
    try { c.audio.pause(); } catch (e) {}
    (c.sources || []).forEach(s => { try { s.stop(); } catch (e) {} });
    clearTimeout(c.timer);
    if (c.url) URL.revokeObjectURL(c.url);
    if (c.reject) c.reject(Object.assign(new Error("stopped"), { name: "AbortError" }));
  }

  function play(blob, rate, session) {
    return new Promise((resolve, reject) => {
      if (current !== session) return reject(Object.assign(new Error("stopped"), { name: "AbortError" }));
      if (session.url) URL.revokeObjectURL(session.url);
      session.url = URL.createObjectURL(blob);
      session.reject = reject;
      const a = session.audio;
      a.src = session.url;
      a.playbackRate = rate || 1;
      a.onended = () => { session.reject = null; resolve(); };
      a.onerror = () => { session.reject = null; reject(new Error("The voice audio couldn't be played.")); };
      a.play().catch(err => {
        session.reject = null;
        /* Autoplay refused — the page hasn't been clicked yet. */
        reject(new Error(err && err.name === "NotAllowedError"
          ? "The browser blocked audio until the page is clicked."
          : "The voice audio couldn't be played."));
      });
    });
  }

  /* Resolves when she's done talking. Rejects with a sayable reason, or
     with an AbortError when stop() cut her off — the caller ignores that
     one, since being told to be quiet isn't a failure. */
  async function say(text, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    stop();

    const clean = String(text || "").trim();
    if (!clean) return;

    const session = { audio: new Audio(), abort: new AbortController(), url: null,
                      reject: null, sources: [], timer: null };
    current = session;

    try {
      /* Streaming first. If it fails before a sound was made, the pieces
         route below gets a go — unless the failure was the key or the
         quota, which it would hit just the same. */
      if (opts.stream !== false && canStream(opts)) {
        try {
          await streamSay(clean, opts, session);
          return;
        } catch (err) {
          if (err && err.name === "AbortError") throw err;
          if (err && (err.final || err.started)) {
            /* Part of it was already heard, and there's no telling which
               words — so the fallback says nothing more rather than
               starting the reply over. */
            if (err.started) err.remaining = "";
            throw err;
          }
          console.warn("[Poppy voice] streaming didn't work, using pieces:", err && err.message);
        }
      }

      /* Pieces: all requested at once. The short first piece comes back
         first and starts playing; each later one is usually ready before
         the one ahead of it finishes. */
      const pieces = split(clean);
      const clips = pieces.map(p => fetchClip(p, opts, session.abort.signal));
      clips.forEach(c => c.catch(() => {}));   // judged when it's needed, not before

      for (let k = 0; k < clips.length && current === session; k++) {
        try {
          await play(await clips[k], opts.rate, session);
        } catch (err) {
          /* Whatever was already said stays said. Hand back only what's
             left, so the fallback voice doesn't start the reply over. */
          if (k > 0 && err && err.name !== "AbortError") err.remaining = pieces.slice(k).join(" ");
          throw err;
        }
      }
    } finally {
      /* Done, failed or cut off — either way this session is over, and
         anything still downloading for it is cancelled. */
      if (current === session) {
        try { session.abort.abort(); } catch (e) {}
        clearTimeout(session.timer);
        if (session.url) URL.revokeObjectURL(session.url);
        current = null;
      }
    }
  }

  /* ── Warm-up ────────────────────────────────────────────────────
     Opening a connection to Google (DNS, TLS) costs a few hundred ms,
     and after a minute or so idle the browser has closed it again. The
     homescreen calls this the moment Jen presses send — while Poppy is
     still thinking — so the voice request finds the line already open.

     no-cors, no key, no body: it's a GET that answers 404 and costs
     nothing against quota. Only the open connection is the point. */
  let lastWarm = 0;
  function warm() {
    if (Date.now() - lastWarm < 20000) return;
    lastWarm = Date.now();
    try {
      fetch("https://generativelanguage.googleapis.com/", { mode: "no-cors", cache: "no-store" })
        .catch(() => {});
    } catch (e) { /* nothing to warm — the real request will just be slower */ }
  }

  window.POPPY_VOICE = {
    voices: VOICES,
    warm,
    models: MODELS.slice(),
    defaults: Object.assign({}, DEFAULTS),
    say,
    stop,
    get speaking() { return !!current; },
    hasKey: (key) => !!keyFor({ key: key || "" })
  };

})();

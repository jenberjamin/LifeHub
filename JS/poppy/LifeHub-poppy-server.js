/* LifeHub — Poppy's engine server.
   ────────────────────────────────────────────────────────────────
   Run:   node LifeHub-poppy-server.js          → port 3001
          node LifeHub-poppy-server.js 3005     → port 3005
          PORT=3005 node LifeHub-poppy-server.js

   Speaks the same wire format as your See You Latte server, because
   LifeHub-poppy.js:300 (sendViaServer) already knows how to talk to
   that. Nothing in the front end has to change except the config.

   In the browser console, once:

       POPPY.setConfig({
         connection: "server",
         serverUrl:  "http://localhost:3001/api/chat",
         model:      "vertex:gemini-2.5-pro"
       })

   ── The model string picks the provider ──────────────────────────
   Prefix it and there's no guessing:

       vertex:gemini-2.5-pro              Vertex AI, no key, uses gcloud ADC
       gemini:gemini-2.5-flash            Google AI Studio, needs a key
       groq:llama-3.3-70b-versatile       Groq
       anthropic:claude-sonnet-4-5        Anthropic
       deepseek:deepseek-chat             DeepSeek
       openrouter:meta-llama/llama-3.3    OpenRouter

   No prefix and it guesses from the name (claude→anthropic, a slash
   →openrouter, gemini→vertex, and so on). The prefix is better. Guessing
   is how you end up debugging the wrong provider at 2am.

   ── Keys ─────────────────────────────────────────────────────────
   Set them as environment variables. A key sent from the front end
   (Engine configuration → API key) overrides the env one for that
   request, so you can paste a key in to try a provider without
   restarting anything.

       GROQ_API_KEY  GEMINI_API_KEY  ANTHROPIC_API_KEY
       DEEPSEEK_API_KEY  OPENROUTER_API_KEY

   Windows, one session:   set GROQ_API_KEY=gsk_...
   Windows, permanently:   setx GROQ_API_KEY "gsk_..."   (reopen the terminal)

   Vertex takes no key. It uses your gcloud credentials:
       gcloud auth application-default login

   No dependencies except @google/genai, and that's only loaded if you
   actually route to Vertex. Node 18+ (needs global fetch).
*/

const http = require("http");

/* ── Vertex project ────────────────────────────────────────────────
   Carried over from your See You Latte server.js. Override with the
   VERTEX_PROJECT env var. */
const VERTEX_PROJECT  = process.env.VERTEX_PROJECT  || "project-f6f56882-f322-4f08-912";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "global";

const PORT = Number(process.argv[2] || process.env.PORT || 3001);

const DEFAULTS = {
  model:       "vertex:gemini-2.5-pro",
  tokenBudget: 30000,
  temperature: 0.9,
  maxTokens:   8000
};


/* ══════════════════════════════════════════════════════════════════
   PROVIDERS
   ══════════════════════════════════════════════════════════════════
   Every one of these takes the same thing and returns a string. Add
   another by adding a key here — nothing else in the file needs to
   know it exists. */

const PROVIDERS = {

  /* ── Vertex AI ────────────────────────────────────────────────
     No API key. Uses application-default credentials, which is why
     this one can't run from the browser and needs the server at all. */
  vertex: {
    label: "Vertex AI",
    needsKey: false,
    async send({ model, system, turns, temperature, maxTokens }){
      const ai = vertexClient();
      const result = await ai.models.generateContent({
        model,
        contents: turns.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        })),
        config: {
          systemInstruction: system,
          temperature,
          maxOutputTokens: maxTokens,
          topP: 0.9,
          topK: 40
        }
      });
      const text = result && result.text;
      if (!text) throw new Error("Vertex returned an empty reply (blocked or truncated).");
      return text;
    }
  },

  /* ── Google AI Studio ─────────────────────────────────────────
     The keyed Gemini endpoint. Same models, different door. */
  gemini: {
    label: "Gemini (AI Studio)",
    envKey: "GEMINI_API_KEY",
    async send({ model, system, turns, temperature, maxTokens, apiKey }){
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
                  encodeURIComponent(model) + ":generateContent";
      const data = await postJSON(url, {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      }, {
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        })),
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP: 0.9,
          topK: 40
        }
      });

      const cand  = data.candidates && data.candidates[0];
      const parts = cand && cand.content && cand.content.parts;
      const text  = parts ? parts.map(p => p.text || "").join("") : "";
      if (!text){
        throw new Error(cand && cand.finishReason
          ? "No reply (" + cand.finishReason + ")."
          : "Gemini returned an empty reply.");
      }
      return text;
    }
  },

  /* ── Anthropic ────────────────────────────────────────────────
     System prompt is a top-level field, not a message. max_tokens is
     required, not optional. Roles must alternate strictly, which is
     what coalesce() upstream is for. */
  anthropic: {
    label: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    async send({ model, system, turns, temperature, maxTokens, apiKey }){
      const data = await postJSON("https://api.anthropic.com/v1/messages", {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }, {
        model,
        system,
        messages: turns,
        /* Anthropic caps temperature at 1. Deep mode sits exactly there
           and Friend at 0.9, so nothing of yours clips — but a mode set
           above 1 would 400 the whole request rather than be ignored. */
        temperature: Math.min(temperature, 1),
        max_tokens: maxTokens,
        top_p: 0.9
      });

      const text = (data.content || [])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");
      if (!text) throw new Error("Anthropic returned an empty reply.");
      return text;
    }
  },

  groq:       openAICompatible("Groq",       "GROQ_API_KEY",       "https://api.groq.com/openai/v1/chat/completions"),
  deepseek:   openAICompatible("DeepSeek",   "DEEPSEEK_API_KEY",   "https://api.deepseek.com/chat/completions"),
  openrouter: openAICompatible("OpenRouter", "OPENROUTER_API_KEY", "https://openrouter.ai/api/v1/chat/completions")
};

/* Groq, DeepSeek and OpenRouter are all the same request. Writing it
   three times is three places to fix a bug in. */
function openAICompatible(label, envKey, endpoint){
  return {
    label, envKey,
    async send({ model, system, turns, temperature, maxTokens, apiKey }){
      const data = await postJSON(endpoint, {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
        "HTTP-Referer": "http://localhost",
        "X-Title": "LifeHub Poppy"
      }, {
        model,
        messages: [{ role: "system", content: system }].concat(turns),
        temperature,
        max_tokens: maxTokens,
        top_p: 0.9,
        frequency_penalty: 0.4,
        presence_penalty: 0.3
      });

      const text = data.choices && data.choices[0] &&
                   data.choices[0].message && data.choices[0].message.content;
      if (!text) throw new Error(label + " returned an empty reply.");
      return text;
    }
  };
}


/* ══════════════════════════════════════════════════════════════════
   MACHINERY
   ══════════════════════════════════════════════════════════════════ */

let _vertex = null;
function vertexClient(){
  if (_vertex) return _vertex;
  let GoogleGenAI;
  try {
    ({ GoogleGenAI } = require("@google/genai"));
  } catch (err){
    throw new Error("@google/genai isn't installed here. Run: npm install @google/genai");
  }
  _vertex = new GoogleGenAI({
    vertexai: true,
    project: VERTEX_PROJECT,
    location: VERTEX_LOCATION
  });
  return _vertex;
}

/* One place where a non-2xx turns into a readable message. Every
   provider buries its error somewhere slightly different. */
async function postJSON(url, headers, body){
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  let data = null;
  try { data = await res.json(); } catch (err){ /* not JSON */ }

  if (!res.ok || (data && data.error)){
    let detail = data && data.error;
    if (detail && typeof detail === "object") detail = detail.message || JSON.stringify(detail);
    throw new Error(detail || ("HTTP " + res.status + " " + res.statusText));
  }
  return data || {};
}

/* "groq:llama-3.3-70b" → { provider: "groq", model: "llama-3.3-70b" }
   Unprefixed falls back to reading the name, which is a guess and
   labelled as one in the log. */
function resolveModel(raw){
  const s = String(raw || DEFAULTS.model).trim();

  const colon = s.indexOf(":");
  if (colon > 0){
    const head = s.slice(0, colon).toLowerCase();
    if (PROVIDERS[head]) return { provider: head, model: s.slice(colon + 1), explicit: true };
  }

  const low = s.toLowerCase();
  let provider;
  if (s.includes("/"))              provider = "openrouter";
  else if (low.startsWith("claude"))     provider = "anthropic";
  else if (low.startsWith("deepseek"))   provider = "deepseek";
  else if (low.startsWith("gemini"))     provider = "vertex";
  else if (/llama|mixtral|gemma|qwen|kimi|whisper|gpt-oss/.test(low)) provider = "groq";
  else                                   provider = "vertex";

  return { provider, model: s, explicit: false };
}

const countTokens = (t) => Math.ceil((t || "").length / 4);

/* Newest kept. Same rule your front end uses when it's on a direct
   route, so the two paths can't disagree about what got dropped. */
function sliceHistory(chatHistory, systemText, budget){
  let used = countTokens(systemText);
  const kept = [];
  let sliced = false;
  for (let i = chatHistory.length - 1; i >= 0; i--){
    const c = countTokens(chatHistory[i].content);
    if (used + c > budget){ sliced = true; break; }
    kept.unshift(chatHistory[i]);
    used += c;
  }
  return { kept, used, sliced };
}

/* Anthropic and Vertex both reject a history that opens on an assistant
   turn or repeats a role. Slicing can produce either — cut mid-exchange
   and the oldest surviving turn is Poppy's. Merging is quieter than
   dropping: nothing she said disappears. */
function normalise(turns){
  const out = [];
  for (const t of turns){
    if (!out.length && t.role !== "user") continue;
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content += "\n\n" + t.content;
    else out.push({ role: t.role, content: t.content });
  }
  return out;
}

function readBody(req){
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > 50 * 1024 * 1024){ reject(new Error("Body too large")); req.destroy(); return; }
      raw += chunk;
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (err){ reject(new Error("Body wasn't valid JSON")); }
    });
    req.on("error", reject);
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(res, status, payload){
  const body = JSON.stringify(payload);
  res.writeHead(status, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  }, CORS));
  res.end(body);
}


/* ══════════════════════════════════════════════════════════════════
   THE ROUTE
   ══════════════════════════════════════════════════════════════════ */

async function handleChat(req, res){
  const body = await readBody(req);
  const { messages, apiKey, model, tokenLimit, temperature, maxTokens } = body;

  if (!Array.isArray(messages) || !messages.length){
    return json(res, 400, { error: { message: "No messages sent." } });
  }

  const { provider, model: modelName, explicit } = resolveModel(model);
  const spec = PROVIDERS[provider];

  const budget      = tokenLimit ? parseInt(tokenLimit, 10) : DEFAULTS.tokenBudget;
  const activeTemp  = temperature !== undefined ? parseFloat(temperature) : DEFAULTS.temperature;
  const activeMax   = maxTokens ? parseInt(maxTokens, 10) : DEFAULTS.maxTokens;

  /* Front-end key first, then the environment. Vertex wants neither. */
  const key = spec.needsKey === false
    ? null
    : (apiKey || process.env[spec.envKey] || "");

  if (spec.needsKey !== false && !key){
    return json(res, 400, { error: { message:
      spec.label + " needs a key. Set " + spec.envKey + " in the environment, " +
      "or paste one into Engine configuration." } });
  }

  /* Poppy sends her whole assembled prompt as one system message, but
     splitting on role rather than position means an extra one wouldn't
     silently become a user turn. */
  const systemText = messages.filter(m => m.role === "system")
                             .map(m => m.content).join("\n\n");
  const chatHistory = messages.filter(m => m.role !== "system")
    .map(m => ({
      role: (m.role === "assistant" || m.role === "model" || m.role === "poppy")
        ? "assistant" : "user",
      content: m.content
    }));

  const { kept, used, sliced } = sliceHistory(chatHistory, systemText, budget);

  /* Everything got sliced away — the newest message alone is over
     budget. Sending nothing is worse than sending just that. */
  const turns = normalise(kept.length ? kept : chatHistory.slice(-1));

  console.log("");
  console.log("→ " + spec.label + (explicit ? "" : " (guessed)") + "  ·  " + modelName);
  console.log("  temp " + activeTemp + "  ·  max " + activeMax + "  ·  budget " + budget);
  console.log("  context " + turns.length + "/" + chatHistory.length +
              " message" + (chatHistory.length === 1 ? "" : "s") +
              " (~" + used + " tokens)" + (sliced ? "  ⚠ sliced" : ""));

  const started = Date.now();
  const text = await spec.send({
    model: modelName,
    system: systemText,
    turns,
    temperature: activeTemp,
    maxTokens: activeMax,
    apiKey: key
  });

  console.log("← " + text.length + " chars in " + ((Date.now() - started) / 1000).toFixed(1) + "s");

  /* The shape sendViaServer() reads at LifeHub-poppy.js:328. */
  json(res, 200, {
    choices: [{ message: { role: "assistant", content: text } }],
    retainedContextCount: turns.length,
    provider,
    model: modelName
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS"){
    res.writeHead(204, CORS);
    return res.end();
  }

  const url = (req.url || "").split("?")[0];

  if (req.method === "GET" && (url === "/health" || url === "/")){
    return json(res, 200, {
      ok: true,
      port: PORT,
      providers: Object.entries(PROVIDERS).map(([id, p]) => ({
        id,
        label: p.label,
        ready: p.needsKey === false ? "credentials" : (process.env[p.envKey] ? "key set" : "no key")
      }))
    });
  }

  if (req.method === "POST" && url === "/api/chat"){
    return handleChat(req, res).catch(err => {
      console.error("✗ " + err.message);
      json(res, 500, { error: { message: err.message || "Internal error" } });
    });
  }

  json(res, 404, { error: { message: "Not found: " + req.method + " " + url } });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE"){
    console.error("Port " + PORT + " is busy — See You Latte is probably on it.");
    console.error("Try: node LifeHub-poppy-server.js " + (PORT + 1));
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log("");
  console.log("🌸 Poppy engine on http://localhost:" + PORT);
  console.log("   POST /api/chat   ·   GET /health");
  console.log("");
  for (const [id, p] of Object.entries(PROVIDERS)){
    const state = p.needsKey === false
      ? "gcloud ADC · project " + VERTEX_PROJECT
      : (process.env[p.envKey] ? "key set" : "no " + p.envKey);
    console.log("   " + id.padEnd(11) + state);
  }
  console.log("");
  console.log("   Ctrl+C to stop.");
});

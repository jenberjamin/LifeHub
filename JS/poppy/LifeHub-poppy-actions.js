/* LifeHub — reading Poppy's action blocks.
   ────────────────────────────────────────────────────────────────
   Moved out of LifeHub-homescreen.js on 2026-09-21, when Poppy got a
   phone page (LifeHub-poppy-phone.html). Both chats pull actions out of
   her replies with this one reader, so a fix here fixes both.

   Plain globals on purpose: LifeHub-homescreen.js already calls
   extractActions() and ACTION_TAG by name.

   Load it BEFORE LifeHub-homescreen.js (or the phone page's own script).
*/

/* The fence name Poppy writes her blocks under:  ```lifehub  */
const ACTION_TAG = "lifehub";

/* Pull any action blocks out of a reply, returning the text to display and
   the commands to run. Tolerates a bare JSON object if the fence is missing,
   because models drop it often enough to be worth handling. */
/* One fenced block can carry MORE THAN ONE action, and it has to, because
   some things are genuinely two writes — a glass of milk is fluid in the
   hydration tracker and calories in FoodHub.

   Asked for two, a model writes an array. This used to JSON.parse the
   block and push whatever came back, so the ARRAY itself was handed to
   run() as though it were a command: no `action` field on it, and the
   only thing Jen saw was "Couldn't do: ?" while both writes silently
   didn't happen.

   So the result is flattened, and a block holding two objects back to
   back — with or without a comma — is accepted too. Being liberal here
   is the right trade: the alternative is losing a real log to a comma. */
function collectActions(out, raw){
  const body = String(raw || "").trim();
  if (!body) return;

  const take = (v) => {
    if (Array.isArray(v)) { v.forEach(take); return; }
    if (v && typeof v === "object") out.actions.push(v);
  };

  try { take(JSON.parse(body)); return; } catch (err){ /* try harder */ }

  /* `{...} {...}` or `{...}, {...}` — valid intent, invalid JSON. */
  try { take(JSON.parse("[" + body.replace(/\}\s*,?\s*\{/g, "},{") + "]")); return; }
  catch (err){ /* not JSON at all */ }

  console.warn("[Poppy] an action block couldn't be read as JSON:", body);
}

function extractActions(text){
  const out = { clean: String(text || ""), actions: [] };

  const fence = new RegExp("```\\s*" + ACTION_TAG + "\\s*([\\s\\S]*?)```", "gi");
  out.clean = out.clean.replace(fence, (_, body) => {
    collectActions(out, body);
    return "";
  });

  if (!out.actions.length){
    /* a trailing bare object or array, e.g. {"action":"lock"} on its own
       line, for when the fence is dropped entirely */
    const bare = out.clean.match(/(\[[\s\S]*\]|\{[^{}]*"action"\s*:[\s\S]*\})\s*$/);
    if (bare){
      const before = out.actions.length;
      collectActions(out, bare[0]);
      if (out.actions.length > before) out.clean = out.clean.slice(0, bare.index);
    }
  }

  out.clean = out.clean.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

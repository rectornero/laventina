import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./db.mjs";
import { readFileBase64 } from "./files.mjs";

let client = null;
// Off unless switched on: Netlify's AI Gateway supplies a key on its own and bills the site's credits, and Nero doesn't want that.
// Set LAVENTINA_AI=on (with a key) to turn Claude back on inside the app. Claude on claude.ai, through the MCP link, needs none of this.
export const aiEnabled = () => process.env.LAVENTINA_AI === "on" && !!process.env.ANTHROPIC_API_KEY;

// One call per request: the page sends a prompt (and photo ids); the key never leaves the server.
export async function askClaude(hid, { prompt, fileIds = [], images = [], json = false }) {
  if (!aiEnabled()) throw new HttpError(503, "ai_off", "Claude is switched off inside the app. Talk to Laventina through Claude instead (menu, Connect Claude).");
  if (typeof prompt !== "string" || !prompt.trim()) throw new HttpError(400, "bad_prompt", "Nothing to ask.");
  if (prompt.length > 400_000) throw new HttpError(413, "too_large", "That question is too long.");
  client = client || new Anthropic();
  const content = [];
  for (const id of fileIds.slice(0, 4)) { const img = await readFileBase64(hid, id); if (img && img.media_type.startsWith("image/")) content.push({ type: "image", source: { type: "base64", ...img } }); }
  for (const img of images.slice(0, 4)) if (img && /^image\/(jpeg|png|webp|gif)$/.test(img.media_type) && typeof img.data === "string") content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  content.push({ type: "text", text: prompt + (json ? "\n\nReply with one JSON object only, no prose and no code fences." : "") });
  let msg;
  try {
    msg = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content }]
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "rate_limited", "Claude is busy. Try again in a minute.");
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "ai_off", "The Anthropic API key in Netlify is not valid.");
    if (e instanceof Anthropic.APIError) throw new HttpError(502, "ai_error", "Claude could not answer just now. Try again.");
    throw e;
  }
  if (msg.stop_reason === "refusal") throw new HttpError(422, "refused", "Claude could not help with that one.");
  const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  if (!json) return { text };
  const m = text.match(/\{[\s\S]*\}/);
  try { return { value: JSON.parse(m ? m[0] : text) }; }
  catch { throw new HttpError(502, "bad_json", "Claude's answer could not be read. Try again."); }
}

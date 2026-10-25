// The page asks "anything new?" once a minute. Answering that from the database would keep it awake for as long as
// a screen shows the app, so every write leaves a small stamp in Netlify Blobs instead, and the page only syncs
// when the stamp is newer than its last sync. Asking costs a Blobs read and no database at all.
// A household's stamp sits under a key only its members learn (from /api/me), so the check needs no sign-in lookup.
import { getStore } from "@netlify/blobs";
import { createHmac, randomBytes } from "node:crypto";

let store = null, secret = null;
export function setPulseStore(s) { store = s; secret = null; }
function blobs() {
  if (store) return store;
  try { return (store = getStore({ name: "pulse", consistency: "strong" })); } catch { return null; }
}
async function hmacKey(s) {
  if (secret) return secret;
  let v = await s.get("secret", { type: "json" });
  if (!v || !v.k) {
    await s.setJSON("secret", { k: randomBytes(32).toString("hex") });
    // Read back, so two first runs at once still agree on one secret.
    v = await s.get("secret", { type: "json" });
  }
  return (secret = v && v.k) || null;
}
// The household's pulse key, or null when Blobs isn't reachable (then the page just syncs every minute).
export async function pulseKey(hid) {
  const s = blobs(); if (!s || !hid) return null;
  try { const k = await hmacKey(s); return k ? createHmac("sha256", k).update(String(hid)).digest("base64url").slice(0, 32) : null; }
  catch (e) { console.error("pulse key", e.message); return null; }
}
// Something in this household changed: never fails the write that called it.
export async function touch(hid, at = Date.now()) {
  const s = blobs(); if (!s) return;
  try { const k = await pulseKey(hid); if (k) await s.setJSON("h/" + k, { at }); } catch (e) { console.error("pulse", e.message); }
}
// After a full answer from the database, make sure a stamp exists, so the next check can say "nothing new".
export async function ensureStamp(hid, at = Date.now()) {
  const s = blobs(); if (!s) return;
  try { const k = await pulseKey(hid); if (k && !(await s.get("h/" + k, { type: "json" }))) await s.setJSON("h/" + k, { at }); } catch (e) { console.error("pulse", e.message); }
}
// When this household last changed, in ms, or null when unknown (the page then syncs to be safe).
export async function lastChange(key) {
  const s = blobs(); if (!s || !/^[A-Za-z0-9_-]{16,64}$/.test(String(key || ""))) return null;
  try { const v = await s.get("h/" + key, { type: "json" }); return v && Number.isFinite(v.at) ? v.at : null; } catch { return null; }
}

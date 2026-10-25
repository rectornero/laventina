// The database sleeps when nobody needs it, and every query wakes it for a few minutes of paid compute.
// So the scheduled job first looks at a tiny note in Netlify Blobs that says when they next have work,
// and only touches the database then. The note is rewritten whenever notification settings change.
import { getStore } from "@netlify/blobs";
import { q } from "./db.mjs";
import { localNow } from "./push.mjs";

let store = null;
export function setWakeStore(s) { store = s; }
function notes() {
  if (store) return store;
  try { return (store = getStore({ name: "wake", consistency: "strong" })); } catch { return null; }
}
async function read(key) { const s = notes(); if (!s) return null; try { return await s.get(key, { type: "json" }); } catch { return null; } }
async function write(key, v) { const s = notes(); if (!s) return; try { await s.setJSON(key, v); } catch (e) { console.error("wake note", e.message); } }

// Which local hours have a notification waiting: (time zone, hour) pairs from everyone's devices.
export async function planNotices() {
  const rows = await q("select distinct tz, hour, daily, weekly, expiry from push_subs where daily or weekly or expiry");
  await write("notices", { subs: rows.map(r => ({ tz: r.tz, hour: r.hour, daily: r.daily, weekly: r.weekly, expiry: r.expiry })), planned: Date.now() });
}
export async function noticesDue(now = new Date()) {
  const n = await read("notices");
  if (!n || !Array.isArray(n.subs)) return "unplanned";
  return n.subs.some(s => {
    const l = localNow(s.tz, now);
    return (s.daily && l.hour === s.hour) || (s.expiry && l.weekday === "Mon" && l.hour === s.hour) || (s.weekly && l.weekday === "Sun" && l.hour === 19);
  });
}
// Re-plan after a write, without ever failing the write that triggered it.
export function replanNotices() { return planNotices().catch(e => console.error("plan notices", e.message)); }

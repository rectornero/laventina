// The database sleeps when nobody needs it, and every query wakes it for a few minutes of paid compute.
// So the scheduled jobs first look at a tiny note in Netlify Blobs that says when they next have work,
// and only touch the database then. The note is rewritten whenever reminders or notification settings change.
import { getStore } from "@netlify/blobs";
import { q } from "./db.mjs";
import { localNow, zonedInstant, REMIND_MINUTES, EARLY_OK } from "./push.mjs";

let store = null;
export function setWakeStore(s) { store = s; }
function notes() {
  if (store) return store;
  try { return (store = getStore({ name: "wake", consistency: "strong" })); } catch { return null; }
}
async function read(key) { const s = notes(); if (!s) return null; try { return await s.get(key, { type: "json" }); } catch { return null; } }
async function write(key, v) { const s = notes(); if (!s) return; try { await s.setJSON(key, v); } catch (e) { console.error("wake note", e.message); } }

// Every reminder instant in the next five weeks.
export async function planReminders() {
  const rows = await q(`select to_char(due_on, 'YYYY-MM-DD') as "dueOn", due_time as "dueTime", extra->'reminders' as reminders from tasks
    where deleted = false and status = 'open' and due_time is not null and extra ? 'reminders' and due_on between current_date - 1 and current_date + 35`);
  const at = [];
  for (const t of rows) {
    if (!/^\d{1,2}:\d{2}$/.test(t.dueTime || "")) continue;
    for (const r of Object.values(t.reminders || {})) {
      if (!r || !Array.isArray(r.mins)) continue;
      const due = zonedInstant(t.dueOn, t.dueTime, r.tz || "UTC");
      for (const m of r.mins) if (REMIND_MINUTES.includes(m)) at.push(due - m * 60000);
    }
  }
  at.sort((a, b) => a - b);
  await write("reminders", { at, planned: Date.now() });
  return at;
}
// No note yet (or Blobs unreachable) answers "unplanned": the job checks the database and writes the note,
// so nothing is ever silently skipped.
export async function remindersDue(now = Date.now(), lateOk = 10 * 60000) {
  const n = await read("reminders");
  if (!n || !Array.isArray(n.at)) return "unplanned";
  return n.at.some(t => now >= t - EARLY_OK && now - t <= lateOk);
}

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
export function replanReminders() { return planReminders().catch(e => console.error("plan reminders", e.message)); }
export function replanNotices() { return planNotices().catch(e => console.error("plan notices", e.message)); }

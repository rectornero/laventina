// The day's chores: turn upcoming care jobs, bills, deadlines and warranties into tasks, refresh the wake notes,
// and check yesterday's running costs. They need the database, so they ride along with the first job that wakes it
// each day (usually the morning notifications), instead of waking it once more on their own.
import { getStore } from "@netlify/blobs";
import { q } from "./db.mjs";
import { generate } from "./generate.mjs";
import { replanReminders, replanNotices } from "./wake.mjs";
import { checkCosts } from "./meter.mjs";
import { sendCostAlert } from "./push.mjs";

let store = null;
export function setChoresStore(s) { store = s; }
function notes() {
  if (store) return store;
  try { return (store = getStore({ name: "wake", consistency: "strong" })); } catch { return null; }
}
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export async function choresDone(now = Date.now()) {
  const s = notes(); if (!s) return false;
  try { const n = await s.get("chores", { type: "json" }); return !!n && n.date === today(now); } catch { return false; }
}

export async function dailyChores(now = Date.now()) {
  const hs = await q("select id from households");
  for (const h of hs) {
    try { await generate(h.id); } catch (e) { console.error("generate failed for", h.id, e); }
  }
  // While the database is awake anyway, refresh the notes that let the other jobs leave it asleep.
  await replanReminders(); await replanNotices();
  // Yesterday is complete now: if it cost far more than usual, the owner hears about it today, not at the end of the month.
  try { const { alert } = await checkCosts(); if (alert) console.log("cost alert", alert.level, alert.text); await sendCostAlert(alert); } catch (e) { console.error("cost check failed", e); }
  const s = notes(); if (s) { try { await s.setJSON("chores", { date: today(now) }); } catch (e) { console.error("chores note", e.message); } }
}

// Once a UTC day: a no-op (and no database) when another job already did them today.
export async function choresIfNeeded(now = Date.now()) {
  if (await choresDone(now)) return false;
  await dailyChores(now);
  return true;
}

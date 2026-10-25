// Laventina's own running-cost meter, in Netlify credits (Netlify doesn't expose the balance to the app).
// Each function run notes how long it took and in which minutes it used the database; the notes live in
// Netlify Blobs, one per day, so measuring never wakes the database itself. Prices from Netlify's docs
// (credit-based plans, 2026): compute and database compute 10 credits per GB-hour, production deploy 15,
// web requests 2 per 10,000. Functions run with 1 GB; the database is counted at its smallest size
// (1 GB) and stays awake about 5 minutes after its last query.
import { getStore } from "@netlify/blobs";

export const PRICE = { gbHour: 10, deploy: 15, per10kRequests: 2 };
const DB_AWAKE_MIN = 5;
const FN_GB = 1, DB_GB = 1;

let store = null;
export function setMeterStore(s) { store = s; }
function blobs() {
  if (store) return store;
  try { return (store = getStore({ name: "meter", consistency: "strong" })); } catch { return null; }
}
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// What this run did, kept in memory until flush().
const run = { db: new Set() };
export function sawDatabase(now = Date.now()) { run.db.add(Math.floor(now / 60000)); }

export async function flush(fn, startedMs, extra = {}) {
  const s = blobs(); if (!s) { run.db.clear(); return; }
  const ms = Math.max(0, Date.now() - startedMs);
  const minutes = [...run.db]; run.db.clear();
  const day = dayOf(startedMs);
  try {
    const cur = (await s.get("day/" + day, { type: "json" })) || { fn: {}, dbMinutes: [], deploys: 0, requests: 0 };
    const f = cur.fn[fn] || { runs: 0, ms: 0 };
    f.runs++; f.ms += ms; cur.fn[fn] = f;
    if (minutes.length) cur.dbMinutes = [...new Set([...cur.dbMinutes, ...minutes])].sort((a, b) => a - b);
    if (extra.request) cur.requests++;
    if (extra.deploy) cur.deploys++;
    await s.setJSON("day/" + day, cur);
  } catch (e) { console.error("meter", e.message); }
}
// Wrap a function handler so every run is metered, without slowing the answer when Netlify allows it.
export function metered(fn, handler, opts = {}) {
  return async (req, context) => {
    const t = Date.now();
    try { return await handler(req, context); }
    finally {
      const p = flush(fn, t, { request: !!opts.request, deploy: typeof opts.deploy === "function" ? await opts.deploy(req).catch(() => false) : false });
      if (context && typeof context.waitUntil === "function") context.waitUntil(p); else await p;
    }
  };
}

// Minutes the database was awake: each query keeps it up for DB_AWAKE_MIN minutes.
export function awakeMinutes(minutes) {
  let total = 0, until = -Infinity;
  for (const m of minutes) { const start = Math.max(m, until); const end = m + DB_AWAKE_MIN; if (end > start) total += end - start; until = Math.max(until, end); }
  return total;
}
export function dayCost(d) {
  const ms = Object.values(d.fn || {}).reduce((s, f) => s + f.ms, 0);
  const compute = ms / 3.6e6 * FN_GB * PRICE.gbHour;
  const database = awakeMinutes(d.dbMinutes || []) / 60 * DB_GB * PRICE.gbHour;
  const deploys = (d.deploys || 0) * PRICE.deploy;
  const requests = (d.requests || 0) / 1e4 * PRICE.per10kRequests;
  // The every-minute reminder check that finds nothing: 1,440 short runs a day, about 0.1 s each.
  const background = d.fn ? 1440 * 0.1 / 3600 * FN_GB * PRICE.gbHour : 0;
  return { compute: compute + background, database, deploys, requests, total: compute + background + database + deploys + requests, dbAwakeMin: awakeMinutes(d.dbMinutes || []), runs: Object.fromEntries(Object.entries(d.fn || {}).map(([k, v]) => [k, v.runs])) };
}

// The month so far, by billing cycle (Nero's credits renew on the 22nd), and where it is heading.
export async function costReport({ budget = 1000, cycleDay = 22, now = Date.now() } = {}) {
  const s = blobs();
  const today = new Date(now);
  let start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), cycleDay));
  if (start > today) start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, cycleDay));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, cycleDay));
  const days = [];
  for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    let rec = null; if (s) { try { rec = await s.get("day/" + key, { type: "json" }); } catch {} }
    days.push({ date: key, measured: !!rec, ...dayCost(rec || {}) });
  }
  const measured = days.filter(d => d.measured);
  const spent = measured.reduce((a, d) => a + d.total, 0);
  const full = measured.filter(d => d.date !== dayOf(now));
  const perDay = full.length ? full.reduce((a, d) => a + d.total, 0) / full.length : (measured[0]?.total || 0);
  const left = Math.max(0, (end - today) / 864e5);
  const projected = spent + perDay * left;
  return { cycle: { start: dayOf(start), end: dayOf(end) }, budget, spent: round(spent), perDay: round(perDay), projected: round(projected), share: Math.round(100 * projected / budget), days: days.map(d => ({ ...d, total: round(d.total), compute: round(d.compute), database: round(d.database), deploys: round(d.deploys), requests: round(d.requests) })), note: "Laventina's own estimate. Your other sites aren't counted; Netlify's Usage page has the real balance." };
}
const round = n => Math.round(n * 10) / 10;

// Worth a word from the butler: a day whose running cost (deploys aside: those are expected) was far above usual,
// or a cycle heading past a third of the budget.
export function costAlert(r) {
  const days = r.days.filter(d => d.measured);
  const last = days.length >= 2 ? days[days.length - 2] : null; // yesterday, a full day
  const running = d => d.total - d.deploys;
  const usual = days.length > 2 ? days.slice(0, -2).reduce((a, d) => a + running(d), 0) / (days.length - 2) : 0;
  if (last && running(last) >= Math.max(10, 3 * usual)) return { level: "high", text: `Yesterday I cost about ${round(running(last))} credits to run, far more than usual. The database was awake ${round(last.dbAwakeMin / 60)} hours.` };
  if (r.projected >= r.budget * 0.33) return { level: "watch", text: `At this pace I'll use about ${r.projected} credits this cycle, ${r.share}% of your ${r.budget}.` };
  return null;
}

// Once a day (from the daily job): work out the report and keep the alert, so the butler reads one small note.
export async function checkCosts(opts = {}) {
  const r = await costReport(opts);
  const alert = costAlert(r);
  const s = blobs();
  if (s) { try { await s.setJSON("alert", { date: dayOf(opts.now || Date.now()), alert, spent: r.spent, projected: r.projected }); } catch (e) { console.error("meter", e.message); } }
  return { report: r, alert };
}
export async function currentAlert(now = Date.now()) {
  const s = blobs(); if (!s) return null;
  try {
    const a = await s.get("alert", { type: "json" });
    return a && a.alert && now - Date.parse(a.date) < 2 * 864e5 ? { ...a.alert, date: a.date } : null;
  } catch { return null; }
}

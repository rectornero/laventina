// Everything the butler can do, as tools with JSON schemas. The talking butler (lib/butler.mjs) and Claude through MCP
// (netlify/functions/mcp.mjs) use the same list, so whatever one can do, the other can too.
// Nothing here sends anything outside the household: messages to other people are drafts that Nero sends them personally.
import { q, HttpError } from "./db.mjs";
import { readKinds, rowToTask, putTask, putRecord, TASK_COLS } from "./data.mjs";
import { newId } from "./auth.mjs";
import { localNow, ringBell } from "./push.mjs";
import { collect, addDaysISO } from "../public/js/expiry-core.js";

// ---------- Context ----------
export async function profileOf(uid) {
  return (await q("select data from butler_profile where user_id = $1", [uid]))[0]?.data || {};
}
export async function saveProfile(uid, patch) {
  const cur = await profileOf(uid);
  const next = { ...cur, ...patch };
  await q(`insert into butler_profile (user_id, data) values ($1, $2::jsonb)
    on conflict (user_id) do update set data = excluded.data, updated_at = now()`, [uid, JSON.stringify(next)]);
  return next;
}
// ctx = { hid, user, tz, today, hour, weekday, profile }
export async function makeCtx(hid, user, tz) {
  const profile = await profileOf(user.id);
  const zone = tz || profile.tz || "Europe/Madrid";
  const now = localNow(zone);
  if (tz && tz !== profile.tz) await saveProfile(user.id, { tz });
  return { hid, user, tz: zone, today: now.date, hour: now.hour, weekday: now.weekday, profile: { ...profile, tz: zone } };
}

const SELECT = `select id, ${Object.entries(TASK_COLS).map(([k, [c, t]]) => (t === "date" ? `to_char(${c}, 'YYYY-MM-DD')` : t === "ts" ? `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')` : c) + ` as "${k}"`).join(", ")} from tasks`;
export async function openTasks(ctx) {
  const rows = await q(`${SELECT} where household_id = $1 and not deleted and status = 'open' and (visibility = 'shared' or created_by = $2)`, [ctx.hid, ctx.user.id]);
  return rows.map(rowToTask).filter(t => !t.showFrom || t.showFrom <= ctx.today);
}
async function taskById(ctx, id) {
  const r = (await q(`${SELECT} where household_id = $1 and id = $3 and not deleted and (visibility = 'shared' or created_by = $2)`, [ctx.hid, ctx.user.id, String(id)]))[0];
  if (!r) throw new HttpError(404, "no_task", "I couldn't find that task.");
  return rowToTask(r);
}
async function findTask(ctx, ref) {
  if (/^t[_A-Za-z0-9-]*$/.test(ref || "") && ref.length > 3) { try { return await taskById(ctx, ref); } catch {} }
  const words = String(ref || "").toLowerCase();
  const all = await openTasks(ctx);
  return all.find(t => t.title.toLowerCase() === words) || all.find(t => t.title.toLowerCase().includes(words)) || null;
}
async function members(hid) {
  return q("select u.id, u.name from members m join users u on u.id = m.user_id where m.household_id = $1 order by m.joined_at", [hid]);
}
const brief = t => ({ id: t.id, title: t.title, due: t.dueOn || null, time: t.dueTime || null, priority: t.priority || 0, assignee: t.assigneeId || null, late: !!(t.dueOn && t.dueOn < t._today) });
const mine = (ctx) => t => !t.assigneeId || t.assigneeId === ctx.user.id;

// ---------- Weather (Open-Meteo, no key needed) ----------
const WMO = { 0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "cloudy", 45: "foggy", 48: "foggy", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain", 71: "light snow", 73: "snow", 75: "heavy snow", 80: "showers", 81: "showers", 82: "heavy showers", 95: "thunderstorms", 96: "thunderstorms", 99: "thunderstorms" };
let fetcher = (...a) => fetch(...a);
export function setFetcher(fn) { fetcher = fn; }
async function getJSON(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
  try { const r = await fetcher(url, { signal: ctl.signal }); if (!r.ok) throw new Error("http " + r.status); return await r.json(); } finally { clearTimeout(t); }
}
export async function weatherFor(ctx) {
  const loc = ctx.profile.location;
  if (!loc || loc.lat == null) return null;
  const c = ctx.profile.weather;
  if (c && Date.now() - Date.parse(c.at) < 3600e3) return c;
  try {
    const w = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=2`);
    const out = { at: new Date().toISOString(), now: { temp: Math.round(w.current.temperature_2m), sky: WMO[w.current.weather_code] || "mixed" },
      today: { max: Math.round(w.daily.temperature_2m_max[0]), min: Math.round(w.daily.temperature_2m_min[0]), rain: w.daily.precipitation_probability_max[0], sky: WMO[w.daily.weather_code[0]] || "mixed" },
      tomorrow: { max: Math.round(w.daily.temperature_2m_max[1]), min: Math.round(w.daily.temperature_2m_min[1]), rain: w.daily.precipitation_probability_max[1], sky: WMO[w.daily.weather_code[1]] || "mixed" } };
    ctx.profile = await saveProfile(ctx.user.id, { weather: out });
    return out;
  } catch (e) { console.error("weather", e.message); return c || null; }
}

// ---------- What the butler knows right now ----------
export async function senses(ctx) {
  const [tasks, kinds, people, bells, weather] = await Promise.all([
    openTasks(ctx),
    readKinds(ctx.hid, ["chances", "expiries", "documents", "charges", "items", "notes"]),
    members(ctx.hid),
    q(`select r.data, u.name, r.created_by from records r join users u on u.id = r.created_by where r.household_id = $1 and r.kind = 'bells' and not r.deleted and r.created_at > now() - interval '6 hours' order by r.created_at desc limit 3`, [ctx.hid]),
    weatherFor(ctx)
  ]);
  const vis = r => r._visibility !== "private" || r._createdBy === ctx.user.id;
  for (const t of tasks) t._today = ctx.today;
  const td = ctx.today, soon = addDaysISO(td, 3);
  const mineT = tasks.filter(mine(ctx));
  const done = await q(`select count(*)::int as n, count(*) filter (where done_at::date = $3::date)::int as today from tasks where household_id = $1 and done_by = $2 and status = 'done' and done_at > now() - interval '7 days'`, [ctx.hid, ctx.user.id, td]);
  const chances = kinds.chances.filter(vis);
  const open = chances.filter(c => c.status === "open").sort((a, b) => (a.expiresOn || "9999").localeCompare(b.expiresOn || "9999"));
  const caught = chances.filter(c => c.status === "caught"), missed = chances.filter(c => c.status === "missed");
  const val = l => l.reduce((s, c) => s + (Number(c.value) || 0), 0);
  const expiring = collect({ items: kinds.items, documents: kinds.documents.filter(vis), charges: kinds.charges.filter(vis), expiries: kinds.expiries.filter(vis), chances: [], today: td })
    .filter(e => e.lane !== "coupons" && (e.state === "now" || e.state === "expired") && (e.visibility === "shared" || e.createdBy === ctx.user.id))
    .sort((a, b) => a.days - b.days);
  const notes = kinds.notes.filter(n => n.createdAt && Date.now() - Date.parse(n.createdAt) < 3 * 864e5 && n._createdBy !== ctx.user.id);
  return {
    now: { date: td, hour: ctx.hour, weekday: ctx.weekday, tz: ctx.tz },
    me: { id: ctx.user.id, name: ctx.user.name }, people,
    presence: ctx.profile.presence && ctx.profile.presence.date === td ? ctx.profile.presence : null,
    location: ctx.profile.location || null, weather,
    facts: ctx.profile.facts || [],
    tasks: {
      late: mineT.filter(t => t.dueOn && t.dueOn < td).map(brief),
      today: mineT.filter(t => t.dueOn === td).map(brief),
      soon: mineT.filter(t => t.dueOn > td && t.dueOn <= soon).map(brief),
      important: mineT.filter(t => !t.dueOn && (t.priority || 0) >= 2).map(brief),
      undated: mineT.filter(t => !t.dueOn).length,
      othersOpen: tasks.length - mineT.length,
      doneToday: done[0].today, doneWeek: done[0].n
    },
    money: {
      open: open.map(c => ({ id: c.id, title: c.title, kind: c.kind, value: c.value ?? null, minSpend: c.minSpend ?? null, store: c.store || null, endsOn: c.expiresOn || null, days: c.expiresOn ? Math.round((Date.parse(c.expiresOn) - Date.parse(td)) / 864e5) : null, taskId: c.taskId || null })),
      ledger: { caught: caught.length, missed: missed.length, caughtValue: val(caught), missedValue: val(missed), rate: caught.length + missed.length ? Math.round(100 * caught.length / (caught.length + missed.length)) : null, causes: missed.map(c => c.cause).filter(Boolean) }
    },
    expiring: expiring.slice(0, 6).map(e => ({ key: e.key, lane: e.lane, title: e.title, date: e.date, days: e.days, state: e.state })),
    bells: bells.filter(b => b.created_by !== ctx.user.id).map(b => ({ from: b.name, message: b.data.message || "", at: b.data.at })),
    notes: notes.slice(0, 3).map(n => ({ text: n.text, by: people.find(p => p.id === n._createdBy)?.name || "Someone" }))
  };
}

// ---------- Tools ----------
const str = (d) => ({ type: "string", description: d });
const date = (d) => ({ type: "string", description: d + " (YYYY-MM-DD)" });
const CAUSES = {
  forgot: ["Forgot I had it", "Keep every coupon in Laventina the day you get it, and check what's on the table before you shop.", { title: "Before shopping: ask Laventina what's on the table", repeat: { every: 1, unit: "week" } }],
  date: ["Didn't see the end date", "Give each coupon its end date when you catch it: Laventina then raises it two days before.", { title: "Add end dates to coupons and offers" }],
  spend: ["Couldn't reach the minimum spend", "Plan one bigger shop around the coupon instead of several small ones.", { title: "Plan one bigger grocery shop this week", repeat: { every: 1, unit: "week" } }],
  away: ["Wasn't near the shop", "Pin it to a trip you already make, or pass it to someone who goes there.", { title: "Match coupons to shops we already pass" }],
  notworth: ["Wasn't worth it", "That's fine: only catch the ones worth your time.", null]
};
function resolveDate(ctx, s) {
  if (!s) return undefined;
  const v = String(s).toLowerCase().trim();
  if (v === "today") return ctx.today;
  if (v === "tomorrow") return addDaysISO(ctx.today, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^\+?(\d{1,3})d$/); if (m) return addDaysISO(ctx.today, Number(m[1]));
  return undefined;
}
async function saveTask(ctx, t) { await putTask(ctx.hid, ctx.user.id, t.id, { data: t }); return t; }

export const TOOLS = [
  {
    name: "get_overview",
    description: "What matters in the household right now: Nero's late, today's and upcoming tasks, money on the table (coupons, refunds, offers), things running out, the house bell, fridge notes, weather, and what the butler knows about Nero. Call this first when you need context.",
    input_schema: { type: "object", properties: {} },
    run: async (ctx) => senses(ctx)
  },
  {
    name: "find_tasks",
    description: "Search open tasks by words in the title, or list them by when they are due.",
    input_schema: { type: "object", properties: { query: str("Words to look for; leave empty to list"), scope: { type: "string", enum: ["late", "today", "week", "undated", "all"], description: "Which tasks; default all" } } },
    run: async (ctx, { query, scope = "all" }) => {
      const td = ctx.today, wk = addDaysISO(td, 7);
      let all = await openTasks(ctx); for (const t of all) t._today = td;
      if (query) { const w = String(query).toLowerCase(); all = all.filter(t => t.title.toLowerCase().includes(w) || (t.notes || "").toLowerCase().includes(w)); }
      const f = { late: t => t.dueOn && t.dueOn < td, today: t => t.dueOn === td, week: t => t.dueOn && t.dueOn <= wk, undated: t => !t.dueOn, all: () => true }[scope] || (() => true);
      return { tasks: all.filter(f).sort((a, b) => (a.dueOn || "9999").localeCompare(b.dueOn || "9999")).slice(0, 40).map(brief) };
    }
  },
  {
    name: "add_task",
    description: "Put something on the household's to-do list. Use when Nero asks to remember, do or buy something, or agrees to a proposal.",
    input_schema: { type: "object", required: ["title"], properties: {
      title: str("Short, starts with a verb: 'Call the plumber'"), due: str("today, tomorrow, +3d, or YYYY-MM-DD; omit if no date"), time: str("HH:MM, only if a time was given"),
      notes: str("Optional details"), important: { type: "boolean", description: "True if it matters more than usual" }, minutes: { type: "integer", description: "Rough estimate in minutes" },
      for: str("Name of the household member it is for; omit for Nero") } },
    run: async (ctx, i) => {
      const title = String(i.title || "").trim().slice(0, 200); if (!title) throw new HttpError(400, "bad_task", "A task needs a title.");
      let assigneeId;
      if (i.for) { const p = (await members(ctx.hid)).find(m => m.name.toLowerCase() === String(i.for).toLowerCase()); if (p && p.id !== ctx.user.id) assigneeId = p.id; }
      const t = { id: newId("t"), title, status: "open", source: "todo", visibility: "shared", priority: i.important ? 2 : 0, sortOrder: Date.now() / 1e3,
        dueOn: resolveDate(ctx, i.due), dueTime: /^\d{1,2}:\d{2}$/.test(i.time || "") ? i.time.padStart(5, "0") : undefined, notes: i.notes || undefined,
        estMinutes: Number(i.minutes) || undefined, assigneeId, tags: ["butler"] };
      await saveTask(ctx, t);
      return { added: brief({ ...t, _today: ctx.today }) };
    }
  },
  {
    name: "complete_task",
    description: "Mark a task as done. Give its id, or words from its title.",
    input_schema: { type: "object", required: ["task"], properties: { task: str("Task id or words from the title") } },
    run: async (ctx, { task }) => {
      const t = await findTask(ctx, task); if (!t) throw new HttpError(404, "no_task", "I couldn't find that task.");
      await saveTask(ctx, { ...t, status: "done", doneAt: new Date().toISOString(), doneBy: ctx.user.id });
      if (t.extra && t.extra.chanceId) await setChance(ctx, t.extra.chanceId, { status: "caught", outcomeAt: new Date().toISOString(), by: ctx.user.id });
      return { done: t.title };
    }
  },
  {
    name: "move_task",
    description: "Change when a task is due (snooze, reschedule, or clear the date), or rename it.",
    input_schema: { type: "object", required: ["task"], properties: { task: str("Task id or words from the title"), due: str("today, tomorrow, +3d, YYYY-MM-DD, or 'none'"), time: str("HH:MM or 'none'"), title: str("New title, if renaming") } },
    run: async (ctx, i) => {
      const t = await findTask(ctx, i.task); if (!t) throw new HttpError(404, "no_task", "I couldn't find that task.");
      const n = { ...t };
      if (i.due) { const d = i.due === "none" ? null : resolveDate(ctx, i.due); if (d !== undefined) { if (d && t.dueOn && d > t.dueOn) n.extra = { ...(t.extra || {}), postponed: ((t.extra && t.extra.postponed) || 0) + 1 }; n.dueOn = d || undefined; } }
      if (i.time) n.dueTime = i.time === "none" ? undefined : i.time;
      if (i.title) n.title = String(i.title).slice(0, 200);
      await saveTask(ctx, n);
      return { task: brief({ ...n, _today: ctx.today }) };
    }
  },
  {
    name: "spread_late_tasks",
    description: "Take Nero's late tasks and spread them over the coming days, at most two per day, so nothing piles up.",
    input_schema: { type: "object", properties: {} },
    run: async (ctx) => {
      const late = (await openTasks(ctx)).filter(mine(ctx)).filter(t => t.dueOn && t.dueOn < ctx.today).sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.dueOn.localeCompare(b.dueOn));
      const out = [];
      for (let k = 0; k < late.length; k++) { const d = addDaysISO(ctx.today, Math.floor(k / 2)); await saveTask(ctx, { ...late[k], dueOn: d }); out.push({ title: late[k].title, due: d }); }
      return { moved: out };
    }
  },
  {
    name: "catch_opportunity",
    description: "Save money on the table so it is not lost: a coupon, voucher, discount, refund, cashback or claim. The butler then raises it two days before it ends.",
    input_schema: { type: "object", required: ["title"], properties: {
      title: str("What it is: '€7 off at Carrefour'"), kind: { type: "string", enum: ["coupon", "discount", "refund", "cashback", "claim", "other"] }, value: { type: "number", description: "What it is worth, in the household currency" },
      minSpend: { type: "number", description: "Minimum spend, if any" }, store: str("Shop or company"), endsOn: date("Last day it can be used"), notes: str("Code, conditions, where it is kept") } },
    run: async (ctx, i) => {
      const c = { id: newId("c"), status: "open", createdAt: new Date().toISOString(), title: String(i.title).slice(0, 160), kind: i.kind || "coupon", value: Number(i.value) || undefined, minSpend: Number(i.minSpend) || undefined, store: i.store || undefined, expiresOn: resolveDate(ctx, i.endsOn), notes: i.notes || undefined };
      const due = c.expiresOn ? (addDaysISO(c.expiresOn, -2) >= ctx.today ? addDaysISO(c.expiresOn, -2) : c.expiresOn < ctx.today ? ctx.today : c.expiresOn) : undefined;
      const t = { id: newId("t"), title: `Use: ${c.title}${c.minSpend ? ` (spend ${c.minSpend})` : ""}${c.store && !c.title.toLowerCase().includes(c.store.toLowerCase()) ? " at " + c.store : ""}`, status: "open", source: "todo", visibility: "shared", priority: 1, dueOn: due, tags: ["opportunity"], extra: { chanceId: c.id }, sortOrder: Date.now() / 1e3 };
      c.taskId = t.id;
      await putRecord(ctx.hid, ctx.user.id, "chances", c.id, { data: c });
      await saveTask(ctx, t);
      return { caught: { id: c.id, title: c.title, endsOn: c.expiresOn || null, reminder: due || null } };
    }
  },
  {
    name: "settle_opportunity",
    description: "Record how an opportunity ended: used (caught) or missed. For a miss, give the cause so the system learns and a safeguard task is put in place: forgot, date (didn't see the end date), spend (couldn't reach minimum spend), away (wasn't near the shop), notworth.",
    input_schema: { type: "object", required: ["id", "outcome"], properties: { id: str("Opportunity id"), outcome: { type: "string", enum: ["caught", "missed"] }, cause: { type: "string", enum: Object.keys(CAUSES) }, note: str("Anything else") } },
    run: async (ctx, i) => settle(ctx, i)
  },
  {
    name: "log_lost_opportunity",
    description: "Record an opportunity that was already lost before it was ever saved (for example a coupon that expired in a wallet), with its cause, so it counts in the ledger and the system learns from it.",
    input_schema: { type: "object", required: ["title", "cause"], properties: { title: str("What was lost"), value: { type: "number" }, minSpend: { type: "number" }, store: str("Shop"), cause: { type: "string", enum: Object.keys(CAUSES) }, note: str("Anything else") } },
    run: async (ctx, i) => {
      const c = { id: newId("c"), status: "open", createdAt: new Date().toISOString(), title: String(i.title).slice(0, 160), kind: "coupon", value: Number(i.value) || undefined, minSpend: Number(i.minSpend) || undefined, store: i.store || undefined };
      await putRecord(ctx.hid, ctx.user.id, "chances", c.id, { data: c });
      return settle(ctx, { id: c.id, outcome: "missed", cause: i.cause, note: i.note });
    }
  },
  {
    name: "remember",
    description: "Remember a lasting fact about Nero or the household that will help later (habits, preferences, shops nearby, who does what, birthdays). One short sentence.",
    input_schema: { type: "object", required: ["fact"], properties: { fact: str("The fact") } },
    run: async (ctx, { fact }) => {
      const f = String(fact || "").trim().slice(0, 240); if (!f) return { ok: false };
      const facts = [...(ctx.profile.facts || []).filter(x => x !== f), f].slice(-60);
      ctx.profile = await saveProfile(ctx.user.id, { facts });
      return { remembered: f, total: facts.length };
    }
  },
  {
    name: "forget",
    description: "Forget a fact the butler remembered, by words it contains.",
    input_schema: { type: "object", required: ["words"], properties: { words: str("Words in the fact") } },
    run: async (ctx, { words }) => {
      const w = String(words || "").toLowerCase();
      const facts = (ctx.profile.facts || []).filter(x => !x.toLowerCase().includes(w));
      ctx.profile = await saveProfile(ctx.user.id, { facts });
      return { left: facts.length };
    }
  },
  {
    name: "set_presence",
    description: "Note whether Nero is at home or out today, and where, so suggestions fit: home care when home, errands and shops when out.",
    input_schema: { type: "object", required: ["where"], properties: { where: { type: "string", enum: ["home", "out"] }, place: str("Where, if out: 'city centre', 'office'") } },
    run: async (ctx, { where, place }) => {
      ctx.profile = await saveProfile(ctx.user.id, { presence: { date: ctx.today, where: where === "out" ? "out" : "home", place: place || undefined, at: new Date().toISOString() } });
      return { presence: ctx.profile.presence };
    }
  },
  {
    name: "set_city",
    description: "Set the city Nero lives in, so the butler can follow the weather and plan around it.",
    input_schema: { type: "object", required: ["city"], properties: { city: str("City name, optionally with country") } },
    run: async (ctx, { city }) => {
      const name = String(city || "").trim().slice(0, 80); if (!name) throw new HttpError(400, "no_city", "Which city?");
      let g;
      try { g = (await getJSON(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(name.split(",")[0])}`)).results?.[0]; } catch {}
      const location = g ? { city: g.name, country: g.country, lat: g.latitude, lon: g.longitude, tz: g.timezone } : { city: name };
      ctx.profile = await saveProfile(ctx.user.id, { location, weather: null, ...(g && g.timezone ? { tz: g.timezone } : {}) });
      return { location, weather: await weatherFor(ctx) };
    }
  },
  {
    name: "get_weather",
    description: "Weather now, today and tomorrow where Nero lives.",
    input_schema: { type: "object", properties: {} },
    run: async (ctx) => (await weatherFor(ctx)) || { unknown: "No city set yet. Ask Nero which city, then call set_city." }
  },
  {
    name: "ring_bell",
    description: "Ring the house bell: everyone else in the household is called into Laventina, where the message waits for them. Only when Nero asks.",
    input_schema: { type: "object", properties: { message: str("Short message, optional") } },
    run: async (ctx, { message }) => { const r = await ringBell(ctx.hid, ctx.user, { message }); return { rang: true, devices: r.devices }; }
  },
  {
    name: "leave_note",
    description: "Leave a note on the household fridge for everyone to see.",
    input_schema: { type: "object", required: ["text"], properties: { text: str("The note") } },
    run: async (ctx, { text }) => {
      const n = { id: newId("n"), text: String(text).slice(0, 280), color: "#FBF4D6", createdAt: new Date().toISOString() };
      await putRecord(ctx.hid, ctx.user.id, "notes", n.id, { data: n });
      return { note: n.text };
    }
  },
  {
    name: "add_to_shopping",
    description: "Add things to the household shopping list.",
    input_schema: { type: "object", required: ["items"], properties: { items: { type: "array", items: { type: "string" }, description: "Things to buy" } } },
    run: async (ctx, { items }) => {
      const list = (Array.isArray(items) ? items : [items]).map(s => String(s).trim()).filter(Boolean).slice(0, 30);
      for (const text of list) { const id = newId("s"); await putRecord(ctx.hid, ctx.user.id, "shopping", id, { data: { id, text: text.slice(0, 120), done: false, source: "butler", createdAt: new Date().toISOString() } }); }
      return { added: list };
    }
  },
  {
    name: "search_household",
    description: "Look things up in what the household has stored: belongings, rooms, documents, contracts and bills, notes, wishlist, projects, shopping.",
    input_schema: { type: "object", required: ["query"], properties: { query: str("Words to look for") } },
    run: async (ctx, { query }) => {
      const w = String(query || "").toLowerCase().trim(); if (!w) return { results: [] };
      const kinds = ["items", "rooms", "documents", "charges", "notes", "wishlist", "projects", "shopping", "expiries", "chances"];
      const all = await readKinds(ctx.hid, kinds);
      const out = [];
      for (const k of kinds) for (const r of all[k]) {
        if (r._visibility === "private" && r._createdBy !== ctx.user.id) continue;
        const s = JSON.stringify(r).toLowerCase();
        if (s.includes(w)) out.push({ kind: k, id: r.id, name: r.name || r.title || r.text || r.provider || r.id, ...pick(r, ["roomId", "spot", "value", "purchaseDate", "warrantyUntil", "expiryDate", "expiresOn", "amount", "status", "date", "done", "store"]) });
      }
      return { results: out.slice(0, 25) };
    }
  },
  {
    name: "draft_message",
    description: "Draft an email or message to someone outside the household (a shop, a landlord, a company, a friend). Nothing is sent: Nero reads it and sends it personally. Use for complaints, refunds, bookings, questions.",
    input_schema: { type: "object", required: ["to", "body"], properties: { to: str("Who it is for: name or email"), channel: { type: "string", enum: ["email", "message"] }, subject: str("Email subject"), body: str("The full text, ready to send, in Nero's voice") } },
    run: async (ctx, i) => {
      const d = { id: newId("d"), to: String(i.to).slice(0, 200), channel: i.channel || "email", subject: i.subject ? String(i.subject).slice(0, 200) : undefined, body: String(i.body).slice(0, 6000), createdAt: new Date().toISOString(), status: "draft" };
      await putRecord(ctx.hid, ctx.user.id, "drafts", d.id, { data: d, visibility: "private" });
      return { draft: d };
    }
  },
  {
    name: "offer_choices",
    description: "Offer Nero up to four short tap-to-answer replies under your message, so Nero never has to type. Each is what Nero would say: 'Yes, do it', 'Tomorrow', 'I'm out'. In the app only.",
    input_schema: { type: "object", required: ["choices"], properties: { choices: { type: "array", items: { type: "string" }, maxItems: 4 } } },
    appOnly: true,
    run: async (ctx, { choices }) => ({ offered: (choices || []).slice(0, 4) })
  }
];
function pick(o, ks) { const r = {}; for (const k of ks) if (o[k] != null && o[k] !== "") r[k] = o[k]; return r; }

async function setChance(ctx, id, patch) {
  const c = (await readKinds(ctx.hid, ["chances"])).chances.find(x => x.id === id);
  if (!c) throw new HttpError(404, "no_chance", "I couldn't find that opportunity.");
  const { id: _, _visibility, _createdBy, ...data } = c;
  const next = { ...data, ...patch };
  await putRecord(ctx.hid, ctx.user.id, "chances", id, { data: next, visibility: _visibility });
  return { ...next, id };
}
async function settle(ctx, { id, outcome, cause, note }) {
  const now = new Date().toISOString();
  if (outcome === "caught") {
    const c = await setChance(ctx, id, { status: "caught", outcomeAt: now, by: ctx.user.id });
    if (c.taskId) { try { const t = await taskById(ctx, c.taskId); if (t.status === "open") await saveTask(ctx, { ...t, status: "done", doneAt: now, doneBy: ctx.user.id }); } catch {} }
    return { caught: c.title, value: c.value ?? null };
  }
  const [label, lesson, guard] = CAUSES[cause] || CAUSES.forgot;
  let safeguard = null;
  if (guard) {
    const exists = (await openTasks(ctx)).find(t => t.title === guard.title);
    if (exists) safeguard = exists.title;
    else { await saveTask(ctx, { id: newId("t"), title: guard.title, status: "open", source: "todo", visibility: "shared", priority: 0, dueOn: addDaysISO(ctx.today, 1), repeat: guard.repeat || undefined, tags: ["safeguard"], notes: `Added after a missed opportunity. ${lesson}`, sortOrder: Date.now() / 1e3 }); safeguard = guard.title; }
  }
  const c = await setChance(ctx, id, { status: "missed", outcomeAt: now, cause: label, causeKey: cause || "forgot", lesson, note: note || undefined, by: ctx.user.id });
  if (c.taskId) { try { const t = await taskById(ctx, c.taskId); if (t.status === "open") await saveTask(ctx, { ...t, status: "skipped" }); } catch {} }
  return { missed: c.title, value: c.value ?? null, lesson, safeguard };
}

export const toolByName = (n) => TOOLS.find(t => t.name === n);
export async function runTool(ctx, name, input) {
  const t = toolByName(name);
  if (!t) throw new HttpError(404, "no_tool", "No such ability: " + name);
  return t.run(ctx, input && typeof input === "object" ? input : {});
}

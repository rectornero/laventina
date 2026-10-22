import webpush from "web-push";
import { q, HttpError } from "./db.mjs";
import { newId } from "./auth.mjs";

// Web Push with VAPID keys from the environment. Without them the app simply offers no notifications.
const env = (k) => process.env[k] || (globalThis.Netlify?.env?.get?.(k)) || "";
export const pushEnabled = () => !!(env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY"));
export const publicKey = () => env("VAPID_PUBLIC_KEY");

let sender = null;
// Tests swap in a fake; it gets (subscription, payloadString, options) and may throw { statusCode }.
export function setSender(fn) { sender = fn; }
function send(sub, payload, opts) {
  if (sender) return sender(sub, payload, opts);
  return webpush.sendNotification(sub, payload, {
    ...opts,
    vapidDetails: { subject: env("VAPID_SUBJECT") || "https://laventina.netlify.app", publicKey: env("VAPID_PUBLIC_KEY"), privateKey: env("VAPID_PRIVATE_KEY") }
  });
}

function safeTz(tz) {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } catch { return "UTC"; }
}
// Local calendar date and hour for a time zone.
export function localNow(tz, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: safeTz(tz), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(now).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday };
}

export async function subscribe(hid, uid, b) {
  if (!pushEnabled()) throw new HttpError(503, "push_off", "Notifications are not set up on this site yet.");
  const s = b && b.subscription;
  const endpoint = s && typeof s.endpoint === "string" ? s.endpoint : "";
  if (!/^https:\/\/[^\s]{8,800}$/.test(endpoint) || !s.keys || typeof s.keys.p256dh !== "string" || typeof s.keys.auth !== "string")
    throw new HttpError(400, "bad_subscription", "That push subscription looks wrong.");
  const tz = safeTz(String(b.tz || "UTC").slice(0, 64));
  const hour = Math.min(23, Math.max(0, Math.round(Number(b.hour ?? 8)) || 0));
  // Saying yes after today's nudge time means the first one comes tomorrow.
  const local = localNow(tz);
  await q(`insert into push_subs (endpoint, user_id, household_id, p256dh, auth, tz, hour, daily, assigned, last_digest, bell, weekly)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12)
    on conflict (endpoint) do update set user_id = $2, household_id = $3, p256dh = $4, auth = $5, tz = $6, hour = $7, daily = $8, assigned = $9,
      last_digest = case when push_subs.hour = $7 then push_subs.last_digest else $10::date end, bell = $11, weekly = $12, updated_at = now()`,
    [endpoint, uid, hid, s.keys.p256dh.slice(0, 200), s.keys.auth.slice(0, 100), tz, hour, b.daily !== false, b.assigned !== false, local.hour >= hour ? local.date : null, b.bell !== false, b.weekly !== false]);
  return { ok: true };
}

export async function unsubscribe(uid, endpoint) {
  await q("delete from push_subs where user_id = $1 and endpoint = $2", [uid, String(endpoint || "")]);
  return { ok: true };
}

export async function deviceSettings(uid, endpoint) {
  const r = (await q("select hour, daily, assigned, bell, weekly from push_subs where user_id = $1 and endpoint = $2", [uid, String(endpoint || "")]))[0];
  return r ? { subscribed: true, hour: r.hour, daily: r.daily, assigned: r.assigned, bell: r.bell, weekly: r.weekly } : { subscribed: false };
}

// Sends to each of the rows; drops devices the push service says are gone.
async function deliver(rows, msg, ttl) {
  let sent = 0;
  for (const r of rows) {
    try {
      await send({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, JSON.stringify(msg), { TTL: ttl, urgency: msg.tag === "bell" ? "high" : "normal" });
      sent++;
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await q("delete from push_subs where endpoint = $1", [r.endpoint]);
      else console.error("push failed", e && (e.statusCode || e.message));
    }
  }
  return sent;
}

export async function sendTest(uid, endpoint) {
  const rows = await q("select endpoint, p256dh, auth from push_subs where user_id = $1 and endpoint = $2", [uid, String(endpoint || "")]);
  if (!rows.length) throw new HttpError(404, "not_subscribed", "This device is not signed up for notifications.");
  const sent = await deliver(rows, { title: "Laventina", body: "Notifications work on this device.", url: "/#today", tag: "test" }, 600);
  return { ok: sent > 0 };
}

// Someone handed a task to another member.
export async function notifyAssigned(hid, actor, task) {
  if (!pushEnabled() || !task.assigneeId || task.assigneeId === actor.id || task.visibility === "private" || (task.status && task.status !== "open")) return 0;
  const rows = await q(`select p.endpoint, p.p256dh, p.auth from push_subs p join members m on m.user_id = p.user_id and m.household_id = p.household_id
    where p.household_id = $1 and p.user_id = $2 and p.assigned`, [hid, task.assigneeId]);
  if (!rows.length) return 0;
  const when = task.dueOn ? " · due " + new Date(task.dueOn + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "";
  return deliver(rows, { title: `${actor.name} gave you a task`, body: String(task.title).slice(0, 120) + when, url: "/#today", tag: "task-" + task.id }, 86400);
}

// What is on someone's plate for a given local date: open, visible, theirs or nobody's, due by then.
export async function dueFor(hid, uid, date) {
  return q(`select title, to_char(due_on, 'YYYY-MM-DD') as "dueOn" from tasks
    where household_id = $1 and deleted = false and status = 'open' and due_on <= $3::date
      and (show_from is null or show_from <= $3::date)
      and (visibility = 'shared' or created_by = $2) and (assignee_id = $2 or assignee_id is null)
    order by due_on, priority desc, sort_order nulls last, title`, [hid, uid, date]);
}

export function digestMessage(tasks, date) {
  const overdue = tasks.filter(t => t.dueOn < date).length;
  const names = tasks.slice(0, 3).map(t => t.title);
  const more = tasks.length - names.length;
  return {
    title: tasks.length === 1 ? "1 thing for today" : `${tasks.length} things for today`,
    body: names.join(" · ") + (more > 0 ? ` · and ${more} more` : "") + (overdue ? `\n${overdue} ${overdue === 1 ? "is" : "are"} overdue.` : ""),
    url: "/#today", tag: "digest"
  };
}

// Run every hour: each device gets one morning nudge per local day, at or after the hour it chose.
export async function sendDigests(now = new Date()) {
  if (!pushEnabled()) return 0;
  const subs = await q("select endpoint, p256dh, auth, user_id, household_id, tz, hour, to_char(last_digest, 'YYYY-MM-DD') as last from push_subs where daily");
  const cache = new Map();
  let sent = 0;
  for (const s of subs) {
    const local = localNow(s.tz, now);
    if (local.hour < s.hour || (s.last && s.last >= local.date)) continue;
    await q("update push_subs set last_digest = $2::date where endpoint = $1", [s.endpoint, local.date]);
    const key = s.user_id + "|" + local.date;
    if (!cache.has(key)) cache.set(key, await dueFor(s.household_id, s.user_id, local.date));
    const tasks = cache.get(key);
    if (tasks.length) sent += await deliver([s], digestMessage(tasks, local.date), 12 * 3600);
  }
  return sent;
}

// The house bell: anyone rings, every other member's devices ring, with an optional short message.
const BELL_GAP_SECONDS = 15;
export async function ringBell(hid, user, body) {
  const message = String((body && body.message) || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const recent = await q(`select 1 from records where household_id = $1 and kind = 'bells' and created_by = $2 and created_at > now() - make_interval(secs => $3)`, [hid, user.id, BELL_GAP_SECONDS]);
  if (recent.length) throw new HttpError(429, "too_soon", "The bell is still ringing. Give it a few seconds.");
  const id = newId("b");
  await q("delete from records where household_id = $1 and kind = 'bells' and created_at < now() - interval '7 days'", [hid]);
  await q(`insert into records (household_id, kind, id, data, created_by, updated_by) values ($1, 'bells', $2, $3::jsonb, $4, $4)`,
    [hid, id, JSON.stringify({ message, at: new Date().toISOString() }), user.id]);
  if (!pushEnabled()) return { ok: true, id, devices: 0 };
  const rows = await q(`select p.endpoint, p.p256dh, p.auth from push_subs p join members m on m.user_id = p.user_id and m.household_id = p.household_id
    where p.household_id = $1 and p.user_id <> $2 and p.bell`, [hid, user.id]);
  // A bell is about now: after ten minutes it is not worth delivering.
  const devices = await deliver(rows, { title: `🔔 ${user.name} rang the house bell`, body: message || "Come and see!", url: "/#today", tag: "bell" }, 600);
  return { ok: true, id, devices };
}

// A thank-you on a task someone else finished. Each person thanks a task once.
export async function thank(hid, user, taskId) {
  const t = (await q(`select title, done_by, status, extra from tasks where id = $1 and household_id = $2 and deleted = false and (visibility = 'shared' or created_by = $3)`, [taskId, hid, user.id]))[0];
  if (!t || t.status !== "done" || !t.done_by) throw new HttpError(404, "not_found", "That task is not done yet.");
  if (t.done_by === user.id) throw new HttpError(400, "own_task", "You can't thank yourself, but well done.");
  const thanks = Array.isArray(t.extra && t.extra.thanks) ? t.extra.thanks : [];
  if (thanks.some(x => x.by === user.id)) return { ok: true, already: true };
  await q(`update tasks set extra = coalesce(extra, '{}'::jsonb) || jsonb_build_object('thanks', $3::jsonb), updated_at = clock_timestamp() where id = $1 and household_id = $2`,
    [taskId, hid, JSON.stringify([...thanks, { by: user.id, at: new Date().toISOString() }])]);
  if (pushEnabled()) {
    const rows = await q("select endpoint, p256dh, auth from push_subs where household_id = $1 and user_id = $2 and assigned", [hid, t.done_by]);
    await deliver(rows, { title: `💜 ${user.name} says thanks`, body: `For: ${String(t.title).slice(0, 120)}`, url: "/#today", tag: "thanks-" + taskId }, 86400);
  }
  return { ok: true };
}

// Sunday evening: what the household got done this week.
export async function recapFor(hid, uid, date) {
  const since = new Date(Date.parse(date + "T00:00:00Z") - 6 * 86400000).toISOString().slice(0, 10);
  const done = await q(`select t.title, t.done_by as "doneBy", u.name from tasks t left join users u on u.id = t.done_by
    where t.household_id = $1 and t.deleted = false and t.status = 'done' and t.done_at >= $3::date and (t.visibility = 'shared' or t.created_by = $2)`, [hid, uid, since]);
  const next = await q(`select count(*)::int as n from tasks where household_id = $1 and deleted = false and status = 'open' and due_on > $3::date and due_on <= $3::date + 7
    and (visibility = 'shared' or created_by = $2) and (assignee_id = $2 or assignee_id is null)`, [hid, uid, date]);
  return { done, upcoming: next[0] ? next[0].n : 0 };
}
export function recapMessage({ done, upcoming }) {
  const per = new Map(); const titles = new Map();
  for (const t of done) { const n = (t.name || "Someone").split(" ")[0]; per.set(n, (per.get(n) || 0) + 1); titles.set(t.title, (titles.get(t.title) || 0) + 1); }
  const people = [...per].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(" · ");
  const top = [...titles].sort((a, b) => b[1] - a[1])[0];
  const lines = [`${done.length} ${done.length === 1 ? "thing" : "things"} done${per.size > 1 ? " together" : ""}${per.size > 1 ? ": " + people : ""}.`];
  if (top && top[1] > 1) lines.push(`Most often: ${top[0]} (${top[1]}×).`);
  lines.push(upcoming ? `${upcoming} on your plate next week.` : "Nothing on your plate next week yet.");
  return { title: "Your week at home", body: lines.join("\n"), url: "/#today", tag: "recap" };
}
export async function sendRecaps(now = new Date()) {
  if (!pushEnabled()) return 0;
  const subs = await q("select endpoint, p256dh, auth, user_id, household_id, tz, to_char(last_recap, 'YYYY-MM-DD') as last from push_subs where weekly");
  let sent = 0;
  for (const s of subs) {
    const local = localNow(s.tz, now);
    if (local.weekday !== "Sun" || local.hour < 19 || (s.last && s.last >= local.date)) continue;
    await q("update push_subs set last_recap = $2::date where endpoint = $1", [s.endpoint, local.date]);
    const r = await recapFor(s.household_id, s.user_id, local.date);
    if (r.done.length) sent += await deliver([s], recapMessage(r), 6 * 3600);
  }
  return sent;
}

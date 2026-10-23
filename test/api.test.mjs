import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setDb } from "../lib/db.mjs";
import { setFileStore } from "../lib/files.mjs";
import { desiredTasks, addDays } from "../lib/generate.mjs";
import handler from "../netlify/functions/api.mjs";

const pg = new PGlite();
setDb({ query: async (t, p = []) => (await pg.query(t, p)).rows });
const blobs = new Map();
setFileStore({
  set: async (k, v, o) => blobs.set(k, { data: v, metadata: o.metadata }),
  getWithMetadata: async (k) => blobs.get(k) || null,
  delete: async (k) => blobs.delete(k)
});

function client() {
  let cookie = "";
  return async (method, path, body, headers = {}) => {
    const init = { method, headers: { "x-laventina": "1", cookie, ...headers } };
    if (body !== undefined) init.body = body instanceof Uint8Array ? body : JSON.stringify(body);
    const res = await handler(new Request("https://laventina.test/api" + path, init));
    const sc = res.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
    const ct = res.headers.get("content-type") || "";
    return { status: res.status, body: ct.includes("json") ? await res.json() : await res.arrayBuffer() };
  };
}

const nero = client(), sam = client(), eve = client();
let invite;

test("sign up, invite, and join a household", async () => {
  let r = await nero("POST", "/auth/signup", { email: "nero@example.com", password: "lavender-1", name: "Nero" });
  assert.equal(r.status, 200);
  r = await nero("GET", "/me");
  assert.equal(r.body.members.length, 1);
  invite = r.body.household.inviteCode;
  assert.match(invite, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  r = await sam("POST", "/auth/signup", { email: "sam@example.com", password: "lavender-2", name: "Sam", inviteCode: invite.toLowerCase() });
  assert.equal(r.status, 200);
  r = await sam("GET", "/me");
  assert.equal(r.body.members.length, 2);
  r = await eve("POST", "/auth/signup", { email: "eve@example.com", password: "lavender-3", name: "Eve" });
  assert.equal(r.status, 200);
});

test("rejects bad logins, duplicate emails, and writes without the app header", async () => {
  const anon = client();
  assert.equal((await anon("POST", "/auth/login", { email: "nero@example.com", password: "wrong-pass" })).status, 401);
  assert.equal((await anon("POST", "/auth/signup", { email: "NERO@example.com", password: "whatever-1", name: "X" })).status, 409);
  assert.equal((await anon("GET", "/me")).status, 401);
  const r = await handler(new Request("https://laventina.test/api/records/items/i_1", { method: "PUT", body: "{}" }));
  assert.equal(r.status, 403);
  assert.equal((await anon("POST", "/auth/login", { email: "nero@example.com", password: "lavender-1" })).status, 200);
});

test("records and tasks sync between the two members only", async () => {
  assert.equal((await nero("PUT", "/records/items/i_drill", { data: { name: "Drill", roomId: "r_garage" } })).status, 200);
  assert.equal((await nero("PUT", "/records/charges/c_gym", { data: { name: "Gym", amount: 40 }, visibility: "private" })).status, 200);
  assert.equal((await nero("PUT", "/tasks/t_1", { data: { title: "Call the plumber", dueOn: "2026-10-21", assigneeId: "x", tags: ["home"] } })).status, 200);
  let s = (await sam("GET", "/sync")).body;
  assert.ok(s.records.some(r => r.id === "i_drill" && r.data.name === "Drill"));
  assert.ok(!s.records.some(r => r.id === "c_gym"), "private record hidden from the other member");
  const t = s.tasks.find(t => t.id === "t_1");
  assert.equal(t.data.dueOn, "2026-10-21"); assert.deepEqual(t.data.tags, ["home"]);
  assert.equal((await sam("PUT", "/records/charges/c_gym", { data: { name: "hijack" } })).status, 404);
  s = (await eve("GET", "/sync")).body;
  assert.equal(s.records.length + s.tasks.filter(x => x.data && x.data.source === "todo").length, 0, "other household sees nothing");
  assert.equal((await eve("PUT", "/tasks/t_1", { data: { title: "stolen" } })).status, 404);
  // incremental sync and delete
  const since = (await sam("GET", "/sync")).body.now;
  await nero("DELETE", "/tasks/t_1");
  s = (await sam("GET", "/sync?since=" + encodeURIComponent(since))).body;
  assert.ok(s.tasks.some(x => x.id === "t_1" && x.deleted));
});

test("files are private to the household", async () => {
  const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const up = await nero("POST", "/files", png, { "content-type": "image/png" });
  assert.equal(up.status, 200);
  assert.equal((await sam("GET", "/files/" + up.body.id)).status, 200);
  assert.equal((await eve("GET", "/files/" + up.body.id)).status, 404);
  assert.equal((await nero("POST", "/files", png, { "content-type": "text/html" })).status, 415);
});

test("generator makes one task per source and follows date changes", async () => {
  const today = new Date().toISOString().slice(0, 10);
  await nero("PUT", "/records/plans/p_smoke", { data: { title: "Press the test button", active: true, nextDue: addDays(today, 2), consequence: "safety", effort: "diy", minutes: 2 } });
  await nero("PUT", "/records/charges/c_power", { data: { name: "Electricity", amount: 95, nextDue: addDays(today, 5), contractEnd: addDays(today, 40), noticeDays: 14 } });
  await nero("PUT", "/records/documents/d_ins", { data: { title: "Home insurance", expiryDate: addDays(today, 20) } });
  let g = (await nero("POST", "/generate")).body;
  assert.equal(g.created, 4);
  g = (await nero("POST", "/generate")).body;
  assert.equal(g.created, 0, "idempotent");
  await nero("PUT", "/records/plans/p_smoke", { data: { title: "Press the test button", active: true, nextDue: addDays(today, 4), consequence: "safety", effort: "diy", minutes: 2 } });
  g = (await nero("POST", "/generate")).body;
  assert.equal(g.moved, 1);
  const tasks = (await sam("GET", "/sync")).body.tasks.filter(t => t.data && t.data.source !== "todo");
  assert.equal(tasks.filter(t => t.data.sourceRef === "p_smoke").length, 1);
  assert.ok(tasks.some(t => t.data.title.startsWith("Pay Electricity")));
  assert.ok(tasks.some(t => t.data.title.startsWith("Renew or switch Electricity")));
  // skipping a generated task keeps it, so it is not recreated
  const pay = tasks.find(t => t.data.sourceType === "pay");
  await nero("DELETE", "/tasks/" + pay.id);
  g = (await nero("POST", "/generate")).body;
  assert.equal(g.created, 0);
});

test("desiredTasks: windows, autopay, private titles", () => {
  const today = "2026-10-20";
  const out = desiredTasks({ today,
    plans: [{ id: "p1", title: "Book chimney sweep", active: true, nextDue: "2026-11-10", effort: "pro", lead: 30 }, { id: "p2", title: "Far away", active: true, nextDue: "2027-01-01" }],
    charges: [{ id: "c1", name: "Water", autopay: true, nextDue: "2026-10-22" }],
    documents: [], items: [{ id: "i1", name: "TV", warrantyUntil: "2026-11-25" }], meta: [], members: [] });
  assert.deepEqual(out.map(t => t.sourceRef).sort(), ["i1", "p1"]);
  assert.ok(out.find(t => t.sourceRef === "p1").title.startsWith("Book: "));
});

test("desiredTasks: a late reminder is due a week before the deadline, not in the past", () => {
  const today = "2026-10-20";
  const out = desiredTasks({ today, plans: [], documents: [], items: [], meta: [], members: [],
    charges: [{ id: "c1", name: "Power", provider: "Iberdrola", contractEnd: "2026-11-29", noticeDays: 15 }] });
  const t = out.find(x => x.sourceType === "contract");
  assert.equal(t.dueOn, "2026-11-07");
  assert.equal(t.title, "Renew or switch Iberdrola by 14 Nov");
});

test("the Netlify migrations match the schema", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const { MIGRATIONS } = await import("../lib/schema.mjs");
  const dir = new URL("../netlify/database/migrations/", import.meta.url);
  assert.deepEqual((await readdir(dir)).sort(), MIGRATIONS.map(([name]) => name + ".sql"));
  for (const [name, schema] of MIGRATIONS) assert.equal((await readFile(new URL(name + ".sql", dir), "utf8")).trim(), schema.trim());
});

test("push: assigned tasks ring the assignee, mornings bring a digest, dead devices are dropped", async () => {
  const { setSender, sendDigests, digestMessage } = await import("../lib/push.mjs");
  process.env.VAPID_PUBLIC_KEY = "test-public"; process.env.VAPID_PRIVATE_KEY = "test-private";
  const sent = []; let gone = new Set();
  setSender(async (sub, payload) => { if (gone.has(sub.endpoint)) throw Object.assign(new Error("gone"), { statusCode: 410 }); sent.push({ to: sub.endpoint, ...JSON.parse(payload) }); });
  const samId = (await sam("GET", "/me")).body.user.id;
  assert.ok((await sam("GET", "/me")).body.push.publicKey);
  const sub = { endpoint: "https://push.example/sam-phone", keys: { p256dh: "BPkey", auth: "authkey" } };
  assert.equal((await sam("POST", "/push/subscribe", { subscription: { endpoint: "http://bad" } })).status, 400);
  assert.equal((await sam("POST", "/push/subscribe", { subscription: sub, tz: "Europe/Madrid", hour: 8 })).status, 200);
  assert.equal((await sam("POST", "/push/device", { endpoint: sub.endpoint })).body.subscribed, true);

  await nero("PUT", "/tasks/t_bins", { data: { title: "Take the bins out", dueOn: "2026-10-20", assigneeId: samId } });
  assert.equal(sent.length, 1); assert.equal(sent[0].title, "Nero gave you a task"); assert.match(sent[0].body, /Take the bins out/);
  await nero("PUT", "/tasks/t_bins", { data: { title: "Take the bins out!", dueOn: "2026-10-20", assigneeId: samId } });
  await sam("PUT", "/tasks/t_self", { data: { title: "Mine", assigneeId: samId } });
  await nero("PUT", "/tasks/t_priv", { data: { title: "Secret", assigneeId: samId, visibility: "private" } });
  assert.equal(sent.length, 1, "no ping for unchanged assignee, self-assignment, or private tasks");

  // Days after today, so the check doesn't depend on when the tests run. 06:30 UTC is 07:30 or 08:30 in Madrid: use 07:30 UTC to be past 08:00 either way.
  const day = (n) => addDays(new Date().toISOString().slice(0, 10), n);
  sent.length = 0;
  await sendDigests(new Date(day(2) + "T07:30:00Z"));
  assert.equal(sent.length, 1); assert.match(sent[0].title, /things? for today/); assert.match(sent[0].body, /Take the bins out!/); assert.match(sent[0].body, /overdue/);
  assert.ok(!/Secret/.test(sent[0].body));
  await sendDigests(new Date(day(2) + "T08:30:00Z"));
  assert.equal(sent.length, 1, "one digest per day");
  await sendDigests(new Date(day(3) + "T05:00:00Z"));
  assert.equal(sent.length, 1, "not before the chosen hour");
  gone.add(sub.endpoint);
  await sendDigests(new Date(day(3) + "T07:30:00Z"));
  assert.equal((await sam("POST", "/push/device", { endpoint: sub.endpoint })).body.subscribed, false, "a 410 removes the device");
  assert.equal(digestMessage([{ title: "A", dueOn: "2026-10-20" }], "2026-10-20").title, "1 thing for today");
  delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
});

test("the house bell rings everyone else, thank-yous reach the doer, and Sunday brings a recap", async () => {
  const { setSender, sendRecaps, localNow } = await import("../lib/push.mjs");
  process.env.VAPID_PUBLIC_KEY = "test-public"; process.env.VAPID_PRIVATE_KEY = "test-private";
  const sent = [];
  setSender(async (sub, payload, opts) => sent.push({ to: sub.endpoint, urgency: opts.urgency, ...JSON.parse(payload) }));
  const samSub = { endpoint: "https://push.example/sam-2", keys: { p256dh: "BPkey", auth: "authkey" } };
  const neroSub = { endpoint: "https://push.example/nero-1", keys: { p256dh: "BPkey", auth: "authkey" } };
  await sam("POST", "/push/subscribe", { subscription: samSub, tz: "UTC", hour: 8 });
  await nero("POST", "/push/subscribe", { subscription: neroSub, tz: "UTC", hour: 8 });
  await eve("POST", "/push/subscribe", { subscription: { ...samSub, endpoint: "https://push.example/eve" }, tz: "UTC" });

  let r = await nero("POST", "/bell", { message: "  Dinner's   ready  " });
  assert.equal(r.status, 200);
  assert.deepEqual(sent.map(x => x.to), [samSub.endpoint], "rings the other member, not the ringer or another household");
  assert.equal(sent[0].body, "Dinner's ready"); assert.match(sent[0].title, /Nero rang the house bell/); assert.equal(sent[0].urgency, "high");
  assert.equal((await nero("POST", "/bell", {})).status, 429, "no hammering the bell");
  const s = (await sam("GET", "/sync")).body;
  assert.ok(s.records.some(x => x.kind === "bells" && x.data.message === "Dinner's ready"), "the ring shows up in the app too");
  assert.equal((await sam("PUT", "/records/bells/fake", { data: { message: "x" } })).status, 400, "bells only come from ringing");

  // Sam turns the bell off on their phone.
  await sam("POST", "/push/subscribe", { subscription: samSub, tz: "UTC", hour: 8, bell: false });
  sent.length = 0;
  await sam("POST", "/bell", { message: "Door" });
  assert.deepEqual(sent.map(x => x.to), [neroSub.endpoint]);

  // Thanks
  sent.length = 0;
  await sam("PUT", "/tasks/t_dishes", { data: { title: "Dishes", status: "done", doneAt: new Date().toISOString(), doneBy: (await sam("GET", "/me")).body.user.id } });
  assert.equal((await sam("POST", "/tasks/t_dishes/thanks")).status, 400, "no thanking yourself");
  assert.equal((await nero("POST", "/tasks/t_dishes/thanks")).status, 200);
  assert.equal((await nero("POST", "/tasks/t_dishes/thanks")).body.already, true);
  assert.deepEqual(sent.map(x => x.to), [samSub.endpoint]); assert.match(sent[0].title, /Nero says thanks/);
  const t = (await nero("GET", "/sync")).body.tasks.find(x => x.id === "t_dishes");
  assert.equal(t.data.extra.thanks.length, 1);
  assert.equal((await eve("POST", "/tasks/t_dishes/thanks")).status, 404);

  // Recap: next Sunday 19:30 UTC.
  sent.length = 0;
  const d = new Date(); d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7 || 7)); d.setUTCHours(19, 30, 0, 0);
  assert.equal(localNow("UTC", d).weekday, "Sun");
  await sendRecaps(new Date(d.getTime() - 3 * 3600000));
  assert.equal(sent.length, 0, "not before Sunday evening");
  await sendRecaps(d);
  assert.ok(sent.some(x => x.to === samSub.endpoint && x.title === "Your week at home" && /Dishes|done/.test(x.body)));
  const n = sent.length; await sendRecaps(new Date(d.getTime() + 3600000));
  assert.equal(sent.length, n, "once a week");
  delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
});

test("without keys in the environment, the app makes its own notification keys once and keeps them", async () => {
  delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
  const a = (await nero("GET", "/me")).body.push, b = (await sam("GET", "/me")).body.push;
  assert.ok(a && /^[A-Za-z0-9_-]{80,}$/.test(a.publicKey));
  assert.equal(a.publicKey, b.publicKey);
  const rows = await pg.query("select count(*)::int as n from app_config where key = 'vapid'");
  assert.equal(rows.rows[0].n, 1);
});

test("remind me 5 / 10 / 30 minutes before: each goes out once, in the person's time zone", async () => {
  const { setSender, sendReminders, zonedInstant } = await import("../lib/push.mjs");
  assert.equal(new Date(zonedInstant("2026-10-23", "18:30", "Europe/Madrid")).toISOString(), "2026-10-23T16:30:00.000Z");
  assert.equal(new Date(zonedInstant("2026-10-26", "18:30", "Europe/Madrid")).toISOString(), "2026-10-26T17:30:00.000Z", "after the clocks go back");
  const sent = [];
  setSender(async (sub, payload) => { if (sub.endpoint.endsWith("/sam-r")) sent.push({ to: sub.endpoint, ...JSON.parse(payload) }); });
  const samId = (await sam("GET", "/me")).body.user.id, neroId = (await nero("GET", "/me")).body.user.id;
  const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await sam("POST", "/push/subscribe", { subscription: { endpoint: "https://push.example/sam-r", keys: { p256dh: "BPkey", auth: "authkey" } }, tz: "UTC" });
  await nero("PUT", "/tasks/t_call", { data: { title: "Call the plumber", dueOn: day, dueTime: "18:30",
    extra: { reminders: { [samId]: { mins: [10, 30], tz: "Europe/Madrid" }, [neroId]: { mins: [99], tz: "UTC" } } } } });
  const due = zonedInstant(day, "18:30", "Europe/Madrid");
  const at = (minBefore) => new Date(due - minBefore * 60000);
  await sendReminders(at(45));
  assert.equal(sent.length, 0, "too early");
  await sendReminders(at(29.5));
  assert.equal(sent.length, 1); assert.equal(sent[0].title, "In 30 min: Call the plumber"); assert.equal(sent[0].to, "https://push.example/sam-r");
  await sendReminders(at(28));
  assert.equal(sent.length, 1, "once each");
  await sendReminders(at(9));
  assert.equal(sent.length, 2); assert.match(sent[1].title, /^In 10 min/);
  await sendReminders(at(-30));
  assert.equal(sent.length, 2, "nothing after it's due, and odd minute values are ignored");
  // Done tasks stay quiet.
  await nero("PUT", "/tasks/t_call2", { data: { title: "Done already", status: "done", dueOn: day, dueTime: "18:30", extra: { reminders: { [samId]: { mins: [5], tz: "Europe/Madrid" } } } } });
  await sendReminders(at(4));
  assert.equal(sent.length, 2);
});

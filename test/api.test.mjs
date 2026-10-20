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

test("the Netlify migration matches the schema", async () => {
  const { readFile } = await import("node:fs/promises");
  const { SCHEMA } = await import("../lib/schema.mjs");
  const sql = await readFile(new URL("../netlify/database/migrations/20261020070000_initial_schema.sql", import.meta.url), "utf8");
  assert.equal(sql.trim(), SCHEMA.trim());
});

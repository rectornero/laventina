import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setDb } from "../lib/db.mjs";
import { setFetcher } from "../lib/tools.mjs";
import { composeBrief } from "../lib/butler.mjs";
import api from "../netlify/functions/api.mjs";
import mcp from "../netlify/functions/mcp.mjs";

const pg = new PGlite();
setDb({ query: async (t, p = []) => (await pg.query(t, p)).rows });
delete process.env.ANTHROPIC_API_KEY;
setFetcher(async (url) => ({ ok: true, json: async () => String(url).includes("geocoding")
  ? { results: [{ name: "Valencia", country: "Spain", latitude: 39.47, longitude: -0.38, timezone: "Europe/Madrid" }] }
  : { current: { temperature_2m: 21.4, weather_code: 1 }, daily: { temperature_2m_max: [24, 22], temperature_2m_min: [15, 14], precipitation_probability_max: [10, 70], weather_code: [1, 61] } } }));

let cookie = "";
async function call(method, path, body) {
  const res = await api(new Request("https://laventina.test/api" + path, { method, headers: { "x-laventina": "1", "x-tz": "Europe/Madrid", cookie }, body: body === undefined ? undefined : JSON.stringify(body) }));
  const sc = res.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  return { status: res.status, body: await res.json() };
}
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const plus = n => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

test("the butler greets, raises money on the table, and offers to start the ledger", async () => {
  assert.equal((await call("POST", "/auth/signup", { email: "nero@example.com", password: "lavender-1", name: "Nero" })).status, 200);
  await call("PUT", "/tasks/t_late", { data: { title: "Call the plumber", dueOn: plus(-3) } });
  let r = await call("POST", "/butler/act", { tool: "catch_opportunity", input: { title: "€5 off at Lidl", value: 5, minSpend: 30, store: "Lidl", endsOn: plus(1) }, label: "Catch it" });
  assert.equal(r.status, 200);
  r = await call("GET", "/butler");
  assert.equal(r.status, 200);
  const ids = r.body.messages.map(m => m.id.split(":")[0]);
  assert.match(r.body.messages[0].text, /^Good (morning|afternoon|evening)|^Still up/);
  assert.ok(ids.includes("presence"));
  assert.ok(ids.some(i => i.startsWith("chance-")), "coupon ending tomorrow is raised");
  assert.ok(ids.some(i => i.startsWith("one-")));
  assert.ok(ids.includes("seed"));
  assert.ok(ids.includes("city"));
  const money = r.body.messages.find(m => m.id.startsWith("chance-"));
  assert.match(money.text, /€5 on the table/);
  // The coupon became a task two days before (or today, when that's already past).
  r = await call("GET", "/sync");
  assert.ok(r.body.tasks.some(t => t.data && t.data.extra && t.data.extra.chanceId));
});

test("tapping replies acts, and the €7 coupon starts the ledger with a safeguard", async () => {
  let r = await call("POST", "/butler/act", { tool: "log_lost_opportunity", input: { title: "€7 Carrefour coupon", value: 7, minSpend: 35, store: "Carrefour", cause: "forgot" }, label: "Yes, I forgot it" });
  assert.equal(r.status, 200);
  assert.match(r.body.messages[0].text, /Logged: €7\. .*safeguard/);
  r = await call("POST", "/butler/act", { tool: "set_presence", input: { where: "out" } });
  assert.match(r.body.messages[0].text, /you're out/);
  r = await call("POST", "/butler/act", { tool: "set_city", input: { city: "Valencia" } });
  assert.match(r.body.messages[0].text, /Valencia it is/);
  r = await call("POST", "/butler/act", { tool: "spread_late_tasks", input: {} });
  assert.match(r.body.messages[0].text, /Spread out: 1 thing/);
  r = await call("GET", "/butler");
  const ids = r.body.messages.map(m => m.id.split(":")[0]);
  assert.ok(!ids.includes("presence") && !ids.includes("seed") && !ids.includes("city"));
  assert.match(r.body.messages[0].text, /21° and mostly clear/);
  assert.ok(r.body.log.some(l => l.role === "user" && l.text === "Yes, I forgot it"));
  assert.equal((await call("POST", "/butler/act", { tool: "offer_choices", input: { choices: ["x"] } })).status, 400);
});

test("without Claude the butler still listens: anything said becomes a task", async () => {
  const r = await call("POST", "/butler/say", { text: "remind me to buy lavender soap" });
  assert.equal(r.status, 200);
  assert.match(r.body.messages[0].text, /buy lavender soap/);
  const s = await call("GET", "/sync");
  assert.ok(s.body.tasks.some(t => t.data && t.data.title === "buy lavender soap"));
});

test("Claude connects through MCP with a personal link", async () => {
  let r = await call("POST", "/connect/claude");
  const link = new URL(r.body.url);
  assert.match(link.pathname, /^\/mcp\/lav_/);
  const rpc = async (body, path = link.pathname, headers = {}) => {
    const res = await mcp(new Request("https://laventina.test" + path, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) }));
    return { status: res.status, body: res.status === 202 ? null : await res.json() };
  };
  r = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
  assert.equal(r.body.result.serverInfo.name, "laventina");
  assert.equal((await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
  r = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = r.body.result.tools.map(t => t.name);
  assert.ok(names.includes("get_overview") && names.includes("add_task") && !names.includes("offer_choices"));
  r = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "add_task", arguments: { title: "Water the lavender", due: "tomorrow" } } });
  assert.equal(r.body.result.isError, undefined);
  assert.equal(r.body.result.structuredContent.added.due, plus(1));
  // A bearer token works too.
  r = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_overview", arguments: {} } }, "/mcp", { authorization: "Bearer " + link.pathname.slice(5) });
  const o = JSON.parse(r.body.result.content[0].text);
  assert.equal(o.me.name, "Nero");
  assert.equal(o.money.ledger.missed, 1);
  r = await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "complete_task", arguments: { task: "nothing like this" } } });
  assert.equal(r.body.result.isError, true);
  // Revoked links stop working.
  await call("DELETE", "/connect/claude");
  assert.equal((await rpc({ jsonrpc: "2.0", id: 6, method: "ping" })).status, 401);
});

test("the brief stays quiet when nothing matters", () => {
  const s = { now: { date: "2026-10-25", hour: 10, weekday: "Sun", tz: "UTC" }, me: { name: "Nero" }, presence: { where: "home" }, location: { city: "X" }, weather: null,
    tasks: { late: [], today: [], soon: [], important: [], undated: 0 }, money: { open: [], ledger: { caught: 1, missed: 0, caughtValue: 3, missedValue: 0, rate: 100 } }, expiring: [], bells: [], notes: [] };
  const m = composeBrief(s, {});
  assert.equal(m.length, 1);
  assert.match(m[0].text, /Nothing needs you today/);
});

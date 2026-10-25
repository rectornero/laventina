import { test } from "node:test";
import assert from "node:assert/strict";
import { setMeterStore, sawDatabase, flush, metered, awakeMinutes, dayCost, costReport, costAlert, checkCosts, currentAlert } from "../lib/meter.mjs";

const mem = new Map();
setMeterStore({ get: async (k) => mem.has(k) ? JSON.parse(mem.get(k)) : null, setJSON: async (k, v) => mem.set(k, JSON.stringify(v)) });
const day = (date, d) => mem.set("day/" + date, JSON.stringify({ fn: {}, dbMinutes: [], deploys: 0, requests: 0, ...d }));

test("the database counts as awake five minutes after each query, overlaps counted once", () => {
  assert.equal(awakeMinutes([]), 0);
  assert.equal(awakeMinutes([10]), 5);
  assert.equal(awakeMinutes([10, 12]), 7);
  assert.equal(awakeMinutes([10, 30]), 10);
  // A query every minute keeps it up all day: the 2026-10-25 incident.
  assert.equal(awakeMinutes([...Array(1440).keys()]), 1444);
});

test("a day awake all the time costs about 240 credits, a quiet day only a few", () => {
  const busy = dayCost({ fn: { reminders: { runs: 1440, ms: 1440 * 300 } }, dbMinutes: [...Array(1440).keys()] });
  assert.ok(busy.database > 235 && busy.database < 245, String(busy.database));
  const quiet = dayCost({ fn: { api: { runs: 40, ms: 40 * 200 } }, dbMinutes: [480, 482, 1200], requests: 40 });
  assert.ok(quiet.total < 3, String(quiet.total));
  assert.equal(dayCost({ fn: {}, deploys: 1 }).deploys, 15);
});

test("each run is noted per day, with the minutes it used the database", async () => {
  mem.clear();
  const t = Date.parse("2026-10-25T09:00:10Z");
  sawDatabase(t); sawDatabase(t + 1000);
  await flush("api", t, { request: true });
  await flush("api", t);
  const d = JSON.parse(mem.get("day/2026-10-25"));
  assert.equal(d.fn.api.runs, 2);
  assert.equal(d.requests, 1);
  assert.deepEqual(d.dbMinutes, [Math.floor(t / 60000)]);
});

test("a metered handler still answers, and is counted even when it throws", async () => {
  mem.clear();
  const ok = metered("api", async () => new Response("hi"), { request: true });
  assert.equal(await (await ok(new Request("http://x/"), {})).text(), "hi");
  const bad = metered("api", async () => { throw new Error("boom"); });
  await assert.rejects(bad(new Request("http://x/"), {}), /boom/);
  const d = JSON.parse([...mem.values()][0]);
  assert.equal(d.fn.api.runs, 2);
});

test("the report follows Nero's cycle from the 22nd and projects to its end", async () => {
  mem.clear();
  for (const date of ["2026-10-22", "2026-10-23", "2026-10-24"]) day(date, { fn: { api: { runs: 10, ms: 2000 } }, dbMinutes: [600, 601] });
  const r = await costReport({ now: Date.parse("2026-10-25T12:00:00Z") });
  assert.deepEqual(r.cycle, { start: "2026-10-22", end: "2026-11-22" });
  assert.equal(r.days.length, 4);
  assert.equal(r.days.filter(d => d.measured).length, 3);
  assert.ok(r.perDay > 0 && r.projected > r.spent);
  assert.equal(costAlert(r), null);
});

test("a day far above usual raises an alert, but a deploy on its own does not", async () => {
  mem.clear();
  for (const date of ["2026-10-22", "2026-10-23"]) day(date, { fn: { api: { runs: 10, ms: 2000 } }, dbMinutes: [600] });
  day("2026-10-24", { fn: { api: { runs: 10, ms: 2000 } }, dbMinutes: [600], deploys: 1 });
  day("2026-10-25", { fn: {} });
  const now = Date.parse("2026-10-25T05:00:00Z");
  assert.equal(costAlert(await costReport({ now })), null);
  day("2026-10-24", { fn: { reminders: { runs: 1440, ms: 1440 * 300 } }, dbMinutes: [...Array(1440).keys()] });
  const { alert } = await checkCosts({ now });
  assert.equal(alert.level, "high");
  assert.match(alert.text, /Yesterday I cost about \d+/);
  assert.equal((await currentAlert(now + 3600e3)).level, "high");
  assert.equal(await currentAlert(now + 3 * 864e5), null);
});

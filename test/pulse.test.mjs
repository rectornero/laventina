// An open screen asks "anything new?" every minute: that must be answered without waking the database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setDb } from "../lib/db.mjs";
import { setPulseStore } from "../lib/pulse.mjs";
import handler from "../netlify/functions/api.mjs";

const pg = new PGlite();
let queries = 0;
setDb({ query: async (t, p = []) => { queries++; return (await pg.query(t, p)).rows; } });
const mem = new Map();
setPulseStore({ get: async (k) => mem.has(k) ? JSON.parse(mem.get(k)) : null, setJSON: async (k, v) => mem.set(k, JSON.stringify(v)) });

function client() {
  let cookie = "";
  return async (method, path, body) => {
    const init = { method, headers: { "x-laventina": "1", cookie } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await handler(new Request("https://laventina.test/api" + path, init));
    const sc = res.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
    return { status: res.status, body: await res.json() };
  };
}
const nero = client(), sam = client(), stranger = client();

test("the pulse check answers from Blobs, and every write moves it forward", async () => {
  await nero("POST", "/auth/signup", { email: "nero@example.com", password: "lavender-1", name: "Nero" });
  const me = (await nero("GET", "/me")).body;
  assert.match(me.pulse, /^[A-Za-z0-9_-]{32}$/);
  await sam("POST", "/auth/signup", { email: "sam@example.com", password: "lavender-2", name: "Sam", inviteCode: me.household.inviteCode });
  assert.equal((await sam("GET", "/me")).body.pulse, me.pulse, "the household shares one key");

  const s = await nero("GET", "/sync");
  const synced = Date.parse(s.body.now);
  const before = queries;
  const p = await stranger("GET", "/pulse?k=" + me.pulse);
  assert.equal(queries, before, "no database, not even the sign-in lookup");
  assert.ok(p.body.at <= synced + 1000, "nothing new since the sync");

  await new Promise(r => setTimeout(r, 20));
  await sam("PUT", "/tasks/t_1", { data: { title: "Water the lavender" } });
  const after = (await nero("GET", "/pulse?k=" + me.pulse)).body.at;
  assert.ok(after > p.body.at, "Sam's change shows up for Nero's open screen");

  assert.equal((await stranger("GET", "/pulse?k=nope")).body.at, null, "a wrong key learns nothing");
});

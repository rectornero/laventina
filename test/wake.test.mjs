import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setDb, q } from "../lib/db.mjs";
import { setWakeStore, planNotices, noticesDue } from "../lib/wake.mjs";

const pg = new PGlite();
setDb({ query: async (t, p = []) => (await pg.query(t, p)).rows });
const mem = new Map();
setWakeStore({ get: async (k) => mem.has(k) ? JSON.parse(mem.get(k)) : null, setJSON: async (k, v) => mem.set(k, JSON.stringify(v)) });

test("the notification job wakes only in hours someone is due a notice", async () => {
  assert.equal(await noticesDue(), "unplanned");
  await q("insert into users (id, email, name, pass_hash) values ('u1', 'a@b.c', 'Nero', 'x')");
  await q("insert into households (id, name, invite_code) values ('h1', 'Home', 'ABCD-EFGH')");
  await q(`insert into push_subs (endpoint, user_id, household_id, p256dh, auth, tz, hour) values ('https://push.example/1', 'u1', 'h1', 'k', 'a', 'UTC', 8)`);
  await planNotices();
  assert.equal(await noticesDue(new Date("2026-10-27T08:07:00Z")), true);
  assert.equal(await noticesDue(new Date("2026-10-27T11:07:00Z")), false);
  assert.equal(await noticesDue(new Date("2026-10-25T19:07:00Z")), true, "Sunday recap");
});

test("the day's chores wake the database once a day, whichever job gets there first", async () => {
  const { setChoresStore, choresIfNeeded } = await import("../lib/daily.mjs");
  setChoresStore({ get: async (k) => mem.has("c:" + k) ? JSON.parse(mem.get("c:" + k)) : null, setJSON: async (k, v) => mem.set("c:" + k, JSON.stringify(v)) });
  const day = Date.parse("2026-10-27T07:07:00Z");
  assert.equal(await choresIfNeeded(day), true, "the morning notifications do them");
  assert.equal(await choresIfNeeded(day + 4 * 3600e3), false, "the late-morning fallback finds them done");
  assert.equal(await choresIfNeeded(day + 24 * 3600e3), true, "next day, again");
});

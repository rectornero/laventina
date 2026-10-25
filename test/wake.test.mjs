import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { setDb, q } from "../lib/db.mjs";
import { setWakeStore, planReminders, remindersDue, planNotices, noticesDue } from "../lib/wake.mjs";

const pg = new PGlite();
setDb({ query: async (t, p = []) => (await pg.query(t, p)).rows });
const mem = new Map();
setWakeStore({ get: async (k) => mem.has(k) ? JSON.parse(mem.get(k)) : null, setJSON: async (k, v) => mem.set(k, JSON.stringify(v)) });

test("the reminder job leaves the database asleep unless a reminder is due", async () => {
  assert.equal(await remindersDue(), "unplanned");
  await q("select 1");
  await q("insert into users (id, email, name, pass_hash) values ('u1', 'a@b.c', 'Nero', 'x')");
  await q("insert into households (id, name, invite_code) values ('h1', 'Home', 'ABCD-EFGH')");
  const today = new Date().toISOString().slice(0, 10);
  await q(`insert into tasks (id, household_id, created_by, updated_by, title, status, source, visibility, priority, due_on, due_time, extra)
    values ('t1', 'h1', 'u1', 'u1', 'Dentist', 'open', 'todo', 'shared', 0, $1::date, '23:30', '{"reminders":{"u1":{"mins":[10],"tz":"UTC"}}}'::jsonb)`, [today]);
  const at = await planReminders();
  assert.equal(at.length, 1);
  const fire = Date.parse(today + "T23:20:00Z");
  assert.equal(at[0], fire);
  assert.equal(await remindersDue(fire - 60000), false, "a minute early: stay asleep");
  assert.equal(await remindersDue(fire + 60000), true, "due: wake up");
  assert.equal(await remindersDue(fire + 20 * 60000), false, "long past: stay asleep");
});

test("the notification job wakes only in hours someone is due a notice", async () => {
  assert.equal(await noticesDue(), "unplanned");
  await q(`insert into push_subs (endpoint, user_id, household_id, p256dh, auth, tz, hour) values ('https://push.example/1', 'u1', 'h1', 'k', 'a', 'UTC', 8)`);
  await planNotices();
  assert.equal(await noticesDue(new Date("2026-10-27T08:07:00Z")), true);
  assert.equal(await noticesDue(new Date("2026-10-27T11:07:00Z")), false);
  assert.equal(await noticesDue(new Date("2026-10-25T19:07:00Z")), true, "Sunday recap");
});

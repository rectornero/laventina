import { test } from "node:test";
import assert from "node:assert/strict";
import { collect, weeklyMessage } from "../public/js/expiry-core.js";
import { desiredTasks } from "../lib/generate.mjs";

const today = "2026-10-25";

test("everything that runs out lands in one list, most urgent first", () => {
  const all = collect({
    today,
    items: [
      { id: "i_milk", name: "Milk", category: "supplies.pantry", expiresOn: "2026-10-27" },
      { id: "i_old", name: "Old jam", category: "supplies.pantry", expiresOn: "2026-06-01" },
      { id: "i_tv", name: "TV", category: "electronics.tv", warrantyUntil: "2026-11-10" },
      { id: "i_smoke", name: "Smoke alarm", category: "safety.smoke_detector", installDate: "2016-09-01" },
      { id: "i_filter", name: "Water filter", category: "water.filter", installDate: "2026-05-01", lifeMonths: 6 },
      { id: "i_gone", name: "Gone", disposedOn: "2026-01-01", expiresOn: "2026-10-26" }
    ],
    documents: [{ id: "d_pass", title: "Passport", type: "passport", expiryDate: "2027-01-20" }],
    charges: [{ id: "c_net", name: "Internet", contractEnd: "2027-03-01", noticeDays: 30 }],
    expiries: [{ id: "x_mot", title: "Car inspection", type: "vehicle", date: "2026-11-20" }, { id: "x_done", title: "Old pass", type: "membership", date: "2026-10-26", done: true }],
    chances: [{ id: "c_coupon", title: "€7 off", store: "Carrefour", value: 7, expiresOn: "2026-10-28", status: "open" }, { id: "c_used", title: "Used", expiresOn: "2026-10-27", status: "caught" }]
  });
  const by = Object.fromEntries(all.map(e => [e.key, e]));
  assert.equal(by["useby:i_milk"].state, "now");
  assert.ok(!by["useby:i_old"], "food long past its date is dropped");
  assert.ok(!by["useby:i_gone"] && !by["custom:x_done"] && !by["chance:c_used"]);
  assert.equal(by["custom:x_mot"].state, "now", "car things start 45 days ahead");
  assert.equal(by["warranty:i_tv"].state, "now");
  assert.equal(by["life:i_smoke"].state, "expired");
  assert.equal(by["life:i_filter"].date, "2026-11-01");
  assert.equal(by["doc:d_pass"].state, "now", "passports start 120 days ahead");
  assert.equal(by["contract:c_net"].date, "2027-01-30");
  assert.equal(by["chance:c_coupon"].lane, "coupons");
  assert.equal(all[0].key, "life:i_smoke");
  const msg = weeklyMessage(all);
  assert.match(msg.title, /running out/); assert.match(msg.body, /already has expired/);
  assert.equal(weeklyMessage([]), null);
});

test("use-by food, worn-out things and hand-added expiries become tasks; coupons keep their own task", () => {
  const out = desiredTasks({
    today,
    items: [{ id: "i_milk", name: "Milk", category: "supplies.pantry", expiresOn: "2026-10-27" }, { id: "i_smoke", name: "Smoke alarm", category: "safety.smoke_detector", installDate: "2016-09-01" }],
    expiries: [{ id: "x_rx", title: "Prescription", type: "health", date: "2026-11-05", _visibility: "private", _createdBy: "u_nero" },
      { id: "x_far", title: "Gym", type: "membership", date: "2027-06-01" }],
    chances: [{ id: "c_coupon", title: "€7 off", expiresOn: "2026-10-28", status: "open" }]
  });
  const rx = out.find(t => t.source === "expiry");
  assert.equal(rx.title, "Renew Prescription (ends 5 Nov)"); assert.equal(rx.priority, 1);
  assert.equal(rx.visibility, "private"); assert.equal(rx.createdBy, "u_nero");
  assert.ok(!out.some(t => t.sourceRef === "c_coupon"), "coupons get their task from the opportunities ledger");
  const milk = out.find(t => t.sourceType === "useby");
  assert.equal(milk.sourceRef, "useby:i_milk"); assert.equal(milk.dueOn, "2026-10-27");
  assert.equal(out.find(t => t.sourceType === "lifespan").priority, 2);
  assert.ok(!out.some(t => t.sourceRef === "x_far"));
});

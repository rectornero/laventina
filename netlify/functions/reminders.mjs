import { sendReminders } from "../../lib/push.mjs";
import { remindersDue, planReminders } from "../../lib/wake.mjs";
import { flush } from "../../lib/meter.mjs";

// Every 5 minutes: send "in 10 min" style reminders people asked for on their tasks. A reminder that falls between
// two runs goes out at the earlier one and says the real number of minutes (see EARLY_OK in lib/push.mjs).
// It only opens the database when a reminder is actually due (see lib/wake.mjs), so the database can sleep.
// 8,640 runs a month at ~0.1–0.3 s and 1 GB: about 2–7 credits. Quiet runs aren't metered one by one
// (that would mean a write every run); lib/meter.mjs counts them as a flat daily amount.
export default async () => {
  const t = Date.now();
  try {
    const due = await remindersDue();
    if (!due) return;
    if (due === "unplanned") await planReminders();
    const n = await sendReminders(); if (n) console.log("reminders sent", n);
    await flush("reminders", t);
  } catch (e) { console.error("reminders failed", e); }
};

export const config = { schedule: "*/5 * * * *" };

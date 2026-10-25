import { sendReminders } from "../../lib/push.mjs";
import { remindersDue, planReminders } from "../../lib/wake.mjs";

// Every minute: send "in 10 min" style reminders people asked for on their tasks.
// It only opens the database when a reminder is actually due (see lib/wake.mjs), so the database can sleep.
export default async () => {
  try {
    const due = await remindersDue();
    if (!due) return;
    if (due === "unplanned") await planReminders();
    const n = await sendReminders(); if (n) console.log("reminders sent", n); } catch (e) { console.error("reminders failed", e); }
};

export const config = { schedule: "* * * * *" };

import { sendReminders } from "../../lib/push.mjs";

// Every minute: send "in 10 min" style reminders people asked for on their tasks.
export default async () => {
  try { const n = await sendReminders(); if (n) console.log("reminders sent", n); } catch (e) { console.error("reminders failed", e); }
};

export const config = { schedule: "* * * * *" };

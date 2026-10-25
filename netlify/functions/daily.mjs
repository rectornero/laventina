import { q } from "../../lib/db.mjs";
import { generate } from "../../lib/generate.mjs";
import { replanReminders, replanNotices } from "../../lib/wake.mjs";
import { flush, checkCosts } from "../../lib/meter.mjs";
import { sendCostAlert } from "../../lib/push.mjs";

// Once a day, turn upcoming care jobs, bills, contract deadlines, expiring papers and warranties into tasks.
export default async () => {
  const t = Date.now();
  const hs = await q("select id from households");
  for (const h of hs) {
    try { await generate(h.id); } catch (e) { console.error("generate failed for", h.id, e); }
  }
  // While the database is awake anyway, refresh the notes that let the other jobs leave it asleep.
  await replanReminders(); await replanNotices();
  // Yesterday is complete now: if it cost far more than usual, the owner hears about it today, not at the end of the month.
  try { const { alert } = await checkCosts(); if (alert) console.log("cost alert", alert.level, alert.text); await sendCostAlert(alert); } catch (e) { console.error("cost check failed", e); }
  await flush("daily", t);
};

export const config = { schedule: "0 5 * * *" };

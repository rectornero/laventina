import { q } from "../../lib/db.mjs";
import { generate } from "../../lib/generate.mjs";
import { replanNotices } from "../../lib/wake.mjs";

// Once a day, turn upcoming care jobs, bills, contract deadlines, expiring papers and warranties into tasks.
export default async () => {
  const hs = await q("select id from households");
  for (const h of hs) {
    try { await generate(h.id); } catch (e) { console.error("generate failed for", h.id, e); }
  }
  // While the database is awake anyway, refresh the note that lets the hourly job leave it asleep.
  await replanNotices();
};

export const config = { schedule: "0 5 * * *" };

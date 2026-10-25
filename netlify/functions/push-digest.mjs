import { sendDigests, sendRecaps, sendExpiryNotes } from "../../lib/push.mjs";
import { noticesDue, planNotices } from "../../lib/wake.mjs";

// Every hour: send each device its morning "due today" nudge once its local nudge time has come,
// on Sunday evenings the week's recap, and on Monday mornings what is running out.
export default async () => {
  // Most hours nobody is due anything: then the database is left asleep.
  const due = await noticesDue();
  if (!due) return;
  if (due === "unplanned") { try { await planNotices(); } catch (e) { console.error("plan notices", e); } }
  try { const n = await sendDigests(); if (n) console.log("digests sent", n); } catch (e) { console.error("digests failed", e); }
  try { const n = await sendExpiryNotes(); if (n) console.log("expiry notes sent", n); } catch (e) { console.error("expiry notes failed", e); }
  try { const n = await sendRecaps(); if (n) console.log("recaps sent", n); } catch (e) { console.error("recaps failed", e); }
};

export const config = { schedule: "7 * * * *" };

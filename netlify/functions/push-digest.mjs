import { sendDigests, sendRecaps } from "../../lib/push.mjs";

// Every hour: send each device its morning "due today" nudge once its local nudge time has come,
// and on Sunday evenings the week's recap.
export default async () => {
  try { const n = await sendDigests(); if (n) console.log("digests sent", n); } catch (e) { console.error("digests failed", e); }
  try { const n = await sendRecaps(); if (n) console.log("recaps sent", n); } catch (e) { console.error("recaps failed", e); }
};

export const config = { schedule: "7 * * * *" };

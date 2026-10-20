import { sendDigests } from "../../lib/push.mjs";

// Every hour: send each device its morning "due today" nudge once its local nudge time has come.
export default async () => {
  try { const n = await sendDigests(); if (n) console.log("digests sent", n); } catch (e) { console.error("digests failed", e); }
};

export const config = { schedule: "7 * * * *" };

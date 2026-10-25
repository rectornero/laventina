import { choresIfNeeded } from "../../lib/daily.mjs";
import { flush } from "../../lib/meter.mjs";

// Fallback for the day's chores (lib/daily.mjs). Most days the morning notifications already did them while the
// database was awake, and this run only reads a Blobs note. It runs late morning in Europe, after those notifications.
export default async () => {
  const t = Date.now();
  if (await choresIfNeeded()) await flush("daily", t);
};

export const config = { schedule: "7 11 * * *" };

import { deployUpdate, postUpdate } from "../../lib/artache.mjs";
import { flush } from "../../lib/meter.mjs";

// Netlify calls this after every successful deploy; production deploys are posted to Artache as a release.
export default async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const d = body.payload || body;
    // Each production deploy costs 15 credits: the meter counts it.
    if ((d.context || "production") === "production") await flush("deploy", Date.now(), { deploy: true });
    const update = deployUpdate(body.payload || body);
    if (update && await postUpdate(update)) console.log("posted to artache:", update.title);
  } catch (e) { console.error("artache post failed", e); }
  return new Response("ok");
};

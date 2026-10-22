import { deployUpdate, postUpdate } from "../../lib/artache.mjs";

// Netlify calls this after every successful deploy; production deploys are posted to Artache as a release.
export default async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const update = deployUpdate(body.payload || body);
    if (update && await postUpdate(update)) console.log("posted to artache:", update.title);
  } catch (e) { console.error("artache post failed", e); }
  return new Response("ok");
};

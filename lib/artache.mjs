// Posts progress to the Artache Updates feed (https://artache.netlify.app). Off unless ARTACHE_TOKEN is set.
const env = (k) => process.env[k] || (globalThis.Netlify?.env?.get?.(k)) || "";
export const PROJECT = "rectornero/laventina";
export const artacheEnabled = () => !!env("ARTACHE_TOKEN");

let poster = null;
// Tests swap in a fake; it gets (url, init) like fetch.
export function setPoster(fn) { poster = fn; }

export async function postUpdate(update) {
  if (!artacheEnabled()) return null;
  const base = (env("ARTACHE_URL") || "https://artache.netlify.app").replace(/\/+$/, "");
  const res = await (poster || fetch)(base + "/api/v1/posts", {
    method: "POST",
    headers: { authorization: "Bearer " + env("ARTACHE_TOKEN"), "content-type": "application/json" },
    body: JSON.stringify({ project: PROJECT, kind: "update", ...update })
  });
  if (!res.ok) throw new Error(`artache ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

// Turns a Netlify deploy into a release update. Only production deploys count; "[skip artache]" in the commit opts out.
export function deployUpdate(d) {
  if (!d || d.context !== "production") return null;
  const message = String(d.title || d.commit_message || "").trim();
  if (/\[skip artache\]/i.test(message)) return null;
  const [first, ...rest] = message.split("\n");
  const head = first.trim() || "New version deployed";
  const title = head.length > 100 ? head.slice(0, 97) + "..." : head;
  const site = d.ssl_url || d.url || "https://laventina.netlify.app";
  const details = rest.join("\n").replace(/^\s*Co-Authored-By:.*$|^\s*Claude-Session:.*$/gim, "").trim();
  const body = [details, `Live at ${site}.`].filter(Boolean).join("\n\n");
  return { kind: "release", title, body, url: d.commit_url || site, author: "Netlify deploy" };
}

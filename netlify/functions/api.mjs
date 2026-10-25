import { q, HttpError } from "../../lib/db.mjs";
import { requireUser, createSession, endSession, signup, login, inviteCode } from "../../lib/auth.mjs";
import { sync, putRecord, deleteRecord, putTask, deleteTask } from "../../lib/data.mjs";
import { generate, generateIfStale } from "../../lib/generate.mjs";
import { saveFile, readFile, deleteFile } from "../../lib/files.mjs";
import { askClaude, aiEnabled } from "../../lib/ai.mjs";
import { brief, history, talk, act, greet } from "../../lib/butler.mjs";
import { makeCtx } from "../../lib/tools.mjs";
import { newToken, tokenInfo, revokeTokens } from "../../lib/mcp.mjs";
import { replanReminders, replanNotices } from "../../lib/wake.mjs";
import { metered, costReport } from "../../lib/meter.mjs";
import { pulseKey, touch, ensureStamp, lastChange } from "../../lib/pulse.mjs";
import { publicKey, subscribe, unsubscribe, deviceSettings, sendTest, notifyAssigned, ringBell, thank } from "../../lib/push.mjs";

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

async function body(req) {
  try { return await req.json(); } catch { throw new HttpError(400, "bad_json", "The request body was not valid JSON."); }
}

// Notifications are optional: if the keys can't be read, the app just doesn't offer them.
async function pushInfo() {
  try { return { publicKey: await publicKey() }; } catch (e) { console.error("push keys", e); return null; }
}

async function me(user, hid) {
  const h = (await q("select id, name, invite_code from households where id = $1", [hid]))[0];
  const members = await q("select u.id, u.name, u.color, m.role from members m join users u on u.id = m.user_id where m.household_id = $1 order by m.joined_at", [hid]);
  return { user, household: { id: h.id, name: h.name, inviteCode: h.invite_code }, members, ai: aiEnabled(), push: await pushInfo(), pulse: await pulseKey(hid) };
}

export async function route(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const method = req.method;
  // Writes need this header: a plain cross-site form or image cannot send it, so it doubles as CSRF protection.
  if (method !== "GET" && req.headers.get("x-laventina") !== "1") throw new HttpError(403, "bad_origin", "Missing app header.");

  if (path === "/health") {
    let dbOk = false; try { await q("select 1"); dbOk = true; } catch {}
    return json({ ok: true, db: dbOk, ai: aiEnabled() });
  }

  if (path === "/auth/signup" && method === "POST") {
    const uid = await signup(await body(req));
    return json({ ok: true }, 200, { "set-cookie": await createSession(uid) });
  }
  if (path === "/auth/login" && method === "POST") {
    const uid = await login(await body(req));
    return json({ ok: true }, 200, { "set-cookie": await createSession(uid) });
  }
  if (path === "/auth/logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": await endSession(req) });

  // "Anything new?" from open screens: answered from Blobs, before the sign-in lookup, so the database can sleep.
  if (path === "/pulse" && method === "GET") return json({ at: await lastChange(url.searchParams.get("k")) });

  const { user, householdId: hid } = await requireUser(req);
  if (!hid) throw new HttpError(409, "no_household", "Your account is not in a household.");
  if (method !== "GET") {
    const res = await authed(req, url, path, method, user, hid);
    // Every write tells the other open screens to sync on their next check.
    await touch(hid);
    return res;
  }
  return authed(req, url, path, method, user, hid);
}

async function authed(req, url, path, method, user, hid) {

  if (path === "/me" && method === "GET") return json(await me(user, hid));
  if (path === "/me" && method === "PATCH") {
    const b = await body(req);
    if (b.name && String(b.name).trim()) await q("update users set name = $2 where id = $1", [user.id, String(b.name).trim().slice(0, 60)]);
    if (b.householdName && String(b.householdName).trim()) await q("update households set name = $2 where id = $1", [hid, String(b.householdName).trim().slice(0, 80)]);
    return json(await me({ ...user, name: b.name || user.name }, hid));
  }
  if (path === "/household/invite" && method === "POST") {
    await q("update households set invite_code = $2 where id = $1", [hid, inviteCode()]);
    return json(await me(user, hid));
  }

  if (path === "/sync" && method === "GET") {
    if (!url.searchParams.get("since")) { try { await generateIfStale(hid); } catch (e) { console.error("generate", e); } }
    const out = await sync(hid, user.id, url.searchParams.get("since"));
    await ensureStamp(hid);
    return json(out);
  }
  if (path === "/generate" && method === "POST") return json(await generate(hid));

  let m;
  if ((m = path.match(/^\/records\/([A-Za-z]+)\/([^/]+)$/))) {
    if (method === "PUT") return json(await putRecord(hid, user.id, m[1], decodeURIComponent(m[2]), await body(req)));
    if (method === "DELETE") return json(await deleteRecord(hid, user.id, m[1], decodeURIComponent(m[2])));
  }
  if (path === "/bell" && method === "POST") return json(await ringBell(hid, user, await body(req)));
  if ((m = path.match(/^\/tasks\/([^/]+)\/thanks$/)) && method === "POST") return json(await thank(hid, user, decodeURIComponent(m[1])));
  if ((m = path.match(/^\/tasks\/([^/]+)$/))) {
    if (method === "PUT") {
      const id = decodeURIComponent(m[1]), b = await body(req);
      const before = (await q("select assignee_id from tasks where id = $1 and household_id = $2", [id, hid]))[0];
      const out = await putTask(hid, user.id, id, b);
      // A task handed to someone else, new or reassigned, rings their devices.
      if (b.data.assigneeId && b.data.assigneeId !== (before && before.assignee_id)) {
        try { await notifyAssigned(hid, user, { ...b.data, id }); } catch (e) { console.error("notify", e); }
      }
      await replanReminders();
      return json(out);
    }
    if (method === "DELETE") { const out = await deleteTask(hid, user.id, decodeURIComponent(m[1])); await replanReminders(); return json(out); }
  }
  if (path === "/files" && method === "POST") return json(await saveFile(hid, user.id, req));
  if ((m = path.match(/^\/files\/([^/]+)$/))) {
    if (method === "GET") return readFile(hid, m[1]);
    if (method === "DELETE") { await deleteFile(hid, m[1]); return json({ ok: true }); }
  }
  if (path === "/push/device" && method === "POST") return json(await deviceSettings(user.id, (await body(req)).endpoint));
  if (path === "/push/subscribe" && method === "POST") { const out = await subscribe(hid, user.id, await body(req)); await replanNotices(); return json(out); }
  if (path === "/push/unsubscribe" && method === "POST") { const out = await unsubscribe(user.id, (await body(req)).endpoint); await replanNotices(); return json(out); }
  if (path === "/push/test" && method === "POST") return json(await sendTest(user.id, (await body(req)).endpoint));
  // The butler: what matters now, the conversation, and tapped replies. The page sends its time zone.
  if (path.startsWith("/butler")) {
    const ctx = await makeCtx(hid, user, req.headers.get("x-tz") || undefined);
    if (path === "/butler" && method === "GET") {
      const [b, log] = await Promise.all([brief(ctx), history(ctx, 30)]);
      return json({ me: user, ai: aiEnabled(), push: await pushInfo(), messages: b.messages, log, people: b.senses.people.length, profile: { presence: b.senses.presence, location: b.senses.location } });
    }
    if (path === "/butler/say" && method === "POST") { const b = await body(req); return json(await talk(ctx, { text: b.text, fileIds: Array.isArray(b.fileIds) ? b.fileIds : [] })); }
    if (path === "/butler/greet" && method === "POST") return json(await greet(ctx));
    if (path === "/butler/act" && method === "POST") return json(await act(ctx, await body(req)));
  }
  if (path === "/costs" && method === "GET") return json(await costReport());
  if (path === "/connect/claude") {
    if (method === "GET") return json(await tokenInfo(user.id));
    if (method === "POST") { const token = await newToken(user.id); return json({ url: url.origin + "/mcp/" + token }); }
    if (method === "DELETE") return json(await revokeTokens(user.id));
  }
  if (path === "/ai" && method === "POST") return json(await askClaude(hid, await body(req)));

  throw new HttpError(404, "not_found", "No such endpoint.");
}

export default metered("api", async (req) => {
  try { return await route(req); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
    console.error(e);
    return json({ error: "server_error", message: "Something went wrong on the server. Try again." }, 500);
  }
}, { request: true });

export const config = { path: "/api/*" };

// Laventina as an MCP server, so Claude (claude.ai, the desktop app, Claude Code) can work with the household.
// Stateless Streamable HTTP: each POST carries JSON-RPC and gets JSON back. The tools are the butler's own (lib/tools.mjs).
import { createHash, randomBytes } from "node:crypto";
import { q, HttpError } from "./db.mjs";
import { TOOLS, makeCtx, runTool } from "./tools.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
export const PROTOCOL = "2025-06-18";
const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

// One connector link per person: making a new one retires the old.
export async function newToken(uid, label = "Claude") {
  const token = "lav_" + randomBytes(24).toString("base64url");
  await q("delete from api_tokens where user_id = $1", [uid]);
  await q("insert into api_tokens (token_hash, user_id, label) values ($1, $2, $3)", [sha(token), uid, String(label).slice(0, 60)]);
  return token;
}
export async function tokenInfo(uid) {
  const r = (await q(`select label, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created, to_char(last_used_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as used from api_tokens where user_id = $1`, [uid]))[0];
  return r ? { connected: true, ...r } : { connected: false };
}
export async function revokeTokens(uid) { await q("delete from api_tokens where user_id = $1", [uid]); return { ok: true }; }

export async function userForToken(token) {
  if (!token || !/^lav_[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const r = (await q(`select u.id, u.email, u.name, u.color, m.household_id from api_tokens t join users u on u.id = t.user_id join members m on m.user_id = u.id where t.token_hash = $1`, [sha(token)]))[0];
  if (!r) return null;
  await q("update api_tokens set last_used_at = now() where token_hash = $1", [sha(token)]);
  return { user: { id: r.id, email: r.email, name: r.name, color: r.color }, hid: r.household_id };
}

const INSTRUCTIONS = `Laventina is the household's butler. Through these tools you can see what matters in the household (get_overview), manage the shared to-do list, catch coupons and other money on the table before it expires and log the ones that slipped (with their cause, so a safeguard is put in place), remember facts about the household, ring the house bell, leave fridge notes, add to shopping, search belongings and papers, and draft messages (never sent automatically). Start with get_overview. Speak to the user like a kind, discreet butler: lead with what matters, propose, and let them decide.`;

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
async function handle(msg, who) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg && msg.id, -32600, "Invalid request");
  const { id, method, params = {} } = msg;
  const isNote = id === undefined || id === null;
  const ok = (result) => isNote ? null : { jsonrpc: "2.0", id, result };
  switch (method) {
    case "initialize": {
      const v = SUPPORTED.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOL;
      return ok({ protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "laventina", title: "Artache Laventina", version: "1.0.0" }, instructions: INSTRUCTIONS });
    }
    case "ping": return ok({});
    case "tools/list":
      return ok({ tools: TOOLS.filter(t => !t.appOnly).map(t => ({ name: t.name, description: t.description, inputSchema: t.input_schema, annotations: { readOnlyHint: /^(get_|find_|search_)/.test(t.name) } })) });
    case "tools/call": {
      const t = TOOLS.find(x => x.name === params.name && !x.appOnly);
      if (!t) return rpcError(id, -32602, "Unknown tool: " + params.name);
      const ctx = await makeCtx(who.hid, who.user);
      try {
        const out = await runTool(ctx, t.name, params.arguments || {});
        return ok({ content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out && typeof out === "object" && !Array.isArray(out) ? out : undefined });
      } catch (e) {
        if (!(e instanceof HttpError)) console.error("mcp tool", e);
        return ok({ content: [{ type: "text", text: e instanceof HttpError ? e.message : "That didn't work." }], isError: true });
      }
    }
    case "resources/list": return ok({ resources: [] });
    case "prompts/list": return ok({ prompts: [] });
    default:
      if (method.startsWith("notifications/")) return null;
      return rpcError(id, -32601, "Method not found: " + method);
  }
}

const out = (body, status = 200) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function mcpHandler(req) {
  const url = new URL(req.url);
  const fromPath = url.pathname.replace(/^\/mcp\/?/, "").split("/")[0];
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : fromPath;
  if (req.method === "GET" || req.method === "DELETE") return new Response(null, { status: 405, headers: { allow: "POST" } });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  const who = await userForToken(token);
  if (!who || !who.hid) return out(rpcError(null, -32001, "This Laventina link is not valid. Make a new one in Laventina: menu, Connect Claude."), 401);
  let body;
  try { body = await req.json(); } catch { return out(rpcError(null, -32700, "Parse error"), 400); }
  if (Array.isArray(body)) {
    const res = (await Promise.all(body.map(m => handle(m, who)))).filter(Boolean);
    return res.length ? out(res) : new Response(null, { status: 202 });
  }
  const res = await handle(body, who);
  return res ? out(res) : new Response(null, { status: 202 });
}

import { mcpHandler } from "../../lib/mcp.mjs";

export default async (req) => {
  try { return await mcpHandler(req); }
  catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Laventina had a problem. Try again." } }), { status: 500, headers: { "content-type": "application/json" } });
  }
};

export const config = { path: ["/mcp", "/mcp/*"] };

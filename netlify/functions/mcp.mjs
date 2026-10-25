import { mcpHandler } from "../../lib/mcp.mjs";
import { metered } from "../../lib/meter.mjs";

export default metered("mcp", async (req) => {
  try { return await mcpHandler(req); }
  catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Laventina had a problem. Try again." } }), { status: 500, headers: { "content-type": "application/json" } });
  }
}, { request: true });

export const config = { path: ["/mcp", "/mcp/*"] };

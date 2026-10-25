// Local preview without Netlify: serves public/ and runs the API against an in-memory Postgres.
// Run with: node dev/server.mjs  (then open http://localhost:8888)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { setDb } from "../lib/db.mjs";
import { setFileStore } from "../lib/files.mjs";
import handler from "../netlify/functions/api.mjs";

const pg = new PGlite(process.env.PGLITE_DIR);
setDb({ query: async (t, p = []) => (await pg.query(t, p)).rows });
const blobs = new Map();
setFileStore({
  set: async (k, v, o) => blobs.set(k, { data: v, metadata: o.metadata }),
  getWithMetadata: async (k) => blobs.get(k) || null,
  delete: async (k) => blobs.delete(k),
  list: async ({ prefix }) => ({ blobs: [...blobs.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }),
  getMetadata: async (k) => blobs.has(k) ? { metadata: blobs.get(k).metadata } : null
});

const root = new URL("../public/", import.meta.url).pathname;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const CSP = "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'";
const port = Number(process.env.PORT) || 8888;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith("/api/")) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await handler(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  const p = normalize(join(root, url.pathname === "/" ? "index.html" : url.pathname));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  try { const data = await readFile(p); res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream", "content-security-policy": CSP }); res.end(data); }
  catch { res.writeHead(404); res.end("Not found"); }
}).listen(port, () => console.log(`Laventina on http://localhost:${port}`));

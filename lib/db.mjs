import { neon } from "@neondatabase/serverless";
import { SCHEMA } from "./schema.mjs";

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

let impl = null;
let ready = null;

// Tests inject an in-memory Postgres with the same { query(text, params) } shape.
export function setDb(q) { impl = q; ready = null; }

export function db() {
  if (!impl) {
    const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new HttpError(503, "not_configured", "The database is not connected yet.");
    const sql = neon(url);
    impl = { query: (text, params = []) => sql.query(text, params) };
  }
  return impl;
}

export async function q(text, params = []) {
  if (!ready) ready = migrate();
  await ready;
  return db().query(text, params);
}

async function migrate() {
  for (const stmt of SCHEMA.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) await db().query(stmt);
}

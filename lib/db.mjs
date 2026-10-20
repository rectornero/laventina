import { getDatabase, MissingDatabaseConnectionError } from "@netlify/database";
import { SCHEMA } from "./schema.mjs";

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

let impl = null;
let ready = null;

// Tests and the local preview inject an in-memory Postgres with the same { query(text, params) } shape,
// and get the schema applied here. On Netlify the schema ships as a migration that each deploy applies.
export function setDb(q) { impl = q; ready = null; }

export function db() {
  if (!impl) {
    let database;
    try { database = getDatabase(); }
    catch (e) {
      const url = process.env.DATABASE_URL;
      if (!url) throw new HttpError(503, "not_configured", "The database is not connected yet.");
      database = getDatabase({ connectionString: url });
    }
    impl = { query: async (text, params = []) => (await database.pool.query(text, params)).rows, hosted: true };
  }
  return impl;
}

export async function q(text, params = []) {
  const d = db();
  if (!d.hosted) { if (!ready) ready = migrate(); await ready; }
  try { return await d.query(text, params); }
  catch (e) { if (e instanceof MissingDatabaseConnectionError) throw new HttpError(503, "not_configured", "The database is not connected yet."); throw e; }
}

async function migrate() {
  for (const stmt of SCHEMA.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) await db().query(stmt);
}

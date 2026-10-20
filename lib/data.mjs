import { q, HttpError } from "./db.mjs";

// Record kinds the app stores as JSON documents. Tasks have their own table.
export const KINDS = new Set(["items", "rooms", "shopping", "lists", "plans", "upkeepLog", "charges", "expenses", "settlements", "documents", "projects", "finishes", "wishlist", "decisions", "meta"]);
const MAX_BYTES = 200 * 1024;
const idOk = (s) => typeof s === "string" && /^[A-Za-z0-9_\-.:]{1,80}$/.test(s);

// camelCase field -> [column, type]
export const TASK_COLS = {
  title: ["title", "text"], notes: ["notes", "text"], status: ["status", "text"], dueOn: ["due_on", "date"], dueTime: ["due_time", "text"],
  showFrom: ["show_from", "date"], priority: ["priority", "int"], listId: ["list_id", "text"], assigneeId: ["assignee_id", "text"],
  claimedAt: ["claimed_at", "ts"], doneAt: ["done_at", "ts"], doneBy: ["done_by", "text"], repeat: ["repeat", "json"], subtasks: ["subtasks", "json"],
  tags: ["tags", "json"], source: ["source", "text"], sourceType: ["source_type", "text"], sourceRef: ["source_ref", "text"], projectId: ["project_id", "text"],
  phase: ["phase", "text"], blockedBy: ["blocked_by", "json"], sortOrder: ["sort_order", "float"], itemId: ["item_id", "text"], roomId: ["room_id", "text"],
  estMinutes: ["est_minutes", "int"], extra: ["extra", "json"], visibility: ["visibility", "text"]
};
const SELECT_TASK = `select id, ${Object.entries(TASK_COLS).map(([k, [c, t]]) => (t === "date" ? `to_char(${c}, 'YYYY-MM-DD')` : t === "ts" ? `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')` : c) + ` as "${k}"`).join(", ")},
  created_by as "createdBy", updated_by as "updatedBy", to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt", deleted, updated_at`;

export function rowToTask(r) {
  const t = {};
  for (const [k, v] of Object.entries(r)) if (v !== null && v !== undefined && k !== "updated_at" && k !== "deleted" && k !== "vis") t[k] = v;
  return t;
}

function coerce(type, v) {
  if (v === undefined || v === null || v === "") return null;
  switch (type) {
    case "int": { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : null; }
    case "float": { const n = Number(v); return Number.isFinite(n) ? n : null; }
    case "date": return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    case "ts": return isNaN(Date.parse(v)) ? null : new Date(v).toISOString();
    case "json": return JSON.stringify(v);
    default: return String(v).slice(0, 4000);
  }
}

const visible = (alias = "") => `(${alias}visibility = 'shared' or ${alias}created_by = $2)`;

export async function sync(hid, uid, since) {
  const sinceTs = since && !isNaN(Date.parse(since)) ? new Date(Date.parse(since) - 5000).toISOString() : "1970-01-01T00:00:00Z";
  const now = (await q("select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as now"))[0].now;
  // A row that turned private to someone else comes back as deleted, so the other person's screen drops it.
  const recs = await q(`select kind, id, data, visibility, created_by, deleted, ${visible()} as vis, to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as v
    from records where household_id = $1 and updated_at > $3 ${since ? "" : "and " + visible()}`, [hid, uid, sinceTs]);
  const tasks = await q(`${SELECT_TASK}, ${visible()} as vis from tasks where household_id = $1 and updated_at > $3 ${since ? "" : "and " + visible()}`, [hid, uid, sinceTs]);
  return {
    now,
    full: !since,
    records: recs.map(r => { const gone = r.deleted || !r.vis; return { kind: r.kind, id: r.id, deleted: gone, v: r.v, data: gone ? null : { ...r.data, _visibility: r.visibility, _createdBy: r.created_by } }; }),
    tasks: tasks.map(r => { const gone = r.deleted || !r.vis; return { id: r.id, deleted: gone, data: gone ? null : rowToTask(r) }; })
  };
}

export async function putRecord(hid, uid, kind, id, body) {
  if (!KINDS.has(kind)) throw new HttpError(400, "bad_kind", "Unknown kind of record.");
  if (!idOk(id)) throw new HttpError(400, "bad_id", "Bad record id.");
  const data = body && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : null;
  if (!data) throw new HttpError(400, "bad_body", "Send { data: {...} }.");
  const json = JSON.stringify(data);
  if (json.length > MAX_BYTES) throw new HttpError(413, "too_large", "That record is too large.");
  const vis = body.visibility === "private" ? "private" : "shared";
  // A private record can only be changed by its creator; others see it as missing.
  const rows = await q(`insert into records (household_id, kind, id, data, visibility, created_by, updated_by)
    values ($1, $3, $4, $5::jsonb, $6, $2, $2)
    on conflict (household_id, kind, id) do update set data = excluded.data, visibility = excluded.visibility, updated_by = $2, updated_at = clock_timestamp(), deleted = false
    where records.visibility = 'shared' or records.created_by = $2
    returning to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as v`, [hid, uid, kind, id, json, vis]);
  if (!rows.length) throw new HttpError(404, "not_found", "That record is private to someone else.");
  return { v: rows[0].v };
}

export async function deleteRecord(hid, uid, kind, id) {
  if (!KINDS.has(kind) || !idOk(id)) throw new HttpError(400, "bad_id", "Bad record id.");
  await q(`update records set deleted = true, data = '{}'::jsonb, updated_by = $2, updated_at = clock_timestamp()
    where household_id = $1 and kind = $3 and id = $4 and (visibility = 'shared' or created_by = $2)`, [hid, uid, kind, id]);
  return { ok: true };
}

export async function putTask(hid, uid, id, body) {
  if (!idOk(id)) throw new HttpError(400, "bad_id", "Bad task id.");
  const t = body && body.data;
  if (!t || typeof t !== "object" || !String(t.title || "").trim()) throw new HttpError(400, "bad_task", "A task needs a title.");
  if (JSON.stringify(t).length > MAX_BYTES) throw new HttpError(413, "too_large", "That task is too large.");
  const keys = Object.keys(TASK_COLS);
  const vals = keys.map(k => coerce(TASK_COLS[k][1], t[k]));
  const si = keys.indexOf("status"); if (!["open", "done", "skipped"].includes(vals[si])) vals[si] = "open";
  const so = keys.indexOf("source"); if (!vals[so]) vals[so] = "todo";
  const vi = keys.indexOf("visibility"); if (vals[vi] !== "private") vals[vi] = "shared";
  const pi = keys.indexOf("priority"); if (vals[pi] == null) vals[pi] = 0;
  const cols = keys.map(k => TASK_COLS[k][0]);
  const ph = keys.map((k, i) => `$${i + 4}${TASK_COLS[k][1] === "json" ? "::jsonb" : TASK_COLS[k][1] === "date" ? "::date" : TASK_COLS[k][1] === "ts" ? "::timestamptz" : ""}`);
  const rows = await q(`insert into tasks (id, household_id, created_by, updated_by, ${cols.join(", ")})
    values ($3, $1, $2, $2, ${ph.join(", ")})
    on conflict (id) do update set ${cols.map(c => `${c} = excluded.${c}`).join(", ")}, updated_by = $2, updated_at = clock_timestamp(), deleted = false
    where tasks.household_id = $1 and (tasks.visibility = 'shared' or tasks.created_by = $2)
    returning id`, [hid, uid, id, ...vals]);
  if (!rows.length) throw new HttpError(404, "not_found", "That task belongs to someone else.");
  return { ok: true };
}

export async function deleteTask(hid, uid, id) {
  if (!idOk(id)) throw new HttpError(400, "bad_id", "Bad task id.");
  // Generated tasks are skipped, not deleted, so the generator does not bring the same occurrence back.
  await q(`update tasks set
      deleted = (source = 'todo'), status = case when source = 'todo' then status else 'skipped' end,
      updated_by = $2, updated_at = clock_timestamp()
    where household_id = $1 and id = $3 and (visibility = 'shared' or created_by = $2)`, [hid, uid, id]);
  return { ok: true };
}

export async function readKinds(hid, kinds) {
  const rows = await q("select kind, id, data, visibility, created_by from records where household_id = $1 and deleted = false and kind = any($2)", [hid, kinds]);
  const out = {}; for (const k of kinds) out[k] = [];
  for (const r of rows) out[r.kind].push({ ...r.data, id: r.id, _visibility: r.visibility, _createdBy: r.created_by });
  return out;
}

// Everything a household keeps in Laventina, for taking it elsewhere: what the signed-in person can see
// (shared things, plus their own private ones), their butler conversation, and the list of stored files.
import { q } from "./db.mjs";
import { listFiles } from "./files.mjs";

export async function exportAll(hid, uid) {
  const household = (await q("select id, name, created_at from households where id = $1", [hid]))[0];
  const members = await q(`select u.id, u.name, u.email, u.color, m.role, m.joined_at from members m join users u on u.id = m.user_id
    where m.household_id = $1 order by m.joined_at`, [hid]);
  const records = await q(`select kind, id, data, visibility, created_by, created_at, updated_at from records
    where household_id = $1 and deleted = false and (visibility = 'shared' or created_by = $2) order by kind, id`, [hid, uid]);
  const tasks = await q(`select *, to_char(due_on, 'YYYY-MM-DD') as due_date, to_char(show_from, 'YYYY-MM-DD') as show_from_date from tasks where household_id = $1 and deleted = false and (visibility = 'shared' or created_by = $2)
    order by due_on nulls last, created_at`, [hid, uid]);
  const butlerLog = await q("select role, body, created_at from butler_log where user_id = $1 order by id", [uid]);
  const butlerProfile = (await q("select data from butler_profile where user_id = $1", [uid]))[0]?.data || null;
  return { app: "Laventina", exportedAt: new Date().toISOString(), exportedBy: uid, household, members, tasks, records, butlerLog, butlerProfile, files: await listFiles(hid) };
}

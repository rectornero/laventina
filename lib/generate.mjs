import { q } from "./db.mjs";
import { readKinds, rowToTask } from "./data.mjs";
import { newId } from "./auth.mjs";

// Dates as YYYY-MM-DD strings in UTC; a day either way does not matter for house reminders.
const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Math.round(n)); return iso(d); };
const valid = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const nice = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
// The ideal reminder date, unless it has already passed while the real deadline has not: then a week before the deadline, or the deadline itself.
const dueBy = (ideal, hard, today) => ideal >= today || hard < today ? ideal : addDays(hard, -7) >= today ? addDays(hard, -7) : hard;
const money = (n, cur) => { try { return new Intl.NumberFormat("en-IE", { style: "currency", currency: cur || "EUR" }).format(n); } catch { return n + " " + (cur || ""); } };

// What tasks the house wants to exist right now. Pure, so it is easy to test.
// Each entry: { source, sourceType, sourceRef, dueOn, showFrom, title, ... }
export function desiredTasks({ plans = [], charges = [], documents = [], items = [], meta = [], today, members = [] }) {
  const out = [];
  const house = meta.find(m => m.id === "house") || {};
  const cur = house.currency || "EUR";
  const itemsById = new Map(items.map(i => [i.id, i]));
  const ownerOf = (r) => ({ visibility: r._visibility || "shared", createdBy: r._createdBy });

  for (const p of plans) {
    if (!p.active || !valid(p.nextDue)) continue;
    const it = p.itemId && itemsById.get(p.itemId);
    if (p.itemId && (!it || it.disposedOn)) continue;
    const pro = p.effort === "pro";
    const window = pro ? (p.lead || 21) : (p.minutes || 0) > 60 ? 14 : 7;
    const showFrom = addDays(p.nextDue, -window);
    if (today < showFrom) continue;
    let assigneeId = null;
    if (p.assignMode === "fixed" && p.assigneeId) assigneeId = p.assigneeId;
    else if (p.assignMode === "alternate" && members.length > 1) assigneeId = members.find(m => m !== p.lastDoneBy) || members[0];
    out.push({
      source: "care", sourceType: "plan", sourceRef: p.id, dueOn: pro && p.lead ? addDays(p.nextDue, -Math.min(p.lead, 14)) : p.nextDue, showFrom,
      title: (pro ? "Book: " : "") + p.title + (it ? " · " + it.name : ""), itemId: p.itemId, estMinutes: p.minutes || null, assigneeId,
      priority: p.consequence === "safety" ? 2 : 0, tags: ["upkeep"], extra: { safety: p.consequence === "safety", planDue: p.nextDue }, visibility: "shared"
    });
  }

  for (const c of charges) {
    if (c.status === "cancelled" || c.remind === false) continue;
    const priv = ownerOf(c);
    if (!c.autopay && valid(c.nextDue)) {
      const ideal = addDays(c.nextDue, -3), due = ideal >= today || c.nextDue < today ? ideal : c.nextDue;
      if (today >= addDays(ideal, -7)) out.push({ source: "money", sourceType: "pay", sourceRef: c.id, dueOn: due, showFrom: addDays(ideal, -7),
        title: `Pay ${c.name}${c.amount ? " (" + money(c.amount, cur) + ")" : ""}`, assigneeId: c.payerId || null, tags: ["money"], extra: { billDue: c.nextDue }, ...priv });
    }
    if (valid(c.contractEnd) && today <= c.contractEnd) {
      const deadline = addDays(c.contractEnd, -(Number(c.noticeDays) || 0));
      const ideal = addDays(deadline, -30), due = dueBy(ideal, deadline, today);
      if (today >= addDays(ideal, -7)) out.push({ source: "money", sourceType: "contract", sourceRef: c.id, dueOn: due, showFrom: addDays(ideal, -7),
        title: `Renew or switch ${c.provider || c.name} by ${nice(deadline)}`, assigneeId: c.contactPerson || c.payerId || null, priority: 1, tags: ["money"], extra: { deadline }, ...priv });
    }
    if (["streaming", "software"].includes(c.category)) {
      const base = valid(c.lastUsedCheck) ? c.lastUsedCheck : (c.createdAt || "").slice(0, 10);
      if (valid(base)) {
        const due = addDays(base, 182);
        if (today >= addDays(due, -7)) out.push({ source: "money", sourceType: "subscription", sourceRef: c.id, dueOn: due, showFrom: addDays(due, -7),
          title: `Still using ${c.name}?`, assigneeId: c.payerId || null, tags: ["money"], ...priv });
      }
    }
  }

  for (const d of documents) {
    if (!valid(d.expiryDate) || d.supersededBy || d.remind === false) continue;
    const ideal = addDays(d.expiryDate, -(Number(d.reminderDays) || 30)), due = dueBy(ideal, d.expiryDate, today);
    if (today >= addDays(ideal, -7)) out.push({ source: "papers", sourceType: "expiry", sourceRef: d.id, dueOn: due, showFrom: addDays(ideal, -7),
      title: `Renew ${d.title} (expires ${nice(d.expiryDate)})`, priority: d.critical ? 1 : 0, tags: ["papers"], ...ownerOf(d) });
  }

  for (const it of items) {
    if (it.disposedOn || it.example || !valid(it.warrantyUntil) || today > it.warrantyUntil) continue;
    const ideal = addDays(it.warrantyUntil, -30), due = dueBy(ideal, it.warrantyUntil, today);
    if (today >= addDays(ideal, -7)) out.push({ source: "inventory", sourceType: "warranty", sourceRef: it.id, dueOn: due, showFrom: addDays(ideal, -7),
      title: `Test ${it.name} before its warranty ends ${nice(it.warrantyUntil)}`, itemId: it.id, tags: ["inventory"], visibility: "shared" });
  }
  return out;
}

const GEN_SELECT = `select id, source, source_type as "sourceType", source_ref as "sourceRef", status, to_char(due_on, 'YYYY-MM-DD') as "dueOn", extra, assignee_id as "assigneeId",
  created_at < now() - interval '3 days' as "older3d" from tasks where household_id = $1 and source <> 'todo' and deleted = false`;

// Brings the tasks table in line with what the house wants. Safe to run any number of times.
export async function generate(hid, today = iso(new Date())) {
  const kinds = await readKinds(hid, ["plans", "charges", "documents", "items", "meta", "upkeepLog"]);
  const members = (await q("select user_id from members where household_id = $1 order by joined_at", [hid])).map(r => r.user_id);
  const want = desiredTasks({ ...kinds, today, members });
  const have = await q(GEN_SELECT, [hid]);
  const key = (t) => `${t.source}|${t.sourceType}|${t.sourceRef}`;
  const open = new Map(have.filter(t => t.status === "open").map(t => [key(t), t]));
  let created = 0, moved = 0;
  for (const w of want) {
    const o = open.get(key(w));
    if (o) {
      // One open task per source. Follow the source's date unless a person moved it.
      if (o.dueOn !== w.dueOn && !(o.extra && o.extra.movedDue)) {
        await q("update tasks set due_on = $2::date, show_from = $3::date, title = $4, updated_at = clock_timestamp() where id = $1", [o.id, w.dueOn, w.showFrom, w.title]);
        moved++;
      }
      continue;
    }
    const r = await q(`insert into tasks (id, household_id, title, status, due_on, show_from, priority, assignee_id, source, source_type, source_ref, item_id, est_minutes, tags, extra, visibility, created_by)
      values ($1, $2, $3, 'open', $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16)
      on conflict (household_id, source, source_ref, due_on) where source <> 'todo' do nothing returning id`,
      [newId("g"), hid, w.title, w.dueOn, w.showFrom, w.priority || 0, w.assigneeId || null, w.source, w.sourceType, w.sourceRef, w.itemId || null, w.estMinutes || null,
       JSON.stringify(w.tags || []), JSON.stringify(w.extra || {}), w.visibility === "private" ? "private" : "shared", w.createdBy || null]);
    if (r.length) created++;
  }
  // Unclaimed safety jobs go to whoever has done less care this month, after three days.
  if (members.length > 1) {
    const month = today.slice(0, 7);
    const mins = Object.fromEntries(members.map(m => [m, 0]));
    for (const l of kinds.upkeepLog) if ((l.doneOn || "").startsWith(month) && l.doneBy in mins) mins[l.doneBy] += Number(l.minutes) || 15;
    const least = members.slice().sort((a, b) => mins[a] - mins[b])[0];
    for (const t of have) if (t.status === "open" && t.source === "care" && !t.assigneeId && t.older3d && t.extra && t.extra.safety)
      await q("update tasks set assignee_id = $2, updated_at = clock_timestamp() where id = $1", [t.id, least]);
  }
  await q("update households set generated_at = now() where id = $1", [hid]);
  return { created, moved };
}

export async function generateIfStale(hid) {
  const r = await q("select generated_at is null or generated_at < now() - interval '1 hour' as stale from households where id = $1", [hid]);
  if (r.length && r[0].stale) return generate(hid);
  return null;
}
export { rowToTask };

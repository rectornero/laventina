// Everything in the house that runs out, in one list: papers, contracts, warranties, use-by dates, things with a lifespan,
// coupons and offers ("chances", which home.js owns), and anything else someone adds (car inspection, prescriptions). An ES module shared by the page
// (as window.LavExpiry) and the server (task generator and the Monday heads-up), so both agree on what is due.

const DAY = 864e5;
const valid = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const addDaysISO = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Math.round(n)); return d.toISOString().slice(0, 10); };
export const addMonthsISO = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + Math.round(n)); return d.toISOString().slice(0, 10); };
export const daysBetween = (from, to) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / DAY);

// Units this old should be replaced, whatever they look like.
export const LIFESPAN_YEARS = { "safety.smoke_detector": 10, "safety.co_detector": 7, "safety.extinguisher": 10 };
// How many days ahead to start on a renewal, by document type. Passports take longest.
export const DOC_LEAD = { passport: 120, id_card: 60, licence: 60, visa: 90, policy: 30, certificate: 30, contract: 30, warranty: 30 };
// How long a renewed document usually lasts, in months, to prefill the new date.
export const DOC_VALID_MONTHS = { passport: 120, id_card: 120, licence: 120, visa: 12, policy: 12, certificate: 12, contract: 12 };
// Things added by hand.
export const CUSTOM_KINDS = [["vehicle", "Car: inspection, tax or insurance"], ["health", "Prescription, vaccination or check-up"], ["membership", "Membership, pass or card"], ["licence", "Licence, permit or registration"], ["online", "Domain or online account"], ["other", "Something else"]];
const CUSTOM_LEAD = { vehicle: 45, health: 30, membership: 21, licence: 60, online: 30, other: 30 };
export const LANES = [["coupons", "Coupons"], ["papers", "Papers"], ["contracts", "Contracts"], ["warranty", "Warranties"], ["useby", "Food & medicine"], ["lifespan", "Replace"], ["custom", "Other"]];

const usebyLead = (it) => it.category === "supplies.pantry" ? 3 : it.category === "supplies.medicine" ? 30 : 14;

// One entry per thing that ends. state: expired (date passed), now (inside its lead time), soon (within three more months), later.
export function collect({ items = [], documents = [], charges = [], expiries = [], chances = [], today }) {
  const out = [];
  const add = (e) => {
    const days = daysBetween(today, e.date);
    const state = e.checked ? "later" : days < 0 ? "expired" : days <= e.lead ? "now" : days <= e.lead + 90 ? "soon" : "later";
    out.push({ ...e, days, state });
  };
  const vis = (r) => ({ visibility: r._visibility || "shared", createdBy: r._createdBy || null });

  for (const it of items) {
    if (it.disposedOn || it.example) continue;
    if (valid(it.expiresOn) && Number(it.qty ?? 1) !== 0 && daysBetween(it.expiresOn, today) <= 60)
      add({ key: "useby:" + it.id, lane: "useby", ref: it.id, title: it.name, date: it.expiresOn, lead: usebyLead(it), food: it.category === "supplies.pantry", medicine: it.category === "supplies.medicine", visibility: "shared" });
    // A warranty that ended more than a month ago is no longer news.
    if (valid(it.warrantyUntil) && daysBetween(it.warrantyUntil, today) <= 30)
      add({ key: "warranty:" + it.id, lane: "warranty", ref: it.id, title: it.name, date: it.warrantyUntil, lead: 30, checked: it.warrantyChecked === it.warrantyUntil, visibility: "shared" });
    const start = valid(it.installDate) ? it.installDate : valid(it.purchaseDate) ? it.purchaseDate : null;
    const months = Number(it.lifeMonths) || (LIFESPAN_YEARS[it.category] && valid(it.installDate) ? LIFESPAN_YEARS[it.category] * 12 : 0);
    if (start && months > 0)
      add({ key: "life:" + it.id, lane: "lifespan", ref: it.id, title: it.name, date: addMonthsISO(start, months), lead: months <= 12 ? 14 : 30, months, visibility: "shared" });
  }
  for (const d of documents) {
    if (!valid(d.expiryDate) || d.supersededBy || d.remind === false) continue;
    add({ key: "doc:" + d.id, lane: "papers", ref: d.id, title: d.title, date: d.expiryDate, lead: Number(d.reminderDays) || DOC_LEAD[d.type] || 30, docType: d.type, critical: !!d.critical, ...vis(d) });
  }
  for (const c of charges) {
    if (!valid(c.contractEnd) || c.status === "cancelled" || c.contractEnd < today) continue;
    const deadline = addDaysISO(c.contractEnd, -(Number(c.noticeDays) || 0));
    add({ key: "contract:" + c.id, lane: "contracts", ref: c.id, title: c.provider || c.name, date: deadline, end: c.contractEnd, lead: 30, ...vis(c) });
  }
  for (const x of expiries) {
    if (!valid(x.date) || x.done) continue;
    add({ key: "custom:" + x.id, lane: "custom", ref: x.id, title: x.title, date: x.date, lead: Number(x.leadDays) || CUSTOM_LEAD[x.type] || 30, type: x.type || "other",
      assigneeId: x.assigneeId || null, ...vis(x) });
  }
  // Coupons, refunds and discounts: their own tasks come from home.js, so here they are only listed.
  for (const c of chances) {
    if (c.status !== "open" || !valid(c.expiresOn) || daysBetween(c.expiresOn, today) > 7) continue;
    add({ key: "chance:" + c.id, lane: "coupons", ref: c.id, title: c.title, date: c.expiresOn, lead: 5, value: Number(c.value) || 0, store: c.store || "", ...vis(c) });
  }
  const rank = { expired: 0, now: 1, soon: 2, later: 3 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export const needsYou = (e) => e.state === "expired" || e.state === "now";

// One short line on what to do, written for the person who has to do it.
export function verb(e) {
  switch (e.lane) {
    case "papers": return "Renew";
    case "contracts": return "Renew or switch";
    case "warranty": return "Test it";
    case "useby": return e.food ? "Use up" : "Replace";
    case "lifespan": return "Replace";
    case "coupons": return "Use";
    default: return "Renew";
  }
}

// The Monday heads-up: what needs someone this week or is already late.
export function weeklyMessage(entries) {
  const hot = entries.filter(e => needsYou(e) || (e.days >= 0 && e.days <= 14));
  if (!hot.length) return null;
  const late = hot.filter(e => e.state === "expired").length;
  const names = hot.slice(0, 3).map(e => `${verb(e)} ${e.title}`);
  const more = hot.length - names.length;
  return {
    title: hot.length === 1 ? "1 thing is running out" : `${hot.length} things are running out`,
    body: names.join(" · ") + (more > 0 ? ` · and ${more} more` : "") + (late ? `\n${late} already ${late === 1 ? "has" : "have"} expired.` : ""),
    url: "/#expiring", tag: "expiry"
  };
}

if (typeof window !== "undefined") window.LavExpiry = { collect, needsYou, verb, weeklyMessage, addDaysISO, addMonthsISO, daysBetween, LIFESPAN_YEARS, DOC_LEAD, DOC_VALID_MONTHS, CUSTOM_KINDS, LANES };

"use strict";
// ---------- Tasks: the heart of Laventina ----------
const PRIORITY = [[0, "No priority"], [1, "Nice to do soon"], [2, "Important"], [3, "Urgent"]];
const SOURCE_LABEL = { care: "Upkeep", money: "Money", papers: "Papers", inventory: "Inventory" };
const WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const UNIT_DAYS = { day: 1, week: 7 };

const allTasks = () => [...S.tasks.values()];
const openTasks = () => allTasks().filter(t => t.status === "open");
const isGenerated = t => t.source && t.source !== "todo";
const mineOrAnyone = t => !t.assigneeId || t.assigneeId === S.me?.id;
function whoMatch(t) {
  if (S.who === "all" || S.members.length < 2) return true;
  if (S.who === "mine") return mineOrAnyone(t);
  return t.assigneeId === S.who;
}
function blockerOf(t) {
  for (const id of t.blockedBy || []) { const b = S.tasks.get(id); if (b && b.status === "open") return b; }
  const p = t.projectId && S.projects.get(t.projectId);
  if (p && p.sequential) {
    const steps = projectSteps(p.id).filter(s => s.status === "open" && (s.sortOrder ?? 0) < (t.sortOrder ?? 0));
    if (steps.length) return steps[steps.length - 1];
  }
  return null;
}
const projectSteps = pid => allTasks().filter(t => t.projectId === pid && t.status !== "skipped").sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.createdAt || "").localeCompare(b.createdAt || ""));
const visibleNow = t => !t.showFrom || t.showFrom <= todayISO();
const actionable = t => t.status === "open" && visibleNow(t) && !blockerOf(t);
function todayTasks() { const td = todayISO(); return openTasks().filter(t => actionable(t) && t.dueOn && t.dueOn <= td); }
function taskSort(a, b) {
  return (a.dueOn || "9999").localeCompare(b.dueOn || "9999") || (a.dueTime || "99").localeCompare(b.dueTime || "99") || (b.priority || 0) - (a.priority || 0) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.createdAt || "").localeCompare(b.createdAt || "");
}
const listList = () => [...S.lists.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
const findList = name => listList().find(l => l.name.toLowerCase() === name.toLowerCase()) || listList().find(l => l.name.toLowerCase().startsWith(name.toLowerCase()));

function dueLabel(t) {
  if (!t.dueOn) return "";
  const d = daysUntil(t.dueOn);
  if (d < 0) return d === -1 ? "Yesterday" : Math.abs(d) + " days late";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 7) return new Date(t.dueOn + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" });
  return fmtShort(t.dueOn);
}
function repeatLabel(r) {
  if (!r || !r.every) return "";
  const n = Number(r.every) || 1, u = r.unit || "day";
  if (n === 1) return { day: "Every day", week: "Every week", month: "Every month", year: "Every year" }[u];
  return `Every ${n} ${u}s`;
}
function sourceChip(t) {
  if (t.projectId && S.projects.get(t.projectId)) return `<span class="tchip proj">${esc(S.projects.get(t.projectId).title)}</span>`;
  if (isGenerated(t)) return `<span class="tchip src-${esc(t.source)}">${esc(SOURCE_LABEL[t.source] || t.source)}</span>`;
  const l = t.listId && S.lists.get(t.listId);
  return l ? `<span class="tchip list">${esc(l.name)}</span>` : "";
}
function taskRowHTML(t, opts = {}) {
  const done = t.status !== "open", blk = !done && blockerOf(t);
  const d = t.dueOn ? daysUntil(t.dueOn) : null;
  const subs = t.subtasks || [];
  const meta = [
    t.dueOn && !opts.noDate ? `<span class="due ${!done && d < 0 ? "late" : !done && d === 0 ? "today" : ""}">${esc(dueLabel(t))}${t.dueTime ? " · " + esc(t.dueTime) : ""}</span>` : (t.dueTime ? `<span class="due">${esc(t.dueTime)}</span>` : ""),
    sourceChip(t),
    subs.length ? `<span>${subs.filter(s => s.done).length}/${subs.length}</span>` : "",
    t.repeat && t.repeat.every ? `<span title="${esc(repeatLabel(t.repeat))}">↻ ${esc(repeatLabel(t.repeat).replace("Every ", ""))}</span>` : "",
    t.estMinutes ? `<span>${t.estMinutes} min</span>` : "",
    t.visibility === "private" ? `<span class="lock">Private</span>` : "",
    blk ? `<span>Waiting on: ${esc(blk.title)}</span>` : "",
    done && t.doneBy && S.members.length > 1 ? `<span>Done by ${esc(memberName(t.doneBy))}</span>` : ""
  ].filter(Boolean).join("");
  let side = done ? thanksSideHTML(t) : "";
  if (S.members.length > 1 && !done) {
    if (t.assigneeId) side = avatarHTML(t.assigneeId, "For " + memberName(t.assigneeId));
    else if (!done) side = `<button class="claim" data-act="task-claim" data-id="${esc(t.id)}">I'll do it</button>`;
  }
  return `<div class="task p${t.priority || 0}${done ? " done" : ""}${blk ? " blocked" : ""}">
    <button class="tick" data-act="task-toggle" data-id="${esc(t.id)}" aria-label="${done ? "Mark not done" : "Complete"}: ${esc(t.title)}" ${blk ? "disabled" : ""}><span aria-hidden="true"></span></button>
    <button class="task-main" data-act="task-open" data-id="${esc(t.id)}"><span class="task-title">${esc(t.title)}</span>${meta ? `<span class="task-meta">${meta}</span>` : ""}</button>
    <span class="task-side">${side}</span></div>`;
}
const taskListHTML = (list, opts) => `<div class="tasks">${list.map(t => taskRowHTML(t, opts)).join("")}</div>`;

// ---------- Quick add with plain-language dates ----------
function nextWeekday(i, fromISO = todayISO(), allowSame = false) {
  const d = new Date(fromISO + "T00:00:00"); let k = (i - d.getDay() + 7) % 7; if (k === 0 && !allowSame) k = 7;
  return addDays(fromISO, k);
}
function addUnit(iso, n, unit) { return unit === "month" ? addMonths(iso, n) : unit === "year" ? addMonths(iso, 12 * n) : addDays(iso, n * (UNIT_DAYS[unit] || 1)); }
function futureDate(y, m, d) {
  const td = todayISO(); let iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (isNaN(Date.parse(iso))) return null;
  if (iso < td) iso = `${y + 1}${iso.slice(4)}`;
  return iso;
}
function parseQuick(raw, defaults = {}) {
  const out = { ...defaults };
  let s = " " + raw.replace(/\s+/g, " ") + " ";
  const take = (re, fn) => { s = s.replace(re, (...m) => (fn(...m) === false ? m[0] : " ")); };
  const td = todayISO(), year = new Date().getFullYear();
  const wd = "(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?";
  const mon = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";

  take(/\s(!{1,3}|![123])(?=\s)/, (_, b) => { out.priority = /\d/.test(b) ? Number(b[1]) : b.length; });
  take(/\s#([\p{L}\p{N}_-]+)(?=\s)/u, (_, n) => { const l = findList(n); if (l) { out.listId = l.id; delete out.newList; } else out.newList = n; });
  take(/\s@([\p{L}\p{N}_-]+)(?=\s)/u, (_, n) => {
    if (/^(anyone|any|us|both)$/i.test(n)) { out.assigneeId = ""; return; }
    if (/^me$/i.test(n)) { out.assigneeId = S.me?.id; return; }
    const m = S.members.find(m => m.name.toLowerCase().startsWith(n.toLowerCase())); if (!m) return false; out.assigneeId = m.id;
  });
  // Repeats
  take(new RegExp(`\\s(?:every|each)\\s${wd}(?=\\s)`, "i"), (_, w) => { const i = WD.findIndex(x => x.startsWith(w.toLowerCase().slice(0, 3))); out.repeat = { every: 1, unit: "week" }; out.dueOn = nextWeekday(i, td, true); });
  take(/\s(?:every|each)\s(?:(\d+|other)\s)?(day|week|month|year)s?(?=\s)/i, (_, n, u) => { out.repeat = { every: n === "other" ? 2 : Number(n) || 1, unit: u.toLowerCase() }; });
  take(/\s(daily|weekly|monthly|yearly|annually)(?=\s)/i, (_, w) => { out.repeat = { every: 1, unit: { daily: "day", weekly: "week", monthly: "month", yearly: "year", annually: "year" }[w.toLowerCase()] }; });
  // Times
  take(/\s(?:at\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/i, (_, h, m, ap) => { let H = Number(h) % 12 + (ap.toLowerCase() === "pm" ? 12 : 0); out.dueTime = `${String(H).padStart(2, "0")}:${m || "00"}`; });
  take(/\s(?:at\s)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (_, h, m) => { out.dueTime = `${h.padStart(2, "0")}:${m}`; });
  take(/\s(tonight)(?=\s)/i, () => { out.dueOn = td; out.dueTime = out.dueTime || "20:00"; });
  // Dates
  take(/\s(today|tod)(?=\s)/i, () => { out.dueOn = td; });
  take(/\s(tomorrow|tmrw|tmr|tom)(?=\s)/i, () => { out.dueOn = addDays(td, 1); });
  take(/\s(?:this\s)?weekend(?=\s)/i, () => { out.dueOn = nextWeekday(6, td, true); });
  take(/\snext\sweek(?=\s)/i, () => { out.dueOn = nextWeekday(1, td); });
  take(/\snext\smonth(?=\s)/i, () => { const d = new Date(); out.dueOn = futureDate(d.getMonth() === 11 ? year + 1 : year, (d.getMonth() + 1) % 12, 1); });
  take(/\sin\s(\d+|a|an|one|two|three)\s(day|week|month|year)s?(?=\s)/i, (_, n, u) => { const k = { a: 1, an: 1, one: 1, two: 2, three: 3 }[n.toLowerCase()] || Number(n); out.dueOn = addUnit(td, k, u.toLowerCase()); });
  take(/\s(\d{4})-(\d{2})-(\d{2})(?=\s)/, (_, y, m, d) => { out.dueOn = `${y}-${m}-${d}`; });
  take(new RegExp(`\\s(?:on\\s)?(\\d{1,2})(?:st|nd|rd|th)?\\s(?:of\\s)?${mon}(?=\\s)`, "i"), (_, d, m) => { const r = futureDate(year, MONTHS.indexOf(m.toLowerCase().slice(0, 3)), Number(d)); if (!r) return false; out.dueOn = r; });
  take(new RegExp(`\\s(?:on\\s)?${mon}\\s(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)`, "i"), (_, m, d) => { const r = futureDate(year, MONTHS.indexOf(m.toLowerCase().slice(0, 3)), Number(d)); if (!r) return false; out.dueOn = r; });
  take(/\s(?:on\s)?(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?(?=\s)/, (_, d, m, y) => {
    if (Number(m) > 12) return false;
    if (y) { const Y = y.length === 2 ? 2000 + Number(y) : Number(y); out.dueOn = `${Y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; }
    else { const r = futureDate(year, Number(m) - 1, Number(d)); if (!r) return false; out.dueOn = r; }
  });
  take(new RegExp(`\\s(?:on\\s|next\\s|this\\s)?${wd}(?=\\s)`, "i"), (m0, w) => { const i = WD.findIndex(x => x.startsWith(w.toLowerCase().slice(0, 3))); out.dueOn = nextWeekday(i, td, /this/i.test(m0)); });
  if (out.repeat && !out.dueOn) out.dueOn = td;
  if (out.dueTime && !out.dueOn) out.dueOn = td;
  out.title = s.replace(/\s+/g, " ").trim() || raw.trim();
  return out;
}
function quickChips(p) {
  const c = [];
  if (p.dueOn) c.push(dueLabel({ dueOn: p.dueOn }) + (daysUntil(p.dueOn) > 1 ? " · " + fmtShort(p.dueOn) : ""));
  if (p.dueTime) c.push(p.dueTime);
  if (p.repeat) c.push(repeatLabel(p.repeat));
  if (p.listId) c.push("#" + S.lists.get(p.listId).name);
  if (p.newList) c.push("New list: " + p.newList);
  if (p.assigneeId !== undefined && S.members.length > 1) c.push(p.assigneeId ? "For " + memberName(p.assigneeId) : "Anyone");
  if (p.priority) c.push(PRIORITY[p.priority][1]);
  return c.map(x => `<span class="pill info">${esc(x)}</span>`).join("");
}
function quickAddHTML(ph) {
  return `<form id="qt-form" class="quickadd" autocomplete="off"><label class="sr" for="qt-text">New task</label>
    <input type="text" id="qt-text" placeholder="${esc(ph || "Add a task: water the plants tomorrow 9am #home @anyone !!")}" enterkeyhint="done">
    <button class="btn primary" type="submit">Add</button><div id="qt-preview" class="qt-preview"></div></form>`;
}
function quickDefaults() {
  const d = {};
  if (S.tab === "today") d.dueOn = todayISO();
  if (S.tab === "lists" && S.lists.has(S.listView)) d.listId = S.listView;
  return d;
}
function newTask(fields) {
  return { id: newId("t"), status: "open", source: "todo", priority: 0, visibility: "shared", createdAt: nowISO(), createdBy: S.me?.id, sortOrder: Date.now() / 1e3, ...fields };
}
function addQuick(text) {
  const p = parseQuick(text, quickDefaults());
  if (!p.title) return;
  if (p.newList) { const l = { id: newId("l"), name: p.newList, order: S.lists.size + 1 }; store.put("lists", l); p.listId = l.id; }
  delete p.newList;
  const t = newTask(p);
  putTask(t);
  toast(`Added “${t.title}”${t.dueOn ? " for " + dueLabel(t).toLowerCase() : ""}`, { label: "Open", run: () => openTask(S.tasks.get(t.id)) });
}

// ---------- Doing tasks ----------
function nextRepeatDate(t) {
  const r = t.repeat; const td = todayISO();
  let d = addUnit(r.from === "done" ? td : (t.dueOn || td), Number(r.every) || 1, r.unit || "day");
  for (let i = 0; d <= td && i < 500; i++) d = addUnit(d, Number(r.every) || 1, r.unit || "day");
  return d;
}
function completeTask(t) {
  if (!t) return;
  if (t.status !== "open") { putTask({ ...t, status: "open", doneAt: undefined, doneBy: undefined }); return; }
  if (t.source === "care") { const p = S.plans.get(t.sourceRef); if (p) return openDone(p, t); }
  if (typeof expiryComplete === "function" && expiryComplete(t)) return;
  if (t.source === "money") {
    const c = S.charges.get(t.sourceRef);
    if (c && t.sourceType === "pay") return openPaid(c, t);
    if (c && t.sourceType === "contract") return openContractDecision(c, t);
    if (c && t.sourceType === "subscription") return openSubCheck(c, t);
  }
  finishTask(t);
}
function finishTask(t, { quiet, doneBy } = {}) {
  const before = { ...t };
  putTask({ ...t, status: "done", doneAt: nowISO(), doneBy: doneBy || S.me?.id });
  if (t.extra?.chanceId && typeof chanceCaught === "function") chanceCaught(t.extra.chanceId, true);
  let next = null;
  if (t.repeat && t.repeat.every && !isGenerated(t)) {
    next = newTask({ title: t.title, notes: t.notes, listId: t.listId, assigneeId: t.assigneeId, priority: t.priority, repeat: t.repeat, tags: t.tags, visibility: t.visibility, estMinutes: t.estMinutes, dueTime: t.dueTime, itemId: t.itemId, roomId: t.roomId,
      subtasks: (t.subtasks || []).map(s => ({ ...s, done: false })), dueOn: nextRepeatDate(t) });
    putTask(next);
  }
  if (t.projectId) afterProjectStep(t.projectId);
  if (isGenerated(t)) regenSoon();
  if (!quiet) toast(next ? `Done. Next one ${dueLabel(next).toLowerCase()}` : "Done", { label: "Undo", run: () => { putTask(before); if (next) delTask(next.id); } });
}
function claimTask(t) { putTask({ ...t, assigneeId: S.me.id, claimedAt: nowISO() }); toast("It's yours"); }

// ---------- Views ----------
function whoChipsHTML() {
  if (S.members.length < 2) return "";
  const others = S.members.filter(m => m.id !== S.me?.id);
  return `<div class="chips" role="group" aria-label="Whose tasks">${[["mine", "Mine & anyone's"], ["all", "Everyone's"], ...others.map(m => [m.id, m.name.split(" ")[0] + "'s"])]
    .map(([k, l]) => `<button class="chip" data-act="who" data-who="${esc(k)}" aria-pressed="${S.who === k}">${esc(l)}</button>`).join("")}</div>`;
}
function greeting() { const h = new Date().getHours(); return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }
function fairnessHTML() {
  if (S.members.length < 2) return "";
  const month = todayISO().slice(0, 7);
  const done = allTasks().filter(t => t.status === "done" && (t.doneAt || "").startsWith(month) && t.doneBy);
  if (!done.length) return "";
  const per = S.members.map(m => ({ m, n: done.filter(t => t.doneBy === m.id).length }));
  const tot = sum(per, x => x.n) || 1;
  return `<section class="section"><header><h2>This month together</h2><span class="eyebrow">${tot} tasks done</span></header>
    <div class="panel fair"><div class="fairbar" role="img" aria-label="${esc(per.map(x => x.m.name + " " + x.n).join(", "))}">${per.map(x => `<i style="width:${100 * x.n / tot}%;background:${esc(x.m.color || "#D9CCF5")}"></i>`).join("")}</div>
    <div class="fairkey">${per.map(x => `<span>${avatarHTML(x.m.id)} ${esc(x.m.name.split(" ")[0])} <b class="num">${x.n}</b></span>`).join("")}</div></div></section>`;
}
VIEWS.today = {
  shell: () => `<div id="view-today"><div class="hello"><span class="eyebrow">${esc(new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }))}</span><h2>${greeting()}${S.me ? ", " + esc(S.me.name.split(" ")[0]) : ""}</h2><div id="today-brief"></div></div>
    <div id="today-top"></div><div id="today-one"></div><div id="today-noticed"></div><div id="today-chances"></div><div id="today-areas"></div><div id="today-coach"></div>${quickAddHTML()}<div id="today-who"></div><div id="today-list"></div><div id="today-fridge"></div></div>`,
  live() {
    const el = $("#today-list"); if (!el) return;
    $("#today-who").innerHTML = "";
    $("#today-top").innerHTML = bellBannerHTML() + pushCardHTML();
    $("#today-brief").innerHTML = briefHTML();
    $("#today-one").innerHTML = oneThingHTML();
    $("#today-noticed").innerHTML = insightsHTML();
    $("#today-areas").innerHTML = areasHTML();
    $("#today-chances").innerHTML = chancesHTML();
    if (!$("#coach-form") || !$("#coach-text").value) $("#today-coach").innerHTML = coachHTML();
    if (!$("#note-form")) $("#today-fridge").innerHTML = fridgeHTML();
    const td = todayISO();
    const open = openTasks().filter(t => actionable(t) && whoMatch(t));
    const due = open.filter(t => t.dueOn && t.dueOn <= td).sort(taskSort);
    const doneToday = allTasks().filter(t => t.status === "done" && (t.doneAt || "").slice(0, 10) === td && whoMatch(t)).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
    // The plain list is still here for the days you want it, folded away.
    const wasOpen = $("#today-all")?.open;
    el.innerHTML = (due.length ? `<details class="section donebox" id="today-all" ${wasOpen ? "open" : ""}><summary><h2>Everything due today, as a list</h2><span class="eyebrow">${due.length}</span></summary>${whoChipsHTML()}${taskListHTML(due)}</details>` : "")
      + (doneToday.length ? `<details class="section donebox"><summary><h2>Done today</h2><span class="eyebrow">${doneToday.length}</span></summary>${taskListHTML(doneToday)}</details>` : "")
      + fairnessHTML();
  }
};
VIEWS.upcoming = {
  shell: () => `<div id="view-upcoming"><div class="hello"><h2>Upcoming</h2></div>${quickAddHTML("Plan something: dentist on 12 Nov 10:30, bins every tuesday")}<div id="up-who"></div><div id="up-list"></div></div>`,
  live() {
    const el = $("#up-list"); if (!el) return;
    $("#up-who").innerHTML = whoChipsHTML();
    const td = todayISO();
    const open = openTasks().filter(t => t.dueOn && t.dueOn > td && whoMatch(t)).sort(taskSort);
    const days = [];
    for (let i = 1; i <= 14; i++) { const d = addDays(td, i); const list = open.filter(t => t.dueOn === d); if (i <= 7 || list.length) days.push([d, list]); }
    const later = open.filter(t => t.dueOn > addDays(td, 14));
    const months = new Map(); for (const t of later) { const k = t.dueOn.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k).push(t); }
    el.innerHTML = days.map(([d, list]) => `<section class="day ${list.length ? "" : "empty-day"}"><header><h3>${esc(d === addDays(td, 1) ? "Tomorrow" : new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" }))}</h3><span class="muted">${esc(fmtShort(d))}</span><button class="link" data-act="task-new" data-due="${d}" aria-label="Add a task on ${esc(fmtShort(d))}">+</button></header>${list.length ? taskListHTML(list, { noDate: true }) : ""}</section>`).join("")
      + [...months].map(([k, list]) => `<section class="section"><header><h2>${esc(new Date(k + "-01T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" }))}</h2></header>${taskListHTML(list)}</section>`).join("");
  }
};
function listCounts() {
  const o = openTasks(), c = { inbox: 0, house: 0, projects: 0 };
  for (const t of o) {
    if (t.projectId) c.projects++;
    else if (isGenerated(t)) { if (visibleNow(t)) c.house++; }
    else if (t.listId && S.lists.has(t.listId)) c[t.listId] = (c[t.listId] || 0) + 1;
    else c.inbox++;
  }
  return c;
}
VIEWS.lists = {
  shell: () => `<div id="view-lists"><div class="lists-layout"><nav class="listnav" id="listnav" aria-label="Lists"></nav><div><div id="list-head"></div>${quickAddHTML("Add to this list")}<div id="list-body"></div></div></div></div>`,
  live() {
    const nav = $("#listnav"); if (!nav) return;
    const c = listCounts();
    const items = [["inbox", "Inbox"], ...listList().map(l => [l.id, l.name]), ["themes", "By theme"], ["house", "House jobs"], ["projects", "Project steps"], ["done", "Done"]];
    if (!items.some(([k]) => k === S.listView)) S.listView = "inbox";
    nav.innerHTML = items.map(([k, l]) => `<button class="listbtn" data-act="list-view" data-list="${esc(k)}" aria-current="${S.listView === k}"><span>${esc(l)}</span>${c[k] ? `<span class="muted num">${c[k]}</span>` : ""}</button>`).join("")
      + `<button class="listbtn add" data-act="list-new">+ New list</button>`;
    const lv = S.listView, l = S.lists.get(lv);
    const title = l ? l.name : { themes: "By theme", inbox: "Inbox", house: "House jobs", projects: "Project steps", done: "Done" }[lv];
    const sub = { themes: "Everything open, grouped by what it's about: projects, rooms, house jobs, and shared words.", inbox: "Tasks without a list.", house: "Made for you from Upkeep, bills, papers and warranties. Finish them here and the house keeps its records.", projects: "Steps from your projects, in order. Greyed steps wait on an earlier one.", done: "Finished in the last 30 days." }[lv] || "";
    $("#list-head").innerHTML = `<div class="hello list-hello"><div><h2>${esc(title)}</h2>${sub ? `<p class="muted">${esc(sub)}</p>` : ""}</div>${l ? `<button class="btn small" data-act="list-edit" data-list="${esc(l.id)}">Edit list</button>` : ""}</div>`;
    $("#qt-form").hidden = ["house", "done", "projects", "themes"].includes(lv);
    if (lv === "themes") { $("#list-body").innerHTML = themesBodyHTML(); return; }
    let list;
    if (lv === "done") list = allTasks().filter(t => t.status === "done" && daysSince(t.doneAt) <= 30).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
    else if (lv === "house") list = openTasks().filter(t => isGenerated(t) && !t.projectId && visibleNow(t)).sort(taskSort);
    else if (lv === "projects") {
      const body = [...S.projects.values()].filter(p => !["done", "abandoned"].includes(p.status)).map(p => { const st = projectSteps(p.id).filter(t => t.status === "open"); return st.length ? `<section class="group"><header><h3>${esc(p.title)}</h3><button class="link" data-act="proj-edit" data-id="${esc(p.id)}">Open project</button></header>${taskListHTML(st)}</section>` : ""; }).join("");
      $("#list-body").innerHTML = body || emptyHTML("No open project steps", "Add steps to a project under House, Projects, and they show up here and in Today when they are due.");
      return;
    }
    else list = openTasks().filter(t => !isGenerated(t) && !t.projectId && (lv === "inbox" ? !(t.listId && S.lists.has(t.listId)) : t.listId === lv)).sort(taskSort);
    const doneHere = l || lv === "inbox" ? allTasks().filter(t => t.status === "done" && !t.projectId && !isGenerated(t) && (lv === "inbox" ? !(t.listId && S.lists.has(t.listId)) : t.listId === lv) && daysSince(t.doneAt) <= 7) : [];
    $("#list-body").innerHTML = (list.length ? taskListHTML(list) : emptyHTML(lv === "house" ? "Nothing from the house right now" : "Nothing here", lv === "house" ? "Care jobs, bills, contract deadlines and expiring papers appear here a few days ahead." : "Type above to add a task. Try “#" + (l ? l.name : "groceries") + "” in any quick add to file it here."))
      + (doneHere.length ? `<details class="section donebox"><summary><h2>Done this week</h2><span class="eyebrow">${doneHere.length}</span></summary>${taskListHTML(doneHere)}</details>` : "");
  }
};
function openList(l) {
  const isNew = !l;
  formSheet({ title: isNew ? "New list" : "Edit list", fields: [{ k: "name", label: "Name", full: true, ph: "Groceries, Garden, Admin" }], data: l || {}, del: !isNew,
    onSave(d) { if (!d.name) return toast("Name the list."); if (isNew) { d.id = newId("l"); d.order = S.lists.size + 1; } store.put("lists", d); S.listView = d.id; closeSheet(); setTab("lists"); },
    delRun(d) { for (const t of openTasks().filter(t => t.listId === d.id)) putTask({ ...t, listId: undefined }); store.del("lists", d.id); S.listView = "inbox"; } });
  if (!isNew) $("#g-del").insertAdjacentHTML("beforebegin", `<p class="muted" style="margin:0;font-size:14px">Deleting the list moves its open tasks to the Inbox.</p>`);
}

// ---------- Task sheet ----------
let TS = null;
const REPEAT_OPTS = [["", "Does not repeat"], ["1day", "Every day"], ["1week", "Every week"], ["2week", "Every 2 weeks"], ["1month", "Every month"], ["3month", "Every 3 months"], ["6month", "Every 6 months"], ["1year", "Every year"], ["custom", "Custom…"]];
function subRowHTML(s) { return `<div class="subrow"><input type="checkbox" class="s-done" ${s.done ? "checked" : ""} aria-label="Done"><input type="text" class="s-title" value="${esc(s.title)}" placeholder="Step"><input type="hidden" class="s-id" value="${esc(s.id || newId("s"))}"><button type="button" class="link" data-act="ts-sub-del" aria-label="Remove step">Remove</button></div>`; }
function sourceNote(t) {
  if (!isGenerated(t)) return "";
  const m = {
    care: () => { const p = S.plans.get(t.sourceRef); return p ? [`From Upkeep. Ticking it off logs the job in the care history and schedules the next one.`, "up-edit", "Open the care plan"] : null; },
    money: () => { const c = S.charges.get(t.sourceRef); return c ? [t.sourceType === "pay" ? "From your bills. Ticking it off records the payment and moves the bill to its next date." : t.sourceType === "contract" ? "From your contracts. Ticking it off asks whether you renewed, switched or cancelled." : "From your subscriptions. Ticking it off asks whether you still use it.", "charge-edit", "Open the bill"] : null; },
    papers: () => S.docs.get(t.sourceRef) ? ["From your papers. Upload the renewed document and set its new expiry date.", "doc-edit", "Open the document"] : null,
    inventory: () => { const id = String(t.sourceRef).replace(/^(useby|life):/, ""); return S.items.get(id) ? [t.sourceType === "useby" ? "From Expiring. Ticking it off asks whether you used it, threw it out or bought fresh." : t.sourceType === "lifespan" ? "From Expiring: this has reached the end of its life. Ticking it off restarts the clock." : "From the inventory. Try everything now, while the warranty still covers it.", "edit", "Open the item"].concat([id]) : null; },
    expiry: () => S.expiries.get(t.sourceRef) ? ["From Expiring. Ticking it off asks whether you used or renewed it.", "xp-open-ref", "Open it"] : null
  }[t.source];
  const r = m && m();
  return r ? `<div class="ai-note src-note"><span>${esc(r[0])}</span><button type="button" class="btn small" data-act="${r[1]}" data-id="${esc(r[3] || t.sourceRef)}">${esc(r[2])}</button></div>` : "";
}
function openTask(t, prefill = {}) {
  const isNew = !t;
  const d = t ? structuredClone(t) : newTask({ listId: S.tab === "lists" && S.lists.has(S.listView) ? S.listView : undefined, ...prefill });
  TS = { d, isNew };
  const gen = isGenerated(d);
  const rk = d.repeat && d.repeat.every ? `${d.repeat.every}${d.repeat.unit}` : "";
  const rKnown = REPEAT_OPTS.some(([k]) => k === rk);
  const mine = !d.createdBy || d.createdBy === S.me?.id;
  const it = d.itemId && S.items.get(d.itemId);
  openSheet(isNew ? "New task" : gen ? (SOURCE_LABEL[d.source] || "Task") : "Task", `
    <form id="ts-form" style="display:grid;gap:16px" autocomplete="off">
      ${sourceNote(d)}
      <label class="f">What needs doing<input type="text" id="ts-title" required value="${esc(d.title)}" placeholder="Call the plumber"></label>
      <div class="fields">
        <label class="f">Date<input type="date" id="ts-due" value="${esc(d.dueOn)}"></label>
        <label class="f">Time<input type="time" id="ts-time" value="${esc(d.dueTime)}"></label>
        ${S.members.length > 1 ? `<label class="f">Who<select id="ts-who">${memberOpts().map(([v, l]) => `<option value="${esc(v)}" ${String(d.assigneeId || "") === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>` : ""}
        <label class="f">Priority<select id="ts-pri">${PRIORITY.map(([v, l]) => `<option value="${v}" ${(d.priority || 0) === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        ${gen ? "" : `<label class="f">List<select id="ts-list"><option value="">Inbox</option>${listList().map(l => `<option value="${esc(l.id)}" ${d.listId === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select></label>
        <label class="f">Repeat<select id="ts-rep">${REPEAT_OPTS.map(([k, l]) => `<option value="${k}" ${(rKnown ? rk : "custom") === k && (rk || k === "") ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <div class="fields three full" id="ts-rep-custom" ${rk && !rKnown ? "" : "hidden"}><label class="f">Every<input type="number" id="ts-rep-n" min="1" value="${esc(d.repeat?.every || 2)}"></label><label class="f">Unit<select id="ts-rep-u">${["day", "week", "month", "year"].map(u => `<option value="${u}" ${d.repeat?.unit === u ? "selected" : ""}>${u}s</option>`).join("")}</select></label>
          <label class="f">Counted from<select id="ts-rep-from"><option value="due">the due date</option><option value="done" ${d.repeat?.from === "done" ? "selected" : ""}>when it is done</option></select></label></div>
        <label class="f">Project<select id="ts-proj"><option value="">None</option>${[...S.projects.values()].filter(p => !["done", "abandoned"].includes(p.status) || p.id === d.projectId).map(p => `<option value="${esc(p.id)}" ${d.projectId === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select></label>`}
        <label class="f">Minutes it takes<input type="number" id="ts-min" min="0" value="${esc(d.estMinutes)}" placeholder="optional"></label>
      </div>
      ${S.ai && !isNew && d.status === "open" ? `<div><button type="button" class="btn small" data-act="coach-task" data-id="${esc(d.id)}">Help me plan this</button></div>` : ""}
      <label class="f">Notes<textarea id="ts-notes" rows="3" placeholder="Details, phone numbers, links">${esc(d.notes)}</textarea></label>
      <fieldset><legend class="eyebrow">Steps</legend><div id="ts-subs" style="display:grid;gap:6px">${(d.subtasks || []).map(subRowHTML).join("")}</div><div><button type="button" class="btn small" data-act="ts-sub-add">Add a step</button></div></fieldset>
      ${it ? `<div class="actions"><span class="muted">About</span><button type="button" class="link" data-act="edit" data-id="${esc(it.id)}">${esc(it.name)}</button></div>` : ""}
      ${!gen && S.members.length > 1 && mine ? `<label class="check"><input type="checkbox" id="ts-private" ${d.visibility === "private" ? "checked" : ""}> Private: only I can see this task</label>` : ""}
      ${!isNew && S.members.length > 1 ? `<p class="muted" style="margin:0;font-size:13px">${d.createdBy ? "Added by " + esc(memberName(d.createdBy)) : "Added by Laventina"}${d.status === "done" && d.doneBy ? " · done by " + esc(memberName(d.doneBy)) + " " + esc(fmtDate(d.doneAt)) : ""}</p>` : ""}
      <div id="ts-del"></div>
      <div class="actions" style="justify-content:space-between">
        <div class="actions">${isNew ? "" : gen ? `<button type="button" class="btn" data-act="ts-skip">Skip this time</button>${d.source === "care" ? `<button type="button" class="btn danger" data-act="ts-unneeded">We don't need this</button>` : ""}` : `<button type="button" class="btn danger" data-act="ts-delete">Delete</button>`}</div>
        <div class="actions">${!isNew && d.status === "open" ? `<button type="button" class="btn" data-act="ts-done">Mark done</button>` : ""}<button type="submit" class="btn primary">Save</button></div>
      </div>
    </form>`);
}
function readTask() {
  const d = TS.d, v = id => ($("#" + id)?.value ?? "").trim();
  const due = v("ts-due") || undefined;
  if (isGenerated(d) && TS.isNew === false && due !== S.tasks.get(d.id)?.dueOn) d.extra = { ...(d.extra || {}), movedDue: true };
  const prev = !TS.isNew && S.tasks.get(d.id);
  if (prev && prev.dueOn && due && due > prev.dueOn) d.extra = { ...(d.extra || {}), postponed: (d.extra?.postponed || 0) + 1 };
  Object.assign(d, { title: v("ts-title"), dueOn: due, dueTime: v("ts-time") || undefined, priority: Number(v("ts-pri")) || 0, notes: v("ts-notes") || undefined, estMinutes: Number(v("ts-min")) || undefined });
  if ($("#ts-who")) d.assigneeId = v("ts-who") || undefined;
  if ($("#ts-list")) d.listId = v("ts-list") || undefined;
  if ($("#ts-proj")) {
    const pid = v("ts-proj") || undefined;
    if (pid !== d.projectId) { d.projectId = pid; if (pid) d.sortOrder = Math.max(0, ...projectSteps(pid).map(s => s.sortOrder ?? 0)) + 1; }
  }
  if ($("#ts-rep")) {
    const r = v("ts-rep");
    if (!r) d.repeat = undefined;
    else if (r === "custom") d.repeat = { every: Math.max(1, Number(v("ts-rep-n")) || 1), unit: v("ts-rep-u"), from: v("ts-rep-from") };
    else { const m = r.match(/^(\d+)(\w+)$/); d.repeat = { every: Number(m[1]), unit: m[2], from: d.repeat?.from }; }
    if (d.repeat && !d.dueOn) d.dueOn = todayISO();
  }
  if ($("#ts-private")) d.visibility = $("#ts-private").checked ? "private" : "shared";
  d.subtasks = [...document.querySelectorAll("#ts-subs .subrow")].map(r => ({ id: r.querySelector(".s-id").value, title: r.querySelector(".s-title").value.trim(), done: r.querySelector(".s-done").checked })).filter(s => s.title);
  if (!d.subtasks.length) d.subtasks = undefined;
  return d;
}
function saveTask() {
  const d = readTask();
  if (!d.title) { $("#ts-title").focus(); toast("Give the task a name."); return; }
  putTask(d); closeSheet();
  if (d.projectId) afterProjectStep(d.projectId);
  toast(TS.isNew ? "Added" : "Saved");
}
function skipGenerated(t, unneeded) {
  if (t.source === "care") {
    const p = S.plans.get(t.sourceRef);
    if (p) {
      if (unneeded) store.put("plans", { ...p, active: false });
      else { const tp = TPL[p.templateKey]; store.put("plans", { ...p, nextDue: tp && tp.season ? nextSeason(tp.season) : addDays(todayISO(), p.intervalDays || 90) }); store.put("ulog", { id: newId("l"), planId: p.id, itemId: p.itemId, title: p.title, doneOn: todayISO(), skipped: true, doneBy: S.me?.id, createdAt: nowISO() }); }
    }
  }
  delTask(t.id); regenSoon();
}

"use strict";
// ---------- Home: the day organised by what it means, not by which list a task sits in ----------
// Areas of home life, the one thing that matters most, and opportunities (coupons, refunds, discounts)
// with a ledger of what we caught and what we missed, so each loss turns into a safeguard.

const AREAS = [
  { k: "projects", name: "Projects", hint: "Bigger jobs, step by step", test: t => !!t.projectId },
  { k: "money", name: "Money & savings", hint: "Bills, contracts, coupons", test: t => t.source === "money", words: /\b(pay|bill|bank|tax|insur|invoice|refund|cashback|coupon|voucher|discount|budget|save|savings|subscription|transfer|loan|rent)\w*/i },
  { k: "food", name: "Food & shopping", hint: "Groceries, meals, stock", words: /\b(grocer|shop|buy|supermarket|carrefour|mercadona|lidl|aldi|food|cook|dinner|lunch|breakfast|meal|fridge|milk|bread|market|recipe|order)\w*/i },
  { k: "papers", name: "Papers & appointments", hint: "Documents, renewals, dates", test: t => t.source === "papers", words: /\b(passport|licen[cs]e|renew|form|document|letter|appointment|doctor|dentist|vet|school|register|sign|certificate|visa)\w*/i },
  { k: "care", name: "Home care", hint: "Upkeep, cleaning, repairs", test: t => t.source === "care" || t.source === "inventory" || !!t.roomId || !!t.itemId, words: /\b(clean|fix|repair|filter|paint|water|garden|plant|laundry|wash|vacuum|bins?|tidy|dust|mop|leak|bulb|battery|boiler|heater)\w*/i },
  { k: "people", name: "Us & people", hint: "Family, friends, together", words: /\b(call|birthday|gift|friend|mum|mom|dad|family|visit|invite|party|date|kids?|grandm|grandp)\w*/i },
  { k: "everyday", name: "Everything else", hint: "The rest of life" }
];
function areaOf(t) {
  for (const a of AREAS) if (a.test && a.test(t)) return a.k;
  const text = `${t.title} ${(t.tags || []).join(" ")} ${t.listId && S.lists.get(t.listId)?.name || ""}`;
  for (const a of AREAS) if (a.words && a.words.test(text)) return a.k;
  return "everyday";
}
const CHANCE_KINDS = [["coupon", "Coupon or voucher"], ["discount", "Discount or sale"], ["refund", "Refund or return"], ["cashback", "Cashback or points"], ["claim", "Claim (warranty, insurance)"], ["other", "Other"]];
const chanceArea = c => ["coupon", "discount"].includes(c.kind) && /carrefour|mercadona|lidl|aldi|supermarket|grocer|food/i.test(`${c.store} ${c.title}`) ? "food" : "money";
const openChances = () => [...S.chances.values()].filter(c => c.status === "open");
const chanceDays = c => c.expiresOn ? daysUntil(c.expiresOn) : null;
// For the Expiring inbox (other thread): coupons and the like with an end date.
function chancesExpiring(days = 30) {
  return openChances().filter(c => c.expiresOn && chanceDays(c) <= days).map(c => ({ id: c.id, title: c.title, date: c.expiresOn, value: c.value, kind: c.kind }));
}

// ---------- The one thing ----------
function oneThing() {
  const td = todayISO();
  const cands = openTasks().filter(t => actionable(t) && mineOrAnyone(t) && (t.dueOn ? t.dueOn <= addDays(td, 2) : (t.priority || 0) >= 2));
  const score = t => {
    const ch = t.extra?.chanceId && S.chances.get(t.extra.chanceId);
    const late = t.dueOn && t.dueOn < td ? Math.min(7, -daysUntil(t.dueOn)) : 0;
    return (t.priority || 0) * 3 + late + (t.dueOn === td ? 3 : 0) + (ch ? 4 + (Number(ch.value) || 0) / 3 : 0) + Math.min(3, t.extra?.postponed || 0) + (isGenerated(t) && t.source === "money" ? 2 : 0);
  };
  return cands.sort((a, b) => score(b) - score(a) || taskSort(a, b))[0] || null;
}
function oneThingHTML() {
  const t = oneThing(); if (!t) return "";
  const ch = t.extra?.chanceId && S.chances.get(t.extra.chanceId);
  const why = ch ? `${money(ch.value)} on the table${ch.expiresOn ? `, ${chanceDays(ch) <= 0 ? "last day" : plural(chanceDays(ch), "day") + " left"}` : ""}.`
    : t.dueOn && t.dueOn < todayISO() ? `It's been waiting ${plural(-daysUntil(t.dueOn), "day")}. Clearing it makes room for everything else.`
    : (t.priority || 0) >= 2 ? "Marked important." : t.dueOn === todayISO() ? "Due today." : "Coming up soon, and getting it done early keeps the week calm.";
  return `<section class="one-thing"><span class="eyebrow">If you do one thing</span><h3>${esc(t.title)}</h3><p class="muted">${esc(why)}</p>
    <div class="actions" style="justify-content:flex-start"><button class="btn primary" data-act="task-toggle" data-id="${esc(t.id)}">Done</button><button class="btn" data-act="one-later" data-id="${esc(t.id)}">Not today</button>
    ${S.ai ? `<button class="btn" data-act="coach-task" data-id="${esc(t.id)}">Help me start</button>` : ""}</div></section>`;
}

// ---------- Areas ----------
function areaStats() {
  const td = todayISO(), map = Object.fromEntries(AREAS.map(a => [a.k, { a, open: [], late: 0, today: 0, chances: [], atStake: 0, doneWeek: 0 }]));
  for (const t of openTasks().filter(t => visibleNow(t) && whoMatch(t))) {
    const s = map[areaOf(t)]; s.open.push(t);
    if (t.dueOn && t.dueOn < td) s.late++; if (t.dueOn === td) s.today++;
  }
  for (const c of openChances()) { const s = map[chanceArea(c)]; s.chances.push(c); s.atStake += Number(c.value) || 0; }
  for (const t of allTasks().filter(t => t.status === "done" && daysSince(t.doneAt) <= 7)) map[areaOf(t)].doneWeek++;
  return AREAS.map(a => map[a.k]).filter(s => s.open.length || s.chances.length || s.doneWeek);
}
function areaState(s) {
  const urgentChance = s.chances.some(c => c.expiresOn && chanceDays(c) <= 3);
  if (urgentChance || s.open.some(t => t.dueOn && t.dueOn < todayISO() && (t.priority || 0) >= 2) || s.late >= 3) return ["risk", "Needs care"];
  if (s.late || s.today) return ["now", "Needs you today"];
  return s.open.length ? ["calm", "Calm"] : ["calm", "All clear"];
}
function areasHTML() {
  const list = areaStats(); if (!list.length) return "";
  return `<section class="section"><header><h2>Your home, by what matters</h2></header><div class="areas">${list.map(s => {
    const [cls, label] = areaState(s);
    const next = s.open.filter(actionable).sort(taskSort)[0];
    return `<article class="area st-${cls}"><button class="area-main" data-act="area-open" data-id="${s.a.k}">
      <span class="area-top"><b>${esc(s.a.name)}</b><span class="state"><i aria-hidden="true"></i>${esc(label)}</span></span>
      <span class="muted">${[s.open.length ? plural(s.open.length, "open thing") : "", s.atStake ? money(s.atStake) + " to catch" : "", s.doneWeek ? s.doneWeek + " done this week" : ""].filter(Boolean).join(" · ") || esc(s.a.hint)}</span></button>
      ${next ? `<div class="area-next"><button class="tick" data-act="task-toggle" data-id="${esc(next.id)}" aria-label="Complete: ${esc(next.title)}"><span aria-hidden="true"></span></button><button class="link" data-act="task-open" data-id="${esc(next.id)}">${esc(next.title)}</button>${next.dueOn ? `<span class="due ${next.dueOn < todayISO() ? "late" : ""}">${esc(dueLabel(next))}</span>` : ""}</div>` : ""}</article>`;
  }).join("")}</div></section>`;
}
function openArea(k) {
  const s = areaStats().find(x => x.a.k === k) || { a: AREAS.find(a => a.k === k), open: [], chances: [] };
  openSheet(s.a.name, `<div style="display:grid;gap:14px">
    ${s.chances.length ? `<div class="chances">${s.chances.map(chanceCardHTML).join("")}</div>` : ""}
    ${s.open.length ? taskListHTML(s.open.sort(taskSort)) : `<p class="muted">Nothing open here.</p>`}
    <div class="actions" style="justify-content:flex-start"><button class="btn small" data-act="task-new">New task</button>${k === "money" || k === "food" ? `<button class="btn small" data-act="chance-new">Catch an opportunity</button>` : ""}
    ${S.ai && s.open.length ? `<button class="btn small" data-act="coach-problem" data-id="${esc(`Look at our ${s.a.name.toLowerCase()} and give me a calm plan: what matters, what to drop, what to do first. Open tasks: ${s.open.slice(0, 20).map(t => t.title).join("; ")}`)}">Make a plan for this</button>` : ""}</div></div>`);
}

// ---------- Opportunities and the ledger ----------
function chanceCardHTML(c) {
  const d = chanceDays(c);
  const left = c.expiresOn ? (d < 0 ? "expired" : d === 0 ? "last day" : plural(d, "day") + " left") : "no end date";
  return `<button class="chance ${d != null && d <= 3 ? "soon" : ""}" data-act="chance-open" data-id="${esc(c.id)}"><b class="num">${money(c.value, { cents: true })}</b>
    <span><span class="chance-title">${esc(c.title)}</span><span class="muted">${c.minSpend ? "on " + money(c.minSpend) + " · " : ""}${esc(c.store || "")}${c.store ? " · " : ""}${esc(left)}</span></span></button>`;
}
function chancesHTML() {
  const open = openChances().sort((a, b) => (a.expiresOn || "9999").localeCompare(b.expiresOn || "9999"));
  const due = open.filter(c => c.expiresOn && chanceDays(c) < 0);
  const ledgerEmpty = !S.chances.size;
  const seedHidden = (lsGet("laventina-seed-coupon") || "") === "hide";
  return `<section class="section"><header><h2>Money on the table</h2><button class="link" data-act="chance-new">+ Catch one</button></header>
    ${due.map(c => `<div class="panel ask-outcome"><b>Did you use “${esc(c.title)}”?</b><span class="muted">It ended ${esc(fmtShort(c.expiresOn))}.</span>
      <div class="actions" style="justify-content:flex-start"><button class="btn small primary" data-act="chance-caught" data-id="${esc(c.id)}">Yes, used it</button><button class="btn small" data-act="chance-missed" data-id="${esc(c.id)}">No, missed it</button></div></div>`).join("")}
    ${open.filter(c => !due.includes(c)).length ? `<div class="chances">${open.filter(c => !due.includes(c)).map(chanceCardHTML).join("")}</div>` : ""}
    ${ledgerEmpty && !seedHidden ? `<div class="panel seed"><b>Start the ledger with the one that got away</b><span class="muted">The €7 Carrefour coupon on a €35 shop. Logged, it becomes the first stepping stone: Laventina learns why it slipped and puts a safeguard in place.</span>
      <div class="actions" style="justify-content:flex-start"><button class="btn small primary" data-act="chance-seed">Log the lost €7 coupon</button><button class="btn small" data-act="chance-seed-hide">Not mine</button></div></div>`
    : !open.length ? `<p class="muted" style="margin:0">Got a coupon, refund or discount with an end date? Catch it here and Laventina makes sure you use it.</p>` : ""}</section>`;
}
function openChance(c, prefill = {}) {
  const isNew = !c; const d = c ? { ...c } : { kind: "coupon", ...prefill };
  openSheet(isNew ? "Catch an opportunity" : d.title, `<form id="chance-form" style="display:grid;gap:14px" data-id="${esc(d.id || "")}">
    <label class="f">What is it<input type="text" id="ch-title" required value="${esc(d.title)}" placeholder="€7 off at Carrefour"></label>
    <div class="fields">
      <label class="f">Kind<select id="ch-kind">${CHANCE_KINDS.map(([k, l]) => `<option value="${k}" ${d.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="f">Worth<input type="number" id="ch-value" min="0" step="0.01" value="${esc(d.value)}" placeholder="7"></label>
      <label class="f">If you spend at least <span class="hint">optional</span><input type="number" id="ch-min" min="0" step="0.01" value="${esc(d.minSpend)}" placeholder="35"></label>
      <label class="f">Where<input type="text" id="ch-store" value="${esc(d.store)}" placeholder="Carrefour"></label>
      <label class="f">Ends on<input type="date" id="ch-exp" value="${esc(d.expiresOn)}"></label>
    </div>
    <label class="f">Notes<textarea id="ch-notes" rows="2" placeholder="Code, where the coupon is, what to buy">${esc(d.notes)}</textarea></label>
    ${!isNew && d.status !== "open" ? `<div class="ai-note">${d.status === "caught" ? "Caught" : "Missed"}${d.outcomeAt ? " · " + esc(fmtDate(d.outcomeAt)) : ""}${d.cause ? " · " + esc(d.cause) : ""}${d.lesson ? `<br>${esc(d.lesson)}` : ""}</div>` : ""}
    <div class="actions" style="justify-content:space-between"><div class="actions">${!isNew ? `<button type="button" class="btn danger" data-act="chance-del" data-id="${esc(d.id)}">Delete</button>` : ""}
      ${!isNew && d.status === "open" ? `<button type="button" class="btn" data-act="chance-missed" data-id="${esc(d.id)}">Missed it</button><button type="button" class="btn" data-act="chance-caught" data-id="${esc(d.id)}">Used it</button>` : ""}</div>
      <button type="submit" class="btn primary">${isNew ? "Catch it" : "Save"}</button></div></form>`);
}
function saveChance() {
  const f = $("#chance-form"), v = id => $("#" + id).value.trim(), n = id => { const x = parseFloat(v(id).replace(",", ".")); return isFinite(x) ? x : undefined; };
  const old = f.dataset.id && S.chances.get(f.dataset.id);
  const c = { ...(old || { id: newId("c"), status: "open", createdAt: nowISO() }), title: v("ch-title"), kind: v("ch-kind"), value: n("ch-value"), minSpend: n("ch-min"), store: v("ch-store") || undefined, expiresOn: v("ch-exp") || undefined, notes: v("ch-notes") || undefined };
  if (!c.title) return toast("Say what it is first.");
  // Each open opportunity has a task, so it shows up in the day and gets its reminders.
  if (c.status === "open") {
    const t = c.taskId && S.tasks.get(c.taskId);
    const td = todayISO(), due = c.expiresOn ? (addDays(c.expiresOn, -2) >= td ? addDays(c.expiresOn, -2) : c.expiresOn < td ? td : c.expiresOn) : undefined;
    const title = `Use: ${c.title}${c.minSpend ? ` (spend ${money(c.minSpend)})` : ""}${c.store && !c.title.toLowerCase().includes(c.store.toLowerCase()) ? " at " + c.store : ""}`;
    const task = t ? { ...t, title, dueOn: due } : newTask({ title, dueOn: due, priority: 1, tags: ["opportunity"], notes: c.notes });
    task.extra = { ...(task.extra || {}), chanceId: c.id };
    c.taskId = task.id;
    putTask(task);
  }
  store.put("chances", c);
  closeSheet();
  toast(old ? "Saved" : `Caught. It's on your list${c.expiresOn ? " two days before it ends" : ""}.`);
}
function chanceCaught(id, fromTask) {
  const c = S.chances.get(id); if (!c || c.status !== "open") return;
  store.put("chances", { ...c, status: "caught", outcomeAt: nowISO(), by: S.me?.id });
  if (!fromTask && c.taskId && S.tasks.get(c.taskId)?.status === "open") putTask({ ...S.tasks.get(c.taskId), status: "done", doneAt: nowISO(), doneBy: S.me?.id });
  closeSheet();
  toast(`${money(c.value, { cents: true })} caught 🌿`);
}
// Why it slipped, and what would catch it next time. The safeguard becomes a real task.
const CAUSES = [
  ["forgot", "Forgot I had it", "Keep every coupon in Laventina the day you get it, and check “Money on the table” before you shop.", { title: "Before shopping: check Money on the table", repeat: { every: 1, unit: "week" } }],
  ["date", "Didn't see the end date", "Set the end date when you catch it: Laventina then puts it in your day two days before.", { title: "Add end dates to coupons and offers", repeat: null }],
  ["spend", "Couldn't reach the minimum spend", "Plan one bigger shop around the coupon instead of several small ones.", { title: "Plan one bigger grocery shop this week", repeat: { every: 1, unit: "week" } }],
  ["away", "Wasn't near the shop", "Pin it to a trip you already make, or pass it to someone who goes there.", { title: "Match coupons to shops we already pass", repeat: null }],
  ["notworth", "Wasn't worth it", "That's fine: only catch the ones worth your time.", null],
  ["unwatched", "Wasn't watching the costs", "Things that run on their own need a quick look now and then: a weekly glance catches a runaway early.", { title: "Glance at Netlify usage: credits left, anything unusual", repeat: { every: 1, unit: "week" } }],
  ["external", "Beyond my control", "No guilt: it still counts in the ledger, so the system can guard against it.", null]
];
function openMissed(id) {
  const c = S.chances.get(id); if (!c) return;
  openSheet("What got in the way?", `<form id="missed-form" data-id="${esc(id)}" style="display:grid;gap:14px">
    <p class="muted" style="margin:0">${esc(c.title)}: ${money(c.value, { cents: true })}${c.minSpend ? ` on a ${money(c.minSpend)} shop` : ""}. No blame, just the cause, so the system can catch it next time.</p>
    <div class="causes-pick">${CAUSES.map(([k, l], i) => `<label class="check"><input type="radio" name="cause" value="${k}" ${i === 0 ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div>
    <label class="f">Anything else <span class="hint">optional</span><input type="text" id="ms-note" placeholder="It was in my wallet the whole time"></label>
    <label class="check"><input type="checkbox" id="ms-guard" checked> Add the safeguard as a task</label>
    <div class="actions" style="justify-content:flex-end"><button type="submit" class="btn primary">Log it</button></div></form>`);
}
function saveMissed() {
  const f = $("#missed-form"), c = S.chances.get(f.dataset.id); if (!c) return;
  const k = (f.querySelector('input[name="cause"]:checked') || {}).value || "forgot";
  const [, label, lesson, guard] = CAUSES.find(x => x[0] === k);
  let guardId;
  if (guard && $("#ms-guard").checked) {
    const exists = openTasks().find(t => t.title === guard.title);
    if (exists) guardId = exists.id;
    else { const t = newTask({ title: guard.title, dueOn: addDays(todayISO(), 1), repeat: guard.repeat || undefined, tags: ["safeguard"], notes: `Added after missing: ${c.title}. ${lesson}` }); putTask(t); guardId = t.id; }
  }
  store.put("chances", { ...c, status: "missed", outcomeAt: nowISO(), cause: label, causeKey: k, lesson, note: $("#ms-note").value.trim() || undefined, safeguardTaskId: guardId, by: S.me?.id });
  const t = c.taskId && S.tasks.get(c.taskId); if (t && t.status === "open") putTask({ ...t, status: "skipped" });
  closeSheet();
  toast(guardId ? "Logged, and the safeguard is in place" : "Logged");
}
function ledgerStats() {
  const all = [...S.chances.values()];
  const caught = all.filter(c => c.status === "caught"), missed = all.filter(c => c.status === "missed"), open = openChances();
  const v = l => sum(l, c => Number(c.value) || 0);
  const causes = {}; for (const c of missed) causes[c.cause || "Unknown"] = (causes[c.cause || "Unknown"] || 0) + (Number(c.value) || 0);
  return { caught, missed, open, caughtV: v(caught), missedV: v(missed), openV: v(open), spend: sum(missed, c => Number(c.minSpend) || 0), causes,
    rate: caught.length + missed.length ? Math.round(100 * caught.length / (caught.length + missed.length)) : null };
}
function ledgerHTML() {
  const s = ledgerStats();
  if (!S.chances.size) return `<section class="section"><header><h2>Opportunities ledger</h2></header><p class="muted" style="margin:0">Coupons, refunds and discounts you catch or miss show up here, with what each miss taught the system.</p><div><button class="btn small" data-act="chance-new">Catch an opportunity</button></div></section>`;
  const entries = [...S.chances.values()].filter(c => c.status !== "open").sort((a, b) => (b.outcomeAt || "").localeCompare(a.outcomeAt || ""));
  return `<section class="section"><header><h2>Opportunities ledger</h2>${s.rate != null ? `<span class="eyebrow">${s.rate}% caught</span>` : ""}</header>
    <div class="stats">${[[money(s.caughtV, { cents: true }), "caught", "good"], [money(s.missedV, { cents: true }), "missed", s.missedV ? "bad" : ""], [money(s.openV, { cents: true }), "still on the table", ""]].map(([n, l, c]) => `<div class="stat ${c}"><b class="num">${n}</b><span>${l}</span></div>`).join("")}</div>
    ${entries.length ? `<ol class="stones">${entries.map((c, i) => `<li class="stone ${c.status}"><span class="eyebrow">${c.status === "missed" ? (i === entries.length - 1 ? "Stepping stone 1" : "Missed") : "Caught"} · ${esc(fmtShort(localDay(c.outcomeAt || c.createdAt)))}</span>
      <b>${esc(c.title)} · ${money(c.value, { cents: true })}${c.minSpend ? ` <span class="muted">on ${money(c.minSpend)}</span>` : ""}</b>
      ${c.status === "missed" ? `<span class="muted">Why: ${esc(c.cause || "not logged")}${c.note ? " · " + esc(c.note) : ""}</span><span>${esc(c.lesson || "")}</span>${c.safeguardTaskId && S.tasks.get(c.safeguardTaskId) ? `<button class="link" data-act="task-open" data-id="${esc(c.safeguardTaskId)}">Safeguard: ${esc(S.tasks.get(c.safeguardTaskId).title)}</button>` : ""}` : ""}</li>`).join("")}</ol>` : ""}
    ${Object.keys(s.causes).length > 1 ? `<p class="muted" style="margin:0">Most of what slipped: ${esc(Object.entries(s.causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${money(v, { cents: true })})`).join(", "))}.</p>` : ""}</section>`;
}

// ---------- Events ----------
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case "area-open": openArea(id); break;
    case "one-later": { const t = S.tasks.get(id); if (!t) break; const before = { ...t }; putTask({ ...t, dueOn: addDays(todayISO(), 1), extra: { ...(t.extra || {}), postponed: (t.extra?.postponed || 0) + 1 } }); toast("Moved to tomorrow", { label: "Undo", run: () => putTask(before) }); break; }
    case "chance-new": openChance(null); break;
    case "chance-open": openChance(S.chances.get(id)); break;
    case "chance-caught": chanceCaught(id); break;
    case "chance-missed": openMissed(id); break;
    case "chance-del": { const c = S.chances.get(id); if (c && c.taskId && S.tasks.get(c.taskId)?.status === "open") delTask(c.taskId); store.del("chances", id); closeSheet(); toast("Deleted"); break; }
    case "chance-seed": { const c = { id: newId("c"), title: "Carrefour coupon", kind: "coupon", value: 7, minSpend: 35, store: "Carrefour", status: "open", createdAt: nowISO() }; S.chances.set(c.id, c); openMissed(c.id); break; }
    case "chance-seed-hide": lsSet("laventina-seed-coupon", "hide"); refresh(); break;
  }
});
document.addEventListener("submit", e => {
  if (e.target.id === "chance-form") { e.preventDefault(); saveChance(); }
  if (e.target.id === "missed-form") { e.preventDefault(); saveMissed(); }
});

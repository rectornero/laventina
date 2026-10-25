"use strict";
// ---------- Expiring: one inbox for everything that runs out ----------
// The rules live in expiry-core.js (window.LavExpiry), shared with the server's task generator and the Monday push.
const XP = () => window.LavExpiry;
const STEPS = {
  passport: "Check the photo rules, book the appointment early (they fill up), and bring the old passport.",
  id_card: "Book the appointment, bring the old card and a recent photo.",
  licence: "Check whether you need a medical certificate first, then book the renewal.",
  policy: "Ask for this year's quote, compare two others, then renew or switch before the date.",
  contracts: "Compare two offers, then renegotiate, switch or cancel before the notice date. Loyalty rarely pays.",
  warranty: "Try every function now. If anything is off, claim while it is still covered: you need the receipt and the serial.",
  useby: "Plan a meal around it, freeze it, or give it away before the date.",
  medicine: "Take expired medicine back to a pharmacy, then buy fresh if you still need it.",
  lifespan: "Buy the replacement first, then swap and note today's date.",
  vehicle: "Book the inspection or renew the tax or insurance before the date: driving without it is costly."
};

function expiryEntries() {
  if (!XP()) return [];
  return XP().collect({ items: [...S.items.values()], documents: [...S.docs.values()], charges: [...S.charges.values()], expiries: [...S.expiries.values()], chances: S.chances ? [...S.chances.values()] : [], today: todayISO() });
}
const XS = { lane: "all", plan: "", planBusy: false };
const stateCls = e => e.state === "expired" ? "bad" : e.state === "now" ? "warn" : "";
function whenLabel(e) {
  if (e.lane === "contracts") return e.days < 0 ? "Notice date passed" : "Give notice " + relDays(e.days);
  if (e.days < 0) return (e.lane === "warranty" ? "Ended " : "Expired ") + relDays(e.days);
  if (e.days === 0) return e.lane === "coupons" ? "Last day today" : "Ends today";
  return (e.lane === "coupons" ? "Valid " : "Ends ") + relDays(e.days);
}
function lineFor(e) {
  const x = e.lane === "coupons" ? { store: e.store, value: e.value } : null;
  const what = { papers: "Paper", contracts: "Contract", warranty: "Warranty", useby: e.food ? "Food" : e.medicine ? "Medicine" : "Use-by", lifespan: "Lifespan", coupons: "Coupon", custom: (XP().CUSTOM_KINDS.find(k => k[0] === e.type) || [, "Other"])[1].split(":")[0] }[e.lane];
  return [what, x && x.store, x && x.value ? money(x.value, { cents: true }) : "", fmtDate(e.lane === "contracts" ? e.end : e.date)].filter(Boolean).join(" · ");
}
// Coupons live in the opportunities ledger (home.js), so they open its sheet.
const openAttrs = e => e.lane === "coupons" ? `data-act="chance-open" data-id="${esc(e.ref)}"` : `data-act="xp-open" data-key="${esc(e.key)}"`;
function entryHTML(e) {
  return `<li><button class="alert ${stateCls(e)}" ${openAttrs(e)}><span class="stripe"></span>
    <div><b>${esc(XP().verb(e))}: ${esc(e.title)}</b><span>${esc(lineFor(e))}</span></div><span class="pill ${stateCls(e)}">${esc(whenLabel(e))}</span></button></li>`;
}

// Proactive notes: patterns a person would miss in a flat list.
function insights(all) {
  const out = [];
  const st = S.expiry || {};
  const coupons = all.filter(e => e.lane === "coupons" && e.days >= 0);
  const atStake = sum(coupons, e => e.value || 0);
  if (atStake) out.push(`<b>${money(atStake, { cents: true })}</b> in coupons ends within the week${coupons[0] ? `, the first ${esc(relDays(coupons[0].days))}` : ""}. Take ${coupons.length === 1 ? "it" : "them"} on your next shop.`);
  const ids = all.filter(e => e.lane === "papers" && ["passport", "id_card", "licence"].includes(e.docType) && e.days < 400);
  if (ids.length > 1) out.push(`${ids.map(e => esc(e.title)).join(" and ")} all run out within a year: renew them together and save a trip.`);
  const byMonth = new Map();
  for (const e of all.filter(e => e.lane === "contracts" && e.days >= 0)) { const m = e.date.slice(0, 7); byMonth.set(m, [...(byMonth.get(m) || []), e]); }
  for (const [m, list] of byMonth) if (list.length > 1) out.push(`${list.length} contracts need notice in ${esc(new Date(m + "-01T00:00:00").toLocaleDateString(undefined, { month: "long" }))}: compare them in one sitting.`);
  const tossed = (st.lost || []).filter(x => x.lane === "useby" && daysSince(x.on + "T00:00:00") <= 60);
  if (tossed.length >= 3) out.push(`${tossed.length} food things went in the bin in the last two months. Smaller packs or a weekly "use it up" dinner would help.`);
  const noWarranty = activeItems().filter(i => SERIAL_GROUPS.has(catGroup(i.category)) && !i.warrantyUntil && i.purchaseDate && daysSince(i.purchaseDate + "T00:00:00") < 730);
  if (noWarranty.length) out.push(`${noWarranty.length} ${noWarranty.length === 1 ? "thing bought" : "things bought"} in the last two years ${noWarranty.length === 1 ? "has" : "have"} no warranty date, so you won't hear before cover ends: <button class="link" data-act="edit" data-id="${esc(noWarranty[0].id)}">start with ${esc(noWarranty[0].name)}</button>.`);
  const ids0 = [...S.docs.values()].filter(d => ["passport", "id_card", "licence", "policy"].includes(d.type) && !d.expiryDate);
  if (ids0.length) out.push(`${esc(ids0[0].title)} has no expiry date yet. <button class="link" data-act="doc-edit" data-id="${esc(ids0[0].id)}">Add it</button> and Laventina warns you in time.`);
  return out;
}

function expiryCount() { return expiryEntries().filter(e => XP().needsYou(e) && (e.visibility !== "private" || e.createdBy === S.me?.id)).length; }
// Butler-style lines: one short sentence per thing that needs someone, most urgent first. Other views can show these too.
function briefLine(e) {
  const when = e.days < 0 ? relDays(e.days) : e.days === 0 ? "today" : relDays(e.days);
  switch (e.lane) {
    case "coupons": return `Your ${e.store ? e.store + " " : ""}coupon${e.value ? " (" + money(e.value, { cents: true }) + ")" : ""} ends ${when}. Take it on your next shop.`;
    case "papers": return e.days < 0 ? `${e.title} expired ${when}. Shall we book the renewal?` : `${e.title} expires ${when}. Renewals take time, so it's worth booking now.`;
    case "contracts": return e.days < 0 ? `The notice date for ${e.title} passed ${when}. Ask whether you can still switch.` : `${e.title}: give notice ${when}, or it renews on its own.`;
    case "warranty": return `The warranty on ${e.title} ends ${when}. A quick test now costs nothing.`;
    case "useby": return e.days < 0 ? `${e.title} passed its date ${when}.` : e.food ? `${e.title} should be used ${when}. Perhaps tonight's dinner?` : `${e.title} expires ${when}.`;
    case "lifespan": return `${e.title} is due for replacing${e.days < 0 ? "" : " " + when}.`;
    default: return e.days < 0 ? `${e.title} ended ${when}.` : `${e.title} ends ${when}.`;
  }
}
function expiryBriefs() { return expiryEntries().filter(e => XP().needsYou(e)).map(e => ({ key: e.key, text: briefLine(e), urgent: e.state === "expired" || e.days <= 1 })); }
function expiryCount() { return expiryEntries().filter(e => XP().needsYou(e) && (e.visibility !== "private" || e.createdBy === S.me?.id)).length; }
// A card for Today: only when something needs someone.
function expiryCardHTML() {
  const hot = expiryBriefs().filter(b => !b.key.startsWith("chance:"));
  if (!hot.length) return "";
  return `<div class="panel nudge xp-nudge"><span class="nudge-icon" aria-hidden="true">⏳</span><div><b>Before they run out</b>
    <ul class="xp-brief">${hot.slice(0, 3).map(b => `<li><button class="link" data-act="xp-open" data-key="${esc(b.key)}">${esc(b.text)}</button></li>`).join("")}</ul>
    <div class="actions" style="justify-content:flex-start"><button type="button" class="btn primary small" data-act="tab" data-tab="expiring">${hot.length > 3 ? "See all " + hot.length : "Open Expiring"}</button></div></div></div>`;
}

VIEWS.expiring = {
  shell: () => `<div id="view-expiring"><div class="hello"><span class="eyebrow">Before it runs out</span><h2>Expiring</h2></div>
    <div class="actions xp-add" style="justify-content:flex-start">
      <label class="btn primary" for="xp-photo">Snap a coupon</label><input type="file" id="xp-photo" accept="image/*" capture="environment" hidden>
      <button class="btn" data-act="chance-new">Add a coupon</button><button class="btn" data-act="xp-new">Add something else</button></div>
    <div id="xp-live"></div></div>`,
  live() {
    const el = $("#xp-live"); if (!el) return;
    const all = expiryEntries();
    const lane = XS.lane;
    const list = lane === "all" ? all : all.filter(e => e.lane === lane);
    const wallet = all.filter(e => e.lane === "coupons" && e.days >= 0);
    const hot = list.filter(e => XP().needsYou(e)), soon = list.filter(e => e.state === "soon"), later = list.filter(e => e.state === "later");
    const notes = insights(all);
    const lanes = XP().LANES.filter(([k]) => all.some(e => e.lane === k));
    const sec = (title, note, l) => l.length ? `<section class="section"><header><h2>${title}</h2>${note ? `<span class="eyebrow">${note}</span>` : ""}</header><ul class="alerts">${l.map(entryHTML).join("")}</ul></section>` : "";
    el.innerHTML = `
      ${wallet.length ? `<section class="section"><header><h2>Coupon wallet</h2><span class="eyebrow">${wallet.length} to use</span></header>
        <div class="xp-wallet">${wallet.map(e => `<button class="xp-coupon ${e.days <= 1 ? "bad" : e.days <= e.lead ? "warn" : ""}" ${openAttrs(e)}>
          <span class="xp-store">${esc(e.store || "Coupon")}</span><span class="xp-val num">${e.value ? money(e.value, { cents: true }) : "🎟"}</span><span class="xp-title">${esc(e.title)}</span><span class="pill ${stateCls(e) || (e.days <= 1 ? "bad" : "")}">${esc(whenLabel(e))}</span></button>`).join("")}</div></section>` : ""}
      ${notes.length ? `<section class="section"><header><h2>What Laventina notices</h2></header><div class="panel xp-notes"><ul>${notes.map(n => `<li>${n}</li>`).join("")}</ul>
        ${sampleCap && all.some(e => e.state !== "later") ? `<div class="actions" style="justify-content:flex-start"><button class="btn small" data-act="xp-plan" ${XS.planBusy ? "disabled" : ""}>${XS.planBusy ? '<span class="spinner"></span> Thinking' : "Make a plan with Claude"}</button></div>` : ""}
        ${XS.plan ? `<div class="answer xp-plan">${esc(XS.plan)}</div>` : ""}</div></section>` : ""}
      ${lanes.length > 1 ? `<div class="chips" role="group" aria-label="Show">${[["all", "Everything"], ...lanes].map(([k, l]) => `<button class="chip" data-act="xp-lane" data-lane="${k}" aria-pressed="${lane === k}">${esc(l)}</button>`).join("")}</div>` : ""}
      ${!all.length ? emptyHTML("Nothing is running out", "Add coupons, your passport, contracts, warranties and use-by dates. Laventina tells you before each one ends, and what to do about it.", "") : ""}
      ${sec("Needs you now", hot.length ? hot.length + " to sort" : "", hot)}
      ${!hot.length && all.length ? `<div class="calm"><h3>Nothing needs you right now</h3><p class="muted">You'll get a nudge before anything below runs out.</p></div>` : ""}
      ${sec("Coming up", "Next three months", soon)}
      ${later.length ? `<details class="section donebox"><summary><h2>Later</h2><span class="eyebrow">${later.length}</span></summary><ul class="alerts">${later.map(entryHTML).join("")}</ul></details>` : ""}`;
  }
};

// ---------- Acting on one ----------
function logOutcome(kind, e, extra = {}) {
  const st = S.expiry || {};
  const list = [...(st[kind] || []), { title: e.title, lane: e.lane, on: todayISO(), ...extra }].slice(-200);
  store.putMeta("expiry", { [kind]: list });
}
function doneSourceTasks(e) {
  const m = { papers: ["papers", e.ref], contracts: ["money", e.ref, "contract"], warranty: ["inventory", e.ref, "warranty"], useby: ["inventory", e.key, "useby"], lifespan: ["inventory", e.key, "lifespan"], custom: ["expiry", e.ref] }[e.lane];
  if (m) closeSourceTasks(...m);
}
function openExpiry(key) {
  const e = expiryEntries().find(x => x.key === key); if (!e) return;
  const it = S.items.get(e.ref), doc = S.docs.get(e.ref), ch = S.charges.get(e.ref), x = S.expiries.get(e.ref);
  const step = STEPS[e.docType] || (e.medicine && STEPS.medicine) || STEPS[e.type] || STEPS[e.lane] || "";
  const date = (id, label, v) => `<label class="f">${label}<input type="date" id="${id}" value="${esc(v || "")}"></label>`;
  let body = "", buttons = [];
  if (e.lane === "papers") { body = date("xp-date", "New expiry date, once renewed", addMonthsISOLocal(e.date, XP().DOC_VALID_MONTHS[e.docType] || 12)); buttons = [["xp-renew", "Renewed", "primary"], ["xp-stop", "Not renewing"], ["doc-edit", "Open the paper"]]; }
  else if (e.lane === "contracts") { body = date("xp-date", "New contract end, if you renewed", addMonthsISOLocal(e.end, 12)); buttons = [["xp-renew", "Renewed", "primary"], ["xp-stop", "Cancelled or switched"], ["charge-edit", "Open the bill"]]; }
  else if (e.lane === "warranty") buttons = [["xp-ok", "Tested, all fine", "primary"], ["xp-claim", "Something's wrong: claim"], ["edit", "Open the item"]];
  else if (e.lane === "useby") { body = date("xp-date", "Bought fresh? New date", ""); buttons = [["xp-used", e.food ? "Used it up" : "Used or gone", "primary"], ["xp-toss", "Threw it out"], ["xp-renew", "Bought fresh"], ["xp-shop", "Add to shopping"]]; }
  else if (e.lane === "lifespan") buttons = [["xp-replaced", "Replaced it today", "primary"], ["xp-shop", "Add to shopping"], ["edit", "Open the item"]];
  else { body = date("xp-date", "Next end date, once renewed", addMonthsISOLocal(e.date, Number(x?.renewMonths) || 12)); buttons = [["xp-renew", "Renewed", "primary"], ["xp-stop", "Done with it"], ["xp-edit", "Edit"]]; }
  openSheet(XP().verb(e) + ": " + e.title, `<div style="display:grid;gap:14px" id="xp-sheet" data-key="${esc(e.key)}">
    <p style="margin:0"><span class="pill ${stateCls(e)}">${esc(whenLabel(e))}</span> <span class="muted">${esc(lineFor(e))}</span></p>
    ${x && x.notes ? `<p class="muted" style="margin:0">${esc(x.notes)}</p>` : ""}
    ${step ? `<div class="ai-note"><b>How to sort it.</b> ${esc(step)}</div>` : ""}${body}
    <div class="actions" style="justify-content:flex-end;flex-wrap:wrap">${buttons.map(([a, l, c]) => `<button type="button" class="btn ${c || ""}" data-act="${a}" data-id="${esc(e.ref)}">${esc(l)}</button>`).reverse().join("")}</div></div>`);
}
function addMonthsISOLocal(iso, n) { return XP().addMonthsISO(iso || todayISO(), n); }
function actExpiry(act) {
  const key = $("#xp-sheet")?.dataset.key; const e = key && expiryEntries().find(x => x.key === key); if (!e) return;
  const it = S.items.get(e.ref), doc = S.docs.get(e.ref), ch = S.charges.get(e.ref), x = S.expiries.get(e.ref);
  const nd = $("#xp-date")?.value;
  switch (act) {
    case "xp-renew":
      if (!nd) return toast("Pick the new date first.");
      if (doc) store.put("docs", { ...doc, expiryDate: nd });
      else if (ch) store.put("charges", { ...ch, contractEnd: nd });
      else if (it) store.putItem({ ...it, expiresOn: nd });
      else if (x) store.put("expiries", { ...x, date: nd });
      toast("Saved the new date"); break;
    case "xp-stop":
      if (doc) store.put("docs", { ...doc, remind: false });
      else if (ch) store.put("charges", { ...ch, status: "cancelled" });
      else if (x) store.put("expiries", { ...x, done: true });
      toast("Off the list"); break;
    case "xp-ok": store.putItem({ ...it, warrantyChecked: it.warrantyUntil }); toast("Good. Laventina won't ask again."); break;
    case "xp-claim":
      putTask(newTask({ title: "Warranty claim: " + it.name, dueOn: todayISO(), priority: 1, itemId: it.id, tags: ["inventory"],
        notes: [`Warranty until ${fmtDate(it.warrantyUntil)}.`, it.store ? "Bought at " + it.store + (it.purchaseDate ? " on " + fmtDate(it.purchaseDate) : "") + "." : "", it.serial ? "Serial " + it.serial + "." : "", "Describe the fault, attach the receipt from Money & papers, and keep a copy of what you send."].filter(Boolean).join(" ") }));
      toast("Added a claim task for today"); break;
    case "xp-used":
      if (it) { store.putItem({ ...it, expiresOn: undefined }); logOutcome("used", e); toast("Used up. Nothing wasted."); }
      break;
    case "xp-toss":
      if (it) { store.putItem({ ...it, expiresOn: undefined }); logOutcome("lost", e); }
      toast("Noted. Laventina keeps count, so the next one doesn't slip."); break;
    case "xp-replaced": store.putItem({ ...it, installDate: todayISO() }); toast("Replaced. The clock starts again today."); break;
    case "xp-shop": store.putShop({ id: newId("s"), text: it.name, done: false, source: "expiry", itemId: it.id, createdAt: nowISO() }); toast("Added to shopping"); return;
    case "xp-edit": closeSheet(); openExpiryForm(x); return;
  }
  doneSourceTasks(e); closeSheet();
}

// ---------- Adding one ----------
const XP_FIELDS = () => [
  { k: "title", label: "What runs out", full: true, ph: "Car inspection, gym membership, prescription" },
  { k: "type", label: "Kind", type: "select", options: XP().CUSTOM_KINDS },
  { k: "date", label: "Ends on", type: "date" },
  { k: "renewMonths", label: "Renews every (months)", type: "number", hint: "optional" },
  { k: "leadDays", label: "Warn me this many days before", type: "number", hint: "optional" },
  ...(S.members.length > 1 ? [{ k: "assigneeId", label: "Whose job", type: "select", options: memberOpts() }] : []),
  { k: "notes", label: "Notes", type: "textarea", full: true }
];
function openExpiryForm(x, prefill = {}) {
  const isNew = !x;
  formSheet({ title: isNew ? "Add something that runs out" : x.title, fields: XP_FIELDS(), data: x || { type: "other", ...prefill }, del: !isNew, privacy: true,
    onSave(v) {
      if (!v.title) return toast("Say what it is.");
      if (!v.date) return toast("Add the date it ends.");
      if (isNew) { v.id = newId("x"); v.createdAt = nowISO(); }
      store.put("expiries", v); closeSheet(); toast("Saved. Laventina warns you in time.");
    }, delRun(v) { store.del("expiries", v.id); } });
}
// A photo of a coupon: Claude reads the shop, value, minimum spend and last day into the opportunities sheet.
async function snapCoupon(file) {
  if (!sampleCap) { openChance(null, {}); toast("Claude is off, so fill it in by hand."); return; }
  toast("Reading the coupon…");
  let pre = {};
  try {
    const blob = await shrink(file, 1600);
    const r = await sampleCap.json(`This is a photo of a coupon, voucher, gift card or discount. Today is ${todayISO()}. Return {"title":"short name like '€7 off' or 'Gift card'","store":"shop or brand or null","value":number or null,"minSpend":number or null,"expiresOn":"last valid day YYYY-MM-DD or null","code":"code or null","conditions":"one short line or null"}`, { images: [blob] });
    pre = { title: r.title || undefined, store: r.store || undefined, value: Number(r.value) || undefined, minSpend: Number(r.minSpend) || undefined,
      expiresOn: /^\d{4}-\d{2}-\d{2}$/.test(r.expiresOn || "") ? r.expiresOn : undefined, notes: [r.code && "Code " + r.code, r.conditions].filter(Boolean).join(". ") || undefined };
  } catch (err) { toast("Claude couldn't read it. Fill in the rest."); }
  openChance(null, pre);
}
async function expiryPlan() {
  const all = expiryEntries().filter(e => e.state !== "later").slice(0, 40);
  XS.planBusy = true; VIEWS.expiring.live();
  try {
    const lines = all.map(e => `- ${XP().verb(e)}: ${e.title} (${lineFor(e)}; ${whenLabel(e)})`).join("\n");
    const r = await sampleCap(`You help a household not lose things that run out. Today is ${todayISO()}. Here is what is expiring:\n${lines}\n\nWrite a short, warm plan in plain text (no markdown): first what to do this week, in order, then what to bundle together, then one habit that would stop this from slipping again. For food, suggest a meal that uses it. Under 150 words.`);
    XS.plan = r.text || "";
  } catch (err) { toast(err.message || "Claude could not answer just now."); }
  XS.planBusy = false; VIEWS.expiring.live();
}
// Ticking off a generated expiry task opens the same choices as the inbox.
function expiryComplete(t) {
  const key = t.source === "expiry" ? "custom:" + t.sourceRef : t.source === "inventory" && (t.sourceType === "useby" || t.sourceType === "lifespan") ? t.sourceRef : null;
  if (!key || !expiryEntries().some(e => e.key === key)) return false;
  openExpiry(key); return true;
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  switch (t.dataset.act) {
    case "xp-open": openExpiry(t.dataset.key); break;
    case "xp-lane": XS.lane = t.dataset.lane; VIEWS.expiring.live(); break;
    case "xp-new": openExpiryForm(null, t.dataset.type ? { type: t.dataset.type } : {}); break;
    case "xp-plan": expiryPlan(); break;
    case "xp-renew": case "xp-stop": case "xp-ok": case "xp-claim": case "xp-used": case "xp-toss": case "xp-replaced": case "xp-shop": case "xp-edit": actExpiry(t.dataset.act); break;
  }
});
document.addEventListener("change", e => {
  if (e.target.id === "xp-photo" && e.target.files[0]) { snapCoupon(e.target.files[0]); e.target.value = ""; }
});
document.addEventListener("click", e => { const t = e.target.closest('[data-act="xp-open-ref"]'); if (t) { closeSheet(); openExpiry("custom:" + t.dataset.id); } });

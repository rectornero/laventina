"use strict";
// ---------- Upkeep ----------
const CONS_W = { safety: 4, damage: 3, efficiency: 2, cosmetic: 1 };
const CONS_LABEL = { safety: "Safety", damage: "Prevents damage", efficiency: "Efficiency", cosmetic: "Cosmetic" };
const EFFORT_LABEL = { diy: "DIY", diy_skilled: "Skilled DIY", pro: "Book a pro" };
const TEMPLATES = [
  { key: "filter", title: "Replace the air filter", cats: ["hvac.furnace", "hvac.heat_pump", "hvac.ac"], days: 90, min: 30, max: 180, pets: 60, cons: "efficiency", minutes: 10, part: "filterSize" },
  { key: "hvac_service", title: "Professional service", cats: ["hvac.furnace", "hvac.boiler", "hvac.heat_pump"], season: "autumn", days: 365, cons: "damage", effort: "pro", lead: 21, warranty: true },
  { key: "ac_service", title: "Professional service before summer", cats: ["hvac.ac"], season: "spring", days: 365, cons: "efficiency", effort: "pro", lead: 21 },
  { key: "ac_coil", title: "Clean the outdoor coil and clear debris", cats: ["hvac.ac", "hvac.heat_pump"], season: "spring", days: 365, cons: "efficiency", minutes: 30 },
  { key: "wh_flush", title: "Flush sediment from the tank", cats: ["water.heater_tank"], days: 365, hard: 180, cons: "damage", effort: "diy_skilled", minutes: 45 },
  { key: "wh_valve", title: "Test the pressure relief valve", cats: ["water.heater_tank"], days: 365, cons: "safety", minutes: 10 },
  { key: "salt", title: "Refill the softener salt", cats: ["water.softener"], days: 45, cons: "efficiency", minutes: 10 },
  { key: "cartridge", title: "Replace the filter cartridge", cats: ["water.filter"], days: 180, cons: "efficiency", minutes: 15, part: "filterSize" },
  { key: "sump", title: "Test with a bucket of water", cats: ["water.sump_pump"], days: 90, cons: "damage", minutes: 10 },
  { key: "fridge_coils", title: "Vacuum the condenser coils", cats: ["appliance.fridge"], days: 365, pets: 180, cons: "efficiency", minutes: 20 },
  { key: "dw_filter", title: "Clean the filter", cats: ["appliance.dishwasher"], days: 30, min: 14, max: 90, cons: "efficiency", minutes: 10 },
  { key: "washer_clean", title: "Run a drum clean and wipe the door seal", cats: ["appliance.washer"], days: 30, cons: "cosmetic", minutes: 10 },
  { key: "washer_hoses", title: "Check fill hoses for bulges and cracks", cats: ["appliance.washer"], days: 365, cons: "damage", minutes: 10 },
  { key: "dryer_vent", title: "Clean the vent duct to outside", cats: ["appliance.dryer"], days: 365, cons: "safety", effort: "diy_skilled", minutes: 45 },
  { key: "hood_filter", title: "Clean the grease filter", cats: ["appliance.range_hood"], days: 90, cons: "safety", minutes: 15 },
  { key: "oven_clean", title: "Deep clean", cats: ["appliance.oven"], days: 180, cons: "cosmetic", minutes: 40 },
  { key: "smoke_test", title: "Press the test button", cats: ["safety.smoke_detector", "safety.co_detector"], days: 30, cons: "safety", minutes: 2 },
  { key: "smoke_batt", title: "Replace the battery", cats: ["safety.smoke_detector", "safety.co_detector"], days: 365, cons: "safety", minutes: 5, part: "batteryType" },
  { key: "ext_check", title: "Check the gauge and pin", cats: ["safety.extinguisher"], days: 30, cons: "safety", minutes: 2 },
  { key: "first_aid", title: "Check contents and use-by dates", cats: ["safety.first_aid"], days: 180, cons: "safety", minutes: 10 },
  { key: "garage_door", title: "Test auto-reverse and lubricate", cats: ["garage.door_opener"], days: 180, cons: "safety", minutes: 15 },
  { key: "mower", title: "Sharpen the blade and service", cats: ["garden.machine"], season: "spring", days: 365, cons: "damage", minutes: 45 },
  { key: "car", title: "Service: oil, brakes, tyres", cats: ["vehicle.car"], days: 365, cons: "damage", effort: "pro", lead: 14 },
  { key: "bike", title: "Pump the tyres and oil the chain", cats: ["vehicle.bike"], days: 60, cons: "cosmetic", minutes: 10 },
  { key: "gfci", title: "Test GFCI / RCD outlets and the breaker", home: true, days: 90, cons: "safety", minutes: 10 },
  { key: "leaks", title: "Check under sinks and around toilets for leaks", home: true, days: 90, cons: "damage", minutes: 15 },
  { key: "frost", title: "Shut exterior valves and drain garden hoses", home: true, season: "autumn", days: 365, cons: "damage", minutes: 20 },
  { key: "caulk", title: "Re-seal cracked caulk on windows and doors", home: true, season: "autumn", days: 365, cons: "efficiency", minutes: 60 },
  { key: "roof", title: "Look over the roof and chimney from the ground", home: true, season: "spring", days: 365, cons: "damage", minutes: 15 },
  { key: "bath_fan", title: "Clean bathroom fans, check grout and sealant", home: true, days: 180, cons: "damage", minutes: 30 },
  { key: "gutters", title: "Clean gutters and downspouts", home: true, flag: "hasGutters", days: 182, cons: "damage", effort: "diy_skilled", minutes: 90 },
  { key: "chimney", title: "Book the chimney sweep", home: true, flag: "hasFireplace", season: "autumn", days: 365, cons: "safety", effort: "pro", lead: 30 },
  { key: "septic", title: "Book septic tank pumping", home: true, flag: "hasSeptic", days: 1095, cons: "damage", effort: "pro", lead: 21 },
  { key: "pets_hair", title: "Vacuum vents and radiators for pet hair", home: true, flag: "hasPets", days: 60, cons: "efficiency", minutes: 20 }
];
const LIFESPAN = { "appliance.fridge": 13, "appliance.dishwasher": 10, "appliance.washer": 11, "appliance.dryer": 12, "appliance.oven": 15, "appliance.range_hood": 15, "appliance.microwave": 9, "appliance.vacuum": 8,
  "hvac.furnace": 18, "hvac.boiler": 15, "hvac.heat_pump": 15, "hvac.ac": 15, "water.heater_tank": 11, "water.softener": 15, "water.sump_pump": 10, "garage.door_opener": 12,
  "safety.smoke_detector": 10, "safety.co_detector": 7, "safety.extinguisher": 10, "electronics.tv": 8, "electronics.computer": 5, "electronics.phone": 4, "electronics.network": 5, "furniture.bed": 9, "garden.machine": 10 };
function horizon() {
  const out = [];
  for (const it of activeItems()) {
    const life = LIFESPAN[it.category]; const start = it.installDate || it.purchaseDate; if (!life || !start) continue;
    const end = addYears(start, life), d = daysUntil(end);
    if (d > 3650) continue;
    out.push({ it, end, d, cost: Number(it.value) || Number(it.purchasePrice) || 0, pct: Math.min(1, -daysUntil(start) / (life * 365)) });
  }
  out.sort((a, b) => a.d - b.d);
  const monthly = sum(out, x => x.cost / Math.max(1, x.d / 30.4));
  return { list: out, monthly };
}
function careShareHTML() {
  if (S.members.length < 2) return "";
  const month = todayISO().slice(0, 7);
  const logs = [...S.ulog.values()].filter(l => !l.skipped && (l.doneOn || "").startsWith(month));
  const per = S.members.map(m => ({ m, min: sum(logs.filter(l => l.doneBy === m.id), l => Number(l.minutes) || 15) }));
  const tot = sum(per, x => x.min);
  if (!tot) return "";
  return `<section class="section"><header><h2>Care this month</h2><span class="eyebrow">Unclaimed safety jobs go to whoever has done less</span></header><div class="panel fair"><div class="fairbar">${per.map(x => `<i style="width:${100 * x.min / tot}%;background:${esc(x.m.color || "#D9CCF5")}"></i>`).join("")}</div>
    <div class="fairkey">${per.map(x => `<span>${avatarHTML(x.m.id)} ${esc(x.m.name.split(" ")[0])} <b class="num">${x.min} min</b></span>`).join("")}</div></div></section>`;
}
const taskForSource = (source, ref, type) => openTasks().find(t => t.source === source && t.sourceRef === ref && (!type || t.sourceType === type));
const TPL = Object.fromEntries(TEMPLATES.map(t => [t.key, t]));
const HOME_FLAGS = [["hasPets", "Pets"], ["hasHardWater", "Hard water"], ["hasGutters", "Gutters"], ["hasFireplace", "Fireplace or wood stove"], ["hasSeptic", "Septic tank"], ["owned", "We own the house"]];
function nextSeason(season) {
  const north = (S.upkeep.hemisphere || "north") === "north";
  const m = { spring: north ? 2 : 8, summer: north ? 5 : 11, autumn: north ? 8 : 2, winter: north ? 10 : 4 }[season];
  const now = new Date(); let c = new Date(now.getFullYear(), m, 15); if (c < now) c = new Date(now.getFullYear() + 1, m, 15);
  return new Date(c.getTime() - c.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
}
function makePlan(t, it) {
  const f = S.upkeep.flags || {};
  let days = t.days; if (t.pets && f.hasPets) days = t.pets; if (t.hard && f.hasHardWater) days = t.hard;
  const first = t.season ? nextSeason(t.season) : addDays(todayISO(), t.cons === "safety" ? 3 : Math.round(Math.min(days, 120) / 3));
  return { id: newId("p"), templateKey: t.key, itemId: it ? it.id : undefined, title: t.title, intervalDays: days, minDays: t.min || Math.round(days * 0.5), maxDays: t.max || Math.round(days * 2),
    nextDue: first, consequence: t.cons, effort: t.effort || "diy", minutes: t.minutes || 0, lead: t.lead, part: t.part, warranty: !!t.warranty, active: true, createdAt: nowISO() };
}
function proposals() {
  const have = new Set([...S.plans.values()].map(p => p.templateKey + "|" + (p.itemId || "home")));
  const out = [];
  for (const it of activeItems()) for (const t of TEMPLATES) if (!t.home && t.cats.includes(it.category) && !have.has(t.key + "|" + it.id)) out.push({ t, it });
  for (const t of TEMPLATES) if (t.home && (!t.flag || (S.upkeep.flags || {})[t.flag]) && !have.has(t.key + "|home")) out.push({ t, it: null });
  return out;
}
const activePlans = () => [...S.plans.values()].filter(p => p.active && !(p.itemId && (!S.items.has(p.itemId) || S.items.get(p.itemId).disposedOn)));
function planDue(p) { const d = daysUntil(p.nextDue); return p.effort === "pro" && p.lead ? d - p.lead : d; }
function planWhere(p) { const it = p.itemId && S.items.get(p.itemId); return it ? it.name + " · " + placeLabel(it) : "Whole house"; }
function healthScore() {
  const ps = activePlans(); if (!ps.length) return null;
  let w = 0, ok = 0; const drag = [];
  for (const p of ps) {
    const wt = CONS_W[p.consequence] || 1, d = daysUntil(p.nextDue);
    const on = d >= 0 ? 1 : Math.max(0, 1 + d / Math.max(14, p.intervalDays));
    w += wt; ok += wt * on; if (on < 1) drag.push({ p, loss: wt * (1 - on) });
  }
  drag.sort((a, b) => b.loss - a.loss);
  return { score: Math.round(100 * ok / w), drag: drag.slice(0, 3) };
}
function spareFor(p) {
  if (!p.part) return null;
  const it = p.itemId && S.items.get(p.itemId); const val = it?.attributes?.[p.part]; if (!val) return { need: true };
  const norm = s => String(s).toLowerCase().replace(/\s+/g, "").replace(/×/g, "x");
  const sp = activeItems().find(i => i.id !== it.id && isSupply(i) && i.attributes && i.attributes[p.part] && norm(i.attributes[p.part]) === norm(val));
  return { val, spare: sp };
}
function planRowHTML(p) {
  const d = planDue(p), sp = spareFor(p);
  return `<div class="sweep-row ${d < 0 ? "" : ""}"><div><div class="row-name">${esc(p.title)}</div>
    <div class="label">${esc(planWhere(p))}</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${duePill(d)}${p.consequence === "safety" ? '<span class="pill bad">Safety</span>' : ""}${p.effort === "pro" ? `<span class="pill info">${p.lead ? "Book by " + fmtShort(addDays(p.nextDue, -p.lead)) : "Pro"}</span>` : ""}${p.minutes ? `<span class="pill">${p.minutes} min</span>` : ""}${sp && sp.spare ? `<span class="pill good">${Number(sp.spare.qty) || 0} spare · ${esc(placeLabel(sp.spare))}</span>` : sp && sp.val ? `<span class="pill warn">No spare ${esc(sp.val)}</span>` : ""}</div>
    ${p.intervalNote ? `<div class="muted" style="font-size:13px;margin-top:4px">${esc(p.intervalNote)}</div>` : ""}</div>
    <div class="actions"><button class="btn small primary" data-act="up-done" data-id="${esc(p.id)}">Done</button><button class="btn small" data-act="up-snooze" data-id="${esc(p.id)}">Next week</button><button class="btn small" data-act="up-edit" data-id="${esc(p.id)}" aria-label="Edit ${esc(p.title)}">Edit</button></div></div>`;
}
VIEWS.upkeep = {
  shell: () => `<div id="view-upkeep"></div>`,
  live() {
    const el = $("#view-upkeep"); if (!el) return;
    const ps = activePlans().sort((a, b) => planDue(a) - planDue(b));
    const now = ps.filter(p => planDue(p) <= 7), later = ps.filter(p => planDue(p) > 7 && planDue(p) <= 90);
    const hs = healthScore(), props = proposals();
    const mins = sum(now.filter(p => p.effort !== "pro"), p => p.minutes || 0);
    const byRoom = new Map(); for (const p of now) { const it = S.items.get(p.itemId); const k = it ? roomName(it.roomId) : "Whole house"; byRoom.set(k, (byRoom.get(k) || 0) + 1); }
    const log = [...S.ulog.values()].sort((a, b) => (b.doneOn || "").localeCompare(a.doneOn || "")).slice(0, 8);
    const f = S.upkeep.flags || {};
    el.innerHTML = `
      <div class="hero">
        <div class="worth"><span class="eyebrow">Home Health</span><span class="big num">${hs ? hs.score : "–"}</span>
          <p>${hs ? (hs.drag.length ? "Held back by: " + hs.drag.map(x => x.p.title.toLowerCase() + (x.p.itemId ? " (" + (S.items.get(x.p.itemId)?.name || "") + ")" : "")).join("; ") + "." : "Every care task is on time. Safety tasks count four times as much as cosmetic ones.") : "Add care plans below to start scoring. Overdue safety tasks cost the most points."}</p></div>
        <div class="panel ready"><span class="eyebrow">This week</span>
          <div style="display:flex;align-items:baseline;gap:8px"><span class="score num">${now.length}</span><span class="muted">tasks${mins ? ", about " + mins + " minutes of DIY" : ""}</span></div>
          ${byRoom.size ? `<ul class="mini-list">${[...byRoom].map(([k, n]) => `<li><span>${esc(k)}</span><span class="muted">${n} task${n > 1 ? "s" : ""}</span></li>`).join("")}</ul><span class="muted" style="font-size:14px">Grouped by room so you can do them in one walk.</span>` : `<span class="muted" style="font-size:14px">Nothing due this week.</span>`}
        </div>
      </div>
      ${careShareHTML()}
      <section class="section"><header><h2>Due now</h2><button class="btn small" data-act="up-new">Add your own care job</button></header>
        <div class="rows">${now.map(planRowHTML).join("") || `<div class="panel muted">Nothing due in the next seven days.</div>`}</div></section>
      ${props.length ? `<section class="section"><header><div><h2>Suggested care</h2><p class="muted" style="margin:4px 0 0">Laventina read your inventory and home profile. Each one becomes a task when it comes due. Add the ones that apply.</p></div><button class="btn small primary" data-act="up-add-all">Add all ${props.length}</button></header>
        <div class="rows">${props.slice(0, 12).map(({ t, it }) => `<div class="sweep-row"><div><div class="row-name">${esc(t.title)}</div><div class="label">${esc(it ? it.name + " · " + placeLabel(it) : "Whole house")}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px"><span class="pill">${t.season ? "Each " + t.season : "Every " + (t.days >= 365 ? Math.round(t.days / 365) + " yr" : t.days + " days")}</span><span class="pill ${t.cons === "safety" ? "bad" : ""}">${CONS_LABEL[t.cons]}</span><span class="pill">${EFFORT_LABEL[t.effort || "diy"]}</span></div></div>
          <div class="actions"><button class="btn small primary" data-act="up-add" data-t="${t.key}" data-id="${esc(it ? it.id : "")}">Add</button><button class="btn small" data-act="up-skip" data-t="${t.key}" data-id="${esc(it ? it.id : "")}">Not needed</button></div></div>`).join("")}
          ${props.length > 12 ? `<p class="muted">${props.length - 12} more appear as you add these.</p>` : ""}</div></section>` : ""}
      <section class="section"><header><h2>Coming up</h2><span class="eyebrow">Next 3 months</span></header>
        <div class="rows">${later.map(planRowHTML).join("") || `<div class="panel muted">Nothing else scheduled in the next three months.</div>`}</div></section>
      ${(() => { const h = horizon(); return `<section class="section"><header><div><h2>House horizon</h2><p class="muted" style="margin:4px 0 0">What will likely need replacing in the next 10 years, from install or purchase dates and typical lifespans.</p></div></header>
        <div class="panel">${h.list.length ? `<p style="margin:0 0 10px"><b class="money">${money(h.monthly)}</b> a month set aside covers these replacements when they come due.</p><ul class="timeline">${h.list.slice(0, 8).map(x => `<li><span class="when ${x.d < 365 ? "soon" : ""}">${x.end.slice(0, 4)}</span><span><button class="link" data-act="edit" data-id="${esc(x.it.id)}">${esc(x.it.name)}</button> <span class="muted">${x.d < 0 ? "past its typical life" : relDays(x.d)}${x.cost ? " · about " + money(x.cost) : ""}</span><span class="meter" style="display:block;margin-top:4px;height:6px"><i style="width:${Math.round(100 * x.pct)}%;background:${x.pct > 0.85 ? "var(--warn)" : "var(--accent)"}"></i></span></span></li>`).join("")}</ul>` : `<span class="muted">Add install or purchase dates to your appliances, heating and electronics to see this.</span>`}</div></section>`; })()}
      <div class="grid2">
        <section class="section"><header><h2>Your home</h2></header><div class="panel" style="display:grid;gap:10px">
          <p class="muted" style="margin:0;font-size:14px">These decide which tasks apply and how often. Pets shorten filter intervals; hard water shortens water-heater flushes.</p>
          <div class="chips" style="flex-wrap:wrap">${HOME_FLAGS.map(([k, l]) => `<button class="chip" data-act="up-flag" data-k="${k}" aria-pressed="${!!f[k]}">${esc(l)}</button>`).join("")}</div>
          <label class="f">Hemisphere<select id="up-hemi">${[["north", "Northern"], ["south", "Southern"]].map(([v, l]) => `<option value="${v}" ${(S.upkeep.hemisphere || "north") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div></section>
        <section class="section"><header><h2>Service history</h2></header><div class="panel">${log.length ? `<ul class="timeline">${log.map(l => `<li><span class="when">${fmtShort(l.doneOn)}</span><span>${esc(l.title)}${l.itemId && S.items.get(l.itemId) ? " · " + esc(S.items.get(l.itemId).name) : ""} ${l.condition ? `<span class="pill">${esc(l.condition)}</span>` : ""}${l.cost ? ` <span class="muted">${money(l.cost, { cents: true })}</span>` : ""}</span></li>`).join("")}</ul>` : `<span class="muted">Each task you finish is kept here for good: useful for warranty claims, insurance, and selling the house.</span>`}</div></section>
      </div>`;
  }
};
function openDone(p, task) {
  task = task || taskForSource("care", p.id);
  const sp = spareFor(p), t = TPL[p.templateKey], it = p.itemId && S.items.get(p.itemId);
  const warrantyLive = p.warranty && it && daysUntil(it.warrantyUntil) >= 0;
  openSheet("Done: " + p.title, `<form id="up-form" style="display:grid;gap:14px">
    <div class="label">${esc(planWhere(p))}</div>
    ${warrantyLive ? `<div class="ai-note">This service keeps the warranty valid until ${fmtDate(it.warrantyUntil)}. Keep the invoice: you can add it under Money & papers.</div>` : ""}
    <div class="fields"><label class="f">Done on<input type="date" id="ud-date" value="${todayISO()}"></label><label class="f">Cost<input type="number" id="ud-cost" step="any" min="0" placeholder="optional"></label>
      ${S.members.length > 1 ? `<label class="f">Done by<select id="ud-by">${S.members.map(m => `<option value="${esc(m.id)}" ${m.id === S.me?.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>` : ""}
      <label class="f">Minutes it took<input type="number" id="ud-min" min="0" value="${esc(p.minutes || "")}" placeholder="optional"></label></div>
    <div><span class="eyebrow">How did you find it?</span><div class="chips" style="margin-top:6px">${["clean", "normal", "dirty", "bad"].map(c => `<button type="button" class="chip" data-act="ud-cond" data-c="${c}" aria-pressed="false">${c[0].toUpperCase() + c.slice(1)}</button>`).join("")}</div>
      <p class="muted" style="font-size:13px;margin:6px 0 0">Laventina shortens the interval after two dirty or bad checks, and stretches it after three clean ones.</p></div>
    ${sp && sp.spare ? `<label class="check"><input type="checkbox" id="ud-part" checked> Used one spare ${esc(sp.val)} from ${esc(placeLabel(sp.spare))} (${Number(sp.spare.qty) || 0} left)</label>` : sp && sp.val ? `<label class="check"><input type="checkbox" id="ud-buy" checked> Add ${esc(sp.val)} to the shopping list</label>` : ""}
    <label class="f">Notes<textarea id="ud-notes" rows="2" placeholder="What you found, who did it"></textarea></label>
    <div class="actions" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-sheet">Cancel</button><button type="submit" class="btn primary">Mark done</button></div></form>`);
  $("#up-form").addEventListener("submit", e => {
    e.preventDefault();
    const doneOn = $("#ud-date").value || todayISO(); const cond = ($('[data-act="ud-cond"][aria-pressed="true"]') || {}).dataset?.c;
    const costS = $("#ud-cost").value.trim(); const cost = costS ? parseFloat(costS.replace(",", ".")) : undefined;
    const conds = [...(p.conds || []), cond].filter(Boolean).slice(-3);
    let iv = p.intervalDays, note = p.intervalNote;
    if (conds.length >= 2 && conds.slice(-2).every(c => c === "dirty" || c === "bad") && iv > (p.minDays || 1)) { iv = Math.max(p.minDays || 1, Math.round(iv * 0.75)); note = `Now every ${iv} days because the last two checks were dirty.`; conds.length = 0; }
    else if (conds.length === 3 && conds.every(c => c === "clean") && iv < (p.maxDays || iv * 2)) { iv = Math.min(p.maxDays || iv * 2, Math.round(iv * 1.25)); note = `Now every ${iv} days because the last three checks were clean.`; conds.length = 0; }
    const doneBy = $("#ud-by")?.value || S.me?.id, minutes = Number($("#ud-min").value) || undefined;
    if (task) finishTask(task, { quiet: true, doneBy });
    store.put("plans", { ...p, intervalDays: iv, conds, lastDone: doneOn, lastDoneBy: doneBy, nextDue: t && t.season ? nextSeason(t.season) : addDays(doneOn, iv), intervalNote: note });
    store.put("ulog", { id: newId("l"), planId: p.id, itemId: p.itemId, title: p.title, doneOn, doneBy, minutes, taskId: task?.id, condition: cond, cost, notes: $("#ud-notes").value.trim(), createdAt: nowISO() });
    if (cost) store.put("expenses", { id: newId("e"), date: doneOn, amount: cost, category: "maintenance", description: p.title + (it ? " · " + it.name : ""), itemId: p.itemId, maintenanceTaskId: p.id, paidBy: doneBy, split: "equal", createdAt: nowISO() });
    if ($("#ud-part")?.checked && sp.spare) {
      const left = Math.max(0, (Number(sp.spare.qty) || 0) - 1);
      store.putItem({ ...sp.spare, qty: left });
      if (left < 2 && sp.spare.minQty == null) addShop(`${sp.val} ${p.part === "batteryType" ? "batteries" : "filters"}`, "upkeep", sp.spare.id);
    }
    if ($("#ud-buy")?.checked) addShop(`${sp.val} ${p.part === "batteryType" ? "batteries" : "filters"}`, "upkeep", p.itemId);
    closeSheet(); toast("Logged. Next one " + relDays(daysUntil(t && t.season ? nextSeason(t.season) : addDays(doneOn, iv))));
  });
}
function addShop(text, source, itemId) {
  if ([...S.shopping.values()].some(s => !s.done && s.text.toLowerCase() === text.toLowerCase())) return;
  store.put("shopping", { id: newId("s"), text, done: false, source, itemId, createdAt: nowISO() });
}
const PLAN_FIELDS = () => [
  { k: "title", label: "Task", full: true, ph: "Bleed the radiators" },
  { k: "itemId", label: "For", type: "select", options: itemOpts("Whole house") },
  { k: "intervalDays", label: "Repeat every (days)", type: "number", def: 90 },
  { k: "nextDue", label: "Next due", type: "date", def: addDays(todayISO(), 7) },
  { k: "consequence", label: "If skipped", type: "select", options: Object.entries(CONS_LABEL) },
  { k: "effort", label: "Who does it", type: "select", options: Object.entries(EFFORT_LABEL) },
  { k: "minutes", label: "Minutes", type: "number" },
  ...(S.members.length > 1 ? [{ k: "assignMode", label: "Who gets the task", type: "select", options: [["", "Anyone can grab it"], ["fixed", "Always the same person"], ["alternate", "Take turns"]] },
    { k: "assigneeId", label: "That person", type: "select", options: memberOpts("Choose") }] : [])
];
function openPlan(p) {
  const isNew = !p;
  formSheet({ title: isNew ? "Add a care task" : "Edit care task", fields: PLAN_FIELDS(), data: p || { consequence: "damage", effort: "diy" }, del: !isNew,
    onSave(d) { if (!d.title) return toast("Name the task first."); if (isNew) Object.assign(d, { id: newId("p"), templateKey: "custom", active: true, createdAt: nowISO(), minDays: Math.round((d.intervalDays || 90) / 2), maxDays: (d.intervalDays || 90) * 2 }); d.intervalDays = d.intervalDays || 90; d.nextDue = d.nextDue || addDays(todayISO(), d.intervalDays); store.put("plans", d); closeSheet(); toast("Saved"); },
    delRun(d) { store.put("plans", { ...d, active: false }); } });
}

// ---------- Money & papers ----------
const CHARGE_CATS = ["energy", "water", "internet", "phone", "insurance", "tax", "mortgage_rent", "streaming", "software", "service", "other"];
const EXP_CATS = [...CHARGE_CATS, "maintenance", "improvement", "furnishing", "household"];
const FREQ = [["monthly", "Monthly"], ["quarterly", "Quarterly"], ["yearly", "Yearly"], ["weekly", "Weekly"]];
const FREQ_M = { monthly: 1, quarterly: 3, yearly: 12 };
const perMonth = c => c.frequency === "weekly" ? (c.amount || 0) * 52 / 12 : (c.amount || 0) / (FREQ_M[c.frequency] || 1);
const DOC_TYPES = ["receipt", "invoice", "contract", "policy", "warranty", "manual", "certificate", "deed", "tax", "other"];
const SPLITS = [["equal", "Split equally"], ["payer_only", "Only the payer"]];
const activeCharges = () => [...S.charges.values()].filter(c => c.status !== "cancelled");
function switchWindow(c) {
  if (!c.contractEnd || c.status === "cancelled") return null;
  const deadline = addDays(c.contractEnd, -(c.noticeDays || 0));
  const d = daysUntil(deadline), end = daysUntil(c.contractEnd);
  if (end < 0) return null;
  if (d <= 30) return { deadline, d };
  return null;
}
function needsUseCheck(c) { return ["streaming", "software"].includes(c.category) && c.status !== "cancelled" && daysSince(c.lastUsedCheck ? c.lastUsedCheck + "T00:00:00" : c.createdAt) > 182; }
function driftFor(e) {
  if (!e.chargeId) return null;
  const prev = [...S.expenses.values()].filter(x => x.chargeId === e.chargeId && x.date < e.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  if (prev.length < 2) return null;
  const avg = sum(prev, x => x.amount || 0) / prev.length; if (!avg) return null;
  const pct = Math.round(100 * (e.amount - avg) / avg);
  const th = S.house.driftPct || 15;
  return Math.abs(pct) >= th ? { pct, avg } : null;
}
// Who owes whom: shared expenses split between members, minus settlements. It records, it never moves money.
function balances() {
  const ids = S.members.map(m => m.id), bal = Object.fromEntries(ids.map(i => [i, 0]));
  for (const e of S.expenses.values()) {
    if (e._visibility === "private" || !e.paidBy || !(e.paidBy in bal) || !e.amount) continue;
    if (e.split === "payer_only") continue;
    bal[e.paidBy] += e.amount;
    for (const i of ids) bal[i] -= e.amount / ids.length;
  }
  for (const x of S.settlements.values()) { if (x.from in bal && x.to in bal) { bal[x.from] += x.amount; bal[x.to] -= x.amount; } }
  return bal;
}
function settleHTML() {
  if (S.members.length < 2) return "";
  const bal = balances();
  const sorted = Object.entries(bal).sort((a, b) => b[1] - a[1]);
  const [upId, up] = sorted[0], [downId, down] = sorted.at(-1);
  const last = [...S.settlements.values()].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  const even = up < 0.5;
  return `<section class="section"><header><h2>Settle up</h2>${last ? `<span class="eyebrow">Last settled ${esc(fmtDate(last.date))}</span>` : ""}</header>
    <div class="panel settle">${even ? `<span>You are even. Shared payments are split equally unless a payment says otherwise.</span>`
      : `<span>${avatarHTML(upId)} <b>${esc(memberName(upId))}</b> has paid <b class="money">${money(up, { cents: true })}</b> more than their share. ${S.members.length === 2 ? `${esc(memberName(downId))} owes that amount.` : ""}</span>
      <button class="btn small primary" data-act="settle" data-from="${esc(downId)}" data-to="${esc(upId)}" data-amount="${Math.round(Math.min(up, -down) * 100) / 100}">Record a settlement</button>`}</div></section>`;
}
function closeSourceTasks(source, ref, type) { for (const t of openTasks().filter(t => t.source === source && t.sourceRef === ref && (!type || t.sourceType === type))) finishTask(t, { quiet: true }); }
function chargePaid(c, { amount, date, paidBy, task } = {}) {
  store.put("expenses", { id: newId("e"), date: date || todayISO(), amount: amount ?? c.amount, chargeId: c.id, category: c.category, description: c.name, paidBy: paidBy || c.payerId || S.me?.id, split: c.split || "equal", createdAt: nowISO(), _visibility: c._visibility });
  const step = c.frequency === "weekly" ? null : FREQ_M[c.frequency] || 1;
  store.put("charges", { ...c, nextDue: step ? addMonths(c.nextDue || todayISO(), step) : addDays(c.nextDue || todayISO(), 7) });
  if (task) finishTask(task, { quiet: true }); else closeSourceTasks("money", c.id, "pay");
  toast(`Logged ${money(amount ?? c.amount, { cents: true })} for ${c.name}`);
}
function openPaid(c, task) {
  openSheet("Paid: " + c.name, `<form id="paid-form" style="display:grid;gap:14px">
    <div class="fields"><label class="f">Amount<input type="number" id="pd-amt" step="any" min="0" value="${esc(c.amount)}"></label><label class="f">Paid on<input type="date" id="pd-date" value="${todayISO()}"></label>
    ${S.members.length > 1 ? `<label class="f">Paid by<select id="pd-by">${S.members.map(m => `<option value="${esc(m.id)}" ${m.id === (c.payerId || S.me?.id) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>` : ""}</div>
    <p class="muted" style="margin:0;font-size:14px">The bill moves to its next date${c.frequency ? " (" + esc((FREQ.find(f => f[0] === c.frequency) || FREQ[0])[1].toLowerCase()) + ")" : ""}. If the amount is far from usual, Laventina flags it.</p>
    <div class="actions" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-sheet">Cancel</button><button type="submit" class="btn primary">Record payment</button></div></form>`);
  $("#paid-form").addEventListener("submit", e => {
    e.preventDefault();
    const amount = parseFloat(($("#pd-amt").value || "").replace(",", "."));
    chargePaid(c, { amount: isFinite(amount) ? amount : c.amount, date: $("#pd-date").value, paidBy: $("#pd-by")?.value, task });
    closeSheet();
  });
}
function openContractDecision(c, task) {
  const deadline = addDays(c.contractEnd, -(c.noticeDays || 0));
  openSheet(c.name + " contract", `<form id="cd-form" style="display:grid;gap:14px">
    <div class="ai-note">The contract ends ${esc(fmtDate(c.contractEnd))}. To leave or renegotiate, give notice by ${esc(fmtDate(deadline))}. Compare a couple of offers before you decide: loyalty rarely pays on energy, internet and insurance.</div>
    <label class="f">New contract end, if you renewed<input type="date" id="cd-end" value="${esc(addMonths(c.contractEnd, 12))}"></label>
    <div class="actions" style="justify-content:flex-end"><button type="button" class="btn" data-act="cd-pick" data-v="cancelled">Cancelled it</button><button type="button" class="btn" data-act="cd-pick" data-v="switched">Switched provider</button><button type="button" class="btn primary" data-act="cd-pick" data-v="renewed">Renewed</button></div></form>`);
  $("#cd-form").addEventListener("click", e => {
    const b = e.target.closest('[data-act="cd-pick"]'); if (!b) return;
    const v = b.dataset.v;
    if (v === "renewed") store.put("charges", { ...c, contractEnd: $("#cd-end").value || undefined });
    else store.put("charges", { ...c, status: "cancelled" });
    finishTask(task, { quiet: true }); closeSheet();
    if (v === "switched") { openCharge(null); toast("Add the new provider"); } else toast(v === "renewed" ? "Saved the new end date" : "Marked cancelled");
  });
}
function openSubCheck(c, task) {
  openSheet("Still using " + c.name + "?", `<div style="display:grid;gap:14px"><p style="margin:0">It costs <b class="money">${money(perMonth(c) * 12)}</b> a year.</p>
    <div class="actions" style="justify-content:flex-end"><button class="btn" data-act="sub-cancel" data-id="${esc(c.id)}" data-task="${esc(task.id)}">No, cancel it</button><button class="btn primary" data-act="sub-keep" data-id="${esc(c.id)}" data-task="${esc(task.id)}">Yes, keep it</button></div></div>`);
}
function docUrl(d) { return d.fileId ? fileUrl(d.fileId) : d.url; }
VIEWS.money = {
  shell: () => `<div id="view-money"><div id="money-live"></div>
    <section class="section"><header><h2>Papers</h2><button class="btn small" data-act="doc-new">Add a document</button></header>
      <label class="sr" for="doc-q">Search papers</label><input type="search" id="doc-q" placeholder="Search: deed, boiler manual, home insurance…">
      <div id="doc-list" class="rows"></div></section></div>`,
  live() {
    const el = $("#money-live"); if (!el) return;
    const ch = activeCharges(), monthly = sum(ch, perMonth);
    const lumpy = sum(ch.filter(c => c.frequency === "yearly" || c.frequency === "quarterly"), perMonth);
    const subs = sum(ch.filter(c => ["streaming", "software"].includes(c.category)), c => perMonth(c) * 12);
    const ym = todayISO().slice(0, 7), yr = todayISO().slice(0, 4);
    const exps = [...S.expenses.values()].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const thisMonth = sum(exps.filter(e => (e.date || "").startsWith(ym)), e => e.amount || 0);
    const byCat = {}; for (const e of exps.filter(e => (e.date || "").startsWith(yr))) byCat[e.category || "other"] = (byCat[e.category || "other"] || 0) + (e.amount || 0);
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]); const maxC = cats[0]?.[1] || 1;
    const due = ch.filter(c => c.nextDue && daysUntil(c.nextDue) <= 14).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
    const windows = ch.map(c => ({ c, w: switchWindow(c) })).filter(x => x.w);
    const checks = ch.filter(needsUseCheck);
    const improvements = exps.filter(e => e.isImprovement || e.category === "improvement");
    el.innerHTML = `
      <div class="hero">
        <div class="worth"><span class="eyebrow">Fixed costs per month</span><span class="big num">${money(monthly)}</span>
          <p>${ch.length ? `${ch.length} ${ch.length === 1 ? "bill" : "bills and subscriptions"}.${lumpy ? ` Set aside ${money(lumpy)} a month so the yearly and quarterly ones never surprise you.` : ""}` : "Add your bills and subscriptions to see what the house costs each month."}</p></div>
        <div class="panel ready"><span class="eyebrow">This month</span>
          <div style="display:flex;align-items:baseline;gap:8px"><span class="score num">${money(thisMonth)}</span><span class="muted">spent so far</span></div>
          <ul class="mini-list"><li><span>Subscriptions, per year</span><span class="money">${money(subs)}</span></li><li><span>Improvements on record</span><span class="money">${money(sum(improvements, e => e.amount || 0))}</span></li></ul>
          <div class="actions"><button class="btn small primary" data-act="exp-new">Log a payment</button><button class="btn small" data-act="charge-new">Add a bill</button></div></div>
      </div>
      ${settleHTML()}
      ${windows.length || checks.length ? `<section class="section"><header><h2>Decide now</h2></header><ul class="alerts">
        ${windows.map(({ c, w }) => `<li><button class="alert ${w.d < 0 ? "bad" : "warn"}" data-act="charge-edit" data-id="${esc(c.id)}"><span class="stripe"></span><div><b>${esc(c.name)} contract ends ${fmtDate(c.contractEnd)}</b><span>${w.d < 0 ? "The notice date passed " + relDays(w.d) + ". Ask whether you can still switch." : "Cancel or renegotiate by " + fmtDate(w.deadline) + " or it rolls over" + (c.autoRenews === false ? "" : " at their standard rate") + "."}</span></div><span class="pill ${w.d < 0 ? "bad" : "warn"}">${w.d < 0 ? "Late" : relDays(w.d)}</span></button></li>`).join("")}
        ${checks.map(c => `<li><div class="alert info"><span class="stripe"></span><div><b>Still using ${esc(c.name)}?</b><span>It costs ${money(perMonth(c) * 12)} a year.</span></div><span class="actions"><button class="btn small" data-act="charge-keep" data-id="${esc(c.id)}">Yes</button><button class="btn small danger" data-act="charge-cancel" data-id="${esc(c.id)}">Cancelled it</button></span></div></li>`).join("")}</ul></section>` : ""}
      <div class="grid2">
        <section class="section"><header><h2>Due soon</h2></header><div class="rows">${due.map(c => { const d = daysUntil(c.nextDue); return `<div class="sweep-row"><div><div class="row-name">${esc(c.name)} <span class="money">${money(c.amount, { cents: true })}</span></div><div class="label">${esc(fmtDate(c.nextDue))}${c.autopay ? " · autopay" : ""}</div><div style="margin-top:4px">${duePill(d)}</div></div><div class="actions"><button class="btn small primary" data-act="charge-paid" data-id="${esc(c.id)}">Paid</button></div></div>`; }).join("") || `<div class="panel muted">No bills due in the next two weeks.</div>`}</div></section>
        <section class="section"><header><h2>Spent this year</h2></header><div class="panel bars">${cats.map(([k, v]) => `<div class="bar-row"><span class="name">${esc(opts([k])[0][1])}</span><span class="track"><i style="width:${Math.max(2, 100 * v / maxC)}%"></i></span><span class="money">${money(v)}</span></div>`).join("") || '<span class="muted">Log payments to see where the money goes.</span>'}</div></section>
      </div>
      <section class="section"><header><h2>Bills and subscriptions</h2></header><div class="rows">${[...S.charges.values()].sort((a, b) => perMonth(b) - perMonth(a)).map(c => `<button class="row" style="grid-template-columns:1fr auto" data-act="charge-edit" data-id="${esc(c.id)}"><span class="row-main"><span class="row-name">${esc(c.name)}</span><span class="label">${esc(opts([c.category || "other"])[0][1])} · ${esc((FREQ.find(f => f[0] === c.frequency) || FREQ[0])[1])}${c.contractEnd ? " · ends " + fmtDate(c.contractEnd) : ""}</span></span><span class="row-side"><span class="money">${money(c.amount, { cents: true })}</span><span class="pills">${c.status === "cancelled" ? '<span class="pill">Cancelled</span>' : c.autopay ? '<span class="pill good">Autopay</span>' : ""}</span></span></button>`).join("") || emptyHTML("No bills yet", "Add energy, water, internet, insurance and subscriptions. Add a contract end date and notice period, and Laventina gives you a task before it rolls over.", `<button class="btn primary" data-act="charge-new">Add a bill</button>`)}</div></section>
      <section class="section"><header><h2>Recent payments</h2></header><div class="panel">${exps.slice(0, 10).map(e => { const dr = driftFor(e); return `<div class="stock-row"><div><div class="row-name">${esc(e.description || (e.chargeId && S.charges.get(e.chargeId)?.name) || "Payment")}</div><div class="label">${esc(fmtDate(e.date))} · ${esc(opts([e.category || "other"])[0][1])}${e.itemId && S.items.get(e.itemId) ? " · " + esc(S.items.get(e.itemId).name) : ""}</div>${dr ? `<div class="muted" style="font-size:13px">${dr.pct > 0 ? "Up" : "Down"} ${Math.abs(dr.pct)}% on the usual ${money(dr.avg)}. ${dr.pct > 0 ? "Check for a price rise or a leak, a heater left on, or an appliance failing." : ""}</div>` : ""}</div><div class="actions"><span class="money">${money(e.amount, { cents: true })}</span>${dr ? `<span class="pill ${dr.pct > 0 ? "warn" : "good"}">${dr.pct > 0 ? "+" : ""}${dr.pct}%</span>` : ""}<button class="link" data-act="exp-edit" data-id="${esc(e.id)}">Edit</button></div></div>`; }).join("") || '<span class="muted">No payments logged yet.</span>'}</div></section>`;
    VIEWS.money.docs();
  },
  docs() {
    const el = $("#doc-list"); if (!el) return;
    const q = ($("#doc-q")?.value || "").toLowerCase().trim();
    const list = [...S.docs.values()].filter(d => !q || [d.title, d.type, d.physicalLocation, d.notes, d.itemId && S.items.get(d.itemId)?.name].join(" ").toLowerCase().includes(q))
      .sort((a, b) => (b.critical ? 1 : 0) - (a.critical ? 1 : 0) || (a.title || "").localeCompare(b.title || ""));
    el.innerHTML = list.map(d => { const x = daysUntil(d.expiryDate); const u = docUrl(d); return `<div class="sweep-row"><div><div class="row-name">${esc(d.title)}</div><div class="label">${esc(d.type || "document")}${d.itemId && S.items.get(d.itemId) ? " · " + esc(S.items.get(d.itemId).name) : ""}${d.physicalLocation ? " · paper: " + esc(d.physicalLocation) : ""}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${d.critical ? '<span class="pill info">Critical</span>' : ""}${x != null ? (x < 0 ? '<span class="pill bad">Expired</span>' : x <= (d.reminderDays || 30) ? `<span class="pill warn">Expires ${relDays(x)}</span>` : `<span class="pill">Valid to ${fmtShort(d.expiryDate)}</span>`) : ""}</div></div>
      <div class="actions">${u ? `<a class="btn small" href="${esc(u)}" target="_blank" rel="noopener">Open</a>` : ""}<button class="btn small" data-act="doc-edit" data-id="${esc(d.id)}">Edit</button></div></div>`; }).join("")
      || (S.docs.size ? `<div class="panel muted">No papers match.</div>` : emptyHTML("Where is that paper?", "Scan or photograph receipts, policies, manuals and certificates, and note where the original is kept. Link a receipt to an item to keep warranty proof one tap away.", `<button class="btn primary" data-act="doc-new">Add a document</button>`));
  }
};
const CHARGE_FIELDS = () => [
  { k: "name", label: "Name", full: true, ph: "Electricity, Netflix, home insurance" },
  { k: "category", label: "Type", type: "select", options: opts(CHARGE_CATS) },
  { k: "amount", label: "Amount", type: "number" },
  { k: "frequency", label: "How often", type: "select", options: FREQ },
  { k: "nextDue", label: "Next due", type: "date" },
  { k: "provider", label: "Provider", ph: "Company" },
  { k: "accountNumber", label: "Account or policy number" },
  { k: "contractEnd", label: "Contract ends", type: "date" },
  { k: "noticeDays", label: "Notice period (days)", type: "number" },
  { k: "autopay", label: "Paid automatically", type: "check" },
  { k: "autoRenews", label: "Renews automatically", type: "check", def: true },
  ...(S.members.length > 1 ? [{ k: "payerId", label: "Billed to", type: "select", options: memberOpts("Shared account") },
    { k: "split", label: "Split", type: "select", options: SPLITS },
    { k: "contactPerson", label: "Who deals with them", type: "select", options: memberOpts("Either of us") }] : []),
  { k: "remind", label: "Make tasks for this bill (pay, renew, still using?)", type: "check", def: true, full: true },
  { k: "notes", label: "Notes", type: "textarea", full: true }
];
function openCharge(c) {
  const isNew = !c;
  formSheet({ title: isNew ? "Add a bill or subscription" : c.name, fields: CHARGE_FIELDS(), data: c || { frequency: "monthly", category: "energy", autoRenews: true }, del: !isNew,
    privacy: "Private: a personal bill only I see", onRead(d) { d.remind = d.remind ? undefined : false; },
    onSave(d) { if (!d.name) return toast("Name it first."); if (isNew) { d.id = newId("c"); d.createdAt = nowISO(); d.status = "active"; } store.put("charges", d); closeSheet(); toast("Saved"); },
    delRun(d) { store.del("charges", d.id); } });
}
const EXP_FIELDS = () => [
  { k: "description", label: "What for", full: true },
  { k: "amount", label: "Amount", type: "number" },
  { k: "date", label: "Paid on", type: "date", def: todayISO() },
  { k: "category", label: "Type", type: "select", options: opts(EXP_CATS) },
  { k: "chargeId", label: "Bill", type: "select", options: [["", "One-off"], ...[...S.charges.values()].map(c => [c.id, c.name])] },
  { k: "itemId", label: "Item", type: "select", options: itemOpts() },
  { k: "projectId", label: "Project", type: "select", options: [["", "None"], ...[...S.projects.values()].map(p => [p.id, p.title])] },
  { k: "isImprovement", label: "Home improvement (keep for tax when selling)", type: "check", full: true },
  { k: "usage", label: "Usage", type: "number", hint: "kWh, m³…" },
  { k: "isEstimated", label: "Estimated bill", type: "check" },
  ...(S.members.length > 1 ? [{ k: "paidBy", label: "Paid by", type: "select", options: S.members.map(m => [m.id, m.name]) }, { k: "split", label: "Split", type: "select", options: SPLITS }] : [])
];
function openExpense(e, prefill) {
  const isNew = !e;
  formSheet({ title: isNew ? "Log a payment" : "Payment", fields: EXP_FIELDS(), data: e || { date: todayISO(), category: "household", paidBy: S.me?.id, split: "equal", ...prefill }, del: !isNew, privacy: "Private: not part of the shared money",
    onSave(d) { if (!d.amount) return toast("Add the amount."); if (isNew) { d.id = newId("e"); d.createdAt = nowISO(); } store.put("expenses", d); closeSheet(); toast("Saved"); },
    delRun(d) { store.del("expenses", d.id); } });
}
const DOC_FIELDS = () => [
  { k: "title", label: "Title", full: true, ph: "Dishwasher receipt, home insurance policy" },
  { k: "type", label: "Type", type: "select", options: opts(DOC_TYPES) },
  { k: "itemId", label: "For item", type: "select", options: itemOpts() },
  { k: "issuedDate", label: "Dated", type: "date" },
  { k: "expiryDate", label: "Expires", type: "date" },
  { k: "physicalLocation", label: "Paper copy is in", full: true, ph: "Blue folder, office shelf" },
  { k: "url", label: "Link", type: "url", full: true, ph: "https://" },
  { k: "critical", label: "Critical: needed in an emergency", type: "check", full: true },
  { k: "notes", label: "Notes", type: "textarea", full: true }
];
function openDoc(d, prefill) {
  const isNew = !d; let pending = d?.fileId;
  formSheet({ title: isNew ? "Add a document" : d.title, fields: DOC_FIELDS(), data: d || { type: "receipt", ...prefill }, del: !isNew, privacy: "Private: only I can see this paper",
    extraTop: assets ? `<div class="actions" style="align-items:center"><label class="btn" for="doc-file">${d?.fileId ? "Replace file" : "Attach a scan or PDF"}</label><input type="file" id="doc-file" accept="image/*,application/pdf" hidden><span id="doc-file-st" class="muted" style="font-size:14px">${d?.fileId ? "File attached" : ""}</span></div>` : "",
    onRead(x) { if (pending) x.fileId = pending; },
    onSave(x) {
      if (!x.title) return toast("Give it a title.");
      if (isNew) { x.id = newId("d"); x.createdAt = nowISO(); }
      store.put("docs", x);
      const it = x.itemId && S.items.get(x.itemId);
      if (it && x.type === "receipt" && x.issuedDate && !it.purchaseDate) store.putItem({ ...it, purchaseDate: x.issuedDate });
      closeSheet(); toast("Saved");
    }, delRun(x) { store.del("docs", x.id); } });
  $("#doc-file")?.addEventListener("change", async ev => {
    const f = ev.target.files[0]; if (!f) return; $("#doc-file-st").innerHTML = `<span class="spinner"></span> Uploading`;
    try { const blob = f.type.startsWith("image/") ? await shrink(f, 2000) : f; const r = await assets.upload(blob, { type: blob.type || f.type }); pending = r.id; $("#doc-file-st").textContent = "File attached: " + f.name; }
    catch (err) { $("#doc-file-st").textContent = assetErr(err); }
  });
}

// ---------- Projects ----------
const P_STATUS = [["idea", "Idea"], ["planning", "Planning"], ["scheduled", "Scheduled"], ["in_progress", "In progress"], ["on_hold", "On hold"], ["done", "Done"], ["abandoned", "Dropped"]];
const SCALE = [["1", "1 · low"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5 · high"]];
const COST_CATS = ["materials", "labor", "tools", "permits", "disposal", "other"];
const FIN_KINDS = ["paint", "tile", "grout", "flooring", "wallpaper", "fixture", "hardware", "other"];
const SHEENS = ["", "flat", "matte", "eggshell", "satin", "semi_gloss", "gloss"];
const pnum = (v, d = 3) => Number(v) || d;
function priority(p) { return (pnum(p.impact) + pnum(p.urgency) + (p.safetyIssue ? 3 : 0) + pnum(p.valueAdded) + pnum(p.energySavings, 1)) / pnum(p.effortBand); }
const actualCost = p => sum(p.costs || [], c => Number(c.actual) || 0);
const estCost = p => Number(p.estimate) || sum(p.costs || [], c => Number(c.estimated) || 0);
function overrunFactor() {
  const r = [...S.projects.values()].filter(p => p.status === "done" && estCost(p) > 0 && actualCost(p) > 0).map(p => actualCost(p) / estCost(p)).sort((a, b) => a - b);
  if (r.length < 3) return null; const m = Math.floor(r.length / 2); return r.length % 2 ? r[m] : (r[m - 1] + r[m]) / 2;
}
function realistic(p) { const f = overrunFactor() || 1; return estCost(p) * (1 + (p.contingencyPct ?? 15) / 100) * f; }
VIEWS.projects = {
  shell: () => `<div id="view-projects"><div id="proj-live"></div>
    <section class="section"><header><div><h2>Finishes</h2><p class="muted" style="margin:4px 0 0">The paint, tile and flooring on every surface, and where the leftovers are.</p></div><button class="btn small" data-act="fin-new">Log a finish</button></header>
      <label class="sr" for="fin-q">Search finishes</label><input type="search" id="fin-q" placeholder="Search: hallway, ceiling, white…"><div id="fin-list" class="rows"></div></section></div>`,
  live() {
    const el = $("#proj-live"); if (!el) return;
    const ps = [...S.projects.values()];
    const open = ps.filter(p => !["done", "abandoned"].includes(p.status));
    const top = [...open].sort((a, b) => priority(b) - priority(a)).slice(0, 3);
    const of = overrunFactor();
    const wish = [...S.wish.values()].filter(w => !["bought", "dropped"].includes(w.status)).sort((a, b) => (a.coolOffUntil || "").localeCompare(b.coolOffUntil || ""));
    const card = p => `<button class="row" style="grid-template-columns:1fr auto" data-act="proj-edit" data-id="${esc(p.id)}"><span class="row-main"><span class="row-name">${esc(p.title)}</span><span class="label">${esc((p.roomIds || []).map(roomName).join(", ") || "Whole house")} · ${stepsLabel(p)}</span></span>
      <span class="row-side">${estCost(p) ? `<span class="money">${money(realistic(p))}</span>` : ""}<span class="pills"><span class="pill info">Score ${priority(p).toFixed(1)}</span>${p.safetyIssue ? '<span class="pill bad">Safety</span>' : ""}${p.leadId && S.members.length > 1 ? avatarHTML(p.leadId, "Led by " + memberName(p.leadId)) : ""}${p._visibility === "private" ? '<span class="pill">Private</span>' : ""}</span></span></button>`;
    el.innerHTML = `
      <section class="section"><header><div><h2>Worth doing next</h2><p class="muted" style="margin:4px 0 0">Scored by impact, urgency, value and energy savings against effort.${of ? ` Your projects run ${of.toFixed(2)}× the estimate, so totals shown include that.` : ""}</p></div><button class="btn small primary" data-act="proj-new">New project</button></header>
        <div class="rows">${top.map(card).join("") || emptyHTML("No projects yet", "Capture an idea in five seconds: a title and a room. Score and budget it later.", `<button class="btn primary" data-act="proj-new">Add an idea</button>`)}</div></section>
      ${P_STATUS.filter(([k]) => k !== "abandoned").map(([k, l]) => { const g = ps.filter(p => p.status === k && !top.includes(p)); return g.length ? `<section class="group"><header><h3>${l}</h3><span class="muted">${g.length}</span></header><div class="rows">${g.map(card).join("")}</div></section>` : ""; }).join("")}
      <section class="section"><header><div><h2>Wishlist</h2><p class="muted" style="margin:4px 0 0">Things to buy, with a 30-day cooling-off timer so impulse buys get a second look.</p></div><button class="btn small" data-act="wish-new">Add a wish</button></header>
        <div class="rows">${wish.map(w => { const d = daysUntil(w.coolOffUntil); const cooling = d != null && d > 0; return `<div class="sweep-row"><div><div class="row-name">${esc(w.title)} ${w.price ? `<span class="money">${money(w.price)}</span>` : ""}</div><div class="label">${esc(w.roomId ? roomName(w.roomId) : "Anywhere")}${w.where ? " · " + esc(w.where) : ""}${w.replacesItemId && S.items.get(w.replacesItemId) ? " · replaces " + esc(S.items.get(w.replacesItemId).name) : ""}</div>
          <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${cooling ? `<span class="pill info">Cooling off · ${d} days left</span>` : `<span class="pill warn">Still want it?</span>`}${voteBadge(w)}${w._visibility === "private" ? '<span class="pill">Private</span>' : ""}</div>${voteRowHTML(w)}</div>
          <div class="actions">${cooling ? "" : `<button class="btn small primary" data-act="wish-bought" data-id="${esc(w.id)}" ${canBuy(w) ? "" : `disabled title="Over ${esc(money(threshold()))}: both of you need to want it"`}>Bought it</button>`}<button class="btn small" data-act="wish-drop" data-id="${esc(w.id)}">Drop</button><button class="btn small" data-act="wish-edit" data-id="${esc(w.id)}">Edit</button></div></div>`; }).join("") || `<div class="panel muted">Nothing on the wishlist.</div>`}</div></section>`;
    VIEWS.projects.fins();
  },
  fins() {
    const el = $("#fin-list"); if (!el) return;
    const q = ($("#fin-q")?.value || "").toLowerCase().trim();
    const list = [...S.finishes.values()].filter(f => !q || [roomName(f.roomId), f.surface, f.kind, f.brand, f.product, f.colorName, f.colorCode, f.notes].join(" ").toLowerCase().includes(q))
      .sort((a, b) => roomName(a.roomId).localeCompare(roomName(b.roomId)) || (a.surface || "").localeCompare(b.surface || ""));
    el.innerHTML = list.map(f => { const lo = f.leftoverItemId && S.items.get(f.leftoverItemId); return `<button class="row" data-act="fin-edit" data-id="${esc(f.id)}"><span class="thumb" style="${f.hex && /^#[0-9a-f]{3,8}$/i.test(f.hex) ? "background:" + f.hex : ""}" aria-hidden="true">${f.hex ? "" : esc((f.kind || "?")[0].toUpperCase())}</span>
      <span class="row-main"><span class="row-name">${esc([f.colorName, f.colorCode].filter(Boolean).join(" · ") || f.product || f.kind)}</span><span class="label">${esc(roomName(f.roomId))} · ${esc(f.surface || "")} · ${esc([f.brand, f.sheen && f.sheen.replace("_", "-")].filter(Boolean).join(" "))}</span></span>
      <span class="row-side"><span class="pills">${lo ? `<span class="pill good">Leftover: ${esc(placeLabel(lo))}</span>` : ""}${f.appliedAt ? `<span class="pill">${esc(f.appliedAt.slice(0, 4))}</span>` : ""}</span></span></button>`; }).join("")
      || (S.finishes.size ? `<div class="panel muted">No finishes match.</div>` : `<div class="panel muted">Log the paint code next time you paint, and touch-ups become a ten-second lookup.</div>`);
  }
};
function stepsLabel(p) { const st = projectSteps(p.id); return st.length ? `${st.filter(t => t.status === "done").length}/${st.length} steps` : "No steps yet"; }
function stepRowHTML(t) {
  return `<div class="subrow step-row"><input type="checkbox" class="t-done" ${t.status === "done" ? "checked" : ""} aria-label="Done"><input type="text" class="t-title" value="${esc(t.title)}" placeholder="Step">
    ${S.members.length > 1 ? `<select class="t-who" aria-label="Who">${memberOpts().map(([v, l]) => `<option value="${esc(v)}" ${String(t.assigneeId || "") === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}
    <input type="date" class="t-due" value="${esc(t.dueOn)}" aria-label="Due"><input type="hidden" class="t-id" value="${esc(t.id || "")}"><button type="button" class="link" data-act="p-step-del" aria-label="Remove step">Remove</button></div>`;
}
// When a step changes, the project status follows: first step done starts it, last step done offers the wrap-up.
function afterProjectStep(pid) {
  const p = S.projects.get(pid); if (!p) return;
  const st = projectSteps(pid); if (!st.length) return;
  const done = st.filter(t => t.status === "done").length;
  if (done && ["idea", "planning", "scheduled"].includes(p.status)) store.put("projects", { ...p, status: "in_progress", startDate: p.startDate || todayISO() });
  if (done === st.length && p.status !== "done") setTimeout(() => toast(`Every step of ${p.title} is done`, { label: "Wrap it up", run: () => { const q = { ...S.projects.get(pid), status: "done", doneDate: todayISO() }; store.put("projects", q); openProject(q); } }), 3300);
}

function costRowHTML(c) { return `<div class="fields cost-row" style="grid-template-columns:2fr 1fr 1fr 1fr"><input type="text" class="c-label" value="${esc(c.label)}" placeholder="Item" aria-label="Cost item"><select class="c-cat" aria-label="Kind">${COST_CATS.map(k => `<option ${c.category === k ? "selected" : ""}>${k}</option>`).join("")}</select><input type="number" step="any" class="c-est" value="${esc(c.estimated)}" placeholder="Est." aria-label="Estimated"><input type="number" step="any" class="c-act" value="${esc(c.actual)}" placeholder="Actual" aria-label="Actual"></div>`; }
const PROJ_FIELDS = () => [
  { k: "title", label: "Project", full: true, ph: "Repaint the hallway" },
  { k: "roomId", label: "Room", type: "select", options: roomOpts() },
  { k: "status", label: "Status", type: "select", options: P_STATUS },
  { k: "description", label: "Notes", type: "textarea", full: true },
  { k: "impact", label: "Impact on daily life", type: "select", options: SCALE, def: "3" },
  { k: "urgency", label: "Urgency", type: "select", options: SCALE, def: "3" },
  { k: "valueAdded", label: "Value added", type: "select", options: SCALE, def: "3" },
  { k: "energySavings", label: "Energy savings", type: "select", options: SCALE, def: "1" },
  { k: "effortBand", label: "Effort and cost", type: "select", options: [["1", "1 · an afternoon"], ["2", "2 · a weekend"], ["3", "3 · a few weekends"], ["4", "4 · hire a trade"], ["5", "5 · renovation"]], def: "3" },
  { k: "diyOrPro", label: "Who", type: "select", options: [["diy", "DIY"], ["pro", "Pro"], ["mixed", "Mixed"]] },
  { k: "safetyIssue", label: "Fixes a safety issue", type: "check", full: true },
  { k: "estimate", label: "Budget estimate", type: "number" },
  { k: "contingencyPct", label: "Contingency %", type: "number", def: 15 },
  { k: "startDate", label: "Start", type: "date" },
  { k: "dueDate", label: "Finish by", type: "date" },
  { k: "sequential", label: "Do the steps in order (later steps wait for earlier ones)", type: "check", full: true },
  ...(S.members.length > 1 ? [{ k: "leadId", label: "Who leads it", type: "select", options: memberOpts("Nobody yet") }] : [])
];
function openProject(p) {
  const isNew = !p;
  const data = p ? { ...p, roomId: (p.roomIds || [])[0] } : { status: "idea", costs: [], sequential: true, leadId: S.me?.id };
  const costs = data.costs || [];
  const steps = p ? projectSteps(p.id) : [];
  formSheet({ title: isNew ? "New project" : p.title, fields: PROJ_FIELDS(), data, del: !isNew, privacy: "Private idea: only I see it until I share it",
    extra: `<fieldset><legend class="eyebrow">Steps</legend><p class="muted" style="margin:0;font-size:14px">Each step is a task: it shows up in Today when it is due, and ticking it there moves the project along.</p><div id="p-tasks" style="display:grid;gap:6px">${steps.map(stepRowHTML).join("")}</div><div><button type="button" class="btn small" data-act="p-add-task">Add a step</button></div></fieldset>
      <fieldset><legend class="eyebrow">Costs</legend><div id="p-costs" style="display:grid;gap:6px">${costs.map(costRowHTML).join("")}</div><div><button type="button" class="btn small" data-act="p-add-cost">Add a cost</button></div>
      ${!isNew && estCost(p) ? `<div class="ai-note">Estimate ${money(estCost(p))} · realistic ${money(realistic(p))}${overrunFactor() ? " (includes your usual overrun)" : " (includes contingency)"} · spent ${money(actualCost(p))}</div>` : ""}</fieldset>
      ${!isNew && p.status === "done" ? `<div class="ai-note" style="display:grid;gap:8px"><b>Wrap up</b><span>Make the house remember this job.</span><div class="actions"><button type="button" class="btn small" data-act="p-fin" data-id="${esc(p.id)}">Log a finish</button><button type="button" class="btn small" data-act="p-item" data-id="${esc(p.id)}">Add a new item</button><button type="button" class="btn small" data-act="p-leftover" data-id="${esc(p.id)}">Store leftovers</button></div></div>` : ""}`,
    onRead(d) {
      d.roomIds = d.roomId ? [d.roomId] : []; delete d.roomId;
      for (const k of ["impact", "urgency", "valueAdded", "energySavings", "effortBand"]) if (d[k]) d[k] = Number(d[k]);
      d._steps = [...document.querySelectorAll("#p-tasks .step-row")].map(r => ({ id: r.querySelector(".t-id").value, title: r.querySelector(".t-title").value.trim(), done: r.querySelector(".t-done").checked, assigneeId: r.querySelector(".t-who")?.value || undefined, dueOn: r.querySelector(".t-due").value || undefined })).filter(t => t.title);
      delete d.tasks;
      d.costs = [...document.querySelectorAll("#p-costs .cost-row")].map(r => { const n = s => { const v = parseFloat(r.querySelector(s).value.replace(",", ".")); return isFinite(v) ? v : undefined; }; return { label: r.querySelector(".c-label").value.trim(), category: r.querySelector(".c-cat").value, estimated: n(".c-est"), actual: n(".c-act") }; }).filter(c => c.label);
    },
    onSave(d) {
      if (!d.title) return toast("Name the project first.");
      if (isNew) { d.id = newId("j"); d.createdAt = nowISO(); }
      const wasDone = p && p.status === "done";
      if (d.status === "done" && !d.doneDate) d.doneDate = todayISO();
      const rows = d._steps || []; delete d._steps;
      store.put("projects", d);
      const keep = new Set();
      rows.forEach((r, i) => {
        const old = r.id && S.tasks.get(r.id);
        const t = old ? { ...old } : newTask({ projectId: d.id, roomId: (d.roomIds || [])[0] });
        Object.assign(t, { title: r.title, assigneeId: r.assigneeId, dueOn: r.dueOn, sortOrder: i + 1, visibility: d._visibility === "private" ? "private" : "shared" });
        if (r.done && t.status !== "done") Object.assign(t, { status: "done", doneAt: nowISO(), doneBy: S.me?.id });
        if (!r.done && t.status === "done") Object.assign(t, { status: "open", doneAt: undefined, doneBy: undefined });
        keep.add(t.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(t)) putTask(t);
      });
      for (const t of projectSteps(d.id)) if (!keep.has(t.id)) delTask(t.id);
      if (d.status === "done" && !wasDone) { openProject(d); toast("Done. Wrap it up so the house remembers."); } else { closeSheet(); toast("Saved"); }
    }, delRun(d) { for (const t of projectSteps(d.id)) delTask(t.id); store.del("projects", d.id); } });
}
const FIN_FIELDS = () => [
  { k: "roomId", label: "Room", type: "select", options: roomOpts("Choose a room") },
  { k: "surface", label: "Surface", ph: "North wall, ceiling, floor" },
  { k: "kind", label: "Kind", type: "select", options: opts(FIN_KINDS) },
  { k: "brand", label: "Brand" },
  { k: "product", label: "Product" },
  { k: "colorName", label: "Color name" },
  { k: "colorCode", label: "Color code" },
  { k: "sheen", label: "Sheen", type: "select", options: SHEENS.map(s => [s, s ? s.replace("_", "-") : "–"]) },
  { k: "hex", label: "Swatch", type: "color", hint: "approximate" },
  { k: "appliedAt", label: "Applied on", type: "date" },
  { k: "leftoverItemId", label: "Leftover stored as", type: "select", options: itemOpts("No leftover") },
  { k: "notes", label: "Notes", type: "textarea", full: true }
];
function openFinish(f, prefill) {
  const isNew = !f;
  formSheet({ title: isNew ? "Log a finish" : "Finish", fields: FIN_FIELDS(), data: f || { kind: "paint", hex: "#d9d4c7", appliedAt: todayISO(), ...prefill }, del: !isNew,
    onSave(d) { if (isNew) { d.id = newId("f"); d.createdAt = nowISO(); } store.put("finishes", d); closeSheet(); toast("Saved to the finishes ledger"); },
    delRun(d) { store.del("finishes", d.id); } });
}
const WISH_FIELDS = () => [
  { k: "title", label: "What", full: true },
  { k: "price", label: "Price", type: "number" },
  { k: "where", label: "Seen at" },
  { k: "roomId", label: "For room", type: "select", options: roomOpts("Anywhere") },
  { k: "replacesItemId", label: "Replaces", type: "select", options: itemOpts("Nothing") },
  { k: "dimensionsCm.w", label: "Width cm", type: "number" },
  { k: "dimensionsCm.d", label: "Depth cm", type: "number" },
  { k: "dimensionsCm.h", label: "Height cm", type: "number" },
  { k: "url", label: "Link", type: "url" }
];
const VOTES = [["want", "Want it"], ["meh", "Meh"], ["no", "No"]];
const threshold = () => Number(S.house.sharedSpendThreshold) || 150;
function voteBadge(w) {
  if (S.members.length < 2 || w._visibility === "private") return "";
  const v = w.votes || {}, vs = S.members.map(m => v[m.id]);
  if (vs.every(x => x === "want")) return '<span class="pill good">Both want it</span>';
  if (vs.some(x => x === "no")) return '<span class="pill bad">Someone said no</span>';
  if (vs.filter(Boolean).length < S.members.length) return `<span class="pill">Waiting on ${esc(S.members.filter(m => !v[m.id]).map(m => m.name.split(" ")[0]).join(", "))}</span>`;
  return '<span class="pill warn">Split</span>';
}
function canBuy(w) {
  if (S.members.length < 2 || w._visibility === "private" || !(Number(w.price) >= threshold())) return true;
  const v = w.votes || {}; return S.members.every(m => v[m.id] === "want");
}
function voteRowHTML(w) {
  if (S.members.length < 2 || w._visibility === "private") return "";
  const mine = (w.votes || {})[S.me.id];
  return `<div class="chips" style="margin-top:6px" role="group" aria-label="Your vote">${VOTES.map(([k, l]) => `<button class="chip" data-act="wish-vote" data-id="${esc(w.id)}" data-v="${k}" aria-pressed="${mine === k}">${l}</button>`).join("")}</div>`;
}
function openWish(w) {
  const isNew = !w;
  formSheet({ title: isNew ? "Add a wish" : w.title, fields: WISH_FIELDS(), data: w || {}, del: !isNew, privacy: "Private: a surprise or a half-formed idea",
    extraTop: isNew ? `<label class="check"><input type="checkbox" id="w-cool" checked> Wait 30 days before buying</label>` : "",
    onSave(d) { if (!d.title) return toast("Name it first."); if (isNew) { d.id = newId("w"); d.createdAt = nowISO(); d.status = "wanted"; if ($("#w-cool")?.checked) d.coolOffUntil = addDays(todayISO(), 30); } store.put("wish", d); closeSheet(); toast(d.coolOffUntil && daysUntil(d.coolOffUntil) > 0 ? "Added. Laventina will ask again in 30 days." : "Added"); },
    delRun(d) { store.del("wish", d.id); } });
}

// ---------- Links on the item page ----------
function linkedHTML(id) {
  const plans = activePlans().filter(p => p.itemId === id);
  const docs = [...S.docs.values()].filter(d => d.itemId === id);
  const props = proposals().filter(x => x.it && x.it.id === id);
  const spent = sum([...S.expenses.values()].filter(e => e.itemId === id), e => e.amount || 0);
  return `<fieldset><legend class="eyebrow">Care and papers</legend>
    ${plans.length ? `<ul class="mini-list">${plans.map(p => `<li><span>${esc(p.title)}</span><span class="muted">${relDays(daysUntil(p.nextDue))}</span></li>`).join("")}</ul>` : ""}
    ${props.length ? `<div class="actions"><button type="button" class="btn small" data-act="up-add-item" data-id="${esc(id)}">Add ${props.length} suggested care task${props.length > 1 ? "s" : ""}</button></div>` : ""}
    ${docs.length ? `<ul class="mini-list">${docs.map(d => `<li><span>${esc(d.title)}</span><span>${docUrl(d) ? `<a href="${esc(docUrl(d))}" target="_blank" rel="noopener">Open</a>` : `<span class="muted">${esc(d.physicalLocation || d.type)}</span>`}</span></li>`).join("")}</ul>` : ""}
    ${spent ? `<span class="muted" style="font-size:14px">Spent on upkeep and repairs: ${money(spent)}</span>` : ""}
    <div class="actions"><button type="button" class="btn small" data-act="doc-for-item" data-id="${esc(id)}">Add a receipt, manual or warranty</button></div></fieldset>`;
}

// ---------- Module events ----------
document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const id = t.dataset.id;
  switch (t.dataset.act) {
    case "g-del": $("#g-del").innerHTML = `<div class="confirm"><span style="flex:1">Delete this for good?</span><button type="button" class="btn small danger" data-act="g-del-yes">Delete</button><button type="button" class="btn small" data-act="g-del-no">Keep</button></div>`; break;
    case "g-del-no": $("#g-del").innerHTML = ""; break;
    case "g-del-yes": { const d = GF.data; GF.delRun && GF.delRun(d); closeSheet(); toast("Deleted"); break; }
    case "up-done": { const p = S.plans.get(id); if (p) openDone(p); break; }
    case "settle": {
      const amt = Number(t.dataset.amount); if (!amt) break;
      store.put("settlements", { id: newId("x"), from: t.dataset.from, to: t.dataset.to, amount: amt, date: todayISO(), by: S.me?.id, createdAt: nowISO() });
      toast(`Recorded: ${memberName(t.dataset.from)} paid ${memberName(t.dataset.to)} ${money(amt, { cents: true })}`); break;
    }
    case "sub-keep": case "sub-cancel": {
      const c = S.charges.get(id), task = S.tasks.get(t.dataset.task); if (!c) break;
      if (t.dataset.act === "sub-keep") { store.put("charges", { ...c, lastUsedCheck: todayISO() }); toast("Kept. Laventina asks again in six months."); }
      else { store.put("charges", { ...c, status: "cancelled" }); putTask(newTask({ title: `Cancel ${c.name}`, dueOn: todayISO(), assigneeId: S.me?.id, priority: 2, visibility: c._visibility === "private" ? "private" : "shared", notes: c.provider ? "Provider: " + c.provider : undefined })); toast(`Added a task to cancel ${c.name}. Saves ${money(perMonth(c) * 12)} a year.`); }
      if (task) finishTask(task, { quiet: true }); closeSheet(); break;
    }
    case "wish-vote": { const w = S.wish.get(id); if (!w) break; const v = { ...(w.votes || {}) }; v[S.me.id] = v[S.me.id] === t.dataset.v ? undefined : t.dataset.v; store.put("wish", { ...w, votes: v }); break; }
    case "p-step-del": t.closest(".step-row").remove(); break;
    case "up-snooze": { const p = S.plans.get(id); if (!p) break; const nd = addDays(todayISO(), 7); store.put("plans", { ...p, nextDue: p.nextDue > nd ? p.nextDue : nd }); toast("Moved to next week"); break; }
    case "up-edit": { const p = S.plans.get(id); if (p) openPlan(p); break; }
    case "up-new": openPlan(null); break;
    case "up-add": case "up-skip": { const tp = TPL[t.dataset.t]; const it = id ? S.items.get(id) : null; const p = makePlan(tp, it); if (t.dataset.act === "up-skip") p.active = false; store.put("plans", p); break; }
    case "up-add-all": for (const { t: tp, it } of proposals()) store.put("plans", makePlan(tp, it)); toast("Care plans added"); break;
    case "up-add-item": { for (const { t: tp, it } of proposals().filter(x => x.it && x.it.id === id)) store.put("plans", makePlan(tp, it)); toast("Care tasks added to Upkeep"); t.remove(); break; }
    case "up-flag": { const f = { ...(S.upkeep.flags || {}) }; f[t.dataset.k] = !f[t.dataset.k]; store.putMeta("upkeep", { flags: f }); break; }
    case "ud-cond": document.querySelectorAll('[data-act="ud-cond"]').forEach(b => b.setAttribute("aria-pressed", b === t ? String(t.getAttribute("aria-pressed") !== "true") : "false")); break;
    case "charge-new": openCharge(null); break;
    case "charge-edit": { const c = S.charges.get(id); if (c) openCharge(c); break; }
    case "charge-keep": { const c = S.charges.get(id); if (c) { store.put("charges", { ...c, lastUsedCheck: todayISO() }); closeSourceTasks("money", c.id, "subscription"); } break; }
    case "charge-cancel": { const c = S.charges.get(id); if (c) { store.put("charges", { ...c, status: "cancelled" }); closeSourceTasks("money", c.id); toast(`Marked cancelled: saves ${money(perMonth(c) * 12)} a year`); } break; }
    case "charge-paid": { const c = S.charges.get(id); if (c) openPaid(c, taskForSource("money", c.id, "pay")); break; }
    case "exp-new": openExpense(null); break;
    case "exp-edit": { const x = S.expenses.get(id); if (x) openExpense(x); break; }
    case "doc-new": openDoc(null); break;
    case "doc-edit": { const x = S.docs.get(id); if (x) openDoc(x); break; }
    case "doc-for-item": { const it = S.items.get(id); closeSheet(); openDoc(null, { itemId: id, title: it ? it.name + " receipt" : "" }); break; }
    case "proj-new": openProject(null); break;
    case "proj-edit": { const p = S.projects.get(id); if (p) openProject(p); break; }
    case "p-add-task": $("#p-tasks").insertAdjacentHTML("beforeend", stepRowHTML({ title: "" })); $("#p-tasks .step-row:last-child .t-title").focus(); break;
    case "p-add-cost": $("#p-costs").insertAdjacentHTML("beforeend", costRowHTML({ category: "materials" })); break;
    case "p-fin": { const p = S.projects.get(id); openFinish(null, { roomId: (p.roomIds || [])[0], projectId: p.id }); break; }
    case "p-item": { const p = S.projects.get(id); openEditor(null, { roomId: (p.roomIds || [])[0] || "", purchaseDate: todayISO(), notes: "From project: " + p.title }); break; }
    case "p-leftover": { const p = S.projects.get(id); openEditor(null, { roomId: "", category: "supplies.paint", name: "Leftover: ", notes: "From project: " + p.title, minQty: undefined }, "Where are the leftovers stored? Pick the room and spot."); break; }
    case "fin-new": openFinish(null); break;
    case "fin-edit": { const f = S.finishes.get(id); if (f) openFinish(f); break; }
    case "wish-new": openWish(null); break;
    case "wish-edit": { const w = S.wish.get(id); if (w) openWish(w); break; }
    case "wish-drop": { const w = S.wish.get(id); if (w) { store.put("wish", { ...w, status: "dropped" }); toast("Dropped. Money saved."); } break; }
    case "wish-bought": {
      const w = S.wish.get(id); if (!w) break; const iid = newId("i");
      store.put("wish", { ...w, status: "bought", boughtItemId: iid });
      openEditor(null, { id: iid, name: w.title, roomId: w.roomId || "", value: w.price, purchasePrice: w.price, purchaseDate: todayISO(), store: w.where, dimensionsCm: w.dimensionsCm || {} }, "Add the warranty and serial while the box is still here.");
      const old = w.replacesItemId && S.items.get(w.replacesItemId);
      if (old) toast(`Replacing ${old.name}?`, { label: "Mark it gone", run: () => store.putItem({ ...old, disposedOn: todayISO() }) });
      break;
    }
  }
});
document.addEventListener("submit", e => { if (e.target.id === "g-form") { e.preventDefault(); const d = readGF(); GF.onSave(d); } });
document.addEventListener("input", e => { if (e.target.id === "doc-q") VIEWS.money.docs(); if (e.target.id === "fin-q") VIEWS.projects.fins(); });
document.addEventListener("change", e => { if (e.target.id === "up-hemi") store.putMeta("upkeep", { hemisphere: e.target.value }); });

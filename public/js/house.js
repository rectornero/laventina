"use strict";
// ---------- Views ----------

VIEWS.overview = {
  shell: () => `<div id="view-overview"></div>`,
  live() {
    const el = $("#view-overview"); if (!el) return;
    if (S.mode === "loading") { el.innerHTML = emptyHTML("Opening your house", "Fetching your rooms and things."); return; }
    const items = activeItems();
    if (!items.length) {
      el.innerHTML = emptyHTML("Start your inventory", "Snap a photo of a shelf or type what you own, and Claude fills in the details. Start with the expensive things: they matter most for insurance.", `<button class="btn primary" data-act="quickadd">Add your first things</button>`) + modulesHTML();
      return;
    }
    const total = sum(items, totalValue);
    const ins = items.filter(insurable);
    const score = ins.length ? Math.round(100 * sum(ins, proofScore) / ins.length) : 0;
    const todo = ins.filter(i => missingProof(i).length).sort((a, b) => totalValue(b) - totalValue(a)).slice(0, 4);
    const att = [];
    for (const it of items) for (const f of flagsFor(it)) if (f.rank != null && !(f.k === "lent" && f.cls === "info")) att.push({ it, f });
    att.sort((a, b) => a.f.rank - b.f.rank);
    // Coming up: warranty ends and use-by dates in the next 180 days
    const up = [];
    for (const it of items) {
      const w = daysUntil(it.warrantyUntil); if (w != null && w > 60 && w <= 180) up.push({ d: w, iso: it.warrantyUntil, t: "Warranty ends", it });
      const e = daysUntil(it.expiresOn); if (e != null && e > 30 && e <= 180) up.push({ d: e, iso: it.expiresOn, t: "Use by", it });
    }
    up.sort((a, b) => a.d - b.d);
    const byRoom = new Map();
    for (const it of items) byRoom.set(it.roomId || "", (byRoom.get(it.roomId || "") || 0) + totalValue(it));
    const roomVals = [...byRoom.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const maxV = roomVals.length ? roomVals[0][1] : 1;
    const examples = items.filter(i => i.example).length;
    el.innerHTML = `
      ${examples ? `<p class="banner">${examples} example items are shown so you can see how the inventory works. <button class="link" data-act="clear-examples">Remove examples</button></p>` : ""}
      <div class="hero">
        <div class="worth">
          <span class="eyebrow">Replacement value on record</span>
          <span class="big num">${money(total)}</span>
          <p>${items.length} things across ${S.rooms.size} rooms. This is the number your contents insurance should cover.</p>
        </div>
        <div class="panel ready">
          <span class="eyebrow">Claim readiness</span>
          <div style="display:flex;align-items:baseline;gap:8px"><span class="score num">${score}%</span><span class="muted">of the proof an insurer asks for</span></div>
          <div class="meter" role="img" aria-label="${score} percent"><i style="width:${score}%"></i></div>
          ${todo.length ? `<span class="muted" style="font-size:14px">Document these next:</span>
          <ul class="mini-list">${todo.map(i => `<li><span><button class="link" data-act="edit" data-id="${esc(i.id)}">${esc(i.name)}</button></span><span class="muted">needs ${esc(missingProof(i).join(", "))}</span></li>`).join("")}</ul>` : `<span class="muted" style="font-size:14px">Every valuable item has a photo, value, and date. Nicely done.</span>`}
        </div>
      </div>
      ${(() => { const feed = openTasks().filter(t => isGenerated(t) && visibleNow(t)).sort(taskSort); return feed.length ? `<section class="section"><header><h2>Around the house</h2><button class="link" data-act="list-view" data-list="house">All house jobs</button></header>${taskListHTML(feed.slice(0, 6))}</section>` : ""; })()}
      <div class="grid2">
        <section class="section">
          <header><h2>Needs attention</h2>${att.length ? `<button class="link" data-act="goto-flag" data-flag="attention">See all ${att.length}</button>` : ""}</header>
          ${att.length ? `<ul class="alerts">${att.slice(0, 6).map(({ it, f }) => `<li><button class="alert ${f.cls}" data-act="edit" data-id="${esc(it.id)}"><span class="stripe"></span><div><b>${esc(it.name)}</b><span>${esc(f.why)}</span></div><span class="pill ${f.cls}">${esc(f.t)}</span></button></li>`).join("")}</ul>`
            : `<div class="panel muted">Nothing is expiring, running low, or overdue.</div>`}
        </section>
        <section class="section">
          <header><h2>Coming up</h2><span class="eyebrow">Next 6 months</span></header>
          <div class="panel">${up.length ? `<ul class="timeline">${up.slice(0, 7).map(u => `<li><span class="when ${u.d < 90 ? "soon" : ""}">${fmtShort(u.iso)}</span><span>${esc(u.t)}: <button class="link" data-act="edit" data-id="${esc(u.it.id)}">${esc(u.it.name)}</button> <span class="muted">${relDays(u.d)}</span></span></li>`).join("")}</ul>` : `<span class="muted">No warranty ends or use-by dates in the next six months. Add warranty dates to your appliances and electronics to see them here.</span>`}</div>
        </section>
      </div>
      <section class="section">
        <header><h2>Value by room</h2><span class="eyebrow">Tap a room to open it</span></header>
        <div class="panel bars">${roomVals.map(([rid, v]) => `<button class="bar-row" data-act="goto-room" data-room="${esc(rid || "none")}"><span class="name">${esc(rid ? roomName(rid) : "Unsorted")}</span><span class="track"><i style="width:${Math.max(2, 100 * v / maxV)}%"></i></span><span class="money">${money(v)}</span></button>`).join("") || '<span class="muted">Add values to items to see where your money sits.</span>'}</div>
      </section>
      ${modulesHTML()}`;
  }
};
function modulesHTML() {
  if (typeof healthScore !== "function") return "";
  const hs = healthScore(), due = activePlans().filter(p => planDue(p) <= 7).length;
  const monthly = sum(activeCharges(), perMonth), docs = S.docs.size;
  const open = [...S.projects.values()].filter(p => !["done", "abandoned"].includes(p.status));
  const top = [...open].sort((a, b) => priority(b) - priority(a))[0];
  return `<section class="section"><header><h2>The rest of the house</h2></header>
    <div class="modules">
      <button class="module" data-act="tab" data-tab="upkeep"><span class="eyebrow">Upkeep</span><span class="big2 num">${hs ? "Home Health " + hs.score : "Set up care"}</span><span class="muted">${hs ? due + " tasks due this week" : proposals().length + " care tasks suggested from your inventory"}</span></button>
      <button class="module" data-act="tab" data-tab="projects"><span class="eyebrow">Projects</span><span class="big2">${top ? esc(top.title) : "No projects yet"}</span><span class="muted">${top ? "Top of " + open.length + " open, by priority score" : "Ideas, budgets, paint codes, wishlist"}</span></button>
      <button class="module" data-act="tab" data-tab="money"><span class="eyebrow">Money & papers</span><span class="big2 num">${activeCharges().length ? money(monthly) + " / month" : "Add your bills"}</span><span class="muted">${docs ? docs + " documents on file" : "Receipts, policies, manuals, contract alerts"}</span></button>
    </div></section>`;
}
const FLAG_FILTERS = [["all", "Everything"], ["attention", "Needs attention"], ["covered", "Under warranty"], ["low", "Low stock"], ["lent", "Lent out"], ["nophoto", "No photo"], ["valuable", "Worth 500+"], ["gone", "Gone"]];
function matchFlag(it, flag) {
  const fl = flagsFor(it);
  switch (flag) {
    case "all": return !it.disposedOn;
    case "gone": return !!it.disposedOn;
    case "attention": return !it.disposedOn && fl.some(f => f.rank != null && f.rank <= 2);
    case "covered": return !it.disposedOn && fl.some(f => f.k === "covered" || f.k === "warranty");
    case "nophoto": return !it.disposedOn && !(it.photoIds && it.photoIds.length);
    case "valuable": return !it.disposedOn && totalValue(it) >= 500;
    default: return !it.disposedOn && fl.some(f => f.k === flag);
  }
}
function matchQuery(it, q) {
  if (!q) return true;
  const hay = [it.name, it.spot, roomName(it.roomId), CAT_LABEL[it.category], it.brand, it.model, it.serial, it.notes, it.lentTo, it.store, (it.tags || []).join(" "), it.attributes && Object.values(it.attributes).join(" ")].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}
VIEWS.inventory = {
  shell: () => `<div id="view-inventory">
    <div class="toolbar">
      <div class="search">
        <label class="sr" for="inv-q">Search your things</label>
        <input type="search" id="inv-q" placeholder="Find anything: drill, passport, AA, serial…" value="${esc(S.q)}">
        <label class="sr" for="inv-flag">Show</label>
        <select id="inv-flag" style="flex:0 1 200px">${FLAG_FILTERS.map(([k, l]) => `<option value="${k}" ${S.flag === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      </div>
      <div class="chips" id="inv-rooms"></div>
    </div>
    <div id="inv-list"></div>
    <div class="actions" style="margin-top:20px"><button class="btn" data-act="export">Insurance list (CSV)</button></div>
  </div>`,
  live() {
    const chipsEl = $("#inv-rooms"); if (!chipsEl) return;
    const counts = {};
    for (const it of activeItems()) counts[it.roomId || "none"] = (counts[it.roomId || "none"] || 0) + 1;
    chipsEl.innerHTML = [["all", "All rooms"], ...roomList().map(r => [r.id, r.name]), ...(counts.none ? [["none", "Unsorted"]] : [])]
      .map(([k, l]) => `<button class="chip" data-act="room-filter" data-room="${esc(k)}" aria-pressed="${S.room === k}">${esc(l)}${k !== "all" && counts[k] ? ` <span class="muted">${counts[k]}</span>` : ""}</button>`).join("");
    const list = [...S.items.values()].filter(it => matchFlag(it, S.flag) && matchQuery(it, S.q) && (S.room === "all" || (S.room === "none" ? !S.rooms.has(it.roomId) : it.roomId === S.room)));
    const el = $("#inv-list");
    if (S.mode === "loading") { el.innerHTML = emptyHTML("Opening your house", "Fetching your things."); return; }
    if (!S.items.size) { el.innerHTML = emptyHTML("Nothing here yet", "Add things one at a time, or photograph a whole shelf and let Claude list what is on it.", `<button class="btn primary" data-act="quickadd">Add things</button>`); return; }
    if (!list.length) { el.innerHTML = emptyHTML("No matches", "Try another word or clear the filters.", `<button class="btn" data-act="clear-filters">Clear filters</button>`); return; }
    const groups = new Map();
    for (const it of list) { const k = S.rooms.has(it.roomId) ? it.roomId : ""; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    const order = [...roomList().map(r => r.id), ""];
    el.innerHTML = order.filter(k => groups.has(k)).map(k => {
      const g = groups.get(k).sort((a, b) => (a.spot || "").localeCompare(b.spot || "") || a.name.localeCompare(b.name));
      return `<section class="group"><header><h3>${esc(k ? roomName(k) : "Unsorted")}</h3><span class="muted num">${g.length} · ${money(sum(g, totalValue))}</span></header><div class="rows">${g.map(it => rowHTML(it, { noRoom: true })).join("")}</div></section>`;
    }).join("");
  }
};

VIEWS.sweep = {
  shell: () => `<div id="view-sweep"></div>`,
  live() {
    const el = $("#view-sweep"); if (!el) return;
    const items = activeItems();
    if (!S.sweepRoom || !S.rooms.has(S.sweepRoom)) {
      S.sweepRoom = null;
      el.innerHTML = `<section class="section"><header><div><h2>Room sweep</h2><p class="muted" style="margin:4px 0 0;max-width:62ch">Walk into a room with your phone and tick off what is still there. It keeps your insurance list true and finds things that wandered off. Aim for each room once a year.</p></div></header>
        ${S.rooms.size ? `<div class="cards">${roomList().map(r => {
          const ri = items.filter(i => i.roomId === r.id);
          const fresh = ri.filter(i => daysSince(i.verifiedAt) < 365).length;
          const pct = ri.length ? Math.round(100 * fresh / ri.length) : 100;
          return `<button class="roomcard" data-act="sweep-room" data-room="${esc(r.id)}"><b>${esc(r.name)}</b><span class="muted num">${ri.length} things · ${fresh} checked this year</span><div class="meter"><i style="width:${pct}%;background:${pct === 100 ? "var(--good)" : "var(--accent)"}"></i></div><span class="eyebrow">${r.lastSweep ? "Last sweep " + fmtDate(r.lastSweep) : "Never swept"}</span></button>`;
        }).join("")}</div>` : emptyHTML("No rooms yet", "Add rooms in Settings first.", `<button class="btn" data-act="settings">Open settings</button>`)}</section>`;
      return;
    }
    const r = S.rooms.get(S.sweepRoom);
    const ri = items.filter(i => i.roomId === r.id).sort((a, b) => (a.spot || "").localeCompare(b.spot || "") || a.name.localeCompare(b.name));
    const done = ri.filter(i => S.swept.has(i.id)).length;
    el.innerHTML = `<section class="section"><header><div><span class="eyebrow">Room sweep</span><h2>${esc(r.name)}</h2></div><button class="btn small" data-act="sweep-exit">All rooms</button></header>
      <div class="panel" style="display:grid;gap:8px"><div style="display:flex;justify-content:space-between"><b class="num">${done} of ${ri.length} checked</b>${done === ri.length && ri.length ? '<span class="pill good">Room done</span>' : ""}</div><div class="meter"><i style="width:${ri.length ? 100 * done / ri.length : 0}%"></i></div></div>
      <div class="rows">${ri.map(it => {
        const ok = S.swept.has(it.id);
        return `<div class="sweep-row ${ok ? "done" : ""}"><div><div class="row-name">${esc(it.name)}${(Number(it.qty) || 1) !== 1 ? ` <small class="muted">× ${it.qty}</small>` : ""}</div><div class="label">${esc(it.spot || "No spot set")}${!ok && it.verifiedAt ? " · last seen " + esc(fmtDate(it.verifiedAt)) : ""}</div></div>
          <div class="actions">${ok ? `<span class="pill good">Here</span>` : `<button class="btn small primary" data-act="sw-here" data-id="${esc(it.id)}">Here</button>
          <label class="sr" for="mv-${esc(it.id)}">Moved to</label><select class="btn small" id="mv-${esc(it.id)}" data-act-change="sw-move" data-id="${esc(it.id)}" style="width:auto"><option value="">Moved…</option>${roomList().filter(x => x.id !== r.id).map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select>
          <button class="btn small danger" data-act="sw-gone" data-id="${esc(it.id)}">Gone</button>`}</div></div>`;
      }).join("") || emptyHTML("Nothing recorded in this room", "Use Add things to start this room's list.")}</div>
      <p class="muted" style="font-size:14px">Spot something that is not on the list? Use <b>Add things</b> and pick ${esc(r.name)}.</p></section>`;
  }
};

VIEWS.shopping = {
  shell: () => `<div id="view-shopping">
    <section class="section"><header><h2>Shopping list</h2><button class="btn small" data-act="copy-list">Copy list</button></header>
      <form id="shop-form" class="search"><label class="sr" for="shop-new">Add to the list</label><input type="text" id="shop-new" placeholder="Add something to buy"><button class="btn" type="submit">Add</button></form>
      <div class="panel" id="shop-list"></div></section>
    <section class="section"><header><div><h2>Stock levels</h2><p class="muted" style="margin:4px 0 0">Things with a restock level. Tap minus as you use them; they join the list when they run low.</p></div></header>
      <div class="panel" id="stock-list"></div></section></div>`,
  live() {
    const sl = $("#shop-list"); if (!sl) return;
    const low = activeItems().filter(i => flagsFor(i).some(f => f.k === "low"));
    const manual = [...S.shopping.values()].sort((a, b) => (a.done - b.done) || (a.createdAt || "").localeCompare(b.createdAt || ""));
    sl.innerHTML = (low.map(it => `<div class="shop-item"><span><b>${esc(it.name)}</b> <span class="muted">· have ${Number(it.qty) || 0}, restock at ${esc(it.minQty)}${it.attributes?.filterSize ? " · size " + esc(it.attributes.filterSize) : ""}${it.attributes?.batteryType ? " · " + esc(it.attributes.batteryType) : ""}</span></span><button class="btn small" data-act="restock" data-id="${esc(it.id)}">Bought</button></div>`).join("")
      + manual.map(s => `<div class="shop-item ${s.done ? "done" : ""}"><input type="checkbox" id="sh-${esc(s.id)}" data-act-change="shop-toggle" data-id="${esc(s.id)}" ${s.done ? "checked" : ""}><span><label for="sh-${esc(s.id)}">${esc(s.text)}</label>${s.source ? ` <span class="pill">${esc(s.source)}</span>` : ""}</span><button class="link" data-act="shop-del" data-id="${esc(s.id)}" aria-label="Remove ${esc(s.text)}">Remove</button></div>`).join(""))
      || `<span class="muted">Nothing to buy. Items you mark with a restock level land here when they run low.</span>`;
    const tracked = activeItems().filter(i => i.minQty != null).sort((a, b) => a.name.localeCompare(b.name));
    $("#stock-list").innerHTML = tracked.map(it => `<div class="stock-row"><div><div class="row-name">${esc(it.name)}</div><div class="label">${esc(placeLabel(it))} · restock at ${esc(it.minQty)}</div></div>
      <div class="stepper"><button data-act="qty" data-d="-1" data-id="${esc(it.id)}" aria-label="One less">−</button><span class="num">${Number(it.qty) || 0}</span><button data-act="qty" data-d="1" data-id="${esc(it.id)}" aria-label="One more">+</button></div></div>`).join("")
      || `<span class="muted">Set a restock level on batteries, filters, bulbs, or pantry staples to track them here.</span>`;
  }
};

const ASK_SUGGEST = ["Where are the spare batteries?", "What is still under warranty?", "What did I lend out, and to whom?", "Which electronics have no serial number recorded?", "What would it cost to replace everything in the living room?"];
VIEWS.ask = {
  shell: () => `<div id="view-ask"><section class="section"><header><div><h2>Ask your house</h2><p class="muted" style="margin:4px 0 0">Claude reads your inventory and answers. Tap a highlighted item to open it.</p></div></header>
    <form id="ask-form" class="search"><label class="sr" for="ask-q">Question</label><input type="text" id="ask-q" placeholder="Where did I put the camping stove?" value="${esc(S.askText)}"><button class="btn primary" type="submit" id="ask-go">Ask</button></form>
    <div class="suggest">${ASK_SUGGEST.map(q => `<button class="chip" data-act="ask-suggest">${esc(q)}</button>`).join("")}</div>
    <div id="ask-out"></div></section></div>`,
  live() {}
};
// Item editor
let ED = null;
function roomOptions(sel) {
  return `<option value="">Unsorted</option>` + roomList().map(r => `<option value="${esc(r.id)}" ${r.id === sel ? "selected" : ""}>${esc(r.name)}</option>`).join("") + `<option value="__new">+ New room…</option>`;
}
function catOptions(sel) {
  return `<option value="">Choose a type</option>` + CATS.map(([g, l]) => `<optgroup label="${esc(g)}">${l.map(([k, n]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${esc(n)}</option>`).join("")}</optgroup>`).join("");
}
function spotSuggestions(roomId) { return [...new Set(activeItems().filter(i => !roomId || i.roomId === roomId).map(i => i.spot).filter(Boolean))].slice(0, 40); }
function openEditor(id, prefill, note) {
  const existing = id && S.items.get(id);
  const d = existing ? structuredClone(existing) : { id: newId("i"), qty: 1, roomId: S.room !== "all" && S.room !== "none" ? S.room : "", ...prefill };
  if (prefill && existing) Object.assign(d, prefill);
  d.attributes = d.attributes || {}; d.dimensionsCm = d.dimensionsCm || {}; d.photoIds = d.photoIds || [];
  ED = { d, isNew: !existing, blobs: prefill?._blobs || {}, confirmDel: false };
  renderEditor(note);
}
function renderEditor(note) {
  const d = ED.d, a = d.attributes, dm = d.dimensionsCm;
  const showWarrantyChips = !d.warrantyUntil;
  openSheet(ED.isNew ? "Add a thing" : d.name || "Item", `
    <form id="ed-form" style="display:grid;gap:18px" autocomplete="off">
      ${note ? `<div class="ai-note">${esc(note)}</div>` : ""}
      ${d.example ? `<div class="ai-note">This is an example item. Edit it into something real or delete it.</div>` : ""}
      <fieldset>
        <div class="fields">
          <label class="f full">What is it<input type="text" id="f-name" required value="${esc(d.name)}" placeholder="Bosch cordless drill"></label>
          <label class="f">Room<select id="f-room">${roomOptions(d.roomId)}</select></label>
          <label class="f">Spot in the room<input type="text" id="f-spot" list="spots" value="${esc(d.spot)}" placeholder="Top shelf, left cabinet"></label>
          <datalist id="spots">${spotSuggestions(d.roomId).map(s => `<option value="${esc(s)}">`).join("")}</datalist>
          <label class="f">Type<select id="f-cat">${catOptions(d.category)}</select></label>
          <div class="fields three" style="grid-column:auto">
            <label class="f">Qty<input type="number" id="f-qty" min="0" step="any" value="${esc(d.qty ?? 1)}"></label>
            <label class="f">Unit<input type="text" id="f-unit" value="${esc(d.unit)}" placeholder="pcs"></label>
            <label class="f">Restock at<input type="number" id="f-min" min="0" step="any" value="${esc(d.minQty)}" placeholder="–"></label>
          </div>
        </div>
      </fieldset>
      <fieldset><legend class="eyebrow">Photos</legend>
        <div class="photos" id="ed-photos">${photosHTML()}</div>
        ${sampleCap ? `<div><button type="button" class="btn small" data-act="ed-identify" ${d.photoIds.length ? "" : "disabled"} id="ed-identify">Fill in from photo with Claude</button></div>` : ""}
      </fieldset>
      <fieldset><legend class="eyebrow">Value and proof</legend>
        <div class="fields">
          <label class="f">Replacement value, each <span class="hint">what it costs to buy again</span><input type="number" id="f-value" min="0" step="any" value="${esc(d.value)}"></label>
          <label class="f">Price paid<input type="number" id="f-price" min="0" step="any" value="${esc(d.purchasePrice)}"></label>
          <label class="f">Bought on<input type="date" id="f-pdate" value="${esc(d.purchaseDate)}"></label>
          <label class="f">Bought at<input type="text" id="f-store" value="${esc(d.store)}"></label>
          <label class="f">Brand<input type="text" id="f-brand" value="${esc(d.brand)}"></label>
          <label class="f">Model<input type="text" id="f-model" value="${esc(d.model)}"></label>
          <label class="f full">Serial number<input type="text" id="f-serial" value="${esc(d.serial)}" style="font-family:var(--f-mono)"></label>
        </div>
      </fieldset>
      <fieldset><legend class="eyebrow">Dates that matter</legend>
        <div class="fields">
          <label class="f">Warranty until<input type="date" id="f-warranty" value="${esc(d.warrantyUntil)}">
            <span class="actions" id="w-chips" ${showWarrantyChips ? "" : "hidden"}>${[1, 2, 3, 5].map(y => `<button type="button" class="chip" data-act="w-years" data-y="${y}">${y} yr</button>`).join("")}</span></label>
          <label class="f">Use by / expires<input type="date" id="f-expires" value="${esc(d.expiresOn)}"></label>
          <label class="f">Installed on <span class="hint">appliances, heating, detectors</span><input type="date" id="f-install" value="${esc(d.installDate)}"></label>
          <label class="f">Lasts (months) <span class="hint">filters, batteries: Laventina says when to replace</span><input type="number" min="0" step="1" id="f-life" value="${esc(d.lifeMonths)}"></label>
        </div>
      </fieldset>
      <details class="more" ${d.lentTo || a.filterSize || a.batteryType || a.bulbType || dm.w || d.manualUrl ? "open" : ""}><summary>Lending, size, and parts</summary>
        <div class="fields" style="margin-top:10px">
          <label class="f">Lent to<input type="text" id="f-lentto" value="${esc(d.lentTo)}" placeholder="Name"></label>
          <label class="f">Lent on<input type="date" id="f-lenton" value="${esc(d.lentOn)}"></label>
          <div class="full"><span class="eyebrow">Size in cm (W × D × H)</span>
            <div class="fields three" style="margin-top:4px"><label class="f"><span class="sr">Width</span><input type="number" id="f-w" min="0" step="any" placeholder="W" value="${esc(dm.w)}"></label><label class="f"><span class="sr">Depth</span><input type="number" id="f-d" min="0" step="any" placeholder="D" value="${esc(dm.d)}"></label><label class="f"><span class="sr">Height</span><input type="number" id="f-h" min="0" step="any" placeholder="H" value="${esc(dm.h)}"></label></div></div>
          <label class="f">Filter size<input type="text" id="f-filter" value="${esc(a.filterSize)}" placeholder="16x25x1"></label>
          <label class="f">Battery type<input type="text" id="f-battery" value="${esc(a.batteryType)}" placeholder="AA, 9V, CR2032"></label>
          <label class="f">Bulb type<input type="text" id="f-bulb" value="${esc(a.bulbType)}" placeholder="E27 LED 806lm"></label>
          <label class="f">Manual link<input type="url" id="f-manual" value="${esc(d.manualUrl)}" placeholder="https://"></label>
        </div>
      </details>
      <label class="f">Notes<textarea id="f-notes" rows="3">${esc(d.notes)}</textarea></label>
      ${ED.isNew ? "" : linkedHTML(d.id)}
      <div id="ed-del"></div>
      <div class="actions" style="justify-content:space-between">
        <div class="actions">${ED.isNew ? "" : `<button type="button" class="btn danger" data-act="ed-delete">Delete</button>${d.disposedOn ? `<button type="button" class="btn" data-act="ed-restore">Bring back</button>` : `<button type="button" class="btn" data-act="ed-gone">Mark gone</button>`}`}</div>
        <div class="actions"><button type="button" class="btn" data-act="close-sheet">Cancel</button><button type="submit" class="btn primary">Save</button></div>
      </div>
    </form>`);
}
function photosHTML() {
  const d = ED.d;
  return d.photoIds.map(p => `<div class="photo"><img src="${ED.blobs[p] ? esc(ED.blobs[p].url) : esc(fileUrl(p))}" alt=""><button type="button" data-act="ed-photo-del" data-p="${esc(p)}" aria-label="Remove photo">×</button></div>`).join("")
    + (assets ? `<label class="addphoto" for="ed-file"><span>+ Photo<br><span style="font-size:11px">item, label, receipt</span></span></label><input type="file" id="ed-file" accept="image/*" hidden>`
      : (d.photoIds.length ? "" : `<span class="muted" style="font-size:14px">Photos can be added by people with edit access.</span>`));
}
function readEditor() {
  const v = id => ($("#" + id)?.value ?? "").trim();
  const n = id => { const x = v(id).replace(",", "."); if (x === "") return undefined; const f = parseFloat(x); return isFinite(f) ? f : undefined; };
  const d = ED.d;
  Object.assign(d, {
    name: v("f-name"), roomId: v("f-room") === "__new" ? "" : v("f-room"), spot: v("f-spot"), category: v("f-cat"), qty: n("f-qty") ?? 1, unit: v("f-unit"), minQty: n("f-min"),
    value: n("f-value"), purchasePrice: n("f-price"), purchaseDate: v("f-pdate"), store: v("f-store"), brand: v("f-brand"), model: v("f-model"), serial: v("f-serial"),
    warrantyUntil: v("f-warranty"), expiresOn: v("f-expires"), installDate: v("f-install"), lifeMonths: n("f-life"), lentTo: v("f-lentto"), lentOn: v("f-lenton"), manualUrl: v("f-manual"), notes: v("f-notes"),
    attributes: { ...d.attributes, filterSize: v("f-filter"), batteryType: v("f-battery"), bulbType: v("f-bulb") },
    dimensionsCm: { w: n("f-w"), d: n("f-d"), h: n("f-h") }
  });
  if (d.lentTo && !d.lentOn) d.lentOn = todayISO();
  if (!d.lentTo) d.lentOn = undefined;
  return d;
}
function saveEditor() {
  const d = readEditor();
  if (!d.name) { $("#f-name").focus(); toast("Give it a name first."); return; }
  if (ED.isNew) { d.createdAt = nowISO(); d.verifiedAt = nowISO(); }
  delete d.example;
  for (const k of Object.keys(d)) if (k.startsWith("_")) delete d[k];
  store.putItem(d);
  closeSheet();
  toast(ED && ED.isNew ? "Added " + d.name : "Saved");
}

// Photos
async function shrink(file, max = 1400) {
  try {
    const bmp = await createImageBitmap(file);
    const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || file), "image/jpeg", 0.84));
  } catch { return file; }
}
async function uploadPhoto(blob) {
  if (!assets) throw { message: "Photos need edit access to this page." };
  const res = await assets.upload(blob, { type: "image/jpeg" });
  return res.id;
}
function assetErr(e) {
  const c = e && e.code;
  if (c === "too_large") return "That photo is too large.";
  if (c === "quota_or_state") return "Photo storage is full. Remove old photos to add new ones.";
  if (c === "rate_limited") return "Too many uploads at once. Wait a moment and try again.";
  return (e && e.message) || "The photo did not upload. Try again.";
}

// ---------- Claude: reading notes and photos ----------
function roomNames() { return roomList().map(r => r.name); }
function parsePrompt(text, hasPhoto) {
  return `You catalog belongings for a home inventory app. Today is ${todayISO()}. Currency: ${S.house.currency}.
Rooms in this house: ${JSON.stringify(roomNames())}.
Allowed category keys: ${JSON.stringify(CAT_KEYS)}.
${hasPhoto ? "A photo is attached. It may show one item, a product label, a receipt, or a shelf or drawer with many things." : ""}
${text ? "The owner wrote: " + JSON.stringify(text) : ""}

List each distinct item worth tracking. For a shelf or drawer photo, list up to 20 notable things and skip trivial clutter. For a receipt, list the purchased items with price and date. For a label or nameplate, read brand, model and serial exactly.
Return JSON only, no prose, shaped as:
{"items":[{"name":"short specific name, brand first when known","category":"one allowed key","qty":1,"unit":null,"brand":null,"model":null,"serial":null,"room":"exact room name from the list or null","spot":"place within the room or null","value":null,"purchaseDate":null,"purchasePrice":null,"store":null,"warrantyUntil":null,"expiresOn":null,"installDate":null,"minQty":null,"dimensionsCm":null,"attributes":null,"notes":null}],"summary":"one short sentence on what you saw"}
Rules: value = your estimate of today's replacement cost per unit in ${S.house.currency}, a number. Dates are YYYY-MM-DD. If the owner gives a warranty length, compute warrantyUntil from the purchase date (or today). Only fill serial or model when clearly readable. For consumables (batteries, filters, bulbs, pantry) suggest a sensible minQty. attributes may hold filterSize, batteryType, bulbType. dimensionsCm is {"w":..,"d":..,"h":..} when known.`;
}
function aiToItem(x, defaults = {}) {
  const room = roomList().find(r => x.room && r.name.toLowerCase() === String(x.room).toLowerCase());
  const num = v => (v == null || v === "" || !isFinite(Number(v))) ? undefined : Number(v);
  const date = v => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : undefined;
  const str = v => (v == null ? undefined : String(v).trim() || undefined);
  const it = {
    name: str(x.name) || "Unnamed item", category: CAT_KEYS.includes(x.category) ? x.category : undefined, qty: num(x.qty) ?? 1, unit: str(x.unit),
    brand: str(x.brand), model: str(x.model), serial: str(x.serial), roomId: defaults.roomId || room?.id || "", spot: defaults.spot || str(x.spot),
    value: num(x.value), purchaseDate: date(x.purchaseDate), purchasePrice: num(x.purchasePrice), store: str(x.store), warrantyUntil: date(x.warrantyUntil),
    expiresOn: date(x.expiresOn), installDate: date(x.installDate), minQty: num(x.minQty), notes: str(x.notes),
    attributes: x.attributes && typeof x.attributes === "object" ? { filterSize: str(x.attributes.filterSize), batteryType: str(x.attributes.batteryType), bulbType: str(x.attributes.bulbType) } : {},
    dimensionsCm: x.dimensionsCm && typeof x.dimensionsCm === "object" ? { w: num(x.dimensionsCm.w), d: num(x.dimensionsCm.d), h: num(x.dimensionsCm.h) } : {}
  };
  return it;
}
function localParse(text, defaults) {
  // Fallback when Claude is not available here: "3x AA batteries, hall closet, 12"
  let t = text.trim(), qty = 1, value, roomId = defaults.roomId || "", spot = defaults.spot;
  const q = t.match(/^(\d+)\s*(x|×)?\s+/i); if (q) { qty = +q[1]; t = t.slice(q[0].length); }
  const p = t.match(/[$€£]\s?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s?(?:€|eur|usd|dollars?|euros?)/i); if (p) { value = parseFloat((p[1] || p[2]).replace(",", ".")); t = t.replace(p[0], ""); }
  const parts = t.split(/,|\bin\b|\bon\b/i).map(s => s.trim()).filter(Boolean);
  const name = parts.shift() || text;
  for (const part of parts) { const r = roomList().find(r => part.toLowerCase().includes(r.name.toLowerCase())); if (r && !roomId) roomId = r.id; else if (!spot) spot = part; }
  return { name, qty, value, roomId, spot };
}

function openQuickAdd() {
  const QA = { blob: null, url: null };
  openSheet("Add things", `
    <form id="qa-form" style="display:grid;gap:14px">
      <p class="muted" style="margin:0">Photograph one thing, its label, a receipt, or a whole shelf. Or just type it the way you would say it.</p>
      <label class="f">Describe it<textarea id="qa-text" rows="3" placeholder="Dyson V11 vacuum in the hall closet, bought March 2024 for 599, 2-year warranty"></textarea></label>
      <div class="actions" style="align-items:center">
        <label class="btn" for="qa-file">${"Add a photo"}</label><input type="file" id="qa-file" accept="image/*" hidden>
        <span id="qa-photo" class="muted" style="font-size:14px"></span>
      </div>
      <div class="fields">
        <label class="f">Put it in<select id="qa-room">${roomOptions(S.room !== "all" && S.room !== "none" ? S.room : "").replace('<option value="__new">+ New room…</option>', "")}</select></label>
        <label class="f">Spot<input type="text" id="qa-spot" placeholder="optional"></label>
      </div>
      ${sampleCap ? "" : `<p class="muted" style="margin:0;font-size:14px">Claude is not available in this view, so Laventina fills in what it can from your words. Add an Anthropic key in Netlify to turn Claude on.</p>`}
      <div class="actions" style="justify-content:space-between"><button type="button" class="btn" data-act="qa-manual">Fill the form myself</button><button type="submit" class="btn primary" id="qa-go">${sampleCap ? "Read it with Claude" : "Continue"}</button></div>
      <div id="qa-out"></div>
    </form>`);
  $("#qa-file").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    QA.blob = await shrink(f, 1600); QA.url = URL.createObjectURL(QA.blob);
    $("#qa-photo").innerHTML = `<img src="${QA.url}" alt="" style="height:48px;border-radius:6px;vertical-align:middle"> Photo ready`;
  });
  $("#qa-form").addEventListener("submit", async e => {
    e.preventDefault();
    const text = $("#qa-text").value.trim(); const defaults = { roomId: $("#qa-room").value, spot: $("#qa-spot").value.trim() || undefined };
    if (!text && !QA.blob) { toast("Type something or add a photo first."); return; }
    if (!sampleCap) { const pre = localParse(text || "New item", defaults); if (QA.blob) await attachPending(pre, QA); openEditor(null, pre, "Check the details, then save."); return; }
    const go = $("#qa-go"); go.disabled = true; go.innerHTML = `<span class="spinner"></span> Reading…`;
    try {
      const opts = { modelTier: "default" }; if (QA.blob) opts.images = [QA.blob];
      const res = await sampleCap.json(parsePrompt(text, !!QA.blob), opts);
      const list = (res && Array.isArray(res.items) ? res.items : []).map(x => aiToItem(x, defaults));
      if (!list.length) { go.disabled = false; go.textContent = "Read it with Claude"; $("#qa-out").innerHTML = `<div class="ai-note">Claude did not find anything to add. Try a closer photo or a few more words.</div>`; return; }
      if (list.length === 1) { if (QA.blob) await attachPending(list[0], QA); openEditor(null, list[0], (res.summary ? res.summary + " " : "") + "Values are Claude's estimates. Check them, then save."); return; }
      showBatch(list, res.summary, QA);
    } catch (err) {
      go.disabled = false; go.textContent = "Read it with Claude";
      const msg = err && err.code === "rate_limited" ? "Claude is busy. Try again in a minute." : err && err.code === "ai_off" ? "Claude is not set up yet. Fill the form yourself instead." : "Claude could not read that. Try again, or fill the form yourself.";
      $("#qa-out").innerHTML = `<div class="ai-note">${esc(msg)}</div>`;
    }
  });
}
async function attachPending(item, QA) {
  // Upload the photo now so the item keeps it.
  if (!assets || !QA.blob) return;
  try { if (!QA.id) QA.id = await uploadPhoto(QA.blob); item.photoIds = [QA.id]; item._blobs = { [QA.id]: { url: QA.url } }; }
  catch (e) { toast(assetErr(e)); }
}
function showBatch(list, summary, QA) {
  const out = $("#qa-out");
  out.innerHTML = `<div style="display:grid;gap:10px">
    <div class="ai-note">${esc(summary || "Claude found several things.")} Untick anything you do not want. Values are estimates you can change later.</div>
    ${list.map((it, i) => `<label class="check panel" style="padding:10px 12px"><input type="checkbox" id="qb-${i}" checked><span style="flex:1;min-width:0"><b>${esc(it.name)}</b>${it.qty !== 1 ? ` × ${it.qty}` : ""}<br><span class="label">${esc([CAT_LABEL[it.category], placeLabel(it)].filter(Boolean).join(" · "))}</span></span><span class="money">${it.value ? money(it.value * (it.qty || 1)) : ""}</span></label>`).join("")}
    <div class="actions" style="justify-content:flex-end"><button type="button" class="btn primary" id="qb-add">Add selected</button></div></div>`;
  $("#qb-add").onclick = async () => {
    const chosen = list.filter((_, i) => $("#qb-" + i).checked);
    if (!chosen.length) { closeSheet(); return; }
    $("#qb-add").disabled = true;
    let pid; if (QA.blob && assets) { try { pid = await uploadPhoto(QA.blob); } catch (e) { toast(assetErr(e)); } }
    for (const it of chosen) { it.id = newId("i"); it.createdAt = nowISO(); it.verifiedAt = nowISO(); if (pid) it.photoIds = [pid]; await store.putItem(it); }
    closeSheet(); toast(`Added ${chosen.length} things`);
  };
}
async function identifyFromPhoto() {
  const d = readEditor(); const btn = $("#ed-identify");
  const pid = d.photoIds[0]; if (!pid) return;
  btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Looking…`;
  try {
    const blob = ED.blobs[pid]?.blob;
    const res = await sampleCap.json(parsePrompt(d.name ? "This is my " + d.name + ". Identify it and read any label." : "", true), blob ? { images: [blob] } : { fileIds: [pid] });
    const x = res && res.items && res.items[0];
    if (!x) throw new Error("none");
    const ai = aiToItem(x, {});
    for (const k of ["name", "category", "brand", "model", "serial", "value", "purchaseDate", "purchasePrice", "store", "warrantyUntil", "installDate"]) if ((d[k] == null || d[k] === "") && ai[k] != null) d[k] = ai[k];
    if (d.name === "Unnamed item" && ai.name) d.name = ai.name;
    d.attributes = { ...ai.attributes, ...Object.fromEntries(Object.entries(d.attributes).filter(([, v]) => v)) };
    renderEditor("Claude filled the empty fields. The value is an estimate: change it if you know better.");
  } catch (e) {
    btn.disabled = false; btn.textContent = "Fill in from photo with Claude";
    toast(e && e.code === "rate_limited" ? "Claude is busy. Try again in a minute." : "Claude could not read that photo.");
  }
}

// Ask
function inventoryDigest(maxBytes) {
  const lines = [...S.items.values()].map(it => [it.id, it.name, "in " + placeLabel(it), "qty " + (it.qty ?? 1) + (it.unit ? " " + it.unit : ""), CAT_LABEL[it.category],
    totalValue(it) ? "value " + money(totalValue(it)) : "", [it.brand, it.model].filter(Boolean).join(" "), it.serial ? "serial " + it.serial : "",
    it.purchaseDate ? "bought " + it.purchaseDate : "", it.warrantyUntil ? "warranty until " + it.warrantyUntil : "", it.expiresOn ? "use by " + it.expiresOn : "",
    it.installDate ? "installed " + it.installDate : "", it.minQty != null ? "restock at " + it.minQty : "", it.lentTo ? "lent to " + it.lentTo + " on " + (it.lentOn || "?") : "",
    it.disposedOn ? "GONE since " + it.disposedOn : "", it.photoIds?.length ? "has photo" : "no photo", it.notes ? "notes: " + it.notes.slice(0, 120) : ""].filter(Boolean).join(" | "));
  let out = "", n = 0;
  for (const l of lines) { if (out.length + l.length > maxBytes) break; out += l + "\n"; n++; }
  return { text: out, n, total: lines.length };
}
async function ask(q) {
  const out = $("#ask-out"); if (!out) return;
  S.askText = q;
  if (!sampleCap) { out.innerHTML = `<div class="answer muted">Claude is not set up yet. Add an Anthropic key in Netlify, or use the search on the Inventory tab.</div>`; return; }
  if (S.askBusy) return; S.askBusy = true;
  const go = $("#ask-go"); if (go) { go.disabled = true; go.innerHTML = `<span class="spinner"></span>`; }
  out.innerHTML = `<div class="answer" id="ask-ans"><span class="muted">Thinking…</span></div>`;
  let lim = 60000; try { lim = (await sampleCap.limits()).maxPromptBytes || lim; } catch {}
  const dg = inventoryDigest(Math.floor(lim * 0.7));
  const prompt = `You are the memory of a household. Today is ${todayISO()}. Currency ${S.house.currency}. Rooms: ${roomNames().join(", ")}.
Inventory, one item per line, fields separated by " | ", first field is the item id:
${dg.text}${dg.n < dg.total ? `(${dg.total - dg.n} more items were left out for length.)\n` : ""}
Question from the owner: ${q}

Answer in plain sentences, under 120 words, no markdown headings or bullets unless listing more than three things. Say exactly where things are (room and spot). When you mention an inventory item, write its id in double brackets right after its name, like Drill [[i_abc]]. If the inventory does not contain the answer, say so and suggest what to record.`;
  try {
    const res = await sampleCap(prompt, { cache: false, modelTier: "default", onText: u => { const a = $("#ask-ans"); if (a) a.innerHTML = renderAnswer(u.text); } });
    const a = $("#ask-ans"); if (a) a.innerHTML = renderAnswer(res.text);
  } catch (e) {
    const a = $("#ask-ans"); if (a) a.innerHTML = `<span class="muted">${esc(e && e.code === "rate_limited" ? "Claude is busy. Try again in a minute." : e && e.code === "ai_off" ? "Claude is not set up yet. Add an Anthropic key in Netlify." : "Claude could not answer just now. Try again.")}</span>`;
  } finally { S.askBusy = false; const g = $("#ask-go"); if (g) { g.disabled = false; g.textContent = "Ask"; } }
}
function renderAnswer(t) {
  return esc(t).replace(/\[\[([A-Za-z0-9_\-]+)\]\]/g, (m, id) => S.items.has(id) ? `<button class="ref" data-act="edit" data-id="${esc(id)}">open</button>` : "");
}
// ---------- Export ----------
function csvCell(v) { const s = String(v ?? ""); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function buildCSV() {
  const head = ["Room", "Spot", "Item", "Type", "Brand", "Model", "Serial", "Qty", "Value each", "Total value", "Currency", "Bought on", "Price paid", "Bought at", "Warranty until", "Photos", "Notes"];
  const rows = activeItems().sort((a, b) => roomName(a.roomId).localeCompare(roomName(b.roomId)) || a.name.localeCompare(b.name)).map(it => [roomName(it.roomId), it.spot, it.name, CAT_LABEL[it.category], it.brand, it.model, it.serial, it.qty ?? 1, it.value ?? it.purchasePrice ?? "", totalValue(it) || "", S.house.currency, it.purchaseDate, it.purchasePrice, it.store, it.warrantyUntil, (it.photoIds || []).length, it.notes]);
  return [head, ...rows].map(r => r.map(csvCell).join(",")).join("\n");
}
async function exportCSV() {
  const csv = buildCSV();
  try {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `laventina-insurance-list-${todayISO()}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast("Saved the insurance list"); return;
  } catch {}
  try { await navigator.clipboard.writeText(csv); toast("Copied the list as CSV. Paste it into a spreadsheet."); }
  catch { toast("This view cannot save or copy files."); }
}
// ---------- Events ----------
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const act = t.dataset.act, id = t.dataset.id;
  if (act === "scrim" && e.target !== t) return;
  switch (act) {
    case "tab": setTab(t.dataset.tab); break;
    case "settings": openSettings(); break;
    case "quickadd": openQuickAdd(); break;
    case "edit": closeSheet(); openEditor(id); break;
    case "scrim": case "close-sheet": closeSheet(); break;
    case "goto-flag": S.flag = t.dataset.flag; S.room = "all"; S.q = ""; setTab("inventory"); break;
    case "goto-room": S.room = t.dataset.room; S.flag = "all"; S.q = ""; setTab("inventory"); break;
    case "room-filter": S.room = t.dataset.room; VIEWS.inventory.live(); break;
    case "clear-filters": S.room = "all"; S.flag = "all"; S.q = ""; setTab("inventory"); break;
    case "clear-examples": for (const it of [...S.items.values()].filter(i => i.example)) await store.delItem(it.id); toast("Examples removed"); break;
    case "export": exportCSV(); break;
    case "sweep-room": S.sweepRoom = t.dataset.room; S.swept = new Set(); VIEWS.sweep.live(); window.scrollTo(0, 0); break;
    case "sweep-exit": {
      const r = S.rooms.get(S.sweepRoom);
      if (r && S.swept.size) store.putRoom({ ...r, lastSweep: todayISO() });
      S.sweepRoom = null; VIEWS.sweep.live(); break;
    }
    case "sw-here": { const it = S.items.get(id); if (!it) break; S.swept.add(id); store.putItem({ ...it, verifiedAt: nowISO() }); break; }
    case "sw-gone": {
      const it = S.items.get(id); if (!it) break; const before = { ...it };
      S.swept.add(id); store.putItem({ ...it, disposedOn: todayISO() });
      toast(`Marked ${it.name} as gone`, { label: "Undo", run: () => { S.swept.delete(id); store.putItem(before); } }); break;
    }
    case "qty": { const it = S.items.get(id); if (!it) break; touchItem({ ...it, qty: Math.max(0, (Number(it.qty) || 0) + Number(t.dataset.d)) }); break; }
    case "restock": {
      const it = S.items.get(id); if (!it) break;
      const target = Math.max((Number(it.minQty) || 0) * 2, (Number(it.minQty) || 0) + 1);
      store.putItem({ ...it, qty: target }); toast(`${it.name}: stock set to ${target}`); break;
    }
    case "shop-del": store.delShop(id); break;
    case "copy-list": {
      const low = activeItems().filter(i => flagsFor(i).some(f => f.k === "low")).map(i => "- " + i.name + (i.attributes?.filterSize ? " (" + i.attributes.filterSize + ")" : "") + (i.attributes?.batteryType ? " (" + i.attributes.batteryType + ")" : ""));
      const man = [...S.shopping.values()].filter(s => !s.done).map(s => "- " + s.text);
      const txt = [...low, ...man].join("\n") || "Nothing to buy";
      try { await navigator.clipboard.writeText(txt); toast("Copied the shopping list"); } catch { toast("Copy is blocked in this view."); }
      break;
    }
    case "ask-suggest": { const q = t.textContent; $("#ask-q").value = q; ask(q); break; }
    case "w-years": {
      const base = $("#f-pdate").value || todayISO();
      $("#f-warranty").value = addYears(base, Number(t.dataset.y)); $("#w-chips").hidden = true; break;
    }
    case "ed-photo-del": { readEditor(); ED.d.photoIds = ED.d.photoIds.filter(p => p !== t.dataset.p); $("#ed-photos").innerHTML = photosHTML(); bindEditorFile(); break; }
    case "ed-identify": identifyFromPhoto(); break;
    case "ed-delete": {
      $("#ed-del").innerHTML = `<div class="confirm"><span style="flex:1">Delete ${esc(ED.d.name)} for good? Use “Mark gone” instead to keep its history.</span><button type="button" class="btn small danger" data-act="ed-delete-yes">Delete</button><button type="button" class="btn small" data-act="ed-delete-no">Keep</button></div>`; break;
    }
    case "ed-delete-no": $("#ed-del").innerHTML = ""; break;
    case "ed-delete-yes": { const d = ED.d; store.delItem(d.id); closeSheet(); toast("Deleted " + d.name); break; }
    case "ed-gone": { readEditor(); ED.d.disposedOn = todayISO(); saveEditor(); break; }
    case "ed-restore": { readEditor(); delete ED.d.disposedOn; saveEditor(); break; }
    case "qa-manual": { const text = $("#qa-text").value.trim(); const pre = text ? localParse(text, { roomId: $("#qa-room").value }) : { roomId: $("#qa-room").value }; openEditor(null, pre); break; }
    case "room-add": {
      const inp = $("#s-newroom"); const name = inp.value.trim(); if (!name) break;
      store.putRoom({ id: newId("r"), name, order: S.rooms.size + 1 }); inp.value = ""; openSettings(); break;
    }
    case "room-del": store.delRoom(t.dataset.room); openSettings(); break;
  }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "inv-flag") { S.flag = t.value; VIEWS.inventory.live(); }
  if (t.dataset.actChange === "sw-move" && t.value) {
    const it = S.items.get(t.dataset.id); if (!it) return;
    S.swept.add(it.id); store.putItem({ ...it, roomId: t.value, spot: undefined, verifiedAt: nowISO() }); toast(`Moved ${it.name} to ${roomName(t.value)}`);
  }
  if (t.dataset.actChange === "shop-toggle") { const s = S.shopping.get(t.dataset.id); if (s) store.putShop({ ...s, done: t.checked }); }
  if (t.id === "f-room" && t.value === "__new") {
    t.insertAdjacentHTML("afterend", `<span class="search" id="nr-wrap" style="margin-top:6px"><input type="text" id="nr-name" placeholder="Room name"><button type="button" class="btn small" id="nr-add">Add</button></span>`);
    $("#nr-name").focus();
    $("#nr-add").onclick = () => { const n = $("#nr-name").value.trim(); if (!n) return; const r = { id: newId("r"), name: n, order: S.rooms.size + 1 }; store.putRoom(r); readEditor(); ED.d.roomId = r.id; $("#f-room").innerHTML = roomOptions(r.id); $("#nr-wrap").remove(); };
  }
  if (t.id === "f-pdate" && !$("#f-warranty").value) $("#w-chips").hidden = false;
});
document.addEventListener("input", e => {
  if (e.target.id === "inv-q") { S.q = e.target.value; VIEWS.inventory.live(); }
});
document.addEventListener("submit", e => {
  const f = e.target;
  if (f.id === "ed-form") { e.preventDefault(); saveEditor(); }
  if (f.id === "shop-form") { e.preventDefault(); const v = $("#shop-new").value.trim(); if (!v) return; store.putShop({ id: newId("s"), text: v, done: false, source: "manual", createdAt: nowISO() }); $("#shop-new").value = ""; }
  if (f.id === "ask-form") { e.preventDefault(); const q = $("#ask-q").value.trim(); if (q) ask(q); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
function bindEditorFile() {
  const inp = $("#ed-file"); if (!inp || inp.dataset.bound) return; inp.dataset.bound = "1";
  inp.addEventListener("change", async () => {
    const f = inp.files[0]; if (!f) return;
    readEditor();
    const lbl = $("label.addphoto"); if (lbl) lbl.innerHTML = `<span class="spinner"></span>`;
    try {
      const blob = await shrink(f);
      const pid = await uploadPhoto(blob);
      ED.blobs[pid] = { url: URL.createObjectURL(blob), blob };
      ED.d.photoIds = [...ED.d.photoIds, pid];
    } catch (err) { toast(assetErr(err)); }
    $("#ed-photos").innerHTML = photosHTML(); bindEditorFile();
    const b = $("#ed-identify"); if (b) b.disabled = !ED.d.photoIds.length;
  });
}
new MutationObserver(() => bindEditorFile()).observe($("#layer"), { childList: true, subtree: true });

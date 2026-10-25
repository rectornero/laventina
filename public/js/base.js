"use strict";
// ---------- Reference data ----------
const CATS = [
  ["Appliances", [["appliance.fridge","Fridge / freezer"],["appliance.dishwasher","Dishwasher"],["appliance.washer","Washing machine"],["appliance.dryer","Dryer"],["appliance.oven","Oven / range"],["appliance.range_hood","Range hood"],["appliance.microwave","Microwave"],["appliance.vacuum","Vacuum"],["appliance.small","Small appliance"]]],
  ["Heating, cooling, water", [["hvac.furnace","Furnace"],["hvac.boiler","Boiler"],["hvac.heat_pump","Heat pump"],["hvac.ac","Air conditioner"],["hvac.other","Other heating / cooling"],["water.heater_tank","Water heater"],["water.softener","Water softener"],["water.filter","Water filter"],["water.sump_pump","Sump pump"]]],
  ["Safety", [["safety.smoke_detector","Smoke detector"],["safety.co_detector","CO detector"],["safety.extinguisher","Fire extinguisher"],["safety.first_aid","First aid kit"],["safety.alarm","Alarm / camera"]]],
  ["Electronics", [["electronics.tv","TV"],["electronics.computer","Computer / tablet"],["electronics.phone","Phone"],["electronics.audio","Audio"],["electronics.camera","Camera"],["electronics.gaming","Gaming"],["electronics.network","Router / network"],["electronics.other","Other electronics"]]],
  ["Furniture & decor", [["furniture.seating","Sofa / chair"],["furniture.table","Table / desk"],["furniture.bed","Bed / mattress"],["furniture.storage","Wardrobe / shelving"],["furniture.outdoor","Outdoor furniture"],["decor.lighting","Lamp / lighting"],["decor.textile","Rug / curtains"],["decor.art","Art / decor"]]],
  ["Kitchen & home", [["kitchen.cookware","Cookware"],["kitchen.tableware","Tableware"],["kitchen.tools","Kitchen tools"],["home.linens","Bedding / towels"],["home.clothing","Clothing / shoes"]]],
  ["Tools, garage, garden", [["tools.power","Power tool"],["tools.hand","Hand tool"],["garage.door_opener","Garage door opener"],["garden.machine","Mower / garden machine"],["garden.tools","Garden tools"],["vehicle.car","Car / motorbike"],["vehicle.bike","Bicycle"]]],
  ["Leisure & valuables", [["leisure.sports","Sports & outdoor"],["leisure.music","Musical instrument"],["leisure.books","Books & media"],["leisure.toys","Toys & games"],["valuables.jewelry","Jewelry / watches"],["valuables.collectible","Collectible"]]],
  ["Supplies & spares", [["supplies.batteries","Batteries"],["supplies.bulbs","Light bulbs"],["supplies.filters","Filters (spare)"],["supplies.paint","Paint & finishes (leftover)"],["supplies.cleaning","Cleaning"],["supplies.pantry","Pantry"],["supplies.medicine","Medicine"],["supplies.toiletries","Toiletries"],["supplies.hardware","Screws, fixings, parts"]]],
  ["Other", [["other","Other"]]]
];
const CAT_LABEL = Object.fromEntries(CATS.flatMap(([, l]) => l));
const CAT_KEYS = Object.keys(CAT_LABEL);
const catGroup = k => (k || "other").split(".")[0];
const isSupply = it => catGroup(it.category) === "supplies";
const SERIAL_GROUPS = new Set(["appliance", "hvac", "water", "electronics", "tools", "vehicle", "garden", "valuables", "safety"]);
const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "SEK", "NOK", "DKK", "PLN", "JPY", "BRL", "MXN", "INR"];

// ---------- Helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const newId = p => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const nowISO = () => new Date().toISOString();
function daysUntil(iso) { if (!iso) return null; const t = Date.parse(iso + "T00:00:00"); if (isNaN(t)) return null; const n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((t - n) / 864e5); }
const daysSince = ts => ts ? (Date.now() - Date.parse(ts)) / 864e5 : Infinity;
function addYears(iso, y) { const d = new Date((iso || todayISO()) + "T00:00:00"); d.setMonth(d.getMonth() + Math.round(y * 12)); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
function fmtDate(iso) { if (!iso) return ""; const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso); return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
function fmtShort(iso) { const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
function relDays(n) { if (n === 0) return "today"; if (n === 1) return "tomorrow"; if (n === -1) return "yesterday"; if (n < 0) return Math.abs(n) + " days ago"; if (n < 45) return "in " + n + " days"; if (n < 365) return "in " + Math.round(n / 30) + " months"; return "in " + (n / 365).toFixed(1).replace(/\.0$/, "") + " years"; }
function money(n, opts = {}) { if (n == null || !isFinite(n)) return ""; try { return new Intl.NumberFormat(undefined, { style: "currency", currency: S.house.currency || "EUR", maximumFractionDigits: opts.cents ? 2 : 0 }).format(n); } catch { return Math.round(n) + " " + (S.house.currency || ""); } }
const totalValue = it => (Number(it.value) || Number(it.purchasePrice) || 0) * (Number(it.qty) || 1);
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

// ---------- State ----------
const S = {
  items: new Map(), rooms: new Map(), shopping: new Map(), lists: new Map(), plans: new Map(), ulog: new Map(), charges: new Map(), expenses: new Map(), settlements: new Map(),
  docs: new Map(), projects: new Map(), finishes: new Map(), wish: new Map(), decisions: new Map(), notes: new Map(), bells: new Map(), coach: new Map(), chances: new Map(), expiries: new Map(), tasks: new Map(),
  house: { name: "Our home", currency: "EUR", sharedSpendThreshold: 150 }, upkeep: { hemisphere: "north", flags: {} }, expiry: {},
  me: null, members: [], household: null, ai: false, push: null, pushState: "off",
  mode: "loading", tab: "today", lastHouseTab: "overview", q: "", room: "all", flag: "all", sweepRoom: null, swept: new Set(), askText: "", askBusy: false,
  who: "mine", listView: "inbox"
};
let assets = null, sampleCap = null, downloads = null;

const activeItems = () => [...S.items.values()].filter(i => !i.disposedOn);
const roomList = () => [...S.rooms.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
const roomName = id => S.rooms.get(id)?.name || "Unsorted";
const placeLabel = it => [roomName(it.roomId), it.spot].filter(Boolean).join(" · ");
const member = id => S.members.find(m => m.id === id);
const memberName = id => member(id)?.name || "Someone";
const initials = id => (memberName(id).trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2) || "?").toUpperCase();
const avatarHTML = (id, title) => id ? `<span class="avatar" style="background:${esc(member(id)?.color || "#D9CCF5")}" title="${esc(title || memberName(id))}">${esc(initials(id))}</span>` : "";

// ---------- Server ----------
class ApiError extends Error {}
async function api(method, path, body, opts = {}) {
  const headers = { "x-laventina": "1", ...(opts.headers || {}) };
  let payload;
  if (opts.raw) payload = body; else if (body !== undefined) { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
  let res;
  try { res = await fetch("/api" + path, { method, headers, body: payload, credentials: "same-origin" }); }
  catch { const e = new ApiError("You seem to be offline. Changes will retry when you are back."); e.code = "offline"; throw e; }
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const e = new ApiError(data?.message || "Something went wrong. Try again."); e.code = data?.error; e.status = res.status;
    if (res.status === 401 && !path.startsWith("/auth")) showAuth();
    throw e;
  }
  return data;
}
const fileUrl = id => "/api/files/" + encodeURIComponent(id);

// ---------- Persistence ----------
const chains = {};
const pending = new Set();
function queue(path, fn) {
  pending.add(path);
  const p = (chains[path] || Promise.resolve()).then(fn).catch(e => { console.error(path, e); toast(e.message || "That change did not save."); if (e.code === "offline") retryLater(path, fn); })
    .finally(() => { if (chains[path] === p) { pending.delete(path); delete chains[path]; } });
  chains[path] = p; return p;
}
function retryLater(path, fn) { setTimeout(() => queue(path, fn), 8000); }
function clean(o) {
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "id" || k.startsWith("_")) continue;
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "number" && !isFinite(v)) continue;
    if (Array.isArray(v) && !v.length) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) { const c = clean(v); if (Object.keys(c).length) r[k] = c; continue; }
    r[k] = v;
  }
  return r;
}
// App key -> record kind on the server
const COLLS = { items: "items", rooms: "rooms", shopping: "shopping", lists: "lists", plans: "plans", ulog: "upkeepLog", charges: "charges", expenses: "expenses", settlements: "settlements", docs: "documents", projects: "projects", finishes: "finishes", wish: "wishlist", decisions: "decisions", notes: "notes", bells: "bells", coach: "coach", chances: "chances", expiries: "expiries" };
const KIND_KEY = Object.fromEntries(Object.entries(COLLS).map(([k, v]) => [v, k]));
const GEN_KINDS = new Set(["plans", "charges", "docs", "items", "expiries"]);
let genTimer;
function regenSoon() { clearTimeout(genTimer); genTimer = setTimeout(() => api("POST", "/generate").then(pull).catch(() => {}), 2500); }
function put(key, obj) {
  obj.updatedAt = nowISO();
  if (!obj._createdBy && S.me) obj._createdBy = S.me.id;
  S[key].set(obj.id, obj); changed();
  const vis = obj._visibility === "private" ? "private" : "shared";
  if (GEN_KINDS.has(key)) regenSoon();
  return queue(COLLS[key] + "/" + obj.id, () => api("PUT", `/records/${COLLS[key]}/${encodeURIComponent(obj.id)}`, { data: clean(obj), visibility: vis }));
}
function del(key, id) {
  S[key].delete(id); changed();
  if (GEN_KINDS.has(key)) regenSoon();
  return queue(COLLS[key] + "/" + id, () => api("DELETE", `/records/${COLLS[key]}/${encodeURIComponent(id)}`));
}
function putTask(t) {
  t.updatedAt = nowISO();
  if (!t.createdBy && S.me) t.createdBy = S.me.id;
  S.tasks.set(t.id, t); changed();
  const data = { ...t }; for (const k of Object.keys(data)) if (data[k] === undefined || data[k] === "") delete data[k];
  return queue("tasks/" + t.id, () => api("PUT", "/tasks/" + encodeURIComponent(t.id), { data }));
}
function delTask(id) {
  const t = S.tasks.get(id);
  if (t && t.source && t.source !== "todo") S.tasks.set(id, { ...t, status: "skipped" }); else S.tasks.delete(id);
  changed();
  return queue("tasks/" + id, () => api("DELETE", "/tasks/" + encodeURIComponent(id)));
}
const store = {
  putItem: it => put("items", it),
  delItem: id => del("items", id),
  putRoom: r => put("rooms", r),
  delRoom: id => del("rooms", id),
  putShop: s => put("shopping", s),
  delShop: id => del("shopping", id),
  put, del, putTask, delTask,
  putMeta(name, patch) { S[name] = { ...S[name], ...patch }; changed(); return queue("meta/" + name, () => api("PUT", "/records/meta/" + name, { data: clean(S[name]) })); },
  putHouse(h) { return store.putMeta("house", h); }
};
const pendingItem = {};
function touchItem(it) { S.items.set(it.id, it); changed(); clearTimeout(pendingItem[it.id]); pendingItem[it.id] = setTimeout(() => store.putItem(S.items.get(it.id)), 700); }

// Pull changes from the other person every few seconds while the app is open.
let lastSync = null, pulling = false, lastMe = Date.now();
function applySync(res) {
  for (const r of res.records) {
    if (pending.has(r.kind + "/" + r.id)) continue;
    if (r.kind === "meta") { if (!r.deleted && (r.id === "house" || r.id === "upkeep" || r.id === "expiry")) S[r.id] = { ...S[r.id], ...r.data }; continue; }
    const key = KIND_KEY[r.kind]; if (!key) continue;
    if (r.deleted) S[key].delete(r.id); else S[key].set(r.id, { ...r.data, id: r.id });
  }
  for (const t of res.tasks) {
    if (pending.has("tasks/" + t.id)) continue;
    if (t.deleted) S.tasks.delete(t.id); else S.tasks.set(t.id, t.data);
  }
  lastSync = res.now;
}
async function pull() {
  if (pulling || !S.me) return; pulling = true;
  try {
    applySync(await api("GET", "/sync" + (lastSync ? "?since=" + encodeURIComponent(lastSync) : "")));
    // Pick up people who joined, or renamed themselves, about once a minute.
    if (Date.now() - lastMe > 60000) { lastMe = Date.now(); applyMe(await api("GET", "/me")); }
    changed(); bellWatch();
  }
  catch (e) { if (e.code !== "offline") console.error(e); }
  finally { pulling = false; }
}
setInterval(() => { if (document.visibilityState === "visible") pull(); }, 12000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pull(); });

// ---------- Flags & insight ----------
function flagsFor(it) {
  const f = [];
  if (it.disposedOn) { f.push({ k: "gone", cls: "", t: "Gone", why: "Marked gone " + fmtDate(it.disposedOn) }); return f; }
  const e = daysUntil(it.expiresOn);
  if (e != null && e < 0) f.push({ k: "expired", cls: "bad", t: "Expired", why: "Use-by date passed " + relDays(e), rank: 0 });
  else if (e != null && e <= 30) f.push({ k: "expiring", cls: "warn", t: "Use by " + fmtShort(it.expiresOn), why: "Use-by date " + relDays(e), rank: 2 });
  const w = daysUntil(it.warrantyUntil);
  if (w != null && w >= 0 && w <= 60) f.push({ k: "warranty", cls: "warn", t: "Warranty ends", why: "Warranty ends " + relDays(w) + ". Test it now and claim if anything is off.", rank: 1 });
  else if (w != null && w > 60) f.push({ k: "covered", cls: "good", t: "Warranty", why: "Under warranty until " + fmtDate(it.warrantyUntil), quiet: true });
  if (it.minQty != null && (Number(it.qty) || 0) <= Number(it.minQty)) f.push({ k: "low", cls: "warn", t: (Number(it.qty) || 0) === 0 ? "Out" : "Low", why: "You have " + (Number(it.qty) || 0) + ", restock at " + it.minQty, rank: 2 });
  const age = it.installDate ? -daysUntil(it.installDate) / 365 : 0;
  const life = { "safety.smoke_detector": 10, "safety.co_detector": 7, "safety.extinguisher": 10 }[it.category];
  if (life && age >= life) f.push({ k: "replace", cls: "bad", t: "Replace", why: `Installed ${Math.floor(age)} years ago. Units this old should be replaced.`, rank: 0 });
  if (it.lentTo) { const d = Math.floor(daysSince(it.lentOn ? it.lentOn + "T00:00:00" : null)); f.push({ k: "lent", cls: d >= 30 && isFinite(d) ? "warn" : "info", t: "Lent", why: "Lent to " + it.lentTo + (isFinite(d) ? " " + d + " days ago" : ""), rank: 3 }); }
  return f;
}
function insurable(it) { return !isSupply(it) && totalValue(it) >= 50; }
function missingProof(it) {
  const m = [];
  if (!(it.photoIds && it.photoIds.length)) m.push("photo");
  if (!(it.value || it.purchasePrice)) m.push("value");
  if (!it.purchaseDate) m.push("purchase date");
  if (SERIAL_GROUPS.has(catGroup(it.category)) && !it.serial) m.push("serial");
  return m;
}
function proofScore(it) { const need = SERIAL_GROUPS.has(catGroup(it.category)) ? 4 : 3; return (need - missingProof(it).length) / need; }

// ---------- Rendering ----------
const MAIN_TABS = [["today", "Home"], ["upcoming", "Upcoming"], ["expiring", "Expiring"], ["lists", "Lists"], ["house", "House"], ["progress", "Progress"]];
const HOUSE_TABS = [["overview", "Overview"], ["inventory", "Inventory"], ["upkeep", "Upkeep"], ["projects", "Projects"], ["money", "Money & papers"], ["shopping", "Stock & shopping"], ["sweep", "Room sweep"], ["ask", "Ask"]];
const isHouseTab = t => HOUSE_TABS.some(([k]) => k === t);
let raf = 0;
function changed() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; refresh(); }); }
function renderNav() {
  const att = activeItems().filter(i => flagsFor(i).some(f => f.rank != null && f.rank <= 2)).length;
  const low = activeItems().filter(i => flagsFor(i).some(f => f.k === "low")).length + [...S.shopping.values()].filter(s => !s.done).length;
  const today = typeof todayTasks === "function" ? todayTasks().filter(t => mineOrAnyone(t)).length : 0;
  const xp = typeof expiryCount === "function" ? expiryCount() : 0;
  const main = isHouseTab(S.tab) ? "house" : S.tab;
  $("#tabs").innerHTML = MAIN_TABS.map(([k, l]) => `<button data-act="tab" data-tab="${k === "house" ? S.lastHouseTab : k}" ${main === k ? 'aria-current="page"' : ""}>${l}${k === "today" && today ? `<span class="count">${today}</span>` : ""}${k === "expiring" && xp ? `<span class="count">${xp}</span>` : ""}</button>`).join("");
  const sub = $("#subtabs");
  sub.hidden = main !== "house";
  if (main === "house") sub.innerHTML = HOUSE_TABS.map(([k, l]) => `<button class="chip" data-act="tab" data-tab="${k}" aria-pressed="${S.tab === k}">${l}${k === "overview" && att ? ` <span class="muted">${att}</span>` : ""}${k === "shopping" && low ? ` <span class="muted">${low}</span>` : ""}</button>`).join("");
}
function renderHeader() {
  const loading = S.mode === "loading";
  $("#h-sub").textContent = loading ? "Opening…" : (S.household?.name || S.house.name || "Our home");
  $("#h-members").innerHTML = S.members.map(m => avatarHTML(m.id, m.name + (m.id === S.me?.id ? " (you)" : ""))).join("");
  const fab = $("#fab");
  const things = ["overview", "inventory", "sweep"].includes(S.tab);
  fab.dataset.act = things ? "quickadd" : "task-new";
  fab.innerHTML = `<span aria-hidden="true">+</span> ${things ? "Add things" : "New task"}`;
  fab.hidden = S.mode !== "live";
}
function setTab(t) {
  if (t === "house") t = S.lastHouseTab;
  if (!VIEWS[t]) t = "today";
  S.tab = t; if (isHouseTab(t)) S.lastHouseTab = t;
  renderNav(); renderHeader();
  $("#main").innerHTML = VIEWS[t].shell();
  VIEWS[t].live && VIEWS[t].live();
  window.scrollTo(0, 0);
  try { localStorage.setItem("laventina-tab", t); } catch {}
}
function refresh() {
  if (S.mode !== "live") return;
  renderHeader(); renderNav();
  const v = VIEWS[S.tab];
  if (!$("#view-" + S.tab)) return setTab(S.tab);
  v.live && v.live();
}
function thumbHTML(it) {
  const p = it.photoIds && it.photoIds[0];
  if (p) return `<span class="thumb"><img src="${esc(fileUrl(p))}" alt="" loading="lazy"></span>`;
  return `<span class="thumb" aria-hidden="true">${esc((it.name || "?").trim().charAt(0).toUpperCase())}</span>`;
}
function rowHTML(it, opts = {}) {
  const fl = flagsFor(it).filter(f => !f.quiet || opts.showQuiet);
  const qty = Number(it.qty) || 1;
  return `<button class="row${it.disposedOn ? " gone" : ""}" data-act="edit" data-id="${esc(it.id)}">
    ${it.example ? '<span class="example-tag">Example</span>' : ""}
    ${thumbHTML(it)}
    <span class="row-main"><span class="row-name">${esc(it.name)}${qty !== 1 ? ` <small>× ${qty}${it.unit ? " " + esc(it.unit) : ""}</small>` : ""}</span>
    <span class="label">${esc(opts.noRoom ? (it.spot || CAT_LABEL[it.category] || "") : placeLabel(it))}</span></span>
    <span class="row-side">${totalValue(it) ? `<span class="money">${money(totalValue(it))}</span>` : ""}<span class="pills">${fl.map(f => `<span class="pill ${f.cls}">${esc(f.t)}</span>`).join("")}</span></span>
  </button>`;
}
function emptyHTML(title, text, btn) {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${btn || ""}</div>`;
}
const VIEWS = {};

// ---------- Sheets ----------
let sheetClose = null;
function openSheet(title, body, { onClose } = {}) {
  closeSheet();
  $("#layer").innerHTML = `<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-head"><h2 id="sheet-title">${esc(title)}</h2><button class="iconbtn" data-act="close-sheet" aria-label="Close">Close</button></div><div class="sheet-body" id="sheet-body">${body}</div></div></div>`;
  sheetClose = onClose || null;
  document.body.style.overflow = "hidden";
  const f = $("#sheet-body input:not([type=checkbox]), #sheet-body textarea, #sheet-body select"); if (f && matchMedia("(min-width: 760px)").matches) f.focus();
}
function closeSheet() { if (!$("#layer").innerHTML) return; $("#layer").innerHTML = ""; document.body.style.overflow = ""; const c = sheetClose; sheetClose = null; c && c(); }

// ---------- Toast ----------
let toastTimer;
function toast(msg, action) {
  const host = $("#toast-host");
  host.innerHTML = `<div class="toast"><span>${esc(msg)}</span>${action ? `<button id="toast-act">${esc(action.label)}</button>` : ""}</div>`;
  if (action) $("#toast-act").onclick = () => { host.innerHTML = ""; action.run(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => host.innerHTML = "", action ? 6000 : 3200);
}

// ---------- Shared form sheet ----------
function getPath(o, k) { return k.split(".").reduce((a, p) => a == null ? a : a[p], o); }
function setPath(o, k, v) { const ps = k.split("."); let a = o; for (const p of ps.slice(0, -1)) { if (!a[p] || typeof a[p] !== "object") a[p] = {}; else a[p] = { ...a[p] }; a = a[p]; } a[ps.at(-1)] = v; }
const fid = k => "g-" + k.replace(/\W/g, "_");
function fieldHTML(f, data) {
  const id = fid(f.k), v = getPath(data, f.k) ?? f.def;
  if (f.type === "check") return `<label class="check ${f.full ? "full" : ""}"><input type="checkbox" id="${id}" ${v ? "checked" : ""}> ${esc(f.label)}</label>`;
  let input;
  if (f.type === "select") input = `<select id="${id}">${f.options.map(([val, l]) => `<option value="${esc(val)}" ${String(v ?? "") === String(val) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  else if (f.type === "textarea") input = `<textarea id="${id}" rows="3" placeholder="${esc(f.ph || "")}">${esc(v)}</textarea>`;
  else input = `<input type="${f.type || "text"}" id="${id}" value="${esc(v ?? "")}" ${f.type === "number" ? 'step="any"' : ""} placeholder="${esc(f.ph || "")}">`;
  return `<label class="f ${f.full ? "full" : ""}">${esc(f.label)}${f.hint ? ` <span class="hint">${esc(f.hint)}</span>` : ""}${input}</label>`;
}
function readFields(fields, data) {
  for (const f of fields) {
    const el = $("#" + fid(f.k)); if (!el) continue;
    let v;
    if (f.type === "check") v = el.checked || undefined;
    else if (f.type === "number") { const x = el.value.trim().replace(",", "."); v = x === "" ? undefined : parseFloat(x); if (!isFinite(v)) v = undefined; }
    else v = el.value.trim() || undefined;
    setPath(data, f.k, v);
  }
  return data;
}
// Private toggle: shown to the record's creator (or on new records) when the house has more than one person.
const canPrivate = d => S.members.length > 1 && (!d || !d._createdBy || d._createdBy === S.me?.id);
const PRIVATE_FIELD = (label = "Private: only I can see this") => ({ k: "_private", label, type: "check", full: true });
let GF = null;
function formSheet({ title, fields, data, onSave, extraTop = "", extra = "", del, delRun, saveLabel = "Save", onRead, privacy }) {
  const d = structuredClone(data);
  if (privacy && canPrivate(data)) { fields = [...fields, PRIVATE_FIELD(typeof privacy === "string" ? privacy : undefined)]; d._private = d._visibility === "private"; }
  GF = { fields, data: d, onSave, del, delRun, onRead };
  openSheet(title, `<form id="g-form" style="display:grid;gap:16px" autocomplete="off">${extraTop}
    <div class="fields">${fields.map(f => fieldHTML(f, GF.data)).join("")}</div>${extra}
    <div id="g-del"></div>
    <div class="actions" style="justify-content:space-between"><div>${del ? `<button type="button" class="btn danger" data-act="g-del">Delete</button>` : ""}</div>
    <div class="actions"><button type="button" class="btn" data-act="close-sheet">Cancel</button><button type="submit" class="btn primary">${esc(saveLabel)}</button></div></div></form>`);
}
function readGF() {
  const d = readFields(GF.fields, GF.data);
  if ("_private" in d) { d._visibility = d._private ? "private" : "shared"; delete d._private; }
  GF.onRead && GF.onRead(d); return d;
}
const opts = (list) => list.map(x => Array.isArray(x) ? x : [x, x[0].toUpperCase() + x.slice(1).replace(/_/g, " ")]);
const roomOpts = (blank = "Whole house") => [["", blank], ...roomList().map(r => [r.id, r.name])];
const itemOpts = (blank = "None") => [["", blank], ...activeItems().sort((a, b) => a.name.localeCompare(b.name)).map(i => [i.id, i.name + " · " + roomName(i.roomId)])];
const memberOpts = (blank = "Anyone") => [["", blank], ...S.members.map(m => [m.id, m.id === S.me?.id ? m.name + " (you)" : m.name])];
function addDays(iso, n) { const d = new Date((iso || todayISO()) + "T00:00:00"); d.setDate(d.getDate() + Math.round(n)); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
function addMonths(iso, n) { const d = new Date((iso || todayISO()) + "T00:00:00"); d.setMonth(d.getMonth() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
function duePill(d) {
  if (d == null) return "";
  if (d < 0) return `<span class="pill bad">${Math.abs(d)}d overdue</span>`;
  if (d <= 7) return `<span class="pill warn">${d === 0 ? "Today" : "In " + d + "d"}</span>`;
  return `<span class="pill">${relDays(d)}</span>`;
}

// ---------- Claude and files, through the server ----------
function blobToB64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ media_type: blob.type || "image/jpeg", data: String(r.result).split(",")[1] }); r.onerror = rej; r.readAsDataURL(blob); });
}
function makeClaude() {
  const call = async (prompt, o = {}, json = false) => {
    const images = o.images ? await Promise.all(o.images.map(blobToB64)) : [];
    return api("POST", "/ai", { prompt, images, fileIds: o.fileIds || [], json });
  };
  const fn = async (prompt, o = {}) => { const r = await call(prompt, o); o.onText && o.onText({ text: r.text }); return r; };
  fn.json = async (prompt, o = {}) => (await call(prompt, o, true)).value;
  fn.limits = async () => ({ maxPromptBytes: 300000 });
  return fn;
}
async function uploadFile(blob, type) {
  const r = await api("POST", "/files", blob, { raw: true, headers: { "content-type": type || blob.type || "application/octet-stream" } });
  return r.id;
}
assets = { upload: async (blob, o = {}) => ({ id: await uploadFile(blob, o.type) }) };

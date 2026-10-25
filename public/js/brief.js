"use strict";
// ---------- The brief: Home as one card, not a list ----------
// One sentence box that catches coupons and tasks, the one thing, money on the table in one line, what was caught and lost,
// "I'm going shopping", phone calendar alarms (.ics, no server), Ask Claude, and things shared in from other apps.
// All of it runs on the phone: only saving what you caught reaches the server.

// ---------- One-sentence catch box ----------
const SHOPS = /\b(carrefour|mercadona|lidl|aldi|dia|eroski|alcampo|consum|bonpreu|caprabo|hipercor|el corte ingl[eé]s|amazon|ikea|decathlon|zara|primark|leroy merlin|media ?markt|fnac|action|glovo|uber eats)\b/i;
const CHANCE_WORDS = /\b(coupons?|vouchers?|cup[oó]n|vale|discount|descuento|promo|refund|reembolso|cashback|gift ?card)\b/i;
const MONEY_RE = /(?:€\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(?:€|eur(?:os?)?\b))/gi;
const titleCase = s => s.replace(/\b\p{L}/gu, c => c.toUpperCase());

// A sentence becomes an opportunity when it talks about money off, a refund or a shop with an amount; anything else is a task.
function parseCatch(raw) {
  const text = raw.replace(/\s+/g, " ").trim();
  const amounts = [];
  let rest = text.replace(MONEY_RE, (m, a, b, off, all) => {
    const before = all.slice(Math.max(0, off - 14), off).toLowerCase();
    amounts.push({ n: parseFloat((a || b).replace(",", ".")), min: /\b(on|over|above|min|minimum|spend|from|de|con)\s*$/.test(before) });
    return " ";
  });
  const shop = (text.match(SHOPS) || [])[1] || (text.match(/\b(?:at|en|in)\s+(\p{Lu}[\p{L}&'-]+)/u) || [])[1];
  // "7€ off" counts, "drop off the kids" doesn't.
  const isChance = CHANCE_WORDS.test(text) || (amounts.length && (shop || /\boff\b/i.test(text)));
  if (!isChance) return { type: "task", task: parseQuick(text, quickDefaults()) };
  const kind = /refund|reembolso/i.test(text) ? "refund" : /cashback/i.test(text) ? "cashback" : /discount|descuento|sale/i.test(text) ? "discount" : "coupon";
  const value = (amounts.find(a => !a.min) || {}).n, minSpend = (amounts.find(a => a.min) || {}).n;
  // Dates: the task parser already knows "3 Nov", "friday", "31/10" and "in 2 weeks".
  rest = rest.replace(/\b(till|until|untill|to|by|ends?|ending|expires?|expiring|valid|before|hasta|on|over|above|min|minimum|spend|at|en)\b/gi, " ");
  const p = parseQuick(rest, {});
  const store = shop ? titleCase(shop) : undefined;
  const leftover = p.title.replace(CHANCE_WORDS, " ").replace(SHOPS, " ").replace(/\boff\b/gi, " ").replace(/\s+/g, " ").trim();
  const what = kind === "coupon" ? "off" : kind;
  const title = value ? `${money(value, { cents: value % 1 !== 0 })} ${what}${store ? " at " + store : ""}` : leftover ? leftover.charAt(0).toUpperCase() + leftover.slice(1) : `${titleCase(kind)}${store ? " at " + store : ""}`;
  return { type: "chance", chance: { title, kind, value, minSpend, store, expiresOn: p.dueOn } };
}
function catchChips(r) {
  if (r.type === "task") return `<span class="pill">Task</span>${quickChips(r.task)}`;
  const c = r.chance, bits = [CHANCE_KINDS.find(k => k[0] === c.kind)?.[1] || "Coupon"];
  if (c.value) bits.push(money(c.value, { cents: true }));
  if (c.minSpend) bits.push("on " + money(c.minSpend));
  if (c.store) bits.push(c.store);
  bits.push(c.expiresOn ? "ends " + fmtShort(c.expiresOn) : "no end date yet");
  return bits.map((b, i) => `<span class="pill ${i ? "info" : "good"}">${esc(b)}</span>`).join("");
}
function catchBoxHTML() {
  return `<form id="catch-form" class="quickadd catchbox" autocomplete="off"><label class="sr" for="catch-text">Catch something</label>
    <input type="text" id="catch-text" placeholder="Coupon 7€ Carrefour till 3 Nov" enterkeyhint="done">
    <button class="btn primary" type="submit">Catch</button><div id="catch-preview" class="qt-preview"></div></form>`;
}
function catchSentence(text) {
  const r = parseCatch(text);
  if (r.type === "task") { addQuick(text); return; }
  const c = { id: newId("c"), status: "open", createdAt: nowISO(), ...r.chance };
  putChance(c);
  toast(`Caught ${c.title}${c.expiresOn ? `. It's on your list two days before ${fmtShort(c.expiresOn)}` : ". Tap it to add the end date"}`,
    c.expiresOn ? { label: "Add to calendar", run: () => calendarFor([chanceEvent(c)], c.title) } : { label: "Open", run: () => openChance(S.chances.get(c.id)) });
}

// ---------- Money on the table, in one line, and the story so far ----------
function moneyLineHTML() {
  const open = openChances(); if (!open.length) return "";
  const total = sum(open, c => Number(c.value) || 0);
  const week = open.filter(c => c.expiresOn && chanceDays(c) <= 7);
  return `<button class="moneyline" data-act="money-open"><b class="num">${money(total, { cents: total % 1 !== 0 }) || open.length}</b>
    <span>on the table${week.length ? `, <b>${week.length}</b> ending this week` : ""}</span><span class="muted">See all</span></button>`;
}
function moneyStoryHTML() {
  if (!S.chances.size) return (lsGet("laventina-seed-coupon") || "") === "hide" ? "" : `<div class="panel story"><span class="muted">Every coupon Laventina catches adds to your story. It starts with the €7 Carrefour coupon that got away.</span>
    <div class="actions" style="justify-content:flex-start"><button class="btn small" data-act="chance-seed">Log the lost €7</button><button class="btn small" data-act="chance-seed-hide">Not mine</button></div></div>`;
  const s = ledgerStats(), month = todayISO().slice(0, 7);
  const inMonth = st => [...S.chances.values()].filter(c => c.status === st && localDay(c.outcomeAt || c.createdAt).startsWith(month));
  const mc = sum(inMonth("caught"), c => Number(c.value) || 0), ml = sum(inMonth("missed"), c => Number(c.value) || 0);
  if (!s.caught.length && !s.missed.length) return "";
  const m = n => money(n, { cents: n % 1 !== 0 });
  return `<button class="story" data-act="tab" data-tab="progress"><span class="eyebrow">Money caught vs lost</span>
    <span><b class="good-ink">${m(mc)}</b> caught and <b class="${ml ? "bad-ink" : ""}">${m(ml)}</b> slipped this month.</span>
    <span class="muted">Since you started: ${m(s.caughtV)} caught, ${m(s.missedV)} lost${s.caughtV > s.missedV ? ". Laventina has paid back what slipped." : "."}</span></button>`;
}

// ---------- I'm going shopping ----------
function knownShops() {
  const set = new Map();
  for (const c of openChances()) if (c.store) set.set(c.store.toLowerCase(), c.store);
  const last = lsGet("laventina-shop"); if (last) set.set(last.toLowerCase(), last);
  return [...set.values()].slice(0, 8);
}
function openShopping(shop = lsGet("laventina-shop") || "") {
  const shops = knownShops();
  const key = shop.toLowerCase();
  const coupons = openChances().filter(c => !c.store || !key || c.store.toLowerCase().includes(key) || key.includes(c.store.toLowerCase()))
    .sort((a, b) => (a.expiresOn || "9999").localeCompare(b.expiresOn || "9999"));
  const here = coupons.filter(c => c.store), general = coupons.filter(c => !c.store);
  const list = [...S.shopping.values()].filter(s => !s.done);
  const low = activeItems().filter(i => flagsFor(i).some(f => f.k === "low"));
  const useUp = expiryEntries().filter(e => e.lane === "useby" && XP().needsYou(e));
  const need = Math.max(0, ...here.map(c => Number(c.minSpend) || 0));
  const coupon = c => `<div class="shop-coupon"><b class="num">${money(c.value, { cents: true }) || "🎟"}</b><span><b>${esc(c.title)}</b><span class="muted">${[c.minSpend ? "on " + money(c.minSpend) : "", c.expiresOn ? (chanceDays(c) <= 0 ? "last day" : "ends " + fmtShort(c.expiresOn)) : "", c.notes || ""].filter(Boolean).map(esc).join(" · ")}</span></span>
    <button class="btn small primary" data-act="chance-caught" data-id="${esc(c.id)}">Used it</button></div>`;
  openSheet(shop ? `Going to ${shop}` : "I'm going shopping", `<div style="display:grid;gap:14px">
    <form id="shop-form" class="search" autocomplete="off"><label class="sr" for="shop-name">Which shop</label><input type="text" id="shop-name" value="${esc(shop)}" placeholder="Which shop? Carrefour, Lidl…"><button class="btn small" type="submit">Go</button></form>
    ${shops.length ? `<div class="chips">${shops.map(s => `<button class="chip" data-act="shop-go" data-shop="${esc(s)}" aria-pressed="${s.toLowerCase() === key}">${esc(s)}</button>`).join("")}</div>` : ""}
    ${here.length ? `<section><h3 class="eyebrow">Bring these coupons${need ? ` · spend at least ${esc(money(need))}` : ""}</h3>${here.map(coupon).join("")}</section>` : shop ? `<p class="muted" style="margin:0">No coupons saved for ${esc(shop)}.</p>` : ""}
    ${general.length ? `<section><h3 class="eyebrow">Coupons for any shop</h3>${general.map(coupon).join("")}</section>` : ""}
    ${list.length || low.length ? `<section><h3 class="eyebrow">To buy</h3>${low.map(it => `<div class="shop-item"><span><b>${esc(it.name)}</b> <span class="muted">running low</span></span><button class="btn small" data-act="restock" data-id="${esc(it.id)}">Bought</button></div>`).join("")}
      ${list.map(s => `<div class="shop-item"><input type="checkbox" id="gs-${esc(s.id)}" data-act-change="shop-toggle" data-id="${esc(s.id)}"><span><label for="gs-${esc(s.id)}">${esc(s.text)}</label></span></div>`).join("")}</section>` : `<p class="muted" style="margin:0">The shopping list is empty.</p>`}
    ${useUp.length ? `<section><h3 class="eyebrow">Use up first, before buying more</h3><p style="margin:0">${useUp.map(e => esc(e.title)).join(", ")}</p></section>` : ""}
    <form id="shop-add" class="search" autocomplete="off"><label class="sr" for="shop-add-text">Add to the list</label><input type="text" id="shop-add-text" placeholder="Add to the list: milk, bin bags…"><button class="btn small" type="submit">Add</button></form>
  </div>`);
}

// ---------- Phone calendar alarms (.ics) ----------
// The phone's own calendar rings, so nothing runs on a server. Each event is all-day on the last day, with an alarm
// at 9:00 a couple of days before and another at 9:00 on the day.
const icsText = s => String(s || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1").slice(0, 160);
function icsFold(line) { const out = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = " " + line.slice(74); } out.push(line); return out.join("\r\n"); }
function chanceEvent(c) {
  return { uid: "chance-" + c.id, date: c.expiresOn, lead: 2, title: `Use: ${c.title}${c.store && !c.title.includes(c.store) ? " at " + c.store : ""}`,
    notes: [c.minSpend ? `Spend at least ${money(c.minSpend)}` : "", c.notes || "", "Laventina: " + location.origin].filter(Boolean).join(". ") };
}
function expiryEvent(e) {
  return { uid: "xp-" + e.key.replace(/[^\w-]/g, "-"), date: e.date, lead: Math.min(Math.max(2, e.lead || 2), 14), title: `${XP().verb(e)}: ${e.title}`, notes: lineFor(e) + ". Laventina: " + location.origin };
}
function icsFor(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Laventina//Home//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const ev of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date || "")) continue;
    const lead = Math.max(1, ev.lead || 2);
    lines.push("BEGIN:VEVENT", `UID:${ev.uid}@laventina`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ev.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(ev.date, 1).replace(/-/g, "")}`,
      icsFold(`SUMMARY:${icsText(ev.title)}`), icsFold(`DESCRIPTION:${icsText(ev.notes)}`), "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY", icsFold(`DESCRIPTION:${icsText(ev.title)}`), `TRIGGER:-P${lead - 1}DT15H`, "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", icsFold(`DESCRIPTION:${icsText(ev.title)}`), "TRIGGER:PT9H", "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
function calendarFor(events, name) {
  events = events.filter(ev => ev.date && ev.date >= todayISO());
  if (!events.length) return toast("Nothing with a date still ahead.");
  const blob = new Blob([icsFor(events)], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "laventina-" + (name || "dates").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) + ".ics";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(events.length === 1 ? "Open the file to add it to your calendar" : `Open the file to add ${events.length} dates to your calendar`);
}
function calendarAll() {
  const xs = expiryEntries().filter(e => e.state !== "later" && e.lane !== "coupons" && e.days >= 0).map(expiryEvent);
  const cs = openChances().filter(c => c.expiresOn).map(chanceEvent);
  calendarFor([...cs, ...xs], "everything-that-runs-out");
}

// ---------- Ask Claude (on Nero's own Claude plan, through the Laventina connector) ----------
const CLAUDE_BRIEF = "Brief me on my household. Use the Laventina connector: start with get_overview, then tell me in a few kind sentences the one thing that matters most today, any money about to slip away (coupons, refunds), and what can wait. Offer to do things for me.";
function askClaudeHTML() {
  return `<a class="btn" href="https://claude.ai/new?q=${encodeURIComponent(CLAUDE_BRIEF)}" target="_blank" rel="noopener" data-act="ask-claude">Ask Claude</a>`;
}

// ---------- Shared in from other apps (Android Share menu) ----------
// The service worker keeps what was shared in a cache and opens /?share=1.
async function takeShared() {
  let meta = {}, image = null;
  try {
    const cache = await caches.open("laventina-share");
    const m = await cache.match("/share/meta"); if (m) meta = await m.json();
    const i = await cache.match("/share/image"); if (i) image = await i.blob();
    await cache.delete("/share/meta"); await cache.delete("/share/image");
  } catch {}
  const text = [meta.title, meta.text].filter(Boolean).join(" ").trim();
  if (!text && !meta.url && !image) return;
  const r = text ? parseCatch(text) : { type: "chance", chance: { kind: "coupon" } };
  if (r.type === "task" && !image) { setTab("today"); const inp = $("#catch-text"); if (inp) { inp.value = [text, meta.url].filter(Boolean).join(" "); inp.dispatchEvent(new Event("input", { bubbles: true })); inp.focus(); } return; }
  const pre = r.type === "chance" ? r.chance : { title: r.task.title, kind: "coupon", expiresOn: r.task.dueOn };
  pre.notes = [meta.url, text && text !== pre.title ? text : ""].filter(Boolean).join(" · ").slice(0, 400) || undefined;
  if (image) {
    toast("Saving the picture…");
    try { pre.photoId = await uploadFile(await shrink(image, 1600), "image/jpeg"); } catch { toast("Couldn't keep the picture, but the rest is here."); }
  }
  openChance(null, pre);
}

// ---------- Home ----------
function briefHomeLive() {
  $("#today-money").innerHTML = moneyLineHTML();
  $("#today-story").innerHTML = moneyStoryHTML();
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  switch (b.dataset.act) {
    case "money-open": openSheet("Money on the table", chancesHTML()); break;
    case "shop-open": openShopping(); break;
    case "shop-go": lsSet("laventina-shop", b.dataset.shop); openShopping(b.dataset.shop); break;
    case "cal-chance": { const c = S.chances.get(b.dataset.id); if (c) calendarFor([chanceEvent(c)], c.title); break; }
    case "cal-xp": { const x = expiryEntries().find(x => x.key === b.dataset.key); if (x) calendarFor([expiryEvent(x)], x.title); break; }
    case "cal-all": calendarAll(); break;
  }
});
document.addEventListener("submit", e => {
  const f = e.target;
  if (f.id === "catch-form") { e.preventDefault(); const inp = $("#catch-text"), v = inp.value.trim(); if (!v) return; catchSentence(v); inp.value = ""; $("#catch-preview").innerHTML = ""; }
  if (f.id === "shop-form") { e.preventDefault(); const v = $("#shop-name").value.trim(); if (v) lsSet("laventina-shop", v); openShopping(v); }
  if (f.id === "shop-add") { e.preventDefault(); const v = $("#shop-add-text").value.trim(); if (!v) return; store.putShop({ id: newId("s"), text: v.slice(0, 120), done: false, createdAt: nowISO() }); openShopping($("#shop-name")?.value.trim() || ""); toast("Added to the list"); }
});
document.addEventListener("input", e => {
  if (e.target.id === "catch-text") { const v = e.target.value.trim(); $("#catch-preview").innerHTML = v ? catchChips(parseCatch(v)) : ""; }
});

// Long-press shortcuts on the app icon (manifest "shortcuts") and the Share menu land here once the app is open.
function briefStartup() {
  const qs = new URLSearchParams(location.search);
  const act = qs.get("do"), shared = qs.has("share");
  if (!act && !shared) return;
  history.replaceState(null, "", location.pathname + location.hash);
  if (shared) { takeShared(); return; }
  if (act === "shop") { openShopping(); return; }
  if (act === "catch" || act === "add") {
    setTab("today");
    const inp = $("#catch-text"); if (!inp) return;
    if (act === "catch") inp.placeholder = "Coupon 7€ Carrefour till 3 Nov";
    inp.focus();
  }
}

// ---------- Together: the house bell, fridge notes, thank-yous, and the notifications card ----------
const BELL_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v3.6l-1.6 2.7A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.7L18 12.6V9a6 6 0 0 0-6-6Z" fill="currentColor"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`;
const BELL_PRESETS = ["Dinner's ready", "Can someone help me?", "I'm home", "Someone's at the door", "Come and look at this"];
const NOTE_COLORS = ["#FFF4C2", "#FDE2EA", "#DDF3EA", "#E6E0FA", "#DCEBFB"];
const agoLabel = iso => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// What this device can do about notifications, worked out once at boot and after changes.
// on | available | ios-install | unsupported | denied | off (site has no keys)
async function refreshPushState() {
  let st = "off";
  if (S.push) {
    if (!pushSupported()) st = isIOS() && !standalone() ? "ios-install" : "unsupported";
    else if (Notification.permission === "denied") st = "denied";
    else {
      const sub = await currentSub();
      if (sub && Notification.permission === "granted") {
        // A device the server forgot (or never heard about) signs itself back up with default settings.
        const dev = await api("POST", "/push/device", { endpoint: sub.endpoint }).catch(() => null);
        if (dev && !dev.subscribed) await api("POST", "/push/subscribe", { subscription: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", hour: 8 }).catch(() => {});
        st = "on";
      } else st = "available";
    }
  }
  if (S.pushState !== st) { S.pushState = st; changed(); }
}
function pushCardHTML({ inBell } = {}) {
  const st = S.pushState;
  if (!inBell && (lsGet("laventina-push-later") || "") > todayISO()) return "";
  const later = inBell ? "" : `<button type="button" class="btn small" data-act="push-later">Not now</button>`;
  if (st === "available") return `<div class="panel nudge"><span class="nudge-icon">${BELL_ICON}</span><div><b>Turn on notifications on this ${isIOS() || /Android/.test(navigator.userAgent) ? "phone" : "device"}</b><p class="muted">Hear the house bell, get a morning list of what is due, and know when someone hands you a task.</p>
    <div class="actions" style="justify-content:flex-start"><button type="button" class="btn primary small" data-act="push-on">Turn on</button>${later}</div></div></div>`;
  if (st === "ios-install") return `<div class="panel nudge"><span class="nudge-icon">${BELL_ICON}</span><div><b>Notifications on iPhone need one step first</b><p class="muted">Tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>. Open Laventina from the new icon and this card will have a Turn on button.</p>${later ? `<div class="actions" style="justify-content:flex-start">${later}</div>` : ""}</div></div>`;
  if (st === "denied" && inBell) return `<p class="muted small-note">Notifications are blocked for Laventina in this browser's site settings, so this device won't ring.</p>`;
  return "";
}

// ---------- The house bell ----------
function recentBells(minutes) {
  const since = Date.now() - minutes * 60000;
  return [...S.bells.values()].filter(b => Date.parse(b.at) >= since).sort((a, b) => b.at.localeCompare(a.at));
}
function openBell() {
  const others = S.members.filter(m => m.id !== S.me.id);
  const recent = recentBells(24 * 60).slice(0, 6);
  openSheet("House bell", `
    <form id="bell-form" class="bell-form">
      <p class="muted" style="margin:0">${others.length ? `Rings on ${esc(others.map(m => m.name.split(" ")[0]).join(" and "))}'s phones${others.length > 1 ? "" : ""}, with your message.` : "Rings for everyone in your home. Invite someone from Settings so there is someone to hear it."}</p>
      <label class="f">Message <span class="hint">optional</span><input type="text" id="bell-msg" maxlength="120" placeholder="Dinner's ready" autocomplete="off"></label>
      <div class="chips wrap-chips">${BELL_PRESETS.map(p => `<button type="button" class="chip" data-act="bell-preset" data-msg="${esc(p)}">${esc(p)}</button>`).join("")}</div>
      <button type="submit" class="btn primary bell-ring" id="bell-go">${BELL_ICON} Ring the bell</button>
      ${pushCardHTML({ inBell: true })}
      ${recent.length ? `<div class="bell-log"><span class="eyebrow">Today</span>${recent.map(b => `<div class="bell-line">${avatarHTML(b._createdBy)}<span><b>${esc(memberName(b._createdBy).split(" ")[0])}</b>${b.message ? ": " + esc(b.message) : " rang"}</span><span class="muted">${esc(agoLabel(b.at))}</span></div>`).join("")}</div>` : ""}
    </form>`);
}
async function ringBell() {
  const btn = $("#bell-go"); if (!btn || btn.disabled) return;
  btn.disabled = true; btn.classList.add("ringing");
  const message = $("#bell-msg").value.trim();
  try {
    const r = await api("POST", "/bell", { message });
    try { applyMe(await api("GET", "/me")); } catch {}
    S.bells.set(r.id, { id: r.id, message, at: nowISO(), _createdBy: S.me.id });
    lsSet("laventina-bell-seen", r.id);
    closeSheet();
    const others = S.members.filter(m => m.id !== S.me.id);
    toast(!others.length ? "Rang. Invite someone so it rings on their phone too." : r.devices ? "Ding dong! The bell rang." : "Rang. Nobody has notifications on yet, so they'll see it next time they open Laventina.");
  } catch (e) { toast(e.message); btn.disabled = false; btn.classList.remove("ringing"); }
}
// A bell rung while the app is open shows up here too, once.
function bellWatch() {
  const fresh = recentBells(3).filter(b => b._createdBy !== S.me?.id);
  const b = fresh[0]; if (!b || lsGet("laventina-bell-seen") === b.id) return;
  lsSet("laventina-bell-seen", b.id);
  toast(`🔔 ${memberName(b._createdBy).split(" ")[0]} rang${b.message ? ": " + b.message : " the bell"}`);
  const hb = $(".bellbtn"); if (hb) { hb.classList.remove("ringing"); void hb.offsetWidth; hb.classList.add("ringing"); }
}
function bellBannerHTML() {
  const hidden = lsGet("laventina-bell-hide");
  const b = recentBells(30).find(b => b._createdBy !== S.me?.id && b.id !== hidden);
  if (!b) return "";
  return `<div class="bell-banner"><span class="nudge-icon">${BELL_ICON}</span><span><b>${esc(memberName(b._createdBy).split(" ")[0])} rang the bell</b>${b.message ? `<br>${esc(b.message)}` : ""}</span><span class="muted">${esc(agoLabel(b.at))}</span><button class="iconbtn" data-act="bell-hide" data-id="${esc(b.id)}" aria-label="Dismiss">✕</button></div>`;
}

// ---------- Fridge notes ----------
function fridgeHTML() {
  const notes = [...S.notes.values()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return `<section class="section fridge"><header><h2>On the fridge</h2><button class="link" data-act="note-new">+ Note</button></header>
    <div class="notes" id="notes">${notes.map(n => `<div class="note" style="background:${esc(n.color || NOTE_COLORS[0])}">
      <p>${esc(n.text)}</p><span class="note-foot">${avatarHTML(n._createdBy)}<span class="muted">${esc(agoLabel(n.createdAt))}</span><button class="link note-x" data-act="note-del" data-id="${esc(n.id)}" aria-label="Take this note down">Take down</button></span></div>`).join("")}
      ${notes.length ? "" : `<button class="note empty-note" data-act="note-new"><span class="muted">Stick a note for everyone: the wifi password, "plumber Thursday", a little hello.</span></button>`}</div></section>`;
}
function openNoteForm() {
  const el = $("#notes"); if (!el || $("#note-form")) return;
  const mine = NOTE_COLORS[[...S.members].findIndex(m => m.id === S.me.id) % NOTE_COLORS.length] || NOTE_COLORS[0];
  el.insertAdjacentHTML("afterbegin", `<form class="note" id="note-form" style="background:${mine}"><label class="sr" for="note-text">Note</label><textarea id="note-text" maxlength="280" rows="3" placeholder="Write a note…"></textarea>
    <span class="note-foot"><span class="note-colors">${NOTE_COLORS.map(c => `<button type="button" class="swatch" data-act="note-color" data-color="${c}" style="background:${c}" aria-label="Note colour"></button>`).join("")}</span><button type="submit" class="btn small primary">Stick it</button></span></form>`);
  $("#note-text").focus();
}
function saveNote() {
  const f = $("#note-form"), text = $("#note-text").value.trim(); if (!text) return f.remove();
  store.put("notes", { id: newId("n"), text, color: f.style.backgroundColor ? rgbHex(f.style.backgroundColor) : NOTE_COLORS[0], createdAt: nowISO() });
}
const rgbHex = c => { const m = c.match(/\d+/g); return m ? "#" + m.slice(0, 3).map(x => Number(x).toString(16).padStart(2, "0")).join("").toUpperCase() : c; };

// ---------- Thank-yous ----------
function thanksSideHTML(t) {
  if (t.status !== "done" || !t.doneBy || S.members.length < 2) return "";
  const thanks = (t.extra && t.extra.thanks) || [];
  if (t.doneBy === S.me?.id) return thanks.length ? `<span class="thanked" title="${esc(thanks.map(x => memberName(x.by)).join(", "))} said thanks">💜 ${thanks.length > 1 ? thanks.length : esc(memberName(thanks[0].by).split(" ")[0])}</span>` : "";
  if (thanks.some(x => x.by === S.me?.id)) return `<span class="thanked">💜 Thanked</span>`;
  return `<button class="claim thank" data-act="task-thank" data-id="${esc(t.id)}">Say thanks</button>`;
}
async function thankTask(t) {
  if (!t) return;
  const thanks = [...((t.extra && t.extra.thanks) || []), { by: S.me.id, at: nowISO() }];
  S.tasks.set(t.id, { ...t, extra: { ...(t.extra || {}), thanks } }); changed();
  try { await api("POST", "/tasks/" + encodeURIComponent(t.id) + "/thanks"); toast(`💜 Sent your thanks to ${memberName(t.doneBy).split(" ")[0]}`); }
  catch (e) { toast(e.message); pull(); }
}

// ---------- Reminders before a task is due ----------
function toggleRemind(btn) {
  btn.setAttribute("aria-pressed", btn.getAttribute("aria-pressed") !== "true");
  const time = $("#ts-time"), hint = $("#ts-remind-hint");
  const on = !!document.querySelector('#ts-remind [aria-pressed="true"]');
  if (!time.value) { hint.textContent = "Pick a time above, so Laventina knows when."; if (on) time.focus(); return; }
  hint.textContent = "";
  if (on && !$("#ts-due").value) $("#ts-due").value = todayISO();
  if (on && S.pushState !== "on") hint.textContent = S.pushState === "ios-install" ? "On iPhone, add Laventina to your Home Screen to get reminders." : "Turn on notifications (on Today) to get reminders on this device.";
  // An existing task saves right away; a new one saves with the Save button.
  if (!TS.isNew) {
    readTask(); if (!TS.d.title) return;
    putTask(TS.d);
    const mins = myReminders(TS.d);
    toast(mins.length ? `I'll remind you ${mins.join(", ")} min before ${TS.d.dueTime}` : "Reminder off");
  }
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  switch (t.dataset.act) {
    case "bell": openBell(); break;
    case "bell-preset": $("#bell-msg").value = t.dataset.msg; document.querySelectorAll("#bell-form .chip").forEach(c => c.setAttribute("aria-pressed", c === t)); break;
    case "bell-hide": lsSet("laventina-bell-hide", t.dataset.id); changed(); break;
    case "push-later": lsSet("laventina-push-later", addDays(todayISO(), 14)); changed(); break;
    case "note-new": openNoteForm(); break;
    case "note-color": $("#note-form").style.background = t.dataset.color; break;
    case "note-del": store.del("notes", t.dataset.id); toast("Taken down"); break;
    case "task-thank": thankTask(S.tasks.get(t.dataset.id)); break;
    case "ts-remind": toggleRemind(t); break;
  }
});
document.addEventListener("input", e => {
  if (e.target.id === "ts-time" && e.target.value && $("#ts-remind-hint")) $("#ts-remind-hint").textContent = "";
});
document.addEventListener("submit", e => {
  if (e.target.id === "bell-form") { e.preventDefault(); ringBell(); }
  if (e.target.id === "note-form") { e.preventDefault(); saveNote(); }
});

"use strict";
// ---------- Signing in ----------
let authMode = "signin";
function showAuth(mode) {
  if (mode) authMode = mode;
  S.mode = "auth"; S.me = null; lastSync = null;
  closeSheet();
  document.body.classList.add("signed-out");
  const code = new URLSearchParams(location.search).get("invite");
  if (code && !mode && authMode === "signin") authMode = "join";
  const tabs = [["signin", "Sign in"], ["create", "Start a household"], ["join", "Join with a code"]];
  $("#main").innerHTML = `<div class="auth">
    <div class="auth-brand">${LOGO}<h1>Laventina</h1><p class="muted">The calm way to run a home together: one shared task list, with the house remembered around it.</p></div>
    <div class="panel auth-card">
      <div class="chips" role="tablist">${tabs.map(([k, l]) => `<button class="chip" role="tab" data-act="auth-mode" data-mode="${k}" aria-pressed="${authMode === k}">${l}</button>`).join("")}</div>
      <form id="auth-form" style="display:grid;gap:12px" autocomplete="on">
        ${authMode !== "signin" ? `<label class="f">Your name<input type="text" id="au-name" autocomplete="given-name" required placeholder="Nero"></label>` : ""}
        <label class="f">Email<input type="email" id="au-email" autocomplete="email" required></label>
        <label class="f">Password${authMode !== "signin" ? ` <span class="hint">at least 8 characters</span>` : ""}<input type="password" id="au-pass" autocomplete="${authMode === "signin" ? "current-password" : "new-password"}" required minlength="${authMode === "signin" ? 1 : 8}"></label>
        ${authMode === "create" ? `<label class="f">Name your home<input type="text" id="au-house" placeholder="Our home"></label>` : ""}
        ${authMode === "join" ? `<label class="f">Invite code <span class="hint">from the person who set it up</span><input type="text" id="au-code" required placeholder="ABCD-EFGH" value="${esc(code || "")}" style="text-transform:uppercase;letter-spacing:.1em"></label>` : ""}
        <div id="au-err" role="alert"></div>
        <button class="btn primary" type="submit" id="au-go">${{ signin: "Sign in", create: "Create my household", join: "Join the household" }[authMode]}</button>
      </form>
    </div></div>`;
  $("#tabs").innerHTML = ""; $("#subtabs").hidden = true; $("#h-sub").textContent = ""; $("#h-members").innerHTML = ""; $("#fab").hidden = true;
}
async function submitAuth() {
  const v = id => ($("#" + id)?.value || "").trim();
  const go = $("#au-go"); go.disabled = true;
  try {
    if (authMode === "signin") await api("POST", "/auth/login", { email: v("au-email"), password: $("#au-pass").value });
    else await api("POST", "/auth/signup", { email: v("au-email"), password: $("#au-pass").value, name: v("au-name"), householdName: v("au-house"), inviteCode: authMode === "join" ? v("au-code") : undefined });
    if (location.search) history.replaceState(null, "", location.pathname);
    document.body.classList.remove("signed-out");
  if (pushSupported()) swReg().catch(() => {});
    boot();
  } catch (e) {
    $("#au-err").innerHTML = `<div class="confirm">${esc(e.message)}</div>`; go.disabled = false;
  }
}

// ---------- Settings ----------
function applyMe(me) {
  S.me = me.user; S.members = me.members; S.household = me.household; S.ai = !!me.ai; S.push = me.push || null;
  sampleCap = S.ai ? makeClaude() : null;
}
function inviteLink() { return location.origin + "/?invite=" + encodeURIComponent(S.household?.inviteCode || ""); }
function openSettings() {
  const rooms = roomList();
  openSheet("Settings", `
    <form id="set-form" style="display:grid;gap:20px">
      <fieldset><legend class="eyebrow">People in this home</legend>
        <div class="members">${S.members.map(m => `<div class="member">${avatarHTML(m.id)}<span><b>${esc(m.name)}</b>${m.id === S.me.id ? ' <span class="muted">(you)</span>' : ""}</span><span class="muted">${m.role === "owner" ? "Set it up" : "Member"}</span></div>`).join("")}</div>
        <div class="panel invite"><span>To share Laventina, send this invite code. They open Laventina, choose <b>Join with a code</b>, and you share everything except what either of you marks private.</span>
          <div class="search"><input type="text" readonly id="s-code" value="${esc(S.household?.inviteCode || "")}" aria-label="Invite code" style="font-weight:800;letter-spacing:.12em"><button type="button" class="btn small" data-act="copy-invite">Copy invite link</button><button type="button" class="btn small" data-act="new-invite">New code</button></div></div>
      </fieldset>
      <div class="fields">
        <label class="f">Your name<input type="text" id="s-me" value="${esc(S.me.name)}"></label>
        <label class="f">Home name<input type="text" id="s-name" value="${esc(S.household?.name || "")}"></label>
        <label class="f">Currency<select id="s-cur">${CURRENCIES.map(c => `<option ${c === S.house.currency ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        ${S.members.length > 1 ? `<label class="f">Ask both of us above <span class="hint">wishlist buys</span><input type="number" id="s-thr" min="0" step="10" value="${esc(threshold())}"></label>` : ""}
      </div>
      <fieldset><legend class="eyebrow">Notifications on this device</legend><div id="s-push" class="push-panel"><span class="muted">Checking…</span></div></fieldset>
      <fieldset><legend class="eyebrow">Rooms</legend>
        <div style="display:grid;gap:8px" id="s-rooms">${rooms.map(r => {
          const n = [...S.items.values()].filter(i => i.roomId === r.id).length;
          return `<div class="search"><label class="sr" for="rn-${esc(r.id)}">Room name</label><input type="text" id="rn-${esc(r.id)}" data-room="${esc(r.id)}" value="${esc(r.name)}"><button type="button" class="btn small ${n ? "" : "danger"}" data-act="room-del" data-room="${esc(r.id)}" ${n ? `disabled title="Move its ${n} things first"` : ""}>${n ? n + " things" : "Remove"}</button></div>`;
        }).join("")}</div>
        <div class="search"><label class="sr" for="s-newroom">New room</label><input type="text" id="s-newroom" placeholder="Add a room: Attic, Kids' room…"><button type="button" class="btn small" data-act="room-add">Add room</button></div>
      </fieldset>
      <div class="ai-note">${S.ai ? "Claude is on: it reads photos and receipts and answers questions about your house." : "Claude is off. Whoever runs the Netlify site can add an ANTHROPIC_API_KEY environment variable to turn on photo reading and Ask."}</div>
      <div class="actions" style="justify-content:space-between"><button type="button" class="btn" data-act="signout">Sign out</button><button type="submit" class="btn primary">Save</button></div>
    </form>`);
  renderPush();
}

// ---------- Push notifications ----------
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function keyBytes(b64) {
  const s = atob((b64 + "=".repeat((4 - b64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
async function swReg() { return navigator.serviceWorker.register("/sw.js"); }
async function currentSub() {
  if (!pushSupported()) return null;
  try { return await (await swReg()).pushManager.getSubscription(); } catch { return null; }
}
const hourLabel = h => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
async function renderPush() {
  const box = $("#s-push"); if (!box) return;
  const say = html => { if ($("#s-push")) $("#s-push").innerHTML = html; };
  if (!S.push) return say(`<span class="muted">Notifications are not set up on this site yet.</span>`);
  if (!pushSupported()) return say(isIOS() && !standalone()
    ? `<span>On iPhone and iPad, first add Laventina to your Home Screen: tap <b>Share</b>, then <b>Add to Home Screen</b>. Open it from there and turn notifications on here.</span>`
    : `<span class="muted">This browser cannot show notifications. Chrome, Edge, Firefox and Safari can.</span>`);
  if (Notification.permission === "denied") return say(`<span>Notifications are blocked for Laventina in this browser's site settings. Allow them there, then come back here.</span>`);
  const sub = await currentSub();
  const dev = sub ? await api("POST", "/push/device", { endpoint: sub.endpoint }).catch(() => ({ subscribed: false })) : { subscribed: false };
  if (!dev.subscribed) return say(`<span>Get a morning list of what is due, and a ping when someone gives you a task.</span><div><button type="button" class="btn primary small" data-act="push-on">Turn on for this device</button></div>`);
  say(`<label class="check"><input type="checkbox" id="p-daily" ${dev.daily ? "checked" : ""}> Morning list of what is due, at
      <select id="p-hour" aria-label="Time of the morning list">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === dev.hour ? "selected" : ""}>${hourLabel(h)}</option>`).join("")}</select></label>
    <label class="check"><input type="checkbox" id="p-assigned" ${dev.assigned ? "checked" : ""}> When someone gives me a task</label>
    <div class="actions" style="justify-content:flex-start"><button type="button" class="btn small" data-act="push-test">Send a test</button><button type="button" class="btn small" data-act="push-off">Turn off on this device</button></div>`);
}
function pushPrefs() {
  return { daily: $("#p-daily") ? $("#p-daily").checked : true, assigned: $("#p-assigned") ? $("#p-assigned").checked : true,
    hour: $("#p-hour") ? Number($("#p-hour").value) : 8, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" };
}
async function pushOn() {
  try {
    if (await Notification.requestPermission() !== "granted") { toast("Notifications were not allowed"); return renderPush(); }
    const reg = await swReg(); await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(S.push.publicKey) });
    await api("POST", "/push/subscribe", { subscription: sub.toJSON(), ...pushPrefs() });
    toast("Notifications are on for this device");
  } catch (e) { toast(e.message || "Could not turn notifications on"); }
  renderPush();
}
async function pushSave() {
  const sub = await currentSub(); if (!sub) return renderPush();
  try { await api("POST", "/push/subscribe", { subscription: sub.toJSON(), ...pushPrefs() }); toast("Saved"); } catch (e) { toast(e.message); }
}
async function pushOff(quiet) {
  const sub = await currentSub(); if (!sub) return;
  try { await api("POST", "/push/unsubscribe", { endpoint: sub.endpoint }); } catch {}
  try { await sub.unsubscribe(); } catch {}
  if (!quiet) { toast("Notifications are off for this device"); renderPush(); }
}

async function saveSettings() {
  const name = $("#s-me").value.trim(), hname = $("#s-name").value.trim();
  store.putHouse({ currency: $("#s-cur").value, ...($("#s-thr") ? { sharedSpendThreshold: Number($("#s-thr").value) || 150 } : {}) });
  document.querySelectorAll("#s-rooms input[data-room]").forEach(inp => { const r = S.rooms.get(inp.dataset.room); const n = inp.value.trim(); if (r && n && n !== r.name) store.putRoom({ ...r, name: n }); });
  closeSheet();
  if (name !== S.me.name || hname !== (S.household?.name || "")) {
    try { applyMe(await api("PATCH", "/me", { name, householdName: hname })); changed(); } catch (e) { toast(e.message); return; }
  }
  toast("Settings saved");
}

// ---------- Events for tasks, sign-in and settings ----------
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const id = t.dataset.id;
  switch (t.dataset.act) {
    case "task-toggle": completeTask(S.tasks.get(id)); break;
    case "task-open": openTask(S.tasks.get(id)); break;
    case "task-claim": claimTask(S.tasks.get(id)); break;
    case "task-new": openTask(null, t.dataset.due ? { dueOn: t.dataset.due } : S.tab === "today" ? { dueOn: todayISO() } : {}); break;
    case "who": S.who = t.dataset.who; try { localStorage.setItem("laventina-who", S.who); } catch {} refresh(); break;
    case "list-view": S.listView = t.dataset.list; closeSheet(); setTab("lists"); break;
    case "list-new": openList(null); break;
    case "list-edit": openList(S.lists.get(t.dataset.list)); break;
    case "ts-sub-add": $("#ts-subs").insertAdjacentHTML("beforeend", subRowHTML({ title: "" })); $("#ts-subs .subrow:last-child .s-title").focus(); break;
    case "ts-sub-del": t.closest(".subrow").remove(); break;
    case "ts-done": { const d = readTask(); if (!d.title) break; closeSheet(); if (S.tasks.has(d.id)) putTask(d); completeTask(S.tasks.get(d.id) || d); break; }
    case "ts-delete": $("#ts-del").innerHTML = `<div class="confirm"><span style="flex:1">Delete this task for good?</span><button type="button" class="btn small danger" data-act="ts-delete-yes">Delete</button><button type="button" class="btn small" data-act="ts-delete-no">Keep</button></div>`; break;
    case "ts-delete-no": $("#ts-del").innerHTML = ""; break;
    case "ts-delete-yes": { const d = TS.d; delTask(d.id); closeSheet(); if (d.projectId) afterProjectStep(d.projectId); toast("Deleted"); break; }
    case "ts-skip": case "ts-unneeded": { const d = TS.d; skipGenerated(d, t.dataset.act === "ts-unneeded"); closeSheet(); toast(t.dataset.act === "ts-unneeded" ? "Turned off. You can turn it back on in Upkeep." : "Skipped this time"); break; }
    case "auth-mode": showAuth(t.dataset.mode); break;
    case "copy-invite": try { await navigator.clipboard.writeText(inviteLink()); toast("Copied the invite link"); } catch { $("#s-code").select(); toast("Copy the code from the box"); } break;
    case "new-invite": try { applyMe(await api("POST", "/household/invite")); $("#s-code").value = S.household.inviteCode; toast("New code made. The old one no longer works."); } catch (err) { toast(err.message); } break;
    case "signout": await pushOff(true); try { await api("POST", "/auth/logout"); } catch {} location.reload(); break;
    case "push-on": t.disabled = true; pushOn(); break;
    case "push-off": pushOff(); break;
    case "push-test": { const sub = await currentSub(); try { const r = await api("POST", "/push/test", { endpoint: sub && sub.endpoint }); toast(r.ok ? "Sent. It should pop up in a moment." : "Could not reach this device. Turn notifications off and on again."); } catch (err) { toast(err.message); } break; }
    case "retry": boot(); break;
  }
});
document.addEventListener("submit", e => {
  const f = e.target;
  if (f.id === "qt-form") { e.preventDefault(); const inp = $("#qt-text"); const v = inp.value.trim(); if (!v) return; addQuick(v); inp.value = ""; $("#qt-preview").innerHTML = ""; }
  if (f.id === "ts-form") { e.preventDefault(); saveTask(); }
  if (f.id === "auth-form") { e.preventDefault(); submitAuth(); }
  if (f.id === "set-form") { e.preventDefault(); saveSettings(); }
});
document.addEventListener("input", e => {
  if (e.target.id === "qt-text") { const v = e.target.value.trim(); $("#qt-preview").innerHTML = v ? quickChips(parseQuick(v, quickDefaults())) : ""; }
});
document.addEventListener("change", e => {
  if (e.target.id === "ts-rep") $("#ts-rep-custom").hidden = e.target.value !== "custom";
  if (["p-daily", "p-hour", "p-assigned"].includes(e.target.id)) pushSave();
});
document.addEventListener("keydown", e => {
  if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey && S.mode === "live" && !$("#layer").innerHTML && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) { const q = $("#qt-text"); if (q) { e.preventDefault(); q.focus(); } }
});

// ---------- Boot ----------
const LOGO = `<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="#EEE8FB"/><path d="M24 38V17" stroke="#6B8F71" stroke-width="2.2" stroke-linecap="round"/><g fill="#8D6FD8"><ellipse cx="24" cy="12" rx="3.2" ry="4.2"/><ellipse cx="19.8" cy="17" rx="3" ry="3.8" transform="rotate(-25 19.8 17)"/><ellipse cx="28.2" cy="17" rx="3" ry="3.8" transform="rotate(25 28.2 17)"/><ellipse cx="20.5" cy="23" rx="2.7" ry="3.4" transform="rotate(-30 20.5 23)" fill="#A58BE0"/><ellipse cx="27.5" cy="23" rx="2.7" ry="3.4" transform="rotate(30 27.5 23)" fill="#A58BE0"/><ellipse cx="21.3" cy="28.6" rx="2.3" ry="2.9" transform="rotate(-35 21.3 28.6)" fill="#C3AEEC"/><ellipse cx="26.7" cy="28.6" rx="2.3" ry="2.9" transform="rotate(35 26.7 28.6)" fill="#C3AEEC"/></g></svg>`;
// A brand-new household gets rooms, two lists and a few first tasks, once.
function seedIfNew() {
  if (S.house.seeded || S.rooms.size || S.tasks.size || S.lists.size) { if (!S.house.seeded && (S.rooms.size || S.tasks.size)) store.putMeta("house", { seeded: true }); return; }
  [["Living room", 1], ["Kitchen", 2], ["Bedroom", 3], ["Bathroom", 4], ["Hallway", 5], ["Storage", 6]].forEach(([name, order]) => store.putRoom({ id: newId("r"), name, order }));
  const home = { id: newId("l"), name: "Home", order: 1 }, errands = { id: newId("l"), name: "Errands", order: 2 };
  store.put("lists", home); store.put("lists", errands);
  const td = todayISO();
  putTask(newTask({ title: "Invite the other person to Laventina", notes: "Settings, then Copy invite link. They join with the code and you share one task list.", dueOn: td, listId: home.id, priority: 1 }));
  putTask(newTask({ title: "Add the expensive things to the inventory", notes: "House, then Add things. A photo of a shelf works: Claude lists what is on it.", dueOn: addDays(td, 1), listId: home.id }));
  putTask(newTask({ title: "Add your bills and contracts", notes: "House, then Money & papers. Laventina turns due dates and notice periods into tasks.", dueOn: addDays(td, 2), listId: home.id }));
  store.putMeta("house", { seeded: true, currency: S.house.currency || "EUR" });
}
async function boot() {
  S.mode = "loading";
  $("#main").innerHTML = `<div class="loading">${LOGO}<span class="muted">Opening Laventina…</span></div>`;
  try { applyMe(await api("GET", "/me")); }
  catch (e) {
    if (e.status === 401 || e.code === "no_household") return;
    $("#main").innerHTML = `<div class="loading">${LOGO}<h2>${e.code === "not_configured" ? "Almost there" : "Laventina could not open"}</h2><p class="muted">${esc(e.code === "not_configured" ? "The database is not connected yet. Whoever runs the site needs to add Netlify DB." : e.message)}</p><button class="btn" data-act="retry">Try again</button></div>`;
    return;
  }
  document.body.classList.remove("signed-out");
  if (pushSupported()) swReg().catch(() => {});
  lastSync = null; S.tasks.clear();
  for (const k of Object.keys(COLLS)) S[k].clear();
  await pull();
  S.mode = "live";
  try { const w = localStorage.getItem("laventina-who"); if (w) S.who = w; } catch {}
  if (S.who !== "mine" && S.who !== "all" && !S.members.some(m => m.id === S.who)) S.who = "mine";
  let tab = "today"; try { tab = localStorage.getItem("laventina-tab") || tab; } catch {}
  if (location.hash && VIEWS[location.hash.slice(1)]) tab = location.hash.slice(1);
  seedIfNew();
  setTab(tab);
}
document.querySelector("#brand-logo").innerHTML = LOGO;
boot();

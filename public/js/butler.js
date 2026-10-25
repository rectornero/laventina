"use strict";
// Artache Laventina: the butler is the whole interface. It speaks first, offers replies to tap, and listens to anything typed,
// spoken or photographed. Everything else lives in the butler's rooms (/rooms.html).

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } })();
const SPRIG = `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="#EEE8FB"/><path d="M24 38V17" stroke="#6B8F71" stroke-width="2.2" stroke-linecap="round"/><g fill="#8D6FD8"><ellipse cx="24" cy="12" rx="3.2" ry="4.2"/><ellipse cx="19.8" cy="17" rx="3" ry="3.8" transform="rotate(-25 19.8 17)"/><ellipse cx="28.2" cy="17" rx="3" ry="3.8" transform="rotate(25 28.2 17)"/><ellipse cx="20.5" cy="23" rx="2.7" ry="3.4" transform="rotate(-30 20.5 23)" fill="#A58BE0"/><ellipse cx="27.5" cy="23" rx="2.7" ry="3.4" transform="rotate(30 27.5 23)" fill="#A58BE0"/><ellipse cx="21.3" cy="28.6" rx="2.3" ry="2.9" transform="rotate(-35 21.3 28.6)" fill="#C3AEEC"/><ellipse cx="26.7" cy="28.6" rx="2.3" ry="2.9" transform="rotate(35 26.7 28.6)" fill="#C3AEEC"/></g></svg>`;
const CAUSES = [["forgot", "I forgot it"], ["date", "Missed the date"], ["spend", "Shop too small"], ["away", "Wasn't nearby"], ["notworth", "Not worth it"]];

const B = { me: null, ai: false, push: null, people: 1, profile: {}, busy: false, chips: new Map(), lastLoad: 0, n: 0 };

// ---------- Small helpers ----------
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const setAside = () => new Set(ls.get("lav.aside", []));
function remember(id) { const s = [...setAside(), id].slice(-200); ls.set("lav.aside", s); }
function toast(t) { const el = document.createElement("div"); el.className = "toast"; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }
// A light touch of formatting in what the butler says: paragraphs and **emphasis**.
const prose = t => String(t || "").split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</p>`).join("");

class ApiError extends Error {}
async function api(method, path, body, raw) {
  const headers = { "x-laventina": "1", "x-tz": tz };
  let payload;
  if (raw) { payload = body; headers["content-type"] = raw; } else if (body !== undefined) { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
  let res;
  try { res = await fetch("/api" + path, { method, headers, body: payload, credentials: "same-origin" }); }
  catch { throw Object.assign(new ApiError("I can't reach the house just now. Are you offline?"), { code: "offline" }); }
  const data = (res.headers.get("content-type") || "").includes("json") ? await res.json().catch(() => null) : null;
  if (!res.ok) throw Object.assign(new ApiError(data?.message || "Something went wrong. Try again."), { status: res.status, code: data?.error });
  return data;
}

// ---------- The feed ----------
const feed = () => $("#feed");
function scrollDown() { requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })); }
function lastIsButler() { const l = feed().lastElementChild; return l && l.classList.contains("butler"); }

function chipsHTML(m) {
  if (!m.chips || !m.chips.length) return "";
  return `<div class="chips">${m.chips.map((c, i) => { const k = m.id + "#" + i; B.chips.set(k, { ...c, msg: m.id }); return `<button type="button" class="chip${c.dismiss ? " quiet" : ""}" data-chip="${esc(k)}">${esc(c.label)}</button>`; }).join("")}</div>`;
}
function draftHTML(d) {
  const mail = /@/.test(d.to) && d.channel !== "message";
  const k = "d" + (++B.n); B.chips.set(k + "c", { copy: (d.subject ? d.subject + "\n\n" : "") + d.body }); B.chips.set(k + "m", { mailto: `mailto:${encodeURIComponent(d.to)}?subject=${encodeURIComponent(d.subject || "")}&body=${encodeURIComponent(d.body)}` });
  return `<div class="draft"><div class="meta">Draft ${d.channel === "message" ? "message" : "email"} to ${esc(d.to)}${d.subject ? ` · ${esc(d.subject)}` : ""}</div><pre>${esc(d.body)}</pre>
    <div class="chips"><button type="button" class="chip" data-chip="${k}c">Copy</button>${mail ? `<button type="button" class="chip" data-chip="${k}m">Open in my mail</button>` : ""}</div></div>`;
}
function addButler(m, opts = {}) {
  const lead = !lastIsButler() || m.hello;
  const el = document.createElement("div");
  el.className = `msg butler${lead ? " lead" : ""}${m.hello ? " hello" : ""}${m.tone ? " " + m.tone : ""}${opts.past ? " past" : ""}`;
  el.dataset.id = m.id || "";
  el.innerHTML = `<span class="av">${SPRIG}</span><div class="card">${prose(m.text)}${(m.drafts || []).map(draftHTML).join("")}${opts.past ? "" : chipsHTML(m)}</div>`;
  if (opts.delay) el.style.animationDelay = opts.delay + "ms";
  feed().appendChild(el);
  return el;
}
function addUser(text, opts = {}) {
  const el = document.createElement("div");
  el.className = `msg user${opts.tap ? " tap" : ""}${opts.past ? " past" : ""}`;
  el.innerHTML = (opts.img ? `<img class="photo" src="${esc(opts.img)}" alt="">` : "") + esc(text);
  feed().appendChild(el);
  return el;
}
function addDay(label) { const el = document.createElement("div"); el.className = "day"; el.textContent = label; feed().appendChild(el); }
function typing() {
  const el = addButler({ id: "typing", text: "" });
  el.querySelector(".card").innerHTML = `<span class="typing" aria-label="Laventina is thinking"><i></i><i></i><i></i></span>`;
  scrollDown();
  return el;
}
function dayLabel(iso) {
  const d = new Date(iso), t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Earlier today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

// ---------- Talking ----------
async function say(text, opts = {}) {
  if (B.busy) return;
  const t = String(text || "").trim(); if (!t && !opts.fileIds) return;
  B.busy = true; $("#send-btn").disabled = true;
  addUser(t || "Here's a photo", { img: opts.img, tap: opts.tap }); scrollDown();
  const dots = typing();
  try {
    const r = await api("POST", "/butler/say", { text: t, fileIds: opts.fileIds || [] });
    dots.remove();
    for (const m of r.messages) addButler(m);
  } catch (e) { dots.remove(); addButler({ id: "err" + Date.now(), text: e.status === 401 ? "Forgive me, I need you to sign in again." : e.message }); if (e.status === 401) return welcome(); }
  finally { B.busy = false; $("#send-btn").disabled = false; scrollDown(); quickReplies(); }
}
async function tapChip(btn) {
  const c = B.chips.get(btn.dataset.chip); if (!c) return;
  if (c.copy) { try { await navigator.clipboard.writeText(c.copy); toast("Copied"); } catch { toast("Couldn't copy here"); } return; }
  if (c.mailto) { location.href = c.mailto; return; }
  const card = btn.closest(".card"), row = btn.closest(".chips");
  const settle = (note) => { if (row) row.outerHTML = note ? `<div class="answered">${esc(note)}</div>` : ""; if (c.msg) remember(c.msg); };
  if (c.dismiss) { settle(""); card.closest(".msg").style.opacity = ".55"; return; }
  if (c.prefill) { const f = $("#say"); f.value = c.prefill; f.focus(); f.setSelectionRange(f.value.length, f.value.length); grow(); return; }
  if (c.open) { location.href = c.open; return; }
  if (c.ask === "cause") {
    settle("");
    addUser(c.label, { tap: true });
    addButler({ id: "cause-" + c.id, text: "No blame, only the cause, so I can catch it next time. What got in the way?", chips: CAUSES.map(([k, l]) => ({ label: l, tool: "settle_opportunity", input: { id: c.id, outcome: "missed", cause: k } })) });
    return scrollDown();
  }
  if (c.say) { settle(""); return say(c.say, { tap: true }); }
  if (c.tool) {
    if (B.busy) return;
    B.busy = true; row && row.querySelectorAll("button").forEach(b => b.disabled = true);
    addUser(c.label, { tap: true }); const dots = typing();
    try {
      const r = await api("POST", "/butler/act", { tool: c.tool, input: c.input || {}, label: c.label });
      dots.remove(); settle("");
      for (const m of r.messages) addButler(m);
      if (c.tool === "set_presence") { B.profile.presence = r.result.presence; status(); quickReplies(); }
    } catch (e) { dots.remove(); row && row.querySelectorAll("button").forEach(b => b.disabled = false); addButler({ id: "err" + Date.now(), text: e.message }); }
    finally { B.busy = false; scrollDown(); }
  }
}

// ---------- Walking in ----------
async function load(fresh) {
  let r;
  try { r = await api("GET", "/butler"); }
  catch (e) { if (e.status === 401 || e.status === 409) return welcome(); feed().innerHTML = ""; addButler({ id: "off", text: e.message, chips: [{ label: "Try again", say: "" }] }); return; }
  B.me = r.me; B.ai = r.ai; B.push = r.push; B.people = r.people; B.profile = r.profile || {}; B.lastLoad = Date.now();
  $("#dock").hidden = false; status(); quickReplies();
  feed().innerHTML = "";
  // The last few things said, quietly, so the conversation carries on.
  const log = (r.log || []).filter(l => !l.greeting).slice(-10);
  let day = "";
  for (const l of log) {
    const d = dayLabel(l.at); if (d !== day) { addDay(d); day = d; }
    if (l.role === "user") addUser(l.text, { past: true, tap: l.tap }); else addButler({ ...l, id: l.id }, { past: true });
  }
  addDay("Now");
  const aside = setAside();
  const fixed = (r.messages || []).filter(m => !aside.has(m.id));
  if (B.ai) {
    const dots = typing();
    let g = null;
    try { g = await Promise.race([api("POST", "/butler/greet"), new Promise(res => setTimeout(() => res(null), 55000))]); } catch {}
    dots.remove();
    if (g && g.messages && g.messages.length) { for (const m of g.messages) addButler(m); return scrollDown(); }
  }
  fixed.forEach((m, i) => addButler(m, { delay: i * 90 }));
  scrollDown();
}
function status() {
  const p = B.profile || {}, bits = [];
  if (p.presence) bits.push(p.presence.where === "out" ? "You're out" : "You're home");
  if (p.location && p.location.city) bits.push(p.location.city);
  bits.push(B.ai ? "At your service" : "At your service (quietly)");
  $("#status").textContent = bits.join(" · ");
}
function quickReplies() {
  const out = (B.profile.presence || {}).where === "out";
  const q = [["What now?", "What should I do now?"], out ? ["I'm home", "I'm home now"] : ["I'm heading out", "I'm heading out"], ["A coupon", null, "I have a coupon: "], ["Remind me", null, "Remind me to "]];
  if (B.people > 1) q.push(["Ring the bell", null, null, { tool: "ring_bell", input: {} }]);
  if (B.ai) q.splice(1, 0, ["Plan my day", "Plan the rest of my day for me"]);
  $("#quick").innerHTML = q.map(([l, s, pre, act], i) => { const k = "q" + i; B.chips.set(k, act ? { label: l, ...act } : s ? { label: l, say: s } : { label: l, prefill: pre }); return `<button type="button" class="chip" data-chip="${k}">${esc(l)}</button>`; }).join("");
}

// ---------- Signing in ----------
function welcome(err) {
  if (new URLSearchParams(location.search).get("invite")) { location.replace("/rooms.html" + location.search); return; }
  $("#dock").hidden = true;
  feed().innerHTML = "";
  const el = addButler({ id: "welcome", text: "Good day. I'm Laventina, your household butler. Please sign in, and I'll tell you what matters.", hello: true });
  el.querySelector(".card").insertAdjacentHTML("beforeend", `<form class="welcome" id="signin"><label>Email<input type="email" id="si-email" autocomplete="email" required></label>
    <label>Password<input type="password" id="si-pass" autocomplete="current-password" required></label><div class="err" id="si-err">${esc(err || "")}</div>
    <button class="btn primary" type="submit">Sign in</button><p style="margin:0;font-size:14px">New here? <a href="/rooms.html">Start or join a household</a>.</p></form>`);
}
async function signIn(e) {
  e.preventDefault();
  try { await api("POST", "/auth/login", { email: $("#si-email").value.trim(), password: $("#si-pass").value }); load(); }
  catch (er) { $("#si-err").textContent = er.message; }
}

// ---------- Photo, voice, typing ----------
function grow() { const f = $("#say"); f.style.height = "auto"; f.style.height = Math.min(140, f.scrollHeight) + "px"; }
async function shrink(file) {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const s = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return await new Promise(res => c.toBlob(b => res(b || file), "image/jpeg", 0.85));
}
async function sendPhoto(file) {
  if (!file) return;
  if (!B.ai) return addButler({ id: "noai", text: "I can't read photos just now. Tell me in a sentence instead, and I'll note it." });
  try {
    const blob = await shrink(file);
    const up = await api("POST", "/files", blob, "image/jpeg");
    const caption = $("#say").value.trim(); $("#say").value = ""; grow();
    say(caption, { fileIds: [up.id], img: URL.createObjectURL(blob) });
  } catch (e) { toast(e.message); }
}
let rec = null;
function setupMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  $("#mic-btn").hidden = false;
  $("#mic-btn").addEventListener("click", () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = navigator.language || "en-GB"; rec.interimResults = true; rec.maxAlternatives = 1;
    const btn = $("#mic-btn"); btn.classList.add("live");
    let text = "";
    rec.onresult = e => { text = [...e.results].map(r => r[0].transcript).join(" "); $("#say").value = text; grow(); };
    rec.onend = () => { btn.classList.remove("live"); rec = null; if (text.trim()) { $("#say").value = ""; grow(); say(text); } };
    rec.onerror = () => { btn.classList.remove("live"); rec = null; };
    rec.start();
  });
}

// ---------- Menu: the rooms, Claude, the bell, signing out ----------
function sheet(html) {
  $("#layer").innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  $("#scrim").addEventListener("click", e => { if (e.target.id === "scrim") closeSheet(); });
}
const closeSheet = () => { $("#layer").innerHTML = ""; };
async function openMenu() {
  const bell = await bellState();
  sheet(`<h2>At your service</h2>
    <a class="row" href="/rooms.html"><span class="ic">🚪</span><span><b>The butler's rooms</b><span>Everything behind the scenes: tasks, house, money and papers.</span></span></a>
    <button class="row" type="button" data-menu="claude"><span class="ic">✳︎</span><span><b>Connect Claude</b><span>Let Claude work with your household, from any Claude app.</span></span></button>
    <button class="row" type="button" data-menu="bell"><span class="ic">🔔</span><span><b>The discreet bell</b><span>${esc(bell.text)}</span></span></button>
    <button class="row" type="button" data-menu="signout"><span class="ic">👋</span><span><b>Sign out</b><span>${esc(B.me ? B.me.email : "")}</span></span></button>`);
}
async function openClaude() {
  let info = { connected: false };
  try { info = await api("GET", "/connect/claude"); } catch {}
  sheet(`<h2>Connect Claude</h2><p>Claude can then see what matters in your household and act on it, the same way I do: tasks, coupons, notes, the bell. It runs on your own Claude plan, and it never sends anything outside the house.</p>
    <div id="cl-box">${info.connected ? `<p>Connected${info.used ? `, last used ${esc(new Date(info.used).toLocaleDateString())}` : ""}. For safety I can't show the link again; make a new one if you need it.</p>` : ""}</div>
    <div class="chips"><button class="btn primary" type="button" data-menu="claude-new">${info.connected ? "Make a new link" : "Make my link"}</button>${info.connected ? `<button class="btn quiet" type="button" data-menu="claude-off">Disconnect</button>` : ""}</div>`);
}
async function claudeNew() {
  try {
    const r = await api("POST", "/connect/claude");
    $("#cl-box").innerHTML = `<div class="linkbox"><input type="text" readonly id="cl-url" value="${esc(r.url)}" aria-label="Your Laventina link"><button class="btn" type="button" data-menu="claude-copy">Copy</button></div>
      <ol class="steps"><li>In Claude, open <b>Settings</b>, then <b>Connectors</b>.</li><li>Choose <b>Add custom connector</b>, name it Laventina, and paste this link.</li><li>Ask Claude: “What matters in my household today?”</li></ol>
      <p>Keep the link private: anyone with it can act as you. Any older link stops working now.</p>`;
    const b = document.querySelector('[data-menu="claude-new"]'); if (b) b.textContent = "Make a new link";
  } catch (e) { toast(e.message); }
}
// The bell is the only way the butler calls you, and it does so rarely.
const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
async function currentSub() { if (!pushOK()) return null; try { return await (await navigator.serviceWorker.register("/sw.js")).pushManager.getSubscription(); } catch { return null; } }
async function bellState() {
  if (!B.push || !pushOK()) return { on: false, can: false, text: "This browser can't hear it. Add Laventina to your home screen first." };
  if (Notification.permission === "denied") return { on: false, can: false, text: "Blocked in this browser's site settings." };
  const sub = await currentSub();
  const dev = sub ? await api("POST", "/push/device", { endpoint: sub.endpoint }).catch(() => ({ subscribed: false })) : { subscribed: false };
  return dev.subscribed ? { on: true, can: true, text: "On. I'll only call you in when something really matters." } : { on: false, can: true, text: "Off. Turn it on and I'll call you in, rarely, when something truly matters." };
}
const keyBytes = b64 => { const s = atob((b64 + "=".repeat((4 - b64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, c => c.charCodeAt(0)); };
async function toggleBell() {
  const st = await bellState();
  if (!st.can) return toast(st.text);
  try {
    if (st.on) { const sub = await currentSub(); await api("POST", "/push/unsubscribe", { endpoint: sub.endpoint }); await sub.unsubscribe().catch(() => {}); toast("The bell is off on this device"); }
    else {
      if (await Notification.requestPermission() !== "granted") return toast("Not allowed");
      const reg = await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(B.push.publicKey) });
      await api("POST", "/push/subscribe", { subscription: sub.toJSON(), tz, hour: 9, daily: true, assigned: true, bell: true, weekly: false, expiry: false });
      toast("The bell is on. I'll be discreet.");
    }
  } catch (e) { toast(e.message || "That didn't work"); }
  openMenu();
}
async function signOut() { try { await api("POST", "/auth/logout"); } catch {} closeSheet(); welcome(); }

// ---------- Wiring ----------
document.addEventListener("click", e => {
  const chip = e.target.closest("[data-chip]"); if (chip) { e.preventDefault(); return tapChip(chip); }
  const m = e.target.closest("[data-menu]"); if (!m) return;
  ({ claude: openClaude, "claude-new": claudeNew, "claude-off": () => api("DELETE", "/connect/claude").then(openClaude),
     "claude-copy": () => navigator.clipboard.writeText($("#cl-url").value).then(() => toast("Copied"), () => $("#cl-url").select()),
     bell: toggleBell, signout: signOut })[m.dataset.menu]?.();
});
document.addEventListener("submit", e => {
  if (e.target.id === "signin") return signIn(e);
  if (e.target.id === "composer") { e.preventDefault(); const f = $("#say"); const t = f.value; f.value = ""; grow(); say(t); }
});
document.addEventListener("keydown", e => {
  if (e.target.id === "say" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); }
  if (e.key === "Escape") closeSheet();
});
document.addEventListener("input", e => { if (e.target.id === "say") grow(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && B.me && Date.now() - B.lastLoad > 15 * 60e3 && !B.busy) load(); });
$("#menu-btn").addEventListener("click", openMenu);
$("#cam-btn").addEventListener("click", () => $("#cam").click());
$("#cam").addEventListener("change", e => { sendPhoto(e.target.files[0]); e.target.value = ""; });
$(".sprig").innerHTML = SPRIG;
setupMic();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
load();

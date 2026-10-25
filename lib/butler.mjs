// Laventina the butler: a kind, attentive, discreet household butler who loves lavender.
// brief() says what matters now, from what the senses gathered, with no AI needed. talk() is the conversation: Claude with
// the tools in lib/tools.mjs. Both write to butler_log, so the conversation follows Nero across devices.
import Anthropic from "@anthropic-ai/sdk";
import { q, HttpError } from "./db.mjs";
import { aiEnabled } from "./ai.mjs";
import { readFileBase64 } from "./files.mjs";
import { TOOLS, senses, runTool, toolByName, saveProfile } from "./tools.mjs";
import { addDaysISO } from "../public/js/expiry-core.js";

const eur = n => n == null ? "" : "€" + (Math.round(Number(n) * 100) / 100).toString().replace(/\.(\d)$/, ".$10");
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const andList = a => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
const quote = s => `“${s}”`;
const first = name => String(name || "").trim().split(/\s+/)[0] || "";

// ---------- Log ----------
export async function logTurn(ctx, role, body) {
  await q("insert into butler_log (household_id, user_id, role, body) values ($1, $2, $3, $4::jsonb)", [ctx.hid, ctx.user.id, role, JSON.stringify(body)]);
}
export async function history(ctx, limit = 40) {
  const rows = await q(`select id::text as id, role, body, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at from butler_log where user_id = $1 order by id desc limit $2`, [ctx.user.id, limit]);
  return rows.reverse().map(r => ({ id: "h" + r.id, role: r.role, at: r.at, ...r.body }));
}

// ---------- The brief ----------
// Each message: { id, text, chips: [{ label, tool?, input?, say?, prefill?, dismiss?, open? }] }. ids are stable for the day,
// so the page can remember what Nero set aside.
export function composeBrief(s, opts = {}) {
  const out = [];
  const add = (id, text, chips = [], extra = {}) => out.push({ id: id + ":" + s.now.date, text, chips, ...extra });
  const name = first(s.me.name);
  const h = s.now.hour;
  const hello = h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const t = s.tasks;
  const urgentMoney = s.money.open.filter(c => c.days != null && c.days <= 3);
  const loads = t.late.length + t.today.length;
  let mood;
  if (!loads && !urgentMoney.length) mood = h < 18 ? "Nothing needs you today. The house is in order." : "Nothing needs you tonight. All is in order.";
  else if (loads <= 2 && !t.late.length) mood = `A light day: ${plural(loads || urgentMoney.length, "small thing")}, and I'll keep track of the rest.`;
  else if (t.late.length >= 4) mood = `A few things have piled up, ${plural(t.late.length, "of them")} waiting. Nothing we can't put right together.`;
  else mood = `${plural(loads, "thing")} for today${t.late.length ? `, ${t.late.length} of them already waiting` : ""}. I've put them in order.`;
  let weather = "";
  if (s.weather) {
    const w = s.weather, day = h < 18 ? w.today : w.tomorrow;
    weather = ` It's ${w.now.temp}° and ${w.now.sky}${day.rain >= 50 ? `; rain is likely ${h < 18 ? "today" : "tomorrow"} (${day.rain}%), so take an umbrella if you go out` : `, ${day.max}° at most ${h < 18 ? "today" : "tomorrow"}`}.`;
  }
  add("hello", `${hello}${name ? ", " + name : ""}. ${mood}${weather}`);

  for (const b of s.bells.slice(0, 1)) add("bell-" + b.at, `${b.from} rang the house bell${b.message ? `: ${quote(b.message)}` : "."}`, [{ label: "On my way", say: `Tell ${b.from} I'm on my way` }, { label: "Noted", dismiss: true }]);
  for (const n of s.notes.slice(0, 2)) add("note-" + n.text.slice(0, 20), `${n.by} left a note on the fridge: ${quote(n.text)}`, [{ label: "Noted", dismiss: true }]);

  if (!s.presence && h >= 6 && h < 22) add("presence", "Are you at home today, or out and about? I'll fit my suggestions to it.", [
    { label: "At home", tool: "set_presence", input: { where: "home" } }, { label: "Out", tool: "set_presence", input: { where: "out" } }]);

  // Money that is about to slip away comes first: this is how the €7 coupon was lost.
  for (const c of urgentMoney.slice(0, 2)) {
    const when = c.days < 0 ? "ended " + plural(-c.days, "day") + " ago" : c.days === 0 ? "ends today" : c.days === 1 ? "ends tomorrow" : `ends in ${c.days} days`;
    add("chance-" + c.id, `${c.value ? eur(c.value) + " on the table: " : ""}${c.title} ${when}.${c.minSpend ? ` It needs a ${eur(c.minSpend)} shop${c.store ? " at " + c.store : ""}.` : c.store ? ` At ${c.store}.` : ""}${s.presence?.where === "out" && c.days >= 0 ? " You're out: worth passing by?" : ""}`,
      c.days < 0 ? [{ label: "I used it", tool: "settle_opportunity", input: { id: c.id, outcome: "caught" } }, { label: "It slipped", ask: "cause", id: c.id }]
        : [{ label: "Used it", tool: "settle_opportunity", input: { id: c.id, outcome: "caught" } }, ...(opts.ai ? [{ label: "Plan the shop", say: `Help me plan a shop to use ${c.title}` }] : []), { label: "Let it go", ask: "cause", id: c.id }], { tone: "money" });
  }

  const shown = new Set(urgentMoney.slice(0, 2).map(c => c.taskId));
  const one = pickOne(s, shown);
  if (one) {
    const why = one.late ? `It's been waiting since ${one.due}, and clearing it makes room for everything else.` : one.priority >= 2 ? "You marked it as important." : one.due === s.now.date ? (one.time ? `It's due at ${one.time}.` : "It's due today.") : "It's coming up, and doing it early keeps the week calm.";
    add("one-" + one.id, `If you do one thing${h >= 18 ? " this evening" : " today"}: ${quote(one.title)}. ${why}`, [
      { label: "Done", tool: "complete_task", input: { task: one.id } }, { label: "Tomorrow", tool: "move_task", input: { task: one.id, due: "tomorrow" } },
      ...(opts.ai ? [{ label: "Help me start", say: `Help me get started on ${quote(one.title)}` }] : [])], { tone: "focus" });
  }
  const restLate = t.late.filter(x => !one || x.id !== one.id);
  if (restLate.length >= 2) add("late", `${plural(restLate.length, "other thing")} ${restLate.length === 1 ? "is" : "are"} waiting: ${andList(restLate.slice(0, 3).map(x => quote(x.title)))}${restLate.length > 3 ? " and more" : ""}. Shall I spread them over the next days, two a day?`, [
    { label: "Yes, spread them", tool: "spread_late_tasks", input: {} }, { label: "Not now", dismiss: true }]);
  const restToday = t.today.filter(x => !one || x.id !== one.id);
  if (restToday.length) add("today", `Also today: ${andList(restToday.slice(0, 4).map(x => quote(x.title) + (x.time ? " at " + x.time : "")))}${restToday.length > 4 ? `, and ${restToday.length - 4} more` : ""}.`,
    restToday.length === 1 ? [{ label: "Done", tool: "complete_task", input: { task: restToday[0].id } }, { label: "Tomorrow", tool: "move_task", input: { task: restToday[0].id, due: "tomorrow" } }] : []);

  for (const e of s.expiring.slice(0, 2)) {
    const what = { papers: "needs renewing", contracts: "has a notice deadline", warranty: "warranty ends", useby: "should be used", lifespan: "is due for replacement", custom: "is due" }[e.lane] || "is due";
    add("xp-" + e.key, `${e.title} ${what} ${e.days < 0 ? "already (" + plural(-e.days, "day") + " ago)" : e.days === 0 ? "today" : e.days === 1 ? "tomorrow" : "in " + e.days + " days"}.`, [
      { label: "Put it in my day", tool: "add_task", input: { title: `Sort out: ${e.title}`, due: e.days <= 0 ? "today" : addDaysISO(s.now.date, Math.min(e.days, 2)) } }, { label: "Noted", dismiss: true }]);
  }

  // The story starts with a €7 coupon lost at Carrefour. Until the ledger has an entry, offer to make it the first.
  if (!s.money.ledger.caught && !s.money.ledger.missed && !opts.seeded) add("seed", "May I begin your ledger with the €7 Carrefour coupon that slipped away on a €35 shop? Each loss we record teaches me what to catch next time.", [
    { label: "Yes, I forgot it", tool: "log_lost_opportunity", input: { title: "€7 Carrefour coupon", value: 7, minSpend: 35, store: "Carrefour", cause: "forgot" } },
    { label: "Missed the date", tool: "log_lost_opportunity", input: { title: "€7 Carrefour coupon", value: 7, minSpend: 35, store: "Carrefour", cause: "date" } },
    { label: "Not now", dismiss: true }]);
  else if (s.money.ledger.caught + s.money.ledger.missed >= 2 && s.now.weekday === "Sun") {
    const l = s.money.ledger;
    add("ledger", `Your ledger so far: ${eur(l.caughtValue)} caught, ${eur(l.missedValue)} missed${l.rate != null ? `, a ${l.rate}% hit rate` : ""}.`, opts.ai ? [{ label: "How do I improve?", say: "Look at my ledger and give me a short training plan to catch more" }] : []);
  }

  if (!s.location) add("city", "One small thing I'd like to know: which city do you live in? I'll follow the weather and plan your errands around it.", [{ label: "Tell you", prefill: "I live in " }, { label: "Later", dismiss: true }]);
  return out;
}
function pickOne(s, skip = new Set()) {
  const c = [...s.tasks.late, ...s.tasks.today, ...s.tasks.important, ...s.tasks.soon].filter(t => !skip.has(t.id));
  const money = new Set(s.money.open.map(x => x.taskId).filter(Boolean));
  const score = t => (t.priority || 0) * 3 + (t.late ? Math.min(7, 1 + (Date.parse(s.now.date) - Date.parse(t.due)) / 864e5) : 0) + (t.due === s.now.date ? 3 : 0) + (money.has(t.id) ? 5 : 0);
  return c.sort((a, b) => score(b) - score(a))[0] || null;
}

export async function brief(ctx) {
  const s = await senses(ctx);
  return { senses: s, messages: composeBrief(s, { ai: aiEnabled() }) };
}

// ---------- Conversation ----------
const VOICE = `You are Laventina, the household butler of Artache Laventina: kind, attentive, discreet, quietly witty, and fond of lavender.
You serve {name} and their household. {name} is a distracted genius who doesn't give up: lists and notifications don't work for them, a kind voice that proposes does. Your job is to turn their weaknesses into strengths, not only to compensate.
How you speak:
- Short. Lead with the point. Two to four sentences unless asked for more. Plain words, warm, never fussy. No lists of more than three items; no headings; no emoji except a rare 🌿.
- You propose, {name} decides. When the next step is obvious, offer it with offer_choices so they can tap instead of type.
- When {name} clearly asks you to do something, do it with the tools, then say it's done in one line.
- Hide complexity. Never mention tools, ids, JSON or the database.
- Nothing leaves the household without {name}: emails and messages to others are drafts (draft_message) that they send themselves.
- When information would help you automate something (their city, shops they pass, when they shop, who does what), ask for it, one question at a time, and remember the answer with remember.
- Be inventive about opportunities that seem lost: refunds, claims, a polite email, a cheaper plan, combining errands.
- Answer in the language {name} writes in.`;

// Nero asked for the butler to think hard: Opus 5.5 at high effort. Functions stop at 60 seconds, so the tool loop keeps an eye on the clock.
const MODEL = "claude-opus-5-5", EFFORT = "high", BUDGET_MS = 42000;
let client = null;
function claude() { client = client || new Anthropic(); return client; }
export function setClaude(c) { client = c; }

export async function talk(ctx, { text, fileIds = [] }) {
  const said = String(text || "").trim().slice(0, 4000);
  if (!said && !fileIds.length) throw new HttpError(400, "empty", "Say something first.");
  await logTurn(ctx, "user", { text: said || "(photo)", files: fileIds.slice(0, 4) });
  if (!aiEnabled()) return fallback(ctx, said);

  const s = await senses(ctx);
  const past = (await history(ctx, 21)).slice(0, -1);
  const messages = [];
  for (const h of past) {
    const role = h.role === "user" ? "user" : "assistant";
    const content = h.text || "";
    if (!content) continue;
    if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += "\n" + content;
    else messages.push({ role, content });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  const content = [];
  for (const id of fileIds.slice(0, 4)) { const img = await readFileBase64(ctx.hid, id); if (img && img.media_type.startsWith("image/")) content.push({ type: "image", source: { type: "base64", ...img } }); }
  content.push({ type: "text", text: said || "Here's a photo. What should we do with it? If it's a coupon, receipt, letter or label with a date or money on it, catch it." });
  if (messages.length && messages[messages.length - 1].role === "user") messages.push({ role: "assistant", content: "…" });
  messages.push({ role: "user", content });

  const system = VOICE.replaceAll("{name}", first(ctx.user.name) || "the lord of the house") +
    `\n\nToday is ${s.now.weekday} ${s.now.date}, ${s.now.hour}:00 (${s.now.tz}). What you know right now:\n${JSON.stringify(s)}`;
  const tools = TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const did = [], chips = [];
  let drafts = [], reply = "";
  const started = Date.now();
  for (let turn = 0; turn < 6; turn++) {
    if (turn && Date.now() - started > BUDGET_MS) { if (!reply) reply = "I've started on it; ask me again in a moment and I'll finish."; break; }
    let msg;
    try {
      msg = await claude().beta.messages.create({ model: MODEL, max_tokens: 8000, thinking: { type: "adaptive" }, output_config: { effort: EFFORT }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", system, tools, messages });
    } catch (e) {
      console.error("butler", e && e.message);
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "rate_limited", "Give me a moment, I'm attending to something. Try again in a minute.");
      throw new HttpError(502, "ai_error", "Forgive me, I lost my train of thought. Could you say that again?");
    }
    const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
    if (text) reply = text;
    const uses = msg.content.filter(b => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || !uses.length) break;
    messages.push({ role: "assistant", content: msg.content });
    const results = [];
    for (const u of uses) {
      let out, isError = false;
      try {
        out = await runTool(ctx, u.name, u.input);
        if (u.name === "offer_choices") chips.push(...out.offered.map(label => ({ label: String(label).slice(0, 60), say: String(label) })));
        else if (u.name === "draft_message") drafts.push(out.draft);
        else if (u.name !== "get_overview" && !u.name.startsWith("find") && !u.name.startsWith("search") && u.name !== "get_weather") did.push(u.name);
      } catch (e) { out = { error: e.message || "That didn't work." }; isError = true; }
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out).slice(0, 20000), is_error: isError });
    }
    messages.push({ role: "user", content: results });
  }
  const body = { text: reply || "Done.", chips: chips.slice(0, 4), drafts, did };
  await logTurn(ctx, "butler", body);
  return { messages: [{ id: "r" + Date.now(), role: "butler", ...body }], changed: did.length > 0 };
}

// Without Claude, the butler still listens: a few phrases it understands, and anything else becomes a task.
async function fallback(ctx, said) {
  const l = said.toLowerCase();
  let text;
  if (/^(i'?m |i am )?(at )?home\b/.test(l)) { await runTool(ctx, "set_presence", { where: "home" }); text = "Welcome home. I'll keep to the house today."; }
  else if (/^(i'?m |i am )?out\b/.test(l)) { await runTool(ctx, "set_presence", { where: "out" }); text = "Noted, you're out. I'll keep errands in mind."; }
  else if (/^i live in /.test(l)) { const r = await runTool(ctx, "set_city", { city: said.slice(10) }); text = `${r.location.city} it is. I'll follow the weather there.`; }
  else { const r = await runTool(ctx, "add_task", { title: said.replace(/^(remind me to|i need to|remember to)\s+/i, "") }); text = `Noted: ${quote(r.added.title)}. I'll bring it up at the right moment.`; }
  const body = { text, chips: [], drafts: [], did: ["note"] };
  await logTurn(ctx, "butler", body);
  return { messages: [{ id: "r" + Date.now(), role: "butler", ...body }], changed: true };
}

// A tap on a reply button runs one ability directly; the butler answers in a line.
export async function act(ctx, { tool, input, label }) {
  const t = toolByName(tool);
  if (!t || t.appOnly) throw new HttpError(400, "bad_tool", "I can't do that from a button.");
  if (label) await logTurn(ctx, "user", { text: String(label).slice(0, 80), tap: true });
  const r = await runTool(ctx, tool, input || {});
  const msgs = [{ id: "a" + Date.now(), role: "butler", text: confirmLine(tool, r, input), chips: [] }];
  if (tool === "set_presence" && r.presence.where === "out") msgs[0].chips = [{ label: "What's near me?", say: "I'm out. Anything worth doing while I'm out?" }];
  if (r.lesson) msgs[0].chips = [];
  await logTurn(ctx, "butler", { text: msgs[0].text, chips: msgs[0].chips });
  return { messages: msgs, changed: true, result: r };
}
function confirmLine(tool, r, input) {
  switch (tool) {
    case "complete_task": return `Done: ${quote(r.done)}. Well handled.`;
    case "move_task": return r.task.due ? `Moved to ${r.task.due === addDaysISO(new Date().toISOString().slice(0, 10), 1) ? "tomorrow" : r.task.due}. I'll bring it back then.` : "I've taken the date off.";
    case "spread_late_tasks": return r.moved.length ? `Spread out: ${plural(r.moved.length, "thing")}, two a day from today. The pile is gone.` : "Nothing was waiting after all.";
    case "settle_opportunity": case "log_lost_opportunity":
      if (r.caught) return `${r.value ? eur(r.value) + " " : ""}caught 🌿 Well done.`;
      return `Logged${r.value ? `: ${eur(r.value)}` : ""}. ${r.lesson}${r.safeguard ? ` I've added a safeguard: ${quote(r.safeguard)}.` : ""}`;
    case "set_presence": return r.presence.where === "home" ? "Welcome home. I'll keep to the house today." : "Noted, you're out. I'll keep errands in mind.";
    case "catch_opportunity": return `Caught: ${quote(r.caught.title)}.${r.caught.reminder ? " I'll raise it two days before it ends." : " Tell me when it ends and I'll watch the date."}`;
    case "add_task": return `In your day: ${quote(r.added.title)}.`;
    case "ring_bell": return r.devices ? "The bell is ringing." : "I rang the bell, though no one else has it switched on yet.";
    case "set_city": return `${r.location.city} it is. I'll follow the weather there.`;
    default: return "Done.";
  }
}

// ---------- The opening, written by Claude ----------
// When Nero walks in, Claude reads everything the senses gathered and says what matters, in a few sentences, with up to four
// replies to tap. A reply either asks something in words (say) or does one thing directly (tool + input).
// The same situation gets the same greeting for three hours, so walking in and out costs nothing.
const GREET = `Nero just walked in. Speak first, as the butler: greet them by name, then say only what matters right now, in order of importance, in 2 to 5 short sentences. Connect the dots (a coupon and an errand, the weather and a chore, a pile-up and a plan); don't recite everything. If nothing matters, say so warmly in one sentence. If one piece of missing information would let you automate something, ask for it as your last sentence.
Then offer up to 4 replies Nero can tap. Each is either {"label": "...", "say": "what Nero says"} or {"label": "...", "tool": "<tool name>", "input": {...}} to do one thing directly. Labels are 1 to 4 words.
Tools you can use in replies: complete_task {task: id}, move_task {task: id, due: "tomorrow"|"+3d"|"YYYY-MM-DD"}, spread_late_tasks {}, settle_opportunity {id, outcome: "caught"}, log_lost_opportunity {title, value, minSpend, store, cause: forgot|date|spend|away|notworth}, set_presence {where: home|out}, add_task {title, due}, ring_bell {message}.
Reply with JSON only: {"say": "...", "replies": [...]}`;

function situationKey(s) {
  const part = s.now.hour < 12 ? "am" : s.now.hour < 18 ? "pm" : "eve";
  return JSON.stringify([s.now.date, part, s.tasks.late.map(t => t.id), s.tasks.today.map(t => t.id), s.money.open.map(c => c.id + c.days), s.presence && s.presence.where, s.bells.map(b => b.at), s.notes.map(n => n.text), s.expiring.map(e => e.key), s.location && s.location.city, s.money.ledger.caught + s.money.ledger.missed]);
}
export async function greet(ctx) {
  const s = await senses(ctx);
  const key = situationKey(s);
  const cached = ctx.profile.greeting;
  if (cached && cached.key === key && Date.now() - Date.parse(cached.at) < 3 * 3600e3) return { messages: [cached.message], cached: true };
  if (!aiEnabled()) return { messages: [], cached: false };
  const system = VOICE.replaceAll("{name}", first(ctx.user.name) || "the lord of the house") +
    `\n\nToday is ${s.now.weekday} ${s.now.date}, ${s.now.hour}:00 (${s.now.tz}). What you know right now:\n${JSON.stringify(s)}` +
    (s.money.ledger.caught + s.money.ledger.missed === 0 ? "\n\nThe ledger of opportunities is empty. The story of Laventina begins with a €7 Carrefour coupon Nero lost on a €35 shop: if it fits, offer to log it as the first entry (log_lost_opportunity)." : "");
  const past = (await history(ctx, 6)).filter(h => h.text).map(h => `${h.role === "user" ? "Nero" : "You"}: ${h.text}`).join("\n");
  let msg;
  try {
    msg = await claude().beta.messages.create({ model: MODEL, max_tokens: 8000, thinking: { type: "adaptive" }, output_config: { effort: EFFORT }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", system,
      messages: [{ role: "user", content: (past ? `The last things said between you:\n${past}\n\n` : "") + GREET }] });
  } catch (e) { console.error("greet", e && e.message); return { messages: [], cached: false }; }
  const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
  let v; try { v = JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]); } catch { return { messages: [], cached: false }; }
  if (!v || typeof v.say !== "string" || !v.say.trim()) return { messages: [], cached: false };
  const chips = (Array.isArray(v.replies) ? v.replies : []).slice(0, 4).map(r => {
    const label = String(r && r.label || "").slice(0, 40); if (!label) return null;
    const t = r.tool && toolByName(r.tool);
    if (t && !t.appOnly) return { label, tool: t.name, input: r.input && typeof r.input === "object" ? r.input : {} };
    return { label, say: String(r.say || label).slice(0, 300) };
  }).filter(Boolean);
  const message = { id: "g:" + s.now.date + ":" + Date.now().toString(36), role: "butler", text: v.say.trim(), chips, hello: true };
  await saveProfile(ctx.user.id, { greeting: { key, at: new Date().toISOString(), message } });
  await logTurn(ctx, "butler", { text: message.text, chips, greeting: true });
  return { messages: [message], cached: false };
}

export async function setPresenceQuick(ctx, where) { return saveProfile(ctx.user.id, { presence: { date: ctx.today, where } }); }

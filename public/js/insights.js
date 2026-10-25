"use strict";
// ---------- Proactive Laventina: what it notices, how we're doing, and Claude as a coach ----------
// Everything here reads the same state as the rest of the app. Rules run on every screen refresh and
// cost nothing; Claude is only called when someone taps a button.

const localDay = iso => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const firstName = id => memberName(id).split(" ")[0];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
const weekStart = iso => { const d = new Date(iso + "T00:00:00"); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const STOP = new Set("the a an and or to for of in on at with from my our your by up out new old get do make fix call buy check take clean put set into off this that some all more".split(" "));
const lsJSON = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const lsSave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ---------- Planning moves the insights offer ----------
// Spread tasks over the coming days, most important first, keeping any one day light.
function spreadTasks(tasks, { from = 0, days = 7, perDay = 3 } = {}) {
  const td = todayISO(), load = {};
  for (const t of openTasks()) if (t.dueOn) load[t.dueOn] = (load[t.dueOn] || 0) + 1;
  for (const t of tasks) if (t.dueOn) load[t.dueOn] = Math.max(0, (load[t.dueOn] || 0) - 1);
  const sorted = [...tasks].sort((a, b) => (b.priority || 0) - (a.priority || 0) || (a.dueOn || "").localeCompare(b.dueOn || ""));
  const moved = [];
  for (const t of sorted) {
    let best = null;
    for (let i = from; i < from + days; i++) { const d = addDays(td, i); if ((load[d] || 0) < perDay) { best = d; break; } }
    if (!best) best = Array.from({ length: days }, (_, i) => addDays(td, from + i)).sort((a, b) => (load[a] || 0) - (load[b] || 0))[0];
    load[best] = (load[best] || 0) + 1;
    moved.push({ before: { ...t }, after: { ...t, dueOn: best } });
  }
  moved.forEach(m => putTask(m.after));
  return moved;
}
function undoable(moved, msg) {
  toast(msg, { label: "Undo", run: () => moved.forEach(m => putTask(m.before)) });
}
function nextWeekday(wd) { const d = new Date(); const add = ((wd - d.getDay()) + 7) % 7 || 7; return addDays(todayISO(), add); }

// ---------- What Laventina notices ----------
function buildInsights() {
  const td = todayISO(), out = [];
  const open = openTasks().filter(t => visibleNow(t));
  const mineOpen = open.filter(mineOrAnyone);
  const two = S.members.length > 1;

  // Overdue pile
  const late = mineOpen.filter(t => t.dueOn && t.dueOn < td && !blockerOf(t));
  if (late.length >= 3) out.push({ id: "late:" + late.length, tone: "nudge", title: `${plural(late.length, "thing")} slipped past their date`,
    text: "A fresh start helps more than a long red list. I can spread them over the next few days, most important first.",
    actions: [["Spread them out", "ins-spread-late"], ...(S.ai ? [["Help me prioritise", "coach-problem", `I have ${late.length} overdue tasks: ${late.slice(0, 12).map(t => t.title).join("; ")}. Help me decide what to do first, what to drop, and what to hand off.`]] : [])] });

  // Keeps slipping
  for (const t of mineOpen.filter(t => (t.extra?.postponed || 0) >= 3).slice(0, 2)) out.push({ id: "slip:" + t.id, tone: "nudge", title: `“${t.title}” keeps getting pushed back`,
    text: `Moved ${t.extra.postponed} times. Usually that means it's too big, unclear, or not really needed.`,
    actions: [...(S.ai ? [["Break it down", "coach-task", t.id]] : []), ["Make it someday", "ins-someday", t.id], ["Open it", "task-open", t.id]] });

  // Waiting with no date
  const stale = mineOpen.filter(t => !t.dueOn && !isGenerated(t) && !t.projectId && daysSince(t.createdAt) > 21);
  if (stale.length >= 3) out.push({ id: "stale:" + stale.length, tone: "nudge", title: `${plural(stale.length, "task")} have waited 3+ weeks with no date`,
    text: "Give them a slot, or let them go. Undated tasks quietly become guilt.",
    actions: [["Give them dates", "ins-date-stale"], ["Show them", "list-view-inbox"]] });

  // A crowded day ahead
  const byDay = {}; for (const t of mineOpen) if (t.dueOn && t.dueOn > td && t.dueOn <= addDays(td, 7)) (byDay[t.dueOn] = byDay[t.dueOn] || []).push(t);
  const busy = Object.entries(byDay).sort((a, b) => b[1].length - a[1].length)[0];
  if (busy && busy[1].length >= 6) out.push({ id: "busy:" + busy[0] + busy[1].length, tone: "heads-up", title: `${dueLabel({ dueOn: busy[0] })} is packed: ${busy[1].length} things`,
    text: "Move the less important ones to lighter days so that day stays doable.", actions: [["Lighten it", "ins-lighten", busy[0]]] });

  // Same place, same trip
  const groups = new Map();
  for (const t of open.filter(t => !t.projectId)) {
    if (t.roomId && S.rooms.get(t.roomId)) { const k = "room:" + t.roomId; groups.set(k, [...(groups.get(k) || []), t]); }
    const words = new Set(String(t.title).toLowerCase().match(/[a-zà-ÿ]{4,}/g) || []);
    for (const w of words) if (!STOP.has(w)) { const k = "word:" + w; groups.set(k, [...(groups.get(k) || []), t]); }
  }
  const cluster = [...groups].filter(([, l]) => l.length >= 3).sort((a, b) => b[1].length - a[1].length)[0];
  if (cluster) {
    const [k, list] = cluster, name = k.startsWith("room:") ? S.rooms.get(k.slice(5)).name : "“" + k.slice(5) + "”";
    out.push({ id: "group:" + k + list.length, tone: "idea", title: `${plural(list.length, "job")} ${k.startsWith("room:") ? "in the " + name : "about " + name}`,
      text: "Doing them in one go saves setting up and cleaning up three times.",
      actions: [["Do them Saturday", "ins-group-day", list.map(t => t.id).join(",")], ["Make it a project", "ins-group-project", list.map(t => t.id).join(",") + "|" + name.replace(/[“”]/g, "")]] });
  }

  // Fairness
  if (two) {
    const recent = allTasks().filter(t => t.status === "done" && t.doneBy && daysSince(t.doneAt) <= 14);
    if (recent.length >= 8) {
      const per = S.members.map(m => [m, recent.filter(t => t.doneBy === m.id).length]).sort((a, b) => b[1] - a[1]);
      const [top, n] = per[0], [low] = per[per.length - 1];
      if (n / recent.length >= 0.7) out.push({ id: "fair:" + top.id + Math.round(n / recent.length * 10), tone: "heads-up", title: `${firstName(top.id)} did ${n} of the last ${recent.length} jobs`,
        text: `Sharing evens out over time if the next few go to ${firstName(low.id)}.`, actions: [["Give the next 3 to " + firstName(low.id), "ins-rebalance", low.id]] });
    }
  }

  // The house
  const att = activeItems().filter(i => flagsFor(i).some(f => f.rank != null && f.rank <= 1));
  if (att.length) out.push({ id: "house:" + att.length, tone: "heads-up", title: `${plural(att.length, "thing")} in the house need${att.length === 1 ? "s" : ""} attention`,
    text: att.slice(0, 3).map(i => `${i.name}: ${flagsFor(i).find(f => f.rank != null && f.rank <= 1).t.toLowerCase()}`).join(" · "), actions: [["See them", "tab-overview"]] });
  if (typeof expiringSoon === "function") {
    try {
      const ex = expiringSoon(30) || [];
      if (ex.length) out.push({ id: "expiry:" + ex.length, tone: "heads-up", title: `${plural(ex.length, "thing")} expire${ex.length === 1 ? "s" : ""} in the next 30 days`,
        text: ex.slice(0, 3).map(e => `${e.title} (${fmtShort(e.date)})`).join(" · "), actions: [["See what's expiring", "tab-" + (ex[0].view || "expiring")]] });
    } catch (e) { console.error(e); }
  }

  // Wins, so it's not all nagging
  const streak = onTimeStreak();
  if (streak >= 3) out.push({ id: "streak:" + streak, tone: "win", title: `${streak} days in a row with nothing left behind`, text: "Everything due on those days got done. Lovely rhythm.", actions: [] });
  const doneWeek = allTasks().filter(t => t.status === "done" && daysSince(t.doneAt) <= 7).length;
  const doneBefore = allTasks().filter(t => t.status === "done" && daysSince(t.doneAt) > 7 && daysSince(t.doneAt) <= 14).length;
  if (doneWeek >= 5 && doneWeek >= doneBefore * 1.3 && doneBefore > 0) out.push({ id: "up:" + doneWeek, tone: "win", title: `${doneWeek} done this week, up from ${doneBefore}`, text: "The home is getting lighter.", actions: [["See progress", "tab-progress"]] });

  const hidden = lsJSON("laventina-ins-hide", {});
  return out.filter(i => !(hidden[i.id] && hidden[i.id] > td));
}
// Days, counting back from yesterday, on which every task due that day was done by then.
function onTimeStreak() {
  const td = todayISO(); let n = 0;
  for (let i = 1; i <= 60; i++) {
    const d = addDays(td, -i);
    const due = allTasks().filter(t => t.dueOn === d && t.status !== "skipped" && mineOrAnyone(t));
    if (!due.length) { if (n) continue; else continue; }
    if (due.every(t => t.status === "done" && localDay(t.doneAt) <= d)) n++; else break;
  }
  return n;
}
const TONE = { nudge: ["Nudge", "warn"], "heads-up": ["Heads up", "info"], idea: ["Idea", "info"], win: ["Nice", "good"] };
function insightsHTML() {
  const list = buildInsights();
  if (!list.length) return "";
  const open = S.insOpen;
  const shown = open ? list : list.slice(0, 2);
  return `<section class="section noticed"><header><h2>Worth your attention</h2>${list.length > 2 ? `<button class="link" data-act="ins-more">${open ? "Show fewer" : "Show all " + list.length}</button>` : ""}</header>
    <div class="ins-list">${shown.map(i => `<article class="ins tone-${i.tone}"><div class="ins-head"><span class="pill ${TONE[i.tone][1]}">${TONE[i.tone][0]}</span><button class="ins-x" data-act="ins-hide" data-id="${esc(i.id)}" aria-label="Hide this for a week">✕</button></div>
      <h3>${esc(i.title)}</h3><p class="muted">${esc(i.text)}</p>
      ${i.actions.length ? `<div class="actions" style="justify-content:flex-start">${i.actions.map(([l, a, d], n) => `<button class="btn small ${n ? "" : "primary"}" data-act="${a}" data-id="${esc(d || "")}">${esc(l)}</button>`).join("")}</div>` : ""}</article>`).join("")}</div></section>`;
}

// A one-line read of the day: how much, how long, and where there's room.
function briefHTML() {
  const td = todayISO();
  const mine = openTasks().filter(t => actionable(t) && mineOrAnyone(t));
  const today = mine.filter(t => t.dueOn === td), late = mine.filter(t => t.dueOn && t.dueOn < td);
  const mins = sum(today, t => t.estMinutes || 0);
  const week = Array.from({ length: 6 }, (_, i) => addDays(td, i + 1)).map(d => [d, mine.filter(t => t.dueOn === d).length]);
  const light = week.sort((a, b) => a[1] - b[1])[0];
  const bits = [];
  bits.push(today.length ? `${plural(today.length, "thing")} today${mins ? `, about ${mins >= 60 ? Math.floor(mins / 60) + " h " + (mins % 60 ? (mins % 60) + " min" : "") : mins + " min"}` : ""}` : "A clear day");
  if (late.length) bits.push(`${late.length} catching up`);
  const timed = today.filter(t => t.dueTime && t.dueTime >= new Date().toTimeString().slice(0, 5)).sort((a, b) => a.dueTime.localeCompare(b.dueTime))[0];
  if (timed) bits.push(`next at ${timed.dueTime}: ${timed.title}`);
  if (light && today.length >= 4) bits.push(`${dueLabel({ dueOn: light[0] })} is lighter`);
  return `<p class="brief">${esc(bits.join(" · "))}.</p>`;
}

// ---------- Progress: wins, misses, trends, people ----------
function progressStats(weeks = 8) {
  const td = todayISO(), from = addDays(weekStart(td), -7 * (weeks - 1));
  const due = allTasks().filter(t => t.dueOn && t.dueOn >= from && t.dueOn < td);
  const res = t => t.status === "done" ? (localDay(t.doneAt) <= t.dueOn ? "on" : "late") : t.status === "skipped" ? "missed" : "open";
  const rows = due.map(t => ({ t, r: res(t) }));
  const count = (l, r) => l.filter(x => x.r === r).length;
  const rate = l => { const n = l.length; return n ? Math.round(100 * count(l, "on") / n) : null; };
  const wk = Array.from({ length: weeks }, (_, i) => addDays(from, i * 7)).map(w => {
    const l = rows.filter(x => weekStart(x.t.dueOn) === w);
    return { w, n: l.length, on: count(l, "on"), rate: rate(l), done: allTasks().filter(t => t.status === "done" && t.doneAt && weekStart(localDay(t.doneAt)) === w).length };
  });
  const people = S.members.map(m => {
    const l = rows.filter(x => (x.t.assigneeId || x.t.doneBy) === m.id);
    const lateDays = l.filter(x => x.r === "late").map(x => (Date.parse(localDay(x.t.doneAt)) - Date.parse(x.t.dueOn)) / 864e5);
    return { m, done: allTasks().filter(t => t.status === "done" && t.doneBy === m.id && t.doneAt >= from).length, rate: rate(l), n: l.length,
      avgLate: lateDays.length ? Math.round(10 * sum(lateDays, x => x) / lateDays.length) / 10 : 0,
      thanks: allTasks().filter(t => t.doneBy === m.id && t.doneAt >= from).reduce((s, t) => s + ((t.extra && t.extra.thanks) || []).length, 0) };
  });
  const recent = rows.filter(x => x.t.dueOn >= addDays(td, -28)), earlier = rows.filter(x => x.t.dueOn < addDays(td, -28));
  const missed = rows.filter(x => x.r === "missed" || (x.r === "open" && x.t.dueOn <= addDays(td, -3)))
    .sort((a, b) => (b.t.priority || 0) - (a.t.priority || 0) || a.t.dueOn.localeCompare(b.t.dueOn)).map(x => x.t);
  const managed = rows.filter(x => x.r === "on").sort((a, b) => (b.t.priority || 0) - (a.t.priority || 0) || b.t.dueOn.localeCompare(a.t.dueOn)).map(x => x.t);
  const bySource = {};
  for (const x of rows) { const k = x.t.source && x.t.source !== "todo" ? SOURCE_LABEL[x.t.source] || "House" : "Our tasks"; const b = bySource[k] = bySource[k] || { on: 0, n: 0 }; b.n++; if (x.r === "on") b.on++; }
  return { from, rows, total: rows.length, on: count(rows, "on"), late: count(rows, "late"), missed: missed.length, rate: rate(rows),
    recentRate: rate(recent), earlierRate: rate(earlier), weeks: wk, people, missedList: missed, managedList: managed, bySource, streak: onTimeStreak(),
    undatedDone: allTasks().filter(t => t.status === "done" && !t.dueOn && t.doneAt >= from).length };
}
function trendLine(s) {
  if (s.recentRate == null || s.earlierRate == null) return "Keep going for a few weeks and trends show up here.";
  const d = s.recentRate - s.earlierRate;
  return d >= 5 ? `On time is up ${d} points over the last 4 weeks.` : d <= -5 ? `On time is down ${-d} points over the last 4 weeks.` : "Steady: about the same as the weeks before.";
}
VIEWS.progress = {
  shell: () => `<div id="view-progress"><div class="hello"><span class="eyebrow">Last 8 weeks</span><h2>How we're doing</h2></div><div id="prog-body"></div></div>`,
  live() {
    const el = $("#prog-body"); if (!el) return;
    const s = progressStats();
    if (s.total < 3) { el.innerHTML = ledgerHTML() + emptyHTML("Not enough task history yet", "Once a few dated tasks have come and gone, this shows what you managed, what slipped, the trend, and a training plan to get better at it."); return; }
    const max = Math.max(1, ...s.weeks.map(w => w.n));
    const tile = (n, l, cls = "") => `<div class="stat ${cls}"><b class="num">${n}</b><span>${l}</span></div>`;
    const coach = S.coach && S.coach.get("training");
    el.innerHTML = `
      <section class="section"><div class="stats">${tile(s.rate + "%", "on time")}${tile(s.on, "managed on time", "good")}${tile(s.late, "done late")}${tile(s.missed, "missed", s.missed ? "bad" : "")}</div>
        <p class="muted" style="margin:0">${esc(trendLine(s))}${s.streak >= 2 ? ` Current streak: ${s.streak} days with nothing left behind.` : ""}${s.undatedDone ? ` Plus ${s.undatedDone} undated tasks done.` : ""}</p></section>
      ${ledgerHTML()}
      <section class="section"><header><h2>Week by week</h2><span class="eyebrow">bar height = tasks due · fill = on time</span></header>
        <div class="weeks" role="img" aria-label="${esc(s.weeks.map(w => `${fmtShort(w.w)}: ${w.on} of ${w.n} on time`).join("; "))}">${s.weeks.map(w => `<div class="wk" title="Week of ${esc(fmtShort(w.w))}: ${w.on} of ${w.n} on time${w.rate != null ? " (" + w.rate + "%)" : ""}, ${w.done} done in total">
          <div class="wk-bar" style="height:${Math.max(4, 100 * w.n / max)}%"><i style="height:${w.n ? 100 * w.on / w.n : 0}%"></i></div><span class="wk-l">${esc(fmtShort(w.w))}</span><span class="wk-v num">${w.rate == null ? "–" : w.rate + "%"}</span></div>`).join("")}</div>
        <details class="tableview"><summary>As a table</summary><table><thead><tr><th>Week of</th><th>Due</th><th>On time</th><th>Rate</th><th>Done in total</th></tr></thead><tbody>${s.weeks.map(w => `<tr><td>${esc(fmtShort(w.w))}</td><td>${w.n}</td><td>${w.on}</td><td>${w.rate == null ? "–" : w.rate + "%"}</td><td>${w.done}</td></tr>`).join("")}</tbody></table></details></section>
      ${S.members.length > 1 ? `<section class="section"><header><h2>Each of us</h2></header><div class="people">${s.people.map(p => `<div class="panel person">${avatarHTML(p.m.id)}<div><b>${esc(p.m.name.split(" ")[0])}</b>
        <span class="muted">${p.done} done · ${p.rate == null ? "no dated tasks" : p.rate + "% on time"}${p.avgLate ? ` · late ones ${p.avgLate} days late on average` : ""}${p.thanks ? ` · 💜 ${p.thanks}` : ""}</span></div></div>`).join("")}</div></section>` : ""}
      <section class="section"><header><h2>By kind</h2></header><div class="kinds">${Object.entries(s.bySource).map(([k, b]) => `<div class="kind"><span>${esc(k)}</span><span class="meter" aria-hidden="true"><i style="width:${100 * b.on / b.n}%"></i></span><span class="num muted">${Math.round(100 * b.on / b.n)}% of ${b.n}</span></div>`).join("")}</div></section>
      <div class="two-col">
        <section class="section"><header><h2>Opportunities missed</h2><span class="eyebrow">${s.missedList.length}</span></header>${s.missedList.length ? `<ul class="plain">${s.missedList.slice(0, 8).map(t => `<li><button class="link" data-act="task-open" data-id="${esc(t.id)}">${esc(t.title)}</button> <span class="muted">${t.status === "skipped" ? "skipped" : "still open"} · was due ${esc(fmtShort(t.dueOn))}</span></li>`).join("")}</ul>` : `<p class="muted">Nothing slipped. 🌿</p>`}</section>
        <section class="section"><header><h2>Managed</h2><span class="eyebrow">${s.managedList.length}</span></header>${s.managedList.length ? `<ul class="plain">${s.managedList.slice(0, 8).map(t => `<li>${esc(t.title)} <span class="muted">· ${esc(fmtShort(t.dueOn))}${t.doneBy && S.members.length > 1 ? " · " + esc(firstName(t.doneBy)) : ""}</span></li>`).join("")}</ul>` : `<p class="muted">Nothing on time yet in this window.</p>`}</section>
      </div>
      <section class="section"><header><h2>Training plan</h2>${coach ? `<span class="eyebrow">${esc(agoLabel(coach.at))}</span>` : ""}</header>
        ${coach ? trainingHTML(coach.result) : `<p class="muted" style="margin:0">A short plan of habits to raise the on-time rate, built from the numbers above${S.members.length > 1 ? " for each of you" : ""}.</p>`}
        ${S.ai ? `<div><button class="btn ${coach ? "" : "primary"}" data-act="coach-training">${coach ? "Make a new plan" : "Make my training plan"}</button></div>` : `<p class="muted">Turn on Claude to get a training plan.</p>`}</section>`;
  }
};

// ---------- Claude as a coach ----------
// Keep what goes to Claude small and useful: titles, dates, who, counts. Never private tasks from someone else (sync already hides those).
function homeSnapshot() {
  const td = todayISO();
  const t = x => ({ title: x.title, due: x.dueOn, time: x.dueTime, who: x.assigneeId ? firstName(x.assigneeId) : undefined, kind: isGenerated(x) ? SOURCE_LABEL[x.source] : undefined,
    room: x.roomId && S.rooms.get(x.roomId)?.name, priority: x.priority || undefined, postponed: x.extra?.postponed, minutes: x.estMinutes });
  const open = openTasks().sort(taskSort);
  const done = allTasks().filter(x => x.status === "done" && daysSince(x.doneAt) <= 30);
  const s = progressStats();
  return {
    today: td, weekday: new Date().toLocaleDateString("en-GB", { weekday: "long" }), people: S.members.map(m => m.name.split(" ")[0]), you: S.me ? firstName(S.me.id) : undefined,
    openTasks: open.slice(0, 80).map(t), openCount: open.length, overdue: open.filter(x => x.dueOn && x.dueOn < td).length,
    doneLast30Days: { total: done.length, byPerson: Object.fromEntries(S.members.map(m => [m.name.split(" ")[0], done.filter(x => x.doneBy === m.id).length])), examples: done.slice(0, 25).map(x => x.title) },
    onTime: { rate: s.rate, recent4Weeks: s.recentRate, before: s.earlierRate, managed: s.on, late: s.late, missed: s.missed, missedExamples: s.missedList.slice(0, 10).map(x => x.title) },
    houseAttention: activeItems().flatMap(i => flagsFor(i).filter(f => f.rank != null && f.rank <= 2).map(f => `${i.name}: ${f.why}`)).slice(0, 15),
    projects: [...S.projects.values()].filter(p => !["done", "abandoned"].includes(p.status)).map(p => ({ title: p.title, status: p.status, openSteps: projectSteps(p.id).filter(x => x.status === "open").length })).slice(0, 10),
    fridgeNotes: [...(S.notes?.values() || [])].map(n => n.text).slice(0, 8)
  };
}
const COACH_VOICE = `You are Laventina, a warm, practical home coach inside a shared household task app. Write in plain, friendly English (short sentences, no jargon, no emoji except at most one). Be concrete: name the actual tasks, rooms and people from the data. Never invent tasks, numbers or facts that are not in the data; if you assume something, say so. Dates are ISO (YYYY-MM-DD); inDays counts from today.`;
async function coachAsk(kind, input) {
  if (!S.ai || !sampleCap) { toast("Claude isn't available on this site right now."); return null; }
  const snap = JSON.stringify(homeSnapshot());
  const prompts = {
    checkup: `${COACH_VOICE}\n\nHere is the household right now:\n${snap}\n\nGive a home check-up. Return JSON: {"headline": string (one sentence), "conclusions": [up to 4 strings: what the data says], "wins": [up to 3 strings], "risks": [up to 3 strings: what will bite if ignored], "plans": [2 to 3 improvement plans, each {"title": string, "why": string, "steps": [2 to 6 {"title": string (a task, verb first, under 60 chars), "inDays": integer 0-60, "minutes": integer or null, "who": one of the people's names or null}]}]}`,
    problem: `${COACH_VOICE}\n\nHere is the household right now:\n${snap}\n\nSomeone in the home says: "${String(input).slice(0, 600)}"\n\nHelp them solve it. Return JSON: {"summary": string (what is probably going on, one or two sentences), "causes": [up to 4 {"cause": string, "check": string (how to tell)}], "path": [3 to 7 {"title": string (a task, verb first, under 60 chars), "inDays": integer 0-60, "minutes": integer or null, "diy": boolean}], "callAPro": string or null (when to stop and call a professional, and which kind), "planTitle": string (a short project name)}`,
    task: `${COACH_VOICE}\n\nHere is the household right now:\n${snap}\n\nHelp with this one task: ${JSON.stringify(input)}\n\nIf it's vague or big, turn it into small, clear steps someone can just start. Return JSON: {"summary": string (one sentence on the best way to tackle it), "steps": [2 to 7 {"title": string (verb first, under 60 chars), "minutes": integer or null}], "tip": string or null, "bestTime": string or null (e.g. "a dry Saturday morning")}`,
    training: `${COACH_VOICE}\n\nHere is the household right now, including on-time numbers over the last 8 weeks:\n${snap}\n\nPer person (last 8 weeks): ${JSON.stringify(progressStats().people.map(p => ({ name: p.m.name.split(" ")[0], done: p.done, onTimeRate: p.rate, avgDaysLate: p.avgLate, thanksReceived: p.thanks })))}\n\nMake a 4-week training plan to get better at doing things on time, with less stress. Return JSON: {"summary": string (what the numbers say about how this home works, honestly but kindly), "strengths": [up to 3 strings], "focus": [up to 3 strings: the habits that would help most], "weeks": [4 items {"week": 1-4, "habit": string (one small habit, under 70 chars), "why": string, "task": {"title": string (a recurring task to practise it, verb first, under 60 chars), "repeat": "day" or "week", "who": name or null}}]}`
  };
  try { return await sampleCap.json(prompts[kind]); }
  catch (e) { toast(e.message || "Claude could not answer just now."); return null; }
}
const COACH_WAIT = { checkup: "Looking over the whole home…", problem: "Thinking it through…", task: "Breaking it down…", training: "Reading the last 8 weeks…" };
function coachBusy(kind, title) { openSheet(title, `<div class="coach-wait"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="muted">${COACH_WAIT[kind]}</span></div>`); }
const whoId = name => name ? (S.members.find(m => m.name.split(" ")[0].toLowerCase() === String(name).toLowerCase()) || {}).id : undefined;
function stepsHTML(steps, group) {
  return `<ol class="steps">${steps.map((s, i) => `<li><label class="check"><input type="checkbox" checked data-group="${esc(group)}" data-i="${i}"> <span>${esc(s.title)}<span class="muted">${s.inDays != null ? " · " + esc(dueLabel({ dueOn: addDays(todayISO(), s.inDays) }).toLowerCase() || "today") : ""}${s.minutes ? " · " + s.minutes + " min" : ""}${s.who ? " · " + esc(s.who) : ""}${s.diy === false ? " · pro" : ""}</span></span></label></li>`).join("")}</ol>`;
}
// Turn a picked list of steps into a project (several steps) or a single task.
function addPlan(title, steps) {
  if (!steps.length) return toast("Tick at least one step.");
  if (steps.length === 1) { const s = steps[0]; putTask(newTask({ title: s.title, dueOn: s.inDays != null ? addDays(todayISO(), s.inDays) : undefined, estMinutes: s.minutes || undefined, assigneeId: whoId(s.who) })); closeSheet(); return toast(`Added “${s.title}”`); }
  const p = { id: newId("j"), title: String(title || "Plan").slice(0, 80), status: "planning", sequential: true, leadId: S.me?.id, costs: [], createdAt: nowISO(), source: "coach" };
  store.put("projects", p);
  steps.forEach((s, i) => putTask(newTask({ title: s.title, projectId: p.id, sortOrder: i + 1, dueOn: s.inDays != null ? addDays(todayISO(), s.inDays) : undefined, estMinutes: s.minutes || undefined, assigneeId: whoId(s.who) })));
  closeSheet();
  toast(`Made the project “${p.title}” with ${steps.length} steps`, { label: "Open", run: () => openProject(S.projects.get(p.id)) });
}
const picked = (group, steps) => [...document.querySelectorAll(`input[data-group="${CSS.escape(group)}"]:checked`)].map(i => steps[Number(i.dataset.i)]).filter(Boolean);
let COACH = null;

async function runCheckup() {
  coachBusy("checkup", "Home check-up");
  const r = await coachAsk("checkup"); if (!r) return closeSheet();
  store.put("coach", { id: "checkup", at: nowISO(), by: S.me.id, result: r });
  showCheckup(r);
}
function showCheckup(r) {
  COACH = { plans: r.plans || [] };
  const list = (h, l, cls) => l && l.length ? `<section><h3 class="eyebrow">${h}</h3><ul class="plain ${cls || ""}">${l.map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>` : "";
  openSheet("Home check-up", `<div class="coach">
    <p class="coach-headline">${esc(r.headline || "")}</p>
    ${list("What I see", r.conclusions)}${list("Going well", r.wins, "wins")}${list("Watch out", r.risks, "risks")}
    ${(r.plans || []).map((p, i) => `<section class="panel plan"><h3>${esc(p.title)}</h3><p class="muted">${esc(p.why || "")}</p>${stepsHTML(p.steps || [], "plan" + i)}
      <div><button class="btn small primary" data-act="coach-add-plan" data-id="${i}">Add this plan</button></div></section>`).join("")}
    <p class="muted small-note">Suggestions from Claude, based only on what's in Laventina. Check before you act on anything important.</p></div>`);
}
async function runProblem(text) {
  if (!text) return;
  coachBusy("problem", "Let's solve it");
  const r = await coachAsk("problem", text); if (!r) return closeSheet();
  COACH = { problem: r };
  openSheet(r.planTitle || "Let's solve it", `<div class="coach">
    <p class="coach-headline">${esc(r.summary || "")}</p>
    ${(r.causes || []).length ? `<section><h3 class="eyebrow">Likely causes</h3><ul class="plain causes">${r.causes.map(c => `<li><b>${esc(c.cause)}</b><br><span class="muted">${esc(c.check)}</span></li>`).join("")}</ul></section>` : ""}
    <section class="panel plan"><h3>Path to fix it</h3>${stepsHTML(r.path || [], "path")}<div><button class="btn small primary" data-act="coach-add-path">Add these steps</button></div></section>
    ${r.callAPro ? `<div class="ai-note"><b>When to call a pro:</b> ${esc(r.callAPro)}</div>` : ""}
    <p class="muted small-note">Suggestions from Claude. For gas, electrics, structure or anything unsafe, call a professional.</p></div>`);
}
async function runTaskHelp(t) {
  if (!t) return;
  coachBusy("task", t.title);
  const r = await coachAsk("task", { title: t.title, notes: t.notes, due: t.dueOn, room: t.roomId && S.rooms.get(t.roomId)?.name, existingSteps: (t.subtasks || []).map(s => s.title) }); if (!r) return closeSheet();
  COACH = { task: t.id, steps: r.steps || [] };
  openSheet(t.title, `<div class="coach">
    <p class="coach-headline">${esc(r.summary || "")}</p>${stepsHTML(r.steps || [], "tsteps")}
    ${r.tip ? `<div class="ai-note">${esc(r.tip)}</div>` : ""}${r.bestTime ? `<p class="muted">Best time: ${esc(r.bestTime)}</p>` : ""}
    <div class="actions" style="justify-content:flex-start"><button class="btn small primary" data-act="coach-add-substeps">Add as steps of this task</button><button class="btn small" data-act="coach-add-tasks">Add as separate tasks</button></div></div>`);
}
async function runTraining() {
  coachBusy("training", "Training plan");
  const r = await coachAsk("training"); if (!r) return closeSheet();
  store.put("coach", { id: "training", at: nowISO(), by: S.me.id, result: r });
  closeSheet(); refresh();
  toast("Your training plan is ready");
}
function trainingHTML(r) {
  return `<div class="coach training"><p class="coach-headline">${esc(r.summary || "")}</p>
    <div class="two-col">${(r.strengths || []).length ? `<div><h3 class="eyebrow">Strengths</h3><ul class="plain wins">${r.strengths.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    ${(r.focus || []).length ? `<div><h3 class="eyebrow">Focus on</h3><ul class="plain">${r.focus.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}</div>
    <ol class="weeks-plan">${(r.weeks || []).map((w, i) => `<li class="panel"><span class="eyebrow">Week ${esc(w.week || i + 1)}</span><b>${esc(w.habit)}</b><span class="muted">${esc(w.why || "")}</span>
      ${w.task ? `<button class="btn small" data-act="coach-add-habit" data-id="${i}">Practise it: ${esc(w.task.title)}${w.task.repeat ? " (every " + esc(w.task.repeat) + ")" : ""}</button>` : ""}</li>`).join("")}</ol></div>`;
}
// The ask box on Today, plus the last check-up so the whole home sees it.
function coachHTML() {
  if (!S.ai) return "";
  const last = S.coach && S.coach.get("checkup");
  return `<section class="section coach-box"><header><h2>Ask Laventina</h2>${last ? `<button class="link" data-act="coach-show-checkup">Last check-up · ${esc(agoLabel(last.at))}</button>` : ""}</header>
    <form id="coach-form" class="panel coach-ask"><label class="sr" for="coach-text">Describe a problem or a goal</label>
      <textarea id="coach-text" rows="2" maxlength="600" placeholder="Something wrong or a goal? “The bathroom smells damp”, “Our weeks feel chaotic”, “Cut our energy bill”"></textarea>
      <div class="actions" style="justify-content:space-between"><button type="button" class="btn small" data-act="coach-checkup">Check up on the whole home</button><button type="submit" class="btn small primary">Find a way</button></div></form></section>`;
}

// ---------- Themes: tasks grouped by what they're about, not by which list they're in ----------
function themesOf(tasks) {
  const themes = new Map(), placed = new Set();
  const add = (k, label, t) => { if (!themes.has(k)) themes.set(k, { label, tasks: [] }); themes.get(k).tasks.push(t); placed.add(t.id); };
  for (const t of tasks) {
    if (t.projectId && S.projects.get(t.projectId)) add("p:" + t.projectId, S.projects.get(t.projectId).title, t);
    else if (t.roomId && S.rooms.get(t.roomId)) add("r:" + t.roomId, S.rooms.get(t.roomId).name, t);
    else if (t.itemId && S.items.get(t.itemId)) add("r:item", "Things in the house", t);
    else if (isGenerated(t)) add("s:" + t.source, SOURCE_LABEL[t.source] || "House", t);
  }
  const rest = tasks.filter(t => !placed.has(t.id));
  const words = new Map();
  for (const t of rest) for (const w of new Set(String(t.title).toLowerCase().match(/[a-zà-ÿ]{4,}/g) || [])) if (!STOP.has(w)) words.set(w, [...(words.get(w) || []), t]);
  for (const [w, l] of [...words].sort((a, b) => b[1].length - a[1].length)) {
    const free = l.filter(t => !placed.has(t.id)); if (free.length < 2) continue;
    free.forEach(t => add("w:" + w, w[0].toUpperCase() + w.slice(1), t));
  }
  const loose = tasks.filter(t => !placed.has(t.id));
  const out = [...themes.values()].sort((a, b) => b.tasks.length - a.tasks.length);
  if (loose.length) out.push({ label: "Everything else", tasks: loose });
  return out;
}
function themesBodyHTML() {
  const open = openTasks().filter(t => visibleNow(t) && whoMatch(t));
  if (!open.length) return emptyHTML("No open tasks", "Add a few and Laventina groups them by what they're about.");
  return themesOf(open).map(g => `<section class="group"><header><h3>${esc(g.label)}</h3><span class="muted num">${g.tasks.length}</span></header>${taskListHTML(g.tasks.sort(taskSort))}</section>`).join("");
}

// ---------- Events ----------
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case "ins-more": S.insOpen = !S.insOpen; refresh(); break;
    case "ins-hide": { const h = lsJSON("laventina-ins-hide", {}); h[id] = addDays(todayISO(), 7); lsSave("laventina-ins-hide", h); refresh(); break; }
    case "ins-spread-late": { const td = todayISO(); const m = spreadTasks(openTasks().filter(t => mineOrAnyone(t) && t.dueOn && t.dueOn < td && !blockerOf(t)), { from: 0, days: 7 }); undoable(m, `Spread ${plural(m.length, "task")} over the next week`); break; }
    case "ins-date-stale": { const m = spreadTasks(openTasks().filter(t => mineOrAnyone(t) && !t.dueOn && !isGenerated(t) && !t.projectId && daysSince(t.createdAt) > 21), { from: 1, days: 14, perDay: 2 }); undoable(m, `Gave ${plural(m.length, "task")} a date in the next two weeks`); break; }
    case "ins-lighten": { const day = id, list = openTasks().filter(t => t.dueOn === day && mineOrAnyone(t)).sort((a, b) => (a.priority || 0) - (b.priority || 0)); const extra = list.slice(0, Math.max(0, list.length - 4)); const off = daysUntil(day); const m = spreadTasks(extra, { from: off + 1, days: 5, perDay: 3 }); undoable(m, `Moved ${plural(m.length, "task")} off ${dueLabel({ dueOn: day })}`); break; }
    case "ins-group-day": { const day = nextWeekday(6); const m = id.split(",").map(x => S.tasks.get(x)).filter(Boolean).map(t => ({ before: { ...t }, after: { ...t, dueOn: day } })); m.forEach(x => putTask(x.after)); undoable(m, `All ${m.length} set for Saturday`); break; }
    case "ins-group-project": { const [ids, name] = id.split("|"); const p = { id: newId("j"), title: name.charAt(0).toUpperCase() + name.slice(1), status: "planning", sequential: false, leadId: S.me?.id, costs: [], createdAt: nowISO() }; store.put("projects", p); ids.split(",").forEach((x, i) => { const t = S.tasks.get(x); if (t) putTask({ ...t, projectId: p.id, sortOrder: i + 1 }); }); toast(`Made the project “${p.title}”`, { label: "Open", run: () => openProject(S.projects.get(p.id)) }); break; }
    case "ins-rebalance": { const td = todayISO(); const next = openTasks().filter(t => !t.assigneeId && t.dueOn && t.dueOn >= td && t.visibility !== "private").sort(taskSort).slice(0, 3); const m = next.map(t => ({ before: { ...t }, after: { ...t, assigneeId: id } })); m.forEach(x => putTask(x.after)); undoable(m, m.length ? `Gave ${plural(m.length, "task")} to ${firstName(id)}` : "Nothing unassigned coming up"); break; }
    case "ins-someday": { const t = S.tasks.get(id); if (t) { const before = { ...t }; putTask({ ...t, dueOn: undefined, dueTime: undefined, priority: 0, extra: { ...(t.extra || {}), postponed: 0, someday: true } }); undoable([{ before }], "Moved to someday, no date"); } break; }
    case "list-view-inbox": S.listView = "inbox"; setTab("lists"); break;
    case "tab-overview": setTab("overview"); break;
    case "tab-progress": setTab("progress"); break;
    case "tab-expiring": setTab(VIEWS.expiring ? "expiring" : "overview"); break;
    case "coach-checkup": runCheckup(); break;
    case "coach-show-checkup": { const c = S.coach.get("checkup"); if (c) showCheckup(c.result); break; }
    case "coach-problem": runProblem(id); break;
    case "coach-task": runTaskHelp(S.tasks.get(id) || (TS && TS.d)); break;
    case "coach-training": runTraining(); break;
    case "coach-add-plan": { const p = COACH.plans[Number(id)]; addPlan(p.title, picked("plan" + id, p.steps || [])); break; }
    case "coach-add-path": addPlan(COACH.problem.planTitle, picked("path", COACH.problem.path || [])); break;
    case "coach-add-substeps": { const t = S.tasks.get(COACH.task); if (!t) break; const st = picked("tsteps", COACH.steps); putTask({ ...t, subtasks: [...(t.subtasks || []), ...st.map(s => ({ id: newId("s"), title: s.title, done: false }))], estMinutes: t.estMinutes || (sum(st, s => s.minutes || 0) || undefined) }); closeSheet(); toast(`Added ${plural(st.length, "step")}`); break; }
    case "coach-add-tasks": { const t = S.tasks.get(COACH.task); const st = picked("tsteps", COACH.steps); st.forEach((s, i) => putTask(newTask({ title: s.title, estMinutes: s.minutes || undefined, dueOn: t?.dueOn, listId: t?.listId, roomId: t?.roomId, sortOrder: Date.now() / 1e3 + i }))); closeSheet(); toast(`Added ${plural(st.length, "task")}`); break; }
    case "coach-add-habit": { const c = S.coach.get("training"); const w = c && c.result.weeks[Number(id)]; if (!w || !w.task) break; const start = addDays(todayISO(), 7 * ((Number(w.week) || 1) - 1));
      putTask(newTask({ title: w.task.title, dueOn: start, repeat: { every: 1, unit: w.task.repeat === "day" ? "day" : "week" }, assigneeId: whoId(w.task.who), notes: w.why, tags: ["habit"] })); toast(`Added “${w.task.title}”, starting ${dueLabel({ dueOn: start }).toLowerCase()}`); break; }
  }
});
document.addEventListener("submit", e => {
  if (e.target.id === "coach-form") { e.preventDefault(); runProblem($("#coach-text").value.trim()); }
});

// "Download everything": fetches the household's data and every stored file, and saves them as one zip.
// The zip is built here, uncompressed (photos and PDFs are compressed already), so no library is needed.
const $ = (s) => document.querySelector(s);
const log = (t) => { $("#log").textContent += t + "\n"; };

async function api(method, path, body) {
  const res = await fetch("/api" + path, { method, headers: { "x-laventina": "1", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  if (!res.ok) { const e = new Error((await res.json().catch(() => null))?.message || "Something went wrong (" + res.status + ")."); e.status = res.status; throw e; }
  return res;
}

// ---------- A minimal zip writer (stored entries, CRC-32) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(entries) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  const now = new Date(), dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const { name, data } of entries) {
    const n = enc.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), n, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, n.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: "application/zip" });
}

// ---------- A readable tasks table ----------
const csvCell = (v) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function tasksCsv(tasks, members) {
  const who = Object.fromEntries(members.map(m => [m.id, m.name]));
  const cols = ["title", "status", "due_date", "due_time", "assignee", "notes", "source", "visibility", "done_at", "done_by", "created_at"];
  const rows = tasks.map(t => cols.map(c => c === "assignee" ? who[t.assignee_id] || "" : c === "done_by" ? who[t.done_by] || "" : t[c]).map(csvCell).join(","));
  return [cols.join(","), ...rows].join("\n");
}
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "application/pdf": "pdf" };

async function download() {
  $("#go").disabled = true; $("#log").textContent = "";
  try {
    log("Collecting your data…");
    const data = await (await api("GET", "/export")).json();
    const enc = new TextEncoder();
    const entries = [
      { name: "laventina-data.json", data: enc.encode(JSON.stringify(data, null, 2)) },
      { name: "tasks.csv", data: enc.encode(tasksCsv(data.tasks, data.members)) }
    ];
    log(`${data.tasks.length} tasks, ${data.records.length} other entries, ${data.files.length} photos and scans.`);
    let failed = 0;
    for (const [i, f] of data.files.entries()) {
      try {
        const res = await api("GET", "/files/" + encodeURIComponent(f.id));
        const type = f.type || (res.headers.get("content-type") || "").split(";")[0];
        entries.push({ name: `files/${f.id}.${EXT[type] || "bin"}`, data: new Uint8Array(await res.arrayBuffer()) });
      } catch { failed++; }
      if ((i + 1) % 10 === 0) log(`  ${i + 1} of ${data.files.length} files…`);
    }
    const blob = zip(entries);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `laventina-everything-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    log(`Saved ${a.download} (${(blob.size / 1048576).toFixed(1)} MB).` + (failed ? ` ${failed} files could not be read; try again to retry them.` : " Everything is in it."));
  } catch (e) {
    if (e.status === 401) { $("#go").hidden = true; $("#signin").hidden = false; log("Please sign in first."); }
    else log(e.message);
  } finally { $("#go").disabled = false; }
}

$("#signin").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  try { await api("POST", "/auth/login", { email: f.get("email"), password: f.get("password") }); $("#signin").hidden = true; $("#go").hidden = false; $("#log").textContent = "Signed in."; }
  catch (e) { $("#log").textContent = e.message; }
});
$("#go").addEventListener("click", download);
api("GET", "/me").then(() => { $("#go").hidden = false; }).catch(() => { $("#signin").hidden = false; });

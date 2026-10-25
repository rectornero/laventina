// Guards against the 2026-10-25 incident: frequent scheduled jobs must not wake the paid database on every run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const FN = new URL("../netlify/functions/", import.meta.url);

// How many times an hour a cron line fires, roughly, from its minute field.
function perHour(cron) {
  const min = cron.trim().split(/\s+/)[0];
  if (min === "*") return 60;
  const step = min.match(/^\*\/(\d+)$/); if (step) return Math.ceil(60 / Number(step[1]));
  return min.split(",").length;
}

test("scheduled functions that run more than once an hour go through lib/wake.mjs", async () => {
  for (const f of await readdir(FN)) {
    if (!/\.m?[jt]s$/.test(f)) continue;
    const src = await readFile(new URL(f, FN), "utf8");
    const m = src.match(/schedule:\s*"([^"]+)"/); if (!m) continue;
    if (perHour(m[1]) > 1) assert.match(src, /lib\/wake\.mjs/, `${f} runs ${perHour(m[1])}× an hour: gate it with lib/wake.mjs so the database can sleep`);
  }
});

test("the page never polls the server more often than once a minute", async () => {
  const dir = new URL("../public/js/", import.meta.url);
  for (const f of await readdir(dir)) {
    const src = await readFile(new URL(f, dir), "utf8");
    for (const [, ms] of src.matchAll(/setInterval\([\s\S]{0,200}?,\s*(\d+)\s*\)/g)) assert.ok(Number(ms) >= 60000, `${f} polls every ${ms} ms`);
  }
});

test("Claude inside the app is off unless explicitly switched on", async () => {
  const src = await readFile(new URL("../lib/ai.mjs", import.meta.url), "utf8");
  assert.match(src, /LAVENTINA_AI === "on"/);
});

test("no scheduled function runs more often than every 5 minutes", async () => {
  for (const f of await readdir(FN)) {
    if (!/\.m?[jt]s$/.test(f)) continue;
    const m = (await readFile(new URL(f, FN), "utf8")).match(/schedule:\s*"([^"]+)"/); if (!m) continue;
    assert.ok(perHour(m[1]) <= 12, `${f} runs ${perHour(m[1])}× an hour`);
  }
});

test("production builds only happen on purpose", async () => {
  const toml = await readFile(new URL("../netlify.toml", import.meta.url), "utf8");
  assert.match(toml, /\[context\.production\][\s\S]*?ignore\s*=.*\[deploy\]/);
});

test("the page's minute check asks the cheap pulse before syncing", async () => {
  const src = await readFile(new URL("../public/js/base.js", import.meta.url), "utf8");
  assert.match(src, /\/pulse\?k=/);
});

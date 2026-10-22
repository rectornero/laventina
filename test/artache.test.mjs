import { test } from "node:test";
import assert from "node:assert/strict";
import { deployUpdate, setPoster } from "../lib/artache.mjs";
import handler from "../netlify/functions/deploy-succeeded.mjs";

const deploy = {
  context: "production",
  title: "Push notifications: morning nudge\n\nAdds a daily digest.\n\nCo-Authored-By: Someone <x@example.com>",
  ssl_url: "https://laventina.netlify.app",
  commit_url: "https://github.com/rectornero/laventina/commit/abc"
};
const run = (payload) => handler(new Request("https://laventina.test/.netlify/functions/deploy-succeeded", { method: "POST", body: JSON.stringify({ payload }) }));

test("a production deploy becomes a release update", () => {
  const u = deployUpdate(deploy);
  assert.equal(u.kind, "release");
  assert.equal(u.title, "Push notifications: morning nudge");
  assert.equal(u.body, "Adds a daily digest.\n\nLive at https://laventina.netlify.app.");
  assert.equal(u.url, deploy.commit_url);
});

test("previews, branch deploys and opted-out commits are not posted", () => {
  assert.equal(deployUpdate({ ...deploy, context: "deploy-preview" }), null);
  assert.equal(deployUpdate({ ...deploy, context: "branch-deploy" }), null);
  assert.equal(deployUpdate({ ...deploy, title: "Fix a typo [skip artache]" }), null);
  assert.equal(deployUpdate({ context: "production", title: "x".repeat(150) }).title.length, 100);
});

test("the deploy hook posts to Artache only when a token is set", async () => {
  const calls = [];
  setPoster(async (url, init) => { calls.push({ url, init }); return new Response("{}", { status: 201 }); });
  delete process.env.ARTACHE_TOKEN;
  await run(deploy);
  assert.equal(calls.length, 0);

  process.env.ARTACHE_TOKEN = "art_test";
  await run(deploy);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://artache.netlify.app/api/v1/posts");
  assert.equal(calls[0].init.headers.authorization, "Bearer art_test");
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.project, "rectornero/laventina");
  assert.equal(sent.kind, "release");

  setPoster(async () => new Response("nope", { status: 401 }));
  const res = await run(deploy);
  assert.equal(res.status, 200);
  delete process.env.ARTACHE_TOKEN;
});

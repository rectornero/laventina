# Laventina

See README.md for how the app is built, run and tested (`npm test`).

## Artache
This studio tracks its work in Artache. The `artache` MCP tools talk to it.
- No `artache` tools in this session (cloud sessions)? Use the same API over HTTPS with the `ARTACHE_TOKEN` environment variable: `curl -sS https://artache.netlify.app/api/v1/inbox?project=owner/repo -H "Authorization: Bearer $ARTACHE_TOKEN"` for the inbox, and POST JSON (`project`, `kind`, `title`, `body`, `url`, `brief_id`) to `/api/v1/posts` for updates. Briefs: POST `/api/v1/briefs/<id>` with `status`; replies: POST `/api/v1/replies`.
- At the start of a session, call `artache_inbox` with this repo's GitHub name to see briefs and studio replies for this project. Briefs come first: accept one with `artache_update_brief` before starting, say what blocks you in a reply, and mark it done with a `result_url` when finished. Answer studio replies with `artache_reply`.
- After meaningful progress (a feature or fix merged, a release or deploy, a milestone, a decision, or a question the team must answer), post one update with `artache_post_update` (with `brief_id` when it delivers a brief). Use this repo's GitHub name ("owner/repo") as `project`, or the folder name if there is no repo.
- Write the title for someone who didn't see the session (under 100 characters). In the body: what changed, why it matters, what's next. Add a `url` to the PR, deploy or doc when there is one.
- Use kind `release` for something shipped, `milestone` for a big step, `question` when you need a human decision, `note` for context, `update` otherwise.
- Don't post for trivial edits, failed attempts or work in progress with nothing to show. One update per meaningful result; check `artache_recent_updates` if unsure whether it was already posted.
- When you create or publish a platform, article or other work, record it with `artache_upsert_work` and a stable `key` like "owner/repo:article-slug", so later changes update the same item.

For this repo, `project` is `rectornero/laventina`. Every production deploy already posts a `release` update on its own (`netlify/functions/deploy-succeeded.mjs`, titled with the commit's first line), so don't post a separate "it's deployed" update; put `[skip artache]` in a commit message to keep a deploy out of the feed. Never print or commit an Artache token.

## Cost safety (Netlify credits): read before adding anything that runs on its own
On 2026-10-25 an every-minute scheduled function that queried the database kept Netlify Database awake around the clock and burned almost the whole month's credits (see /mnt/project-files/house-app/incidents/2026-10-25-netlify-credits.md). Nero's plan is metered and all their sites pause at zero. So:
- Never let a scheduled function, poller or loop touch the database on every run. Gate it on a cheap check (the Blobs notes in `lib/wake.mjs`, `lib/pulse.mjs`, `lib/daily.mjs`), or use delayed or event-driven scheduling instead of polling. `test/cost-guard.test.mjs` enforces this.
- Client polling is never faster than 60 seconds, runs only while the app is the window in front, and asks `/api/pulse` (Blobs, no database) before syncing. Any new write path must call `touch(hid)` from `lib/pulse.mjs` (writes through `/api` and MCP tools already do).
- No Netlify AI Gateway unless Nero approves it. In-app Claude stays off (`LAVENTINA_AI` unset); Claude reaches Laventina through the MCP link on Nero's own plan.
- Production deploys cost 15 credits. Work and test on the `next` branch (branch deploys are free) and batch changes into as few production deploys as possible. A push to `main` only builds when its head commit message contains `[deploy]` (the `ignore` rule in `netlify.toml`), so a merge meant to go live must say so. Ask Nero before any production deploy while credits are low.
- Before adding any schedule, polling or production deploy, estimate its monthly credits and say the number. Prices: production deploy 15 each; compute and database 10 per GB-hour (functions run at 1 GB; the database bills at least ~5 minutes per wake, about 0.85 credits, and about 10 per hour awake); bandwidth 20 per GB; web requests 2 per 10,000; AI Gateway 180 per USD.

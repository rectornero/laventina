# Laventina

See README.md for how the app is built, run and tested (`npm test`).

## Artache
This studio tracks its work in Artache. The `artache` MCP tools post there.
- After meaningful progress (a feature or fix merged, a release or deploy, a milestone, a decision, or a question the team must answer), post one update with `artache_post_update`. Use `rectornero/laventina` as `project`.
- Write the title for someone who didn't see the session (under 100 characters). In the body: what changed, why it matters, what's next. Add a `url` to the PR, deploy or doc when there is one.
- Use kind `release` for something shipped, `milestone` for a big step, `question` when you need a human decision, `note` for context, `update` otherwise.
- Don't post for trivial edits, failed attempts or work in progress with nothing to show. One update per meaningful result; check `artache_recent_updates` if unsure whether it was already posted.
- When you create or publish a platform, article or other work, record it with `artache_upsert_work` and a stable `key` like "rectornero/laventina:article-slug", so later changes update the same item.
- Every production deploy already posts a `release` update automatically (`netlify/functions/deploy-succeeded.mjs`), titled with the commit's first line. So don't post a separate "it's deployed" update; write commit headlines that read well in the feed, and put `[skip artache]` in a commit message to keep a deploy out of it.
- If the `artache` tools aren't available in a session, skip posting; never put an Artache token in the repo.

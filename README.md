# Laventina

A light task manager for a home shared by two (or more) people. One task list sits at the centre; the house helpers around it feed it:

- **Tasks**: Today, Upcoming and Lists. Quick add understands plain language: `water the plants every 3 days`, `dentist on 12 Nov 10:30`, `call the plumber tomorrow 9am #errands @sam !!`. Tasks can be assigned, left for anyone to claim, repeated, split into steps, or kept private.
- **Inventory**: things, rooms, photos, warranties, stock levels, room sweeps, and an insurance list export. Claude can read a photo of a shelf or a receipt.
- **Upkeep**: care plans suggested from the inventory. When a job comes due it appears as a task; ticking it logs the job and schedules the next one.
- **Projects**: steps are tasks (optionally in order), with budgets, a finishes ledger and a shared wishlist with votes.
- **Money & papers**: bills, contracts and documents turn into tasks (pay, renew or switch, still using it?, renew a document). Shared payments add up to a settle-up balance.

## How it runs

- `public/`: the web app, plain HTML, CSS and scripts (no build step).
- `netlify/functions/api.mjs`: the API at `/api/*` (sign-in, sync, tasks, records, files, Claude).
- `netlify/functions/daily.mjs`: a scheduled function that creates house tasks every morning.
- `netlify/functions/push-digest.mjs`: runs hourly and sends each device its morning "due today" notification at the hour it chose. `public/sw.js` shows notifications; assigning a task to someone pings their devices. On Sunday evenings it also sends a recap of the week.
- `netlify/functions/reminders.mjs`: runs every minute and sends the "remind me 5 / 10 / 30 minutes earlier" pings people set on timed tasks.
- Together features (`public/js/together.js`): the house bell (rings every other member's devices with an optional message), fridge notes on Today, and thank-yous on tasks someone else finished.
- Data lives in **Netlify Database** (managed Postgres, powered by Neon) through `@netlify/database`. The schema is the migrations in `netlify/database/migrations/`, which every deploy applies (`lib/schema.mjs` holds the same SQL for tests).
- `netlify/functions/deploy-succeeded.mjs`: after each production deploy, posts a release update to the Artache feed (needs `ARTACHE_TOKEN`; `[skip artache]` in the commit message skips one).
- Photos and scans live in **Netlify Blobs** and are only served to signed-in members of the household.

## Setting it up on Netlify

1. Create a Netlify site from this repository. No build settings are needed (`netlify.toml` has them).
2. The first deploy provisions the database and applies the migration, because `@netlify/database` is a dependency.
3. Make sure the site is public (Project configuration, Access control), so the people you invite can reach it.
4. Optional: add `ANTHROPIC_API_KEY` as an environment variable to turn on photo reading and Ask.
5. Push notifications need no setup: the app makes its own key pair on first use and keeps it in the database. To use your own pair instead, set both `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (and optionally `VAPID_SUBJECT`). On iPhone, notifications need Laventina added to the Home Screen first.
6. Optional: add `ARTACHE_TOKEN` (an `art_...` token from Artache Settings) so every production deploy posts to the Artache Updates feed under `rectornero/laventina`.
7. Open the site, choose **Start a household**, then send the invite code from Settings to the other person.

## Working on it locally

```sh
npm install
npm test                 # API tests against an in-memory Postgres
node dev/server.mjs      # the app on http://localhost:8888 with an in-memory database
```

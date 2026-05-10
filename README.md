# Marketing BI

Internal Salesforce attribution dashboard for the marketing team. Next.js 16 App Router on Vercel + Supabase Postgres + Drizzle + jsforce + ECharts.

Phase 1 scope, decisions, and trade-offs: [`.planning/phases/01-vertical-slice-auth-foundation/01-CONTEXT.md`](.planning/phases/01-vertical-slice-auth-foundation/01-CONTEXT.md).

---

## What ships in Phase 1

- Auth (email + password, invite-only, server-side `@orca-ai.io` domain trigger)
- `/dashboard/campaigns` — Campaign Contribution to SQLs bar chart, computed live from `raw.sf_*`
- Weekly Vercel Cron that pulls all 7 SF objects (`Contact`, `Account`, `Campaign`, `CampaignMember`, `Opportunity`, `OpportunityContactRole`, `Presentation__c`) into `raw.sf_*`
- `ops.contact_source_history` and `ops.campaigns_history` snapshot tables (Pitfall 6 / 16 — must exist from the first sync)
- Per-object watermarks + `ops.sync_runs` + `ops.sync_errors` + `ops.sync_object_stats`
- Dashboard shell: sidebar with all 5 future dashboards (Campaigns enabled, others "Coming soon"), header freshness pill (weekly thresholds: green &lt; 8d, yellow 8–15d, red &gt; 15d), user menu

---

## External setup checklist

These cannot be automated and must be done by you before the app works end-to-end.

### 1. Supabase project

1. Create a free Supabase project. Region: pick the same region as your Vercel deployment.
2. Project Settings → API:
   - Copy `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - Copy `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, NEVER expose to client)
3. Project Settings → Database → Connection pooling:
   - Copy the **Transaction** mode connection string (port 6543) → `DATABASE_URL`
   - Replace `[YOUR-PASSWORD]` with the DB password
4. Project Settings → Database → Connection string:
   - Copy the **Direct connection** string (port 5432) → `DIRECT_DATABASE_URL`
   - Used only by `pnpm db:migrate` from your laptop. Never used at runtime.
5. Apply migrations:
   ```bash
   pnpm db:migrate
   ```
   This creates the `raw`, `ops` schemas, all tables, the email-domain allowlist trigger on `auth.users`, and the profile-creation trigger that elevates `matias@orca-ai.io` to `role='admin'` on first sign-up.

### 2. Salesforce Connected App (JWT Bearer Flow)

1. Generate a self-signed cert + private key:
   ```bash
   openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
     -keyout sf-jwt.private.pem -out sf-jwt.public.crt \
     -subj "/CN=marketing-bi"
   ```
2. SF Setup → App Manager → New Connected App:
   - Name: "Marketing BI Sync"
   - Enable OAuth Settings: yes
   - Callback URL: `http://localhost:3000` (any value — JWT flow doesn't use it)
   - Use digital signatures: upload `sf-jwt.public.crt`
   - OAuth Scopes: `api`, `refresh_token, offline_access`, `Manage user data via APIs (api)`
   - Save. Copy the **Consumer Key** → `SF_CLIENT_ID`.
3. SF Setup → App Manager → your app → Manage → Edit Policies:
   - Permitted Users: "Admin approved users are pre-authorized"
4. SF Setup → Manage Connected Apps → your app → Profiles or Permission Sets:
   - Add the integration user's profile so they're pre-authorized.
5. Pick (or create) a dedicated integration user in SF. Copy the **username** → `SF_USERNAME`.
6. Verify Salesforce custom-field API names match `src/lib/sf/objects.ts`:
   - `Contact.Lifecycle_Stage__c`
   - `Contact.MQL_Date__c` / `SQL_Date__c` / `Opportunity_Date__c` / `Customer_Date__c`
   - `Contact.Original_Source__c` / `Latest_Source__c`
   - `Presentation__c.Contact__c` / `Status__c`

   If they differ, edit `src/lib/sf/objects.ts` to match. (Use `jsforce`'s `describe()` to list real names — there's a small REPL in the README troubleshooting section below.)
7. For local dev, save the private key as `sf-jwt.private.pem` at the repo root (gitignored).
   - For Vercel, paste the entire PEM (including `-----BEGIN PRIVATE KEY-----` lines) into `SF_PRIVATE_KEY`.

### 3. Vercel project

1. Import the GitHub repo into Vercel.
2. Settings → Environment Variables — add everything from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL` (port 6543 Supavisor transaction-mode pooler)
   - `SF_LOGIN_URL`, `SF_CLIENT_ID`, `SF_USERNAME`, `SF_PRIVATE_KEY`
   - `CRON_SECRET` — `openssl rand -base64 32`
   - `NEXT_PUBLIC_APP_URL`, `BUSINESS_TIMEZONE`, `ALLOWED_EMAIL_DOMAIN`, `FIRST_ADMIN_EMAIL`
3. Settings → Crons — confirm the weekly cron `0 6 * * 0` is registered (declared in `vercel.json`).
4. Deploy. Confirm `/login` loads.

### 4. Invite the first user

1. Supabase Studio → Authentication → Users → "Invite user".
2. Type `matias@orca-ai.io` and send. (Other addresses will be rejected by the allowlist trigger with "Cannot invite … — only @orca-ai.io email addresses are allowed.")
3. Open the invite email → click the link → land on `/auth/set-password` → set password → bounce to `/dashboard/campaigns`.

The trigger function `handle_new_auth_user` automatically elevates `matias@orca-ai.io` to `role='admin'` in `public.profiles`. Other invitees default to `role='end_user'`.

### 5. Trigger the first sync manually

The cron runs weekly (Sundays 06:00 UTC by default). To populate the chart immediately:

```bash
curl -X POST https://YOUR-DEPLOYMENT.vercel.app/api/cron/sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

Or from local dev:
```bash
pnpm dev   # in one terminal
CRON_SECRET=… curl -X POST http://localhost:3000/api/cron/sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

Watch the run: Supabase Studio → Table Editor → `ops.sync_runs`.

---

## Local dev

```bash
cp .env.example .env.local
# fill in real values
pnpm install
pnpm db:migrate     # apply migrations to your Supabase project
pnpm dev            # http://localhost:3000
```

### Verify SF custom-field API names (one-shot REPL)

Drop into a Node REPL with the env loaded:
```bash
node --env-file=.env.local --experimental-strip-types -e "
import('./src/lib/sf/jwt.ts').then(async ({ getJsforceConnection }) => {
  const c = await getJsforceConnection();
  const meta = await c.sobject('Contact').describe();
  console.log(meta.fields.filter(f => f.custom).map(f => f.name));
});
"
```

---

## Important constraints (don't change without re-reading research)

- **Edge runtime is forbidden anywhere DB or jsforce code runs.** Every Route Handler / Server Component that touches Postgres or Salesforce must `export const runtime = "nodejs"`. (`@jsforce/jsforce-node` and `postgres` use Node APIs.)
- **Supavisor transaction mode requires `prepare: false` and `max: 1`.** See `src/db/index.ts`. Direct port-5432 connections will exhaust the pool.
- **Snapshot tables (`ops.contact_source_history`, `ops.campaigns_history`) must run on every sync from the first run.** Pitfall 6 — HubSpot rewrites `Original Source`; if you skip a sync, history is permanently unrecoverable.
- **`queryAll` is required for Contact / Account / CampaignMember.** Pitfall 12 — soft-deletes must be mirrored, not silently dropped.
- **Bulk API 2.0 for CampaignMember.** Pitfall 1 — REST `query` will hit governor limits during admin trigger cascades.

See `.planning/research/PITFALLS.md` for the full list (30 items).

---

## Phase 1 timeline reality check

This phase pulled most of original Phase 2's sync infrastructure forward — the user explicitly chose live SF data over a seed fixture during discuss-phase. Realistic timeline: **2–3 weeks** for a clean first deploy, not the 1 week ROADMAP originally implied. The Phase 1 / Phase 2 boundary in `.planning/ROADMAP.md` needs to be updated to reflect this; see `.planning/phases/01-vertical-slice-auth-foundation/01-CONTEXT.md` §"Deferred Ideas" for the change list.

---

## Project planning

See `.planning/` for the full GSD workflow: `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `research/*`, and per-phase `phases/*/CONTEXT.md`.

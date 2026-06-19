# Enterprise AI Agent Hub

A multi-tenant SaaS for discovering, governing, and deploying AI agents across companies.
Built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, **Supabase**
(Postgres + Auth + Row Level Security), and a provider-agnostic AI layer (OpenAI / Anthropic /
Google) for agent suggestions.

The app starts **empty** and reads everything from Supabase. You (the provider/admin) create
companies (tenants) and assign users to them; each company's agents are isolated from every
other company by Postgres Row Level Security.

---

## What's inside

| Area | Route | Description |
| --- | --- | --- |
| **Auth** | `/login` | Email/password sign-in + sign-up (Supabase Auth). |
| **Dashboard** | `/` | Per-company fleet overview; "create a company" prompt for new admins. |
| **Library** | `/hub` | Catalog filterable by **creator**, **company**, category, status; shows who created each agent and when. |
| **Agent profile** | `/hub/[slug]` | Capabilities, connectors, version history, creator. |
| **Builder** | `/builder` | Create an agent (saved to Supabase with owner + company + connectors); high/restricted risk routes to governance. AI can draft a starting point. |
| **Role Match** | `/intake/role` | Describe a role; rank your live catalog (AI or local heuristic). |
| **Governance** | `/governance` | Review queue; reviewers/admins approve, reject, or request changes. |
| **Sessions** | `/sessions` | Per-company runtime session registry (populates once agent execution is added). |
| **Analytics** | `/analytics` | Agents by category, risk distribution, 14-day activity. |
| **Companies & users** | `/admin` | **Provider admin only.** Create companies, invite/assign users. |

**Data model (14 tables)** lives in `supabase/schema.sql` with enums, `SECURITY DEFINER`
helpers, audit triggers, an on-signup profile trigger, and RLS policies for per-company tenant
isolation.

---

## Roles & multi-tenancy

- **Global `app_role`** (on `profiles`): `admin` (provider), `builder`, `reviewer`, `member`.
  - Emails in `ADMIN_EMAILS` are auto-promoted to `admin` on login.
  - Users assigned to a company are set to `builder` so they can create agents.
- **Per-company `org_role`** (on `org_members`): `owner`, `manager`, `staff`.
- **Isolation:** agents, governance, sessions, analytics are all scoped by `organization_id`
  and enforced in Postgres via RLS — not just in the UI.
- The admin is auto-added as **owner** of every company they create, so they can manage and
  view all tenants.

---

## Prerequisites

- **Node.js ≥ 18.17** (`node --version`).
- A free **Supabase** project.
- *(Optional but recommended)* one AI API key (OpenAI / Anthropic / Google) for suggestions.

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Create the Supabase project + schema

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor** → paste and run **`supabase/migrate.sql`** — the one-shot
   rebuild script. It concatenates all 16 migrations in dependency order behind
   `STEP NN / 16` banners, so a fresh project is built in a single pass. (The
   individual files are still there if you prefer to run them one at a time, in
   the order listed at the top of `migrate.sql`.)
   - **Do NOT run `supabase/seed.sql`** — that is demo data, and you want to start empty.
   - `supabase/accounts_rollback.sql` is a teardown script — never run it on a fresh build.
3. **Auth → Providers → Email:** for the smoothest start, turn **"Confirm email" OFF** (so
   sign-up logs you straight in). Leave it on if you want email verification — users must then
   click the confirmation link before signing in, and inviting users requires email sending to
   be configured.

### 3. Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` (from Supabase → **Project Settings → API**):

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon key (safe for the browser; RLS enforces access). |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | **Server only.** Used for admin tasks (create company, invite users). Never expose to the browser. |
| `ADMIN_EMAILS` | ✅ | Comma-separated emails auto-promoted to admin. Put **your** email here. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` | optional | Any one enables AI suggestions. `AI_PROVIDER` optionally forces which one. |

`.env.local` is gitignored — never commit real keys.

### 4. Run

```bash
npm run dev          # http://localhost:3000
```

Other scripts: `npm run build`, `npm run start`, `npm run typecheck`, `npm run lint`.

---

## First-run walkthrough

1. Go to `/login` → **Sign up** with the email you listed in `ADMIN_EMAILS`. You're now an admin.
2. The Dashboard prompts you to **create a company** → go to `/admin`.
3. Create a company (e.g. "Acme"). You become its owner automatically.
4. **Assign users:** enter a teammate's email; if they already have an account they're added,
   otherwise they're invited by email. They land in that company as a `builder`.
5. Open the **Builder**, optionally click **Draft with AI**, pick **connectors**, set a risk
   tier, and save:
   - low/moderate → **published** straight to the Library;
   - high/restricted → **in review** in the Governance queue.
6. The **Library** shows every agent with its creator + date; filter by creator and company.
7. Switch the active company from the sidebar workspace selector. Create a second company and a
   second user to see tenant isolation — neither company can see the other's agents.

---

## Deploy to Vercel

1. Push to GitHub and import the repo in Vercel.
2. **Project → Settings → Environment Variables:** add the same variables as `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `ADMIN_EMAILS`, and your AI key).
3. In Supabase → **Authentication → URL Configuration**, add your Vercel domain to the allowed
   redirect/site URLs.
4. Deploy.

---

## AI suggestions & connectors

- **Suggestions** (`/api/suggest-agent`, `/api/recommendations`) use `lib/ai.ts`, which picks
  the provider from whichever API key is present. With no key, suggestions disable and Role
  Match falls back to a transparent local heuristic. Only task inputs are sent — never session
  transcripts.
- **Connectors** are chosen in the Builder from `lib/connectors.ts` and stored on the agent
  (`agents.connectors`). Execution is intentionally deferred — this release stores the intent.

---

## Security notes

- **RLS everywhere** — tenant isolation is enforced in Postgres.
- **No self-escalation** — a DB trigger blocks users from changing their own `app_role`; role
  changes happen server-side via the service role.
- **Service-role key stays server-side** — only used in API route handlers behind an admin check.
- **Audit trail** — triggers log writes to agents, versions, governance requests, and approvals.

---

## Project structure

```
agent-hub/
├─ middleware.ts                # session refresh + route protection
├─ app/
│  ├─ layout.tsx                # server auth shell (sidebar when signed in)
│  ├─ login/page.tsx            # sign in / sign up
│  ├─ page.tsx                  # dashboard
│  ├─ hub/                      # Library (list + [slug] profile)
│  ├─ builder/page.tsx          # agent builder → /api/agents
│  ├─ governance/               # review queue → /api/governance/[id]
│  ├─ sessions/                 # runtime sessions → /api/sessions/[id]
│  ├─ analytics/page.tsx
│  ├─ intake/                   # role match + corporate intake
│  ├─ admin/                    # provider: companies & users
│  └─ api/                      # agents, admin/orgs, admin/members, governance, sessions, org/switch, intake, suggest-agent, recommendations
├─ components/                  # sidebar, ui primitives
├─ lib/
│  ├─ auth.ts                   # session, profile, org resolution, admin checks
│  ├─ connectors.ts             # connector catalog
│  ├─ ai.ts                     # provider-agnostic AI layer
│  └─ supabase/                 # client, server, admin (service role), types
└─ supabase/
   ├─ migrate.sql               # run this — all 16 migrations combined, in order
   ├─ schema.sql                # migration 1 of 16 (foundation); rest are additive
   ├─ accounts_rollback.sql     # teardown — never run on a fresh build
   └─ seed.sql                  # demo data — do NOT run for a real app
```

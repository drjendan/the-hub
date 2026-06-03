# Enterprise AI Agent Hub

A production-shaped MVP for discovering, governing, and deploying AI agents across an
organization. Built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**,
**Supabase** (Postgres + Row Level Security), and an **OpenAI**-backed recommendation
endpoint with a transparent local fallback.

The UI ships with realistic demo data so it renders immediately — no database connection
required to explore it. Wiring it to a live Supabase project is a small, well-marked change
(see [Switching from demo data to live Supabase](#switching-from-demo-data-to-live-supabase)).

---

## What's inside

| Area | Description |
| --- | --- |
| **Dashboard** (`/`) | Fleet overview: deployed agents, governance queue, 14-day activity, status legend. |
| **Agent Hub** (`/hub`) | Searchable, filterable catalog of agents by category and status. |
| **Agent profile** (`/hub/[id]`) | Capabilities, tools, tags, and version history for a single agent. |
| **Role Match** (`/intake/role`) | Describe a role; get ranked agent recommendations (OpenAI or local heuristic). |
| **Corporate intake** (`/intake/corporate`) | Org setup: industry, size, data sensitivity → governance mode. |
| **Builder** (`/builder`) | Configure a new agent; high/restricted risk auto-routes to governance. |
| **Sessions** (`/sessions`) | Secure session registry with revoke action and a security-posture summary. |
| **Governance** (`/governance`) | Review queue: approve / request changes / reject with reviewer notes. |
| **Analytics** (`/analytics`) | Daily activity, risk distribution, deployments by category. |

**Data model (14 tables):** `organizations`, `profiles`, `org_members`,
`intake_submissions`, `roles`, `agents`, `agent_versions`, `recommendations`, `sessions`,
`session_messages`, `governance_requests`, `approvals`, `audit_logs`, `analytics_events`.

The schema includes Postgres enums, `SECURITY DEFINER` helper functions
(`is_org_member`, `current_app_role`, `can_review`), audit triggers, an `updated_at` touch
trigger, RBAC-oriented **Row Level Security** policies (per-org tenant isolation; admins and
builders write agents; reviewers and admins decide governance; users see their own sessions),
and a `v_agent_catalog` view.

---

## Prerequisites

- **Node.js ≥ 18.17** (Next 14 requirement). `node --version` to check.
- **npm** (ships with Node).
- A free **Supabase** project — only needed when you switch off demo data.
- *(Optional)* an **OpenAI API key** for live recommendations. Without one, the app uses a
  transparent local heuristic, so the feature still works.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file
cp .env.example .env.local
#    Fill in values (see Environment variables below). You can leave Supabase/OpenAI
#    blank for now — the UI runs on bundled demo data.

# 3. Run the dev server
npm run dev
```

Open <http://localhost:3000>. Every page is populated from `lib/demo-data.ts`.

Useful scripts:

```bash
npm run dev        # local dev server
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

---

## Environment variables

Copy `.env.example` → `.env.local` and fill in as needed:

| Variable | Required for | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Live data | From Supabase → Project Settings → API. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Live data | Public anon key. Safe for the browser; RLS enforces access. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin tasks | **Never** expose to the client. Server only. |
| `OPENAI_API_KEY` | Live recommendations | Omit to use the local heuristic fallback. |
| `OPENAI_MODEL` | Optional | Defaults to `gpt-4o-mini`. |

`.env.local` is gitignored. Do not commit real keys.

---

## Setting up the Supabase database

1. Create a project at <https://supabase.com>.
2. Open the **SQL Editor**.
3. Run **`supabase/schema.sql`** first (tables, enums, functions, triggers, RLS, view).
4. Run **`supabase/seed.sql`** next (one demo org, four users, seven agents, governance
   requests, ~240 analytics events). The seed is idempotent (`ON CONFLICT`), so it's safe to
   re-run.
5. Copy your project URL and keys into `.env.local`.

> The seed inserts rows into `auth.users` so foreign keys resolve in a fresh project. In a
> real deployment you'd create those users through Supabase Auth instead.

---

## Switching from demo data to live Supabase

The UI currently imports from `lib/demo-data.ts` so it renders without a backend. To go live,
swap those imports for Supabase queries. The clients are already configured:

- `lib/supabase/client.ts` — browser client (use in `"use client"` components).
- `lib/supabase/server.ts` — cookie-bound server client that respects RLS as the signed-in user.

Example — the dashboard agent list:

```ts
// Before (demo):
import { AGENTS } from "@/lib/demo-data";
const agents = AGENTS;

// After (live, in a Server Component):
import { createClient } from "@/lib/supabase/server";
const supabase = createClient();
const { data: agents } = await supabase
  .from("agents")
  .select("*")
  .order("created_at", { ascending: false });
```

Types for query results live in `lib/supabase/types.ts`. Because RLS is enforced, you'll also
want Supabase Auth wired up so `auth.uid()` resolves; until then, queries run as the anon role
and return only what anon policies permit.

---

## Recommendations API & data handling

`POST /api/recommendations` accepts a role profile plus a compact agent catalog and returns
ranked matches.

- When `OPENAI_API_KEY` is set, it calls OpenAI Chat Completions (default `gpt-4o-mini`) with
  `store: false` and sends **only** the role profile and a compact catalog — **no session
  history or message contents**.
- When the key is absent or the call fails, it falls back to a local heuristic
  (keyword + tool overlap) so the feature degrades gracefully and transparently.

OpenAI states that API data is not used to train its models unless you explicitly opt in.
See OpenAI's data controls: <https://platform.openai.com/docs/guides/your-data>.

---

## Security notes

- **RLS everywhere.** Tenant isolation is enforced in Postgres, not just the UI.
- **RBAC.** `admin`, `builder`, `reviewer`, and `member` roles gate writes, governance
  decisions, and visibility.
- **Audit trail.** Triggers record changes to agents, versions, governance requests, and
  approvals in `audit_logs`.
- **Sessions** are revocable and scoped per-session; the registry intentionally avoids
  surfacing raw IP addresses.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.

### Dependency advisory

`package.json` pins **Next.js 14.2.33**, the latest patched release on the 14.x line.
`npm audit` may still flag advisories that only resolve by upgrading to Next 16 (a major,
breaking change). For this MVP, staying on patched 14.x is intentional; plan the Next 16
migration separately before a production launch.

---

## Tech stack

- Next.js 14.2.33 (App Router) · React 18 · TypeScript 5
- Tailwind CSS 3
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- OpenAI Node SDK
- Fonts via `next/font/google` (Fraunces, Hanken Grotesk, JetBrains Mono) — fetched at build
  time, so the first build needs network access.

---

## Project structure

```
agent-hub/
├─ app/
│  ├─ page.tsx                  # Dashboard
│  ├─ layout.tsx                # Shell, fonts, sidebar
│  ├─ globals.css               # Design tokens
│  ├─ hub/page.tsx              # Catalog
│  ├─ hub/[id]/page.tsx         # Agent profile
│  ├─ intake/corporate/page.tsx # Org intake
│  ├─ intake/role/page.tsx      # Role match
│  ├─ builder/page.tsx          # Agent builder
│  ├─ sessions/page.tsx         # Secure sessions
│  ├─ governance/page.tsx       # Review queue
│  ├─ analytics/page.tsx        # Analytics
│  └─ api/recommendations/route.ts
├─ components/                  # sidebar, ui primitives
├─ lib/
│  ├─ demo-data.ts              # Bundled demo content
│  └─ supabase/                 # client, server, types
├─ supabase/
│  ├─ schema.sql                # 14 tables + RLS + functions
│  └─ seed.sql                  # Realistic demo data
└─ .env.example
```

---

## Push to GitHub

```bash
git init
git add .
git commit -m "Enterprise AI Agent Hub MVP"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

For subsequent updates:

```bash
git add .
git commit -m "Describe your change"
git push origin main
```

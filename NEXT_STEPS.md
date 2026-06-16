# Agent Hub — Next Steps / Roadmap

_Last updated: 2026-06-03_

Captured planned work. **Not yet built** — this is the backlog for upcoming sessions.

## Where things stand today (built & working)
- Multi-tenant app on Supabase: auth, provider admin (create companies, invite/assign users),
  per-company RLS isolation.
- Builder saves agents (owner + company + connectors); high/restricted risk → Governance queue.
- Library with creator/company filters; Dashboard, Analytics, Governance, Sessions wired live.
- AI suggestions via Gemini (`lib/ai.ts`).
- **Gmail integration (read-only):** Connect Gmail (OAuth) on an agent page → "Run on my inbox"
  → classifies recent emails as spam/not-spam. Tokens encrypted at rest. (Requires the user's
  Google Cloud OAuth client + `supabase/connections.sql`.)

---

## Feature 1 — Job-description intake → role-aware agent recommendations
**Goal:** paste a job description; the tool figures out which agents help that role and what to build.

- **Paste-a-JD box** on Role Match (`/intake/role`): AI parses the JD into role title,
  responsibilities, and tools (new route, reuses `lib/ai.ts`).
- **Recommend existing agents** from the catalog (already works via `/api/recommendations`).
- **Gap suggestions:** when no/few catalog agents fit, propose *agent types to build* for the
  role (e.g. "Resume Screener", "Interview Scheduler"), each with a **"Build this"** action that
  opens the Builder pre-filled (and can Draft-with-AI from there).
- Open question to decide: should "Build this" save in one click, or drop into the Builder to
  refine first?

## Feature 2 — Actionable automations (agents that *do*, not just classify)
**Goal:** turn agents from "analyze and report" into "take action automatically."

Core concept: each automation = **trigger → agent reasoning → action(s)**.
- **Actions via connectors** (the next layer beyond read-only):
  - Gmail `gmail.modify` upgrade: actually **label / move / archive** spam (one scope change +
    a label call on top of today's read flow).
  - Later: draft replies, create tickets (Zendesk/Jira), post to Slack, write to Drive, etc.
- **Triggers:**
  - **Scheduled** runs (e.g. "scan inbox every hour") — needs a scheduler (Vercel Cron or
    Supabase scheduled functions) + a run endpoint per automation.
  - **Event-based** later (e.g. on new email) — needs webhooks/push (Gmail watch + Pub/Sub).
- **Automation model / data:** new `automations` table (agent_id, trigger config, action config,
  enabled, schedule) + **run history / logs** so users see what happened and can audit.
- **Guardrails (important):** actions that change data are higher-risk → tie into the existing
  **Governance** + **risk tier** system (e.g. require approval before an automation can take
  destructive actions; dry-run / "suggest only" mode first).

## Supporting infrastructure these depend on
- **Connect-your-account install model** so *any* company's users can connect their own mailbox
  and use a shared agent (per-user `connections`, already started).
- **Google OAuth app verification** — required to move Gmail beyond test users to public use
  (security review; weeks). Until then: testing mode + test users, tokens refresh ~weekly.
- **Outlook / Microsoft 365** — same shape as Gmail but Azure app registration + Microsoft Graph
  API; add after Gmail actions work.
- **Token lifecycle** — handle refresh failures, reconnect prompts, revocation.

## Rough sequencing (suggested)
1. Finish Gmail **read** flow end-to-end (current task: user sets up Google Cloud OAuth).
2. **Feature 1** (JD intake + recommendations + build-this) — self-contained, high value, no new infra.
3. Gmail **`gmail.modify`** (label/move spam) — first real "action."
4. **Scheduled automations** + run history + governance guardrails.
5. **Outlook** connector.
6. **OAuth verification** for public/multi-user rollout.

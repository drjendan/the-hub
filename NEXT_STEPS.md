# Agent Hub — Next Steps / Roadmap

_Last updated: 2026-06-21_

This file reflects the **actual state of the code**, not just intentions. The
core multi-tenant platform is built and working; the items under "Still ahead"
are the genuine backlog.

---

## Built & working today

### Platform core (verified in code)
- **Authentication** — Supabase Auth with `lib/auth.ts` helpers, a DB trigger
  that auto-creates a `profiles` row on signup, `ADMIN_EMAILS` auto-promotion to
  global admin, and a self-escalation guard so users can't change their own role.
- **Company / tenant management** — `organizations` + `org_members` with per-org
  roles; provider-admin UI (`/admin`) and APIs to create companies and assign
  users; active-org switching. Every table is isolated by row-level security.
- **Agent creator / company attribution** — agents carry `owner_id` (creator) and
  `organization_id` (tenant); the `v_agent_catalog` view exposes the owner name.
- **Governance submission + approval** — creating a high/restricted-risk agent
  routes it to `in_review` and opens a `publish` governance request; reviewers
  approve/reject via `/api/governance/[id]`, flipping the agent to
  `published`/`blocked`. Audit trail + approvals tables back it.
- **Agent run route** — `/api/agents/[id]/run` runs an agent against the signed-in
  user's connected Gmail and classifies recent inbox mail as spam/not-spam
  (read-only). Handles encrypted token storage + refresh.
- **Demo data removed** — `lib/demo-data.ts` is gone; all pages read live from
  Supabase.

### Recently closed gaps (June 2026)
- **Execution governance gate** ✅ — the run route now refuses to execute any
  agent whose status isn't `published` (rejects `in_review`/`blocked`/`draft`/
  `deprecated` with a 403 before any provider or Gmail access). The approval
  queue now gates *execution*, not just catalog visibility.
- **BYOK — per-tenant API keys** ✅ — companies can store their own AI provider
  key (`org_provider_keys`, `supabase/provider_keys.sql`). Keys are encrypted at
  rest (AES-256-GCM, `lib/crypto.ts`); two-layer protection = owner-only RLS plus
  a column-level grant that withholds the ciphertext from browser roles, so reads
  return only a masked hint. An owner-only Settings page (`/settings`) validates a
  new key with a cheap provider test call before saving, and never returns or logs
  the key. Agent runs resolve the **tenant key first**, falling back to the
  platform key. (Default Gemini model is now `gemini-2.5-flash`.)

### Supporting infrastructure in place
- **Gmail connect (read-only OAuth)** — per-user `connections` with encrypted
  tokens; "Run on my inbox" flow.
- **Provider-agnostic AI layer** (`lib/ai.ts`) — OpenAI / Anthropic / Google
  behind one interface, with optional per-call key/model overrides (used by BYOK).
- **JD intake + recommendations** — corporate/role intake and `/api/recommendations`
  exist; see "Still ahead" for the remaining build-this/gap-suggestion polish.

---

## Connectors (Gmail + others) — deferred

**Decision:** connectors are a **phase-2 capability, deferred** until the core
platform is proven with the first client. Build the connectors clients actually
ask for once we know which ones those are.

- **Architecture already exists** — the Gmail connector (read-only OAuth flow,
  encrypted token storage, per-user `connections`, the "Run on my inbox" path) is
  built in code but is **NOT configured or enabled** in any live environment.
- **Enabling Gmail requires** (all external setup, no code change):
  - A Google Cloud project with an **OAuth app** configured.
  - The **Gmail API** enabled on that project.
  - A **redirect URI** registered for the live URL.
  - The `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `APP_URL`
    env vars set in **Vercel**.
- **Two tiers of access:**
  1. **Test-users mode** — works for a handful of manually-added Google accounts.
     Sufficient for a **demo**.
  2. **Full client use** — requires **Google app verification**: a weeks-long
     security review that needs a published **privacy policy** and **homepage**.

> The items under "Live connector execution" and "Agent sharing + embeddable
> triggers" below depend on this connector work and are deferred along with it.

---

## Still ahead (the real backlog)

### A. UI polish — branding + typography
- **"Powered by Nexx Jenn Tech" footer** across the app shell.
- **Inter font** pass — adopt Inter for the UI type scale and tidy the current
  font setup for a consistent, polished look.

### B. Live connector execution — actions beyond read-only (the larger phase)
The current Gmail flow only *reads and classifies*. The big next phase is agents
that **take action**:
- **Gmail `gmail.modify`** — actually label / move / archive spam (one OAuth scope
  upgrade + a label call on top of today's read flow). The first real "action."
- **Action guardrails** — data-changing actions are higher risk, so tie them into
  the existing governance + risk-tier system (require approval before an
  automation can take destructive actions; dry-run / "suggest only" mode first).
- **More connectors later** — draft replies, create tickets (Zendesk/Jira), post
  to Slack, write to Drive; then **Outlook / Microsoft 365** (Azure app + Graph).
- **Token lifecycle** — refresh-failure handling, reconnect prompts, revocation.
- **OAuth app verification** — required to move Gmail beyond test users to public,
  multi-user use (security review; weeks).

### C. Agent sharing + embeddable triggers (from the original plan)
- **Connect-your-account install model** so any company's users can connect their
  own mailbox and use a **shared** agent (per-user `connections` already started).
- **Embeddable / event triggers** — let an agent be invoked outside the dashboard
  (embed trigger, webhook, or per-automation run endpoint). When this lands, the
  new trigger path **must reuse the execution governance gate** (only `published`
  agents may run) and BYOK key resolution from the run route.
- **Scheduled runs** — e.g. "scan inbox every hour"; needs a scheduler (Vercel
  Cron or Supabase scheduled functions) + a run endpoint per automation.
- **Automation model / data** — an `automations` table (agent_id, trigger config,
  action config, enabled, schedule) + run history / logs so users can audit what
  happened.

### D. JD-intake finishing touches (smaller)
- **Gap suggestions** — when few catalog agents fit a role, propose *agent types
  to build* (e.g. "Resume Screener"), each with a **"Build this"** action that
  opens the Builder pre-filled.

### E. Audio/video recordings as agent input (future phase)
- The generic run path now takes pasted text + uploaded **.txt/.md/PDF** (PDF text
  extracted server-side via `unpdf`). **Audio/video recordings** (meeting calls,
  voice memos) are a separate later phase: they require **speech-to-text
  transcription** (e.g. Whisper / a hosted STT API) to turn the recording into a
  transcript, which then feeds the same run flow. Considerations: large file
  handling/streaming (well beyond the 4 MB request cap — needs direct-to-Storage
  upload + async processing), transcription cost/latency, and diarization.

---

## Rough sequencing (suggested)
1. **UI polish** (A) — fast, self-contained, improves every screen.
2. **Gmail `gmail.modify`** (B, first action) — the first agent that *does*.
3. **Scheduled automations + run history + governance guardrails** (C).
4. **Embeddable triggers + agent sharing** (C).
5. **Outlook connector**, then **OAuth verification** for public rollout (B).

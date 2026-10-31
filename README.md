# Raft Board 🦦

> **Otter Software Systems (OSS)**  
> *"Building software like no otter."*

Raft Board is an internal installable Progressive Web App (PWA) and weekly progress game for the 6-member student startup team. Members log tasks, earn XP, level up their otters, and track weekly and monthly leaderboards.

---

## Phase 1: Foundation (Auth, Roles, Self-Service & Approvals, App Shell, PWA)

- **Self-Service Registration**: Users register themselves at `/signup` with their full name, startup email, password (min 8 characters), desired role title, and the private **Team Join Code**.
- **Server-Side Validation & Rate Limiting**: The Team Join Code is validated exclusively on the server against `TEAM_JOIN_CODE`. Both `/signup` and `/login` endpoints feature IP-based rate limiting (HTTP 429).
- **Approval Workflow**: New accounts start with `status = 'pending'` and are restricted to the **Waiting for Approval** screen (`/pending-approval`). Row Level Security (RLS) strictly prevents pending users from reading or writing team progress data.
- **Bootstrap Super Admins**: Accounts with emails matching `BOOTSTRAP_ADMIN_EMAILS` (Christian and Railey) are automatically approved on sign-up as `active` Super Admins. Railey is automatically flagged with `is_treasurer = true`.
- **Pending Members Admin Console**: Super Admins can review pending requests at `/admin/pending`, designate official Role Titles, classify as Executive or Lead, toggle Super Admin and Treasurer flags, and approve or reject registrations.
- **Account Security**: Users choose their own password during sign-up; an optional "Change Password" form is available in `/settings`.
- **Meeting Cadence**: The Saturday meeting time (default `10:00 AM`, `Asia/Manila`) is stored dynamically in the database `settings` table.

---

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

### Required Configuration

| Variable | Description | Exposed to Browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | **Yes** (Client & Server) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon public API key | **Yes** (Client & Server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role secret key | **NO (Server ONLY)** |
| `TEAM_JOIN_CODE` | Secret code required to register (e.g. `OTTER-RAFT-2026`) | **NO (Server ONLY)** |
| `BOOTSTRAP_ADMIN_EMAILS` | Comma-separated emails auto-approved as Super Admins (e.g. `christian@otter.systems,railey@otter.systems`) | **NO (Server ONLY)** |
| `NEXT_PUBLIC_APP_URL` | Base app URL (`http://localhost:3000`) | **Yes** |
| `NEXT_PUBLIC_TIMEZONE` | Timezone (`Asia/Manila`) | **Yes** |
| `NEXT_PUBLIC_MEETING_WEEKDAY` | Meeting day (`Saturday`) | **Yes** |
| `NEXT_PUBLIC_MEETING_TIME` | Meeting time (`10:00 AM`) | **Yes** |

### Service Role Key Security Confirmation
The `SUPABASE_SERVICE_ROLE_KEY` does **not** carry the `NEXT_PUBLIC_` prefix. Next.js App Router completely strips non-public environment variables from all client-side bundles, guaranteeing that the service role key never reaches the browser. It is accessed exclusively in server-side API handlers (`src/lib/supabase/admin.ts`).

---

## Phase 2: My Week, Quick Picks, Extras, XP Rules, Levels & Rest Mode

- **My Week Dashboard (`/my-week`)**: Members view assigned tasks and personal extras, with one-tap status updates ("I'm doing", "🪨 Blocked", "I finished").
- **Database-Enforced XP Rules**:
  - Small: 10 XP, Medium: 30 XP, Big: 50 XP.
  - Weekly task XP cap of 150 XP per member. If a finished task would exceed 150 XP, only the remaining capacity is awarded.
  - +10 XP early cutoff bonus for the first task completed before the Saturday meeting cutoff each week.
  - Idempotent awarding and undo: marking a task unfinished voids its XP and recalculates the cap, re-evaluating the early bonus to the next eligible task.
  - Cutoff lock: after the Saturday cutoff in Asia/Manila, tasks of the closed week cannot be edited, finished, or deleted.
- **Extras Shelf**: Members add quick picks or custom tasks across Platforms, Marketing, Clients, Operations, Growth, and Other.
- **Otter Levels**: Pup (0 XP), Paddler (150 XP), Swimmer (450 XP), Diver (900 XP), Raft Leader (1,500 XP), Keystone (2,500 XP).
- **Rest Mode**: Up to 2 weeks per calendar month in Asia/Manila; waives weekly target and freezes streaks while still allowing members to earn XP.

---

## Phase 3: Team Dashboard, Leaderboard, Weekly Close & Monthly Season

- **Team Dashboard (`/team`)**:
  - Shows every active member with an instant visual indicator: **Updated** (green) vs **Not yet** (amber). "Updated" means the member moved a task off todo, added an Extra, or turned on Rest Mode this week.
  - Member Otter Level badges with total XP.
  - "Stuck on a rock" blocked task alerts displaying the blocker note so teammates can help.
  - Team Progress Chart displaying task distribution (Done, In Progress, Blocked, Todo) and aggregate team target completion percentage.
- **Weekly Leaderboard (`/leaderboard`)**:
  - **Scoring**: `weekly_score = (task_xp / target) * 100`, strictly capped at 120.00%. Task XP only (early bonus and kudos do not count).
  - **Top 3 Visibility & Privacy**: Top 3 ranks are visible to the entire team. Non-top-3 lead members see only their own rank and score, keeping other non-top-3 peers private. Executives and Super Admins see the full roster with raw metrics.
  - **Rest Mode Separation**: Resting members are shown in a dedicated section with targets waived, and are never ranked last or penalized.
  - **Tie-Breakers**: 1) Score DESC, 2) Tasks Finished DESC, 3) Earliest Update ASC, 4) Alphabetical by Name ASC.
- **Monthly Season & Top Otter (`/leaderboard` Season Tab)**:
  - Season score = Average of weekly scores in that month, **excluding Rest Mode weeks**. Members who rested all month are unranked.
  - Celebrates the #1 member as the **Top Otter** of the month with a golden champion showcase banner.
  - Month history dropdown and week-by-week score breakdown for each member.
- **Weekly Close Job & Scheduler**:
  - Automatically finalizes weekly scores into `week_scores`, snapshots the member's target at close, locks the week, opens the next week, and updates streaks.
  - When the last week of a month closes, calculates monthly season scores (`month_scores`) and names the Top Otter.
  - Powered by Supabase `pg_cron` (hourly schedule) with a manual **Run Close Now** button in the executive console for testing (guaranteed idempotent).

---

## Database Migrations

Apply migrations in order in Supabase SQL Editor:
1. `supabase/migrations/20261031000001_initial_schema.sql` (Profiles, settings, app shell)
2. `supabase/migrations/20261031000002_self_service_and_approvals.sql` (Self-service signup, approvals)
3. `supabase/migrations/20261101000001_phase2_weeks_tasks_xp.sql` (Weeks, tasks, quick picks, XP events, rest mode)
4. `supabase/migrations/20261101000003_phase2_verification_hardening.sql` (Recalculation, size edit blocking, active assign)
5. `supabase/migrations/20261101000004_phase3_leaderboard_close.sql` (week_scores, month_scores, close_week RPC, tie-breakers, RLS)

---

## How to Test Phase 3

Run the automated test suites:
```bash
# 1. Database scoring, 120% cap, tie-breakers, rest exclusion, target snapshot, idempotency:
node scripts/test-phase3-db-logic.mjs

# 2. Playwright E2E browser tests (Team page, Updated vs Not yet, Leaderboard privacy, Season):
node scripts/test-phase3-e2e.mjs
```

Or test manually in your browser:
1. **Team Dashboard (`/team`)**: Log in as a member. Verify your card says "Not yet". Add an Extra task or move an assigned task to "I'm doing" or mark it "Blocked". Refresh `/team`—verify your card now displays "Updated" (green), and any blocked task displays "Stuck on a rock" with your note.
2. **Leaderboard Privacy (`/leaderboard`)**: Log in as a Lead member. Verify you see the Top 3 podium with names and scores, and your personal rank card at the bottom, but cannot see other non-top-3 members' individual cards.
3. **Executive Full Roster**: Log in as an Executive (e.g. Railey COO). Verify you can see all team members, task XP, targets, and tasks finished.
4. **Manual Close Week**: In `/leaderboard` as an Executive, click **Run Close Now**. Verify the week is finalized, scores are snapshotted, the next week is opened, and running it again safely reports that the week is already closed.
5. **Monthly Season Tab**: Click **Monthly Season** on `/leaderboard`. Verify the Top Otter champion banner is displayed alongside monthly rankings and weekly breakdowns.

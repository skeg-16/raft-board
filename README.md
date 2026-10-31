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

## Database Migrations & Where to Change Meeting Time

### 1. Apply Schema Migrations
Run the SQL migration files in order in your Supabase SQL Editor:
1. `supabase/migrations/20261031000001_initial_schema.sql` (Creates `profiles`, `settings`, triggers)
2. `supabase/migrations/20261031000002_self_service_and_approvals.sql` (Adds `status`, `requested_role_title`, hardened RLS policies)

### 2. How to Change the Saturday Meeting Time
The meeting time is stored in the database `settings` table (row `id = 1`). You can change it in either of two ways:

- **Via Supabase Dashboard**: Go to **Table Editor** → click `settings` table → double-click `meeting_time` (or `meeting_weekday`) and update the value (e.g. `11:00 AM`).
- **Via SQL Editor**:
  ```sql
  update public.settings
  set meeting_time = '11:00 AM'
  where id = 1;
  ```

---

## How to Test

Run the automated E2E test suite:
```bash
node scripts/test-phase1-e2e.mjs
```

Or test manually in your browser:
1. **Invalid Code Rejection**: Visit `/signup` and enter an incorrect join code. Verify registration is blocked with a 403 error.
2. **Pending User Flow**: Register a standard member with code `OTTER-RAFT-2026`. Verify immediate redirection to `/pending-approval`. Try manually navigating to `/`, `/team`, or `/my-week`—verify you are immediately bounced back to `/pending-approval`.
3. **Bootstrap Admin Registration**: Register with `christian@otter.systems` or `railey@otter.systems`. Verify you are automatically approved as a Super Admin and land on Home.
4. **Member Approval**: As the Super Admin, navigate to `/admin/pending`, view the pending user, adjust their role classification and privilege flags, and click **Approve & Activate**.
5. **Approved Member Access**: Sign out and log in as the approved member. Verify full access to all tabs.
6. **Rate Limiting**: Attempt rapid invalid login attempts to verify HTTP 429 protection.

# Raft Board 🦦

> **Otter Software Systems (OSS)**  
> *"Building software like no otter."*

Raft Board is an internal installable Progressive Web App (PWA) and weekly progress game for the 6-member student startup team. Members log tasks, earn XP, level up their otters, and track weekly and monthly leaderboards.

---

## Phase 1: Foundation (Auth, Roles, App Shell, PWA Basics)

This phase establishes the foundational stack:
- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Supabase Auth, PostgreSQL schema, and Row Level Security (RLS) policies
- 6 seeded startup members with roles, super_admin flags, and treasurer flags
- Forced password change on initial login
- Invite-only authentication (no public self-registration)
- Mobile-first app shell with Otter branding and sticky bottom navigation
- PWA setup: Web app manifest, service worker (`/sw.js`), app icons, install banner prompt, and offline fallback (`/offline.html`)

---

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Populate the following variables with your Supabase credentials:

| Variable | Description | Exposed to Client |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (e.g. `https://xyz.supabase.co`) | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public API key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role secret key (used for seed script only) | **No** (Server only) |
| `NEXT_PUBLIC_APP_URL` | Base application URL (`http://localhost:3000` for local dev) | Yes |
| `NEXT_PUBLIC_TIMEZONE` | Timezone for the weekly cycle (`Asia/Manila`) | Yes |
| `NEXT_PUBLIC_MEETING_WEEKDAY` | Weekly meeting day (`Saturday`) | Yes |
| `NEXT_PUBLIC_MEETING_TIME` | Weekly meeting time (`10:00`) | Yes |

*(Note: If live Supabase credentials are not provided, Raft Board automatically runs in local demo mode so you can immediately preview and test the complete authentication and shell flows).*

---

## Database Setup & Migrations

### 1. Apply Schema Migration
Run the SQL migration in your Supabase SQL Editor:
- File: [`supabase/migrations/20261031000001_initial_schema.sql`](supabase/migrations/20261031000001_initial_schema.sql)

This creates:
- `public.profiles` table with role checks, super_admin flags, treasurer flags, and RLS policies.
- `public.settings` table storing the Saturday 10:00 AM meeting schedule in `Asia/Manila`.
- Automatic `updated_at` triggers and security definer functions.

### 2. Seed Team Members
You can seed the 6 team members using either:

**Option A (SQL Editor in Supabase):**
Run [`supabase/seed.sql`](supabase/seed.sql) in your Supabase Dashboard SQL Editor.

**Option B (TypeScript CLI Seed Script):**
```bash
npx tsx scripts/seed.ts
```

### Seeded Team Accounts:
Initial temporary password for all members: **`OtterPass2026!`**

1. **Samira Chen** — `coo@otter.systems`  
   *Chief Operating Officer* | Role: `executive` | Flags: `super_admin` (backup), `treasurer`
2. **Alex Rivera** — `cto@otter.systems`  
   *Chief Technology Officer* | Role: `executive` | Flags: `super_admin` (primary)
3. **Marcus Vance** — `cmo@otter.systems`  
   *Chief Marketing Officer* | Role: `executive`
4. **Chloe Santos** — `creatives@otter.systems`  
   *Creatives Lead* | Role: `lead`
5. **David Kim** — `backend@otter.systems`  
   *Backend Lead* | Role: `lead`
6. **Bea Alcantara** — `operations@otter.systems`  
   *Operations Lead* | Role: `lead`

---

## Local Development & Running

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## How to Test Phase 1

1. **Auth Route Protection:**
   - Navigate to `http://localhost:3000/` without an active session.
   - Verify you are automatically redirected to `http://localhost:3000/login`.
   - Verify there is **no public sign-up link** (invite-only).

2. **Login & Forced Password Change:**
   - On the login screen, select any member (e.g., `cto@otter.systems` or `backend@otter.systems`).
   - Log in with `OtterPass2026!`.
   - Verify you are redirected to `/change-password` because `must_change_password` is `true`.
   - Enter and confirm a new permanent password (at least 8 characters).
   - Verify successful redirect to the Home dashboard (`/`).

3. **Mobile-First App Shell & Navigation:**
   - Open DevTools mobile device mode (e.g., iPhone 14/15 or Pixel 7).
   - Test bottom navigation across all 5 views:
     - **Home (`/`)**: Hero greeting card, level indicator (Level 1: Pup), weekly status, Saturday meeting countdown.
     - **My Week (`/my-week`)**: Progress bar placeholder, task XP scale (10/30/50 XP), cutoff bonus info.
     - **Team (`/team`)**: Lists all 6 members partitioned into Executives and Leads, with Super Admin and Treasurer tags.
     - **Leaderboard (`/leaderboard`)**: Top 3 podium placeholders, lifetime level milestones, season scoring rules.
     - **Settings (`/settings`)**: Member profile details, meeting schedule, PWA installation guide, Sign Out button.

4. **Sign Out:**
   - Tap "Sign Out" in Settings. Verify session is cleared and you are redirected back to `/login`.

5. **PWA Installation & Offline Support:**
   - Test PWA manifest at `http://localhost:3000/manifest.json`.
   - Test service worker at `http://localhost:3000/sw.js`.
   - Test offline fallback at `http://localhost:3000/offline.html`.

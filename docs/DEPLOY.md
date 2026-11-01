# Production Deployment Guide & Checklist
## Otter Software Systems — Raft Board

This guide details the complete manual configuration checklist for **Supabase Dashboard** and **Vercel** production deployment.

---

## 1. Manual Supabase Dashboard Settings Checklist

Before deploying the Next.js application to Vercel, log into your [Supabase Dashboard](https://supabase.com/dashboard) and verify or configure each of the following settings:

### ☐ 1. JWT Access Token Expiry (15 to 30 Minutes)
- **Navigation**: `Project Settings` → `Authentication` → `JWT & Security` (or `Access Token Expiry`).
- **Configuration**: Set **Access token expiry** to **`900`** seconds (15 minutes), or at most **`1800`** seconds (30 minutes).
- **Purpose**: Limits the validity of stateless access tokens. When an admin revokes a session or signs a user out everywhere, any unexpired stateless token expires within 15 minutes, while database RLS policies immediately block access to sensitive tables.

### ☐ 2. Email Confirmation Enabled
- **Navigation**: `Authentication` → `Providers` → `Email`.
- **Configuration**: Ensure **"Confirm email"** is toggled **ON**.
- **Purpose**: Prevents unauthorized account activation. Normal members remain in `pending` status until email confirmation and admin approval. Bootstrap super admins defined in `BOOTSTRAP_ADMIN_EMAILS` are auto-promoted to active Super Admins **only after** their email address is confirmed.

### ☐ 3. Multi-Factor Authentication (TOTP MFA)
- **Navigation**: `Authentication` → `Multi-Factor Authentication`.
- **Configuration**: 
  - Ensure **TOTP** is toggled **ON**.
  - Set **Max enrolled factors per user** to at least **`10`**.
- **Purpose**: Super Admins are strictly barred from the `/admin` console, `/admin/*` pages, and all 10 `/api/admin/*` endpoints until they enroll in TOTP and achieve Authenticator Assurance Level 2 (`aal2`).

### ☐ 4. pg_cron Extension Enabled (Weekly Close Automation)
- **Navigation**: `Database` → `Extensions`.
- **Configuration**: Search for `pg_cron` and toggle **ON** (installed).
- **Verification**: Run the following query in the SQL Editor to confirm the 1-minute close checker is scheduled:
  ```sql
  SELECT jobid, schedule, command, active FROM cron.job WHERE jobname = 'raft_weekly_close_checker';
  ```
  *(If missing, run migration `supabase/migrations/20261101000007_weekly_close_refinements.sql`)*.

### ☐ 5. Site URL and Redirect URLs
- **Navigation**: `Authentication` → `URL Configuration`.
- **Configuration**:
  - **Site URL**: `https://your-production-domain.vercel.app` (or your custom apex domain `https://raft.otter.systems`).
  - **Redirect URLs** (Add all of the following):
    - `https://your-production-domain.vercel.app/auth/callback`
    - `https://your-production-domain.vercel.app/admin/mfa/enroll`
    - `https://your-production-domain.vercel.app/pending-approval`
    - `http://localhost:3000/auth/callback` *(for local development & testing)*

### ☐ 6. Custom SMTP Provider (Mandatory for Production)
- **Navigation**: `Project Settings` → `Authentication` → `Custom SMTP`.
- **Configuration**: Toggle **Enable Custom SMTP** and connect a reliable email provider (Resend, SendGrid, Amazon SES, or Postmark):
  - **Sender email**: `noreply@yourdomain.com`
  - **Sender name**: `Otter Raft Systems`
  - **Host, Port (587), Username, and Password** from your SMTP provider.
- **Purpose**: Supabase's built-in default mail service is restricted to a low hourly rate limit (~3 emails/hour), which causes signup confirmation and password reset emails to fail under normal production usage.

---

## 2. Complete Vercel Environment Variables List

Configure all of the following variables in **Vercel Project Settings → Environment Variables**:

| Variable Name | Exposure | Required Environment | Description & Instructions | Example Value |
| :--- | :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public (Browser & Server) | Production, Preview, Development | The HTTPS URL of your Supabase project. Found under `Project Settings` → `API`. | `https://abcdefghijklm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (Browser & Server) | Production, Preview, Development | The anonymous client API key. Found under `Project Settings` → `API`. | `eyJhbGciOiJIUzI1Ni...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret (Server Only)** | Production, Preview, Development | **CRITICAL SECURITY SECRET**: The elevated service role key used by server-side routes for user approvals, revocation, and system administration. **NEVER prefix with `NEXT_PUBLIC_`.** | `eyJhbGciOiJIUzI1Ni...` |
| `NEXT_PUBLIC_APP_URL` | Public (Browser & Server) | Production, Preview | The canonical public URL of your application. Used for absolute callback and redirect URLs. | `https://raft.otter.systems` |
| `CRON_SECRET` | **Secret (Server Only)** | Production, Preview | High-entropy secret token passed in `Authorization: Bearer <CRON_SECRET>` headers to protect `/api/tasks/close-week` daily fallback runs. | `openssl rand -hex 32` |
| `IP_HASH_SECRET` | **Secret (Server Only)** | Production, Preview | Server-side secret used for HMAC-SHA256 anonymization of client IP addresses in login logs. Prevents rainbow table deanonymization. | `openssl rand -hex 32` |
| `TEAM_JOIN_CODE` | **Secret (Server Only)** | Production, Preview, Development | **SERVER-ONLY SECRET**: The registration passcode required at `/signup`. Validated exclusively on the server and **never exposed in the client bundle**. | `OTTER-RAFT-2026` |
| `BOOTSTRAP_ADMIN_EMAILS` | **Secret (Server Only)** | Production, Preview, Development | Comma-separated list of founding executive emails. Users signing up with these emails are automatically promoted to active Super Admins **only after email confirmation**. Users with "railey" in the email automatically receive `is_treasurer = true`. | `christian@otter.systems,railey@otter.systems` |
| `NODE_ENV` | System (Server Only) | Production | Set automatically to `production` by Vercel. | `production` |

---

## 3. Database Migration Deployment Order

Ensure all migrations in `supabase/migrations/` have been executed against your production Supabase database:
1. `20261031000001_initial_schema.sql`
2. `20261031000002_self_service_and_approvals.sql`
3. `20261101000001_phase2_weeks_tasks_xp.sql`
4. `20261101000002_phase2_triggers_and_backfills.sql`
5. `20261101000003_phase2_verification_hardening.sql`
6. `20261101000004_phase3_leaderboard_close.sql`
7. `20261101000005_phase3_tiebreaker_order.sql`
8. `20261101000006_phase3_privacy_and_access_hardening.sql`
9. `20261101000007_weekly_close_refinements.sql`
10. `20261101000008_minute_cron_and_cutoff_safety.sql`
11. `20261101000009_safety_fixes_settings_and_audit.sql`
12. `20261101000010_audit_logs_append_only_and_settings_constraints.sql`
13. `20261101000011_phase4_super_admin_security.sql`
14. `20261101000012_phase4_hardening.sql`
15. `20261101000013_session_revocation_db_check.sql`

---

## 4. Post-Deployment Verification Steps

1. **Bootstrap Admin Registration**:
   - Navigate to `/signup`.
   - Register using one of the emails defined in `BOOTSTRAP_ADMIN_EMAILS` with the correct `TEAM_JOIN_CODE`.
   - Confirm your email address via the received link.
   - Verify that logging in directs you to `/admin/mfa/enroll`.
2. **2FA Enrollment**:
   - Scan the QR code with your authenticator app (Google Authenticator, 1Password, or Authy).
   - Enter the 6-digit TOTP code.
   - Confirm you are granted access to `/admin` and `/admin/users`.
3. **Normal Member Signup**:
   - Register a dummy member account.
   - Confirm email and verify the account enters `Pending` state.
   - Approve the member in the Super Admin Console (`/admin/users` or `/admin/pending`).
4. **Vercel Cron Fallback**:
   - In Vercel Project Settings → Crons, verify `/api/tasks/close-week` is recognized from `vercel.json`.

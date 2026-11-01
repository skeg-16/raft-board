# Super Admin Multi-Factor Authentication (2FA) Emergency Recovery Runbook

> **Otter Software Systems (OSS)**  
> **Document Ref**: `OSS-SEC-RUNBOOK-004`  
> **Classification**: Restricted / System Administration  

---

## 1. Overview & Threat Context

In Raft Board, Two-Factor Authentication (TOTP via Supabase MFA) is **strictly mandatory** for all Super Admins. Every administrative API route (`/api/admin/*`), administrative page (`/admin/*`), and database stored procedure requires an active `aal2` (Authenticator Assurance Level 2) session.

### Normal Recovery (Single Admin Lockout)
When a single Super Admin loses their device or authenticator app, **any other active Super Admin** can remove the locked-out admin's factor directly from the Super Admin Console at `/admin/users` (or via `POST /api/admin/users/[id]/reset-2fa`). The database prevents self-recovery; a second Super Admin is required, and the action is immutably recorded in `public.audit_logs`.

### Catastrophic Break-Glass Scenario (Total 2FA Loss)
If **every Super Admin** loses access to their 2FA factors simultaneously (e.g., lost physical hardware, catastrophic authenticator data loss), no administrator can reach the web console. This document defines the emergency procedure to break glass and restore access using direct database administrator credentials.

---

## 2. Prerequisites & Access Requirements

To execute this recovery procedure, you must have access to:
1. The **Supabase Dashboard** (SQL Editor) for the project, **OR**
2. Direct connection to the Postgres database via `psql` or Supabase CLI using database administrator credentials:
   ```bash
   psql "postgres://postgres:[DB-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
   ```

---

## 3. Emergency Break-Glass Execution (Step-by-Step)

### Step 1: Identify the Designated Super Admin
Identify the UUID and email of the primary Super Admin whose factor will be reset:

```sql
select 
  p.id, 
  p.full_name, 
  p.role_title, 
  p.is_super_admin, 
  p.mfa_enabled, 
  p.mfa_enrolled_at,
  u.email
from public.profiles p
join auth.users u on u.id = p.id
where p.is_super_admin = true and p.status = 'active';
```

---

### Step 2: Remove MFA Factors from Supabase Auth
Delete the registered TOTP factors in Supabase's `auth` schema for the target administrator:

```sql
-- Replace <TARGET_ADMIN_UUID> with the actual UUID from Step 1
delete from auth.mfa_factors
where user_id = '<TARGET_ADMIN_UUID>';
```

---

### Step 3: Reset Profile 2FA Flags in `public.profiles`
Reset the application-level MFA enrollment flags so the application knows the admin needs to re-enroll:

```sql
update public.profiles
set 
  mfa_enabled = false,
  mfa_enrolled_at = null,
  updated_at = now()
where id = '<TARGET_ADMIN_UUID>';
```

---

### Step 4: Revoke Existing Auth Sessions & Tokens
Force revocation of all existing sessions and refresh tokens to prevent replay of stale tokens:

```sql
-- Revoke refresh tokens and sessions from auth schema
delete from auth.refresh_tokens
where session_id in (select id from auth.sessions where user_id = '<TARGET_ADMIN_UUID>');

delete from auth.sessions
where user_id = '<TARGET_ADMIN_UUID>';

-- Clear application active sessions tracking
delete from public.active_sessions
where user_id = '<TARGET_ADMIN_UUID>';
```

---

### Step 5: Record Immutable Break-Glass Audit Row
Because `public.audit_logs` is append-only, log the emergency break-glass action directly to maintain an unbroken audit trail:

```sql
insert into public.audit_logs (user_id, action, details, created_at)
values (
  '<TARGET_ADMIN_UUID>',
  'emergency_break_glass_mfa_reset',
  jsonb_build_object(
    'reason', 'Catastrophic total 2FA loss runbook executed',
    'executor', current_user,
    'channel', 'Direct SQL Administration',
    'target_admin', '<TARGET_ADMIN_UUID>'
  ),
  now()
);
```

---

## 4. Post-Recovery Verification Runbook

1. **Log In**: The designated Super Admin navigates to `/login` and enters their email and password.
2. **Mandatory 2FA Enrollment**: Because the user is a Super Admin and `mfa_enabled = false`, the server automatically redirects them to `/admin/mfa/enroll`.
3. **Scan New QR Code**: The admin opens an authenticator app (Google Authenticator, Authy, 1Password) and registers the newly generated TOTP factor.
4. **Verify TOTP Code**: The admin submits the 6-digit code. Supabase Auth validates the code and upgrades the session from `aal1` to `aal2`.
5. **Console Restored**: The admin is granted full access to the Super Admin Console at `/admin/users`.
6. **Recover Secondary Admins**: The recovered Super Admin can now click "Reset 2FA" on other locked-out team members from the UI, allowing them to re-enroll cleanly.
7. **Security Incident Review**: Run the following query to review the audit trail and confirm all steps completed cleanly:
   ```sql
   select * from public.audit_logs order by created_at desc limit 10;
   ```

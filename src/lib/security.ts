import crypto from 'crypto';
import { getStores } from '@/lib/tasks';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRevocationStore, revokeToken, isTokenRevoked, isSessionActiveInDb } from '@/lib/revocation';
import type { LoginLog, ActiveSession } from '@/types/database';

export { revokeToken, isTokenRevoked, isSessionActiveInDb, getRevocationStore };

/**
 * Anonymize IP address: HMAC-SHA256 using a server-only secret.
 * NEVER uses plain SHA-256 or unkeyed hashes.
 */
export function anonymizeIp(ip?: string | null): string {
  if (!ip || ip === 'unknown') return '0.0.0.0-unknown';
  const cleanIp = ip.trim();
  const secret =
    process.env.IP_HASH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'otter-raft-default-server-hmac-secret-never-plain';

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(cleanIp);
  return hmac.digest('hex').substring(0, 16);
}

/**
 * Deep sanitization helper: ensures no logs, errors, or audit rows
 * ever contain passwords, TOTP codes, secrets, or tokens.
 */
export function sanitizeSensitiveData(input: any): any {
  if (!input) return input;
  if (typeof input === 'string') {
    return input
      .replace(/bearer\s+[a-zA-Z0-9\-_.]+/gi, 'Bearer [REDACTED]')
      .replace(/eyJ[a-zA-Z0-9\-_.]+/g, '[REDACTED_JWT]');
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeSensitiveData(item));
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized: Record<string, any> = {};
    for (const [key, val] of Object.entries(input)) {
      if (/password|passwd|code|totp|secret|token|credential|jwt|cookie|auth_key/i.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeSensitiveData(val);
      }
    }
    return sanitized;
  }
  return input;
}

// User-Agent parser for human-friendly device/browser descriptions
export function parseUserAgent(uaString?: string | null): string {
  if (!uaString) return 'Unknown Device';
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';

  if (uaString.includes('Firefox')) browser = 'Firefox';
  else if (uaString.includes('Edg/')) browser = 'Edge';
  else if (uaString.includes('Chrome')) browser = 'Chrome';
  else if (uaString.includes('Safari')) browser = 'Safari';

  if (uaString.includes('Windows')) os = 'Windows';
  else if (uaString.includes('Mac OS') || uaString.includes('Macintosh')) os = 'macOS';
  else if (uaString.includes('Android')) os = 'Android';
  else if (uaString.includes('iPhone') || uaString.includes('iPad')) os = 'iOS';
  else if (uaString.includes('Linux')) os = 'Linux';

  return `${browser} on ${os}`;
}

// Record login attempts (both successful and failed) to public.login_logs
export async function recordLoginLog(params: {
  userId?: string | null;
  email: string;
  status: 'success' | 'failed';
  ip: string;
  userAgent?: string | null;
  failureReason?: string | null;
}): Promise<LoginLog> {
  const ipHash = anonymizeIp(params.ip);
  const deviceBrowser = parseUserAgent(params.userAgent);
  const sanitizedReason = params.failureReason ? sanitizeSensitiveData(params.failureReason) : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data, error } = await (admin.from('login_logs') as any)
      .insert({
        user_id: params.userId || null,
        email: params.email,
        status: params.status,
        ip_hash: ipHash,
        user_agent: params.userAgent || null,
        device_browser: deviceBrowser,
        failure_reason: sanitizedReason,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (!error && data) return data as LoginLog;
  }

  // Local in-memory store
  const { loginLogs } = getStores();
  const id = `login-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const entry: LoginLog = {
    id,
    user_id: params.userId || null,
    email: params.email,
    status: params.status,
    ip_hash: ipHash,
    user_agent: params.userAgent || null,
    device_browser: deviceBrowser,
    failure_reason: sanitizedReason,
    created_at: new Date().toISOString(),
  };

  loginLogs.set(id, entry);
  return entry;
}

// Track active sessions per user
export async function createActiveSession(
  userId: string,
  ip: string,
  userAgent?: string | null,
  sessionToken?: string
): Promise<ActiveSession> {
  const ipHash = anonymizeIp(ip);
  const deviceBrowser = parseUserAgent(userAgent);
  const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  if (sessionToken) {
    const { userActiveTokens } = getRevocationStore();
    if (!userActiveTokens.has(userId)) {
      userActiveTokens.set(userId, new Set());
    }
    userActiveTokens.get(userId)!.add(sessionToken);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data } = await (admin.from('active_sessions') as any)
      .insert({
        user_id: userId,
        session_id: sessionId,
        device_browser: deviceBrowser,
        ip_hash: ipHash,
        last_active_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (data) return data as ActiveSession;
  }

  const { activeSessions } = getStores();
  const session: ActiveSession = {
    id: sessionId,
    user_id: userId,
    session_id: sessionId,
    device_browser: deviceBrowser,
    ip_hash: ipHash,
    last_active_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  activeSessions.set(sessionId, session);
  return session;
}

/**
 * Revoke REAL Supabase Auth sessions, refresh tokens, and active_sessions table.
 * Used by "Sign Out Everywhere", "Deactivate User", and "Force Password Reset".
 */
export async function revokeUserAuthSessions(userId: string): Promise<void> {
  const revocationTimestamp = Date.now();
  const { userRevocations, userActiveTokens, revokedTokens } = getRevocationStore();
  userRevocations.set(userId, revocationTimestamp);

  // Invalidate any active tokens registered for this user
  if (userActiveTokens.has(userId)) {
    const tokens = userActiveTokens.get(userId)!;
    for (const t of tokens) {
      revokedTokens.add(t);
    }
    userActiveTokens.delete(userId);
  }

  // Clear active_sessions table in database / store
  await invalidateActiveSessions(userId);

  // Revoke in real Supabase Auth
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    try {
      await (admin as any).rpc('admin_revoke_user_sessions', { p_user_id: userId });
    } catch {
      try {
        await (admin.from('auth.sessions') as any).delete().eq('user_id', userId);
      } catch {
        // Table may be in protected schema
      }
    }
    try {
      await (admin.from('profiles') as any)
        .update({ sessions_revoked_before: new Date().toISOString() })
        .eq('id', userId);
    } catch {
      // Ignore if column not present yet
    }
    try {
      await admin.auth.admin.signOut(userId, 'global');
    } catch {
      // Ignore if not present
    }
  }

  // Update profile in local runtime store if present
  try {
    const { getRuntimeUserStore } = await import('@/lib/auth');
    const store = getRuntimeUserStore();
    const profile = store.get(userId);
    if (profile) {
      (profile as any).sessions_revoked_before = new Date().toISOString();
      store.set(userId, profile);
    }
  } catch {
    // Ignore in edge/isolated environments
  }
}


// Invalidate / Sign out user everywhere (active_sessions table)
export async function invalidateActiveSessions(userId: string): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    await (admin.from('active_sessions') as any).delete().eq('user_id', userId);
  }

  const { activeSessions } = getStores();
  for (const [id, s] of activeSessions.entries()) {
    if (s.user_id === userId) {
      activeSessions.delete(id);
    }
  }
}

// Fetch active sessions for a user
export async function getUserActiveSessions(userId: string): Promise<ActiveSession[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data } = await (admin.from('active_sessions') as any)
      .select('*')
      .eq('user_id', userId)
      .order('last_active_at', { ascending: false });
    return (data as ActiveSession[]) || [];
  }

  const { activeSessions } = getStores();
  return Array.from(activeSessions.values())
    .filter((s) => s.user_id === userId)
    .sort((a, b) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime());
}

// Fetch login logs
export async function getLoginLogs(limit = 100): Promise<LoginLog[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data } = await (admin.from('login_logs') as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data as LoginLog[]) || [];
  }

  const { loginLogs } = getStores();
  return Array.from(loginLogs.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

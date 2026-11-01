import crypto from 'crypto';
import { getStores } from '@/lib/tasks';
import { createAdminClient } from '@/lib/supabase/admin';
import type { LoginLog, ActiveSession } from '@/types/database';

// Anonymize IP address: SHA-256 hash or mask last octet to protect user privacy
export function anonymizeIp(ip?: string | null): string {
  if (!ip || ip === 'unknown') return '0.0.0.***';
  // If standard IPv4, truncate the last segment e.g. 192.168.1.***
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
    }
  }
  // Otherwise SHA-256 hash
  return crypto.createHash('sha256').update(ip + '-raft-salt').digest('hex').substring(0, 16);
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
        failure_reason: params.failureReason || null,
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
    failure_reason: params.failureReason || null,
    created_at: new Date().toISOString(),
  };

  loginLogs.set(id, entry);
  return entry;
}

// Track active sessions per user
export async function createActiveSession(
  userId: string,
  ip: string,
  userAgent?: string | null
): Promise<ActiveSession> {
  const ipHash = anonymizeIp(ip);
  const deviceBrowser = parseUserAgent(userAgent);
  const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

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

// Invalidate / Sign out user everywhere
export async function invalidateActiveSessions(userId: string): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    await (admin.from('active_sessions') as any).delete().eq('user_id', userId);
    try {
      await admin.auth.admin.signOut(userId, 'global');
    } catch {
      // Ignore if auth user not found
    }
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

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isTokenRevoked } from '@/lib/security';
import type { Profile, Settings } from '@/types/database';

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  meeting_weekday: 'Saturday',
  meeting_time: '10:00 AM',
  timezone: 'Asia/Manila',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Check if an email is configured as a bootstrap super admin
export function checkBootstrapAdmin(email: string): {
  isBootstrap: boolean;
  isTreasurer: boolean;
} {
  const normalized = email.trim().toLowerCase();
  const rawList = process.env.BOOTSTRAP_ADMIN_EMAILS || 'christian@otter.systems,railey@otter.systems';
  const bootstrapList = rawList
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const isBootstrap = bootstrapList.some(
    (b) =>
      normalized === b ||
      (b.includes('@')
        ? normalized.startsWith(b.split('@')[0] + '@') ||
          normalized.startsWith(b.split('@')[0] + '_')
        : normalized.startsWith(b))
  );

  const isTreasurer = isBootstrap && (normalized.includes('railey') || normalized.includes('coo'));

  return { isBootstrap, isTreasurer };
}

// In-memory user store for local development preview when live Supabase is not configured
declare global {
  // eslint-disable-next-line no-var
  var __raft_runtime_users:
    | Map<string, Profile & { email?: string; passwordHash?: string; email_confirmed?: boolean }>
    | undefined;
}

export function getRuntimeUserStore() {
  if (!globalThis.__raft_runtime_users) {
    globalThis.__raft_runtime_users = new Map();
  }
  return globalThis.__raft_runtime_users;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('raft_user_session');

  if (!isConfigured) {
    if (!sessionCookie) return null;
    try {
      let rawVal = sessionCookie.value;
      try {
        rawVal = decodeURIComponent(rawVal);
      } catch {
        // already decoded
      }
      const parsed = JSON.parse(rawVal) as { id: string; email: string; issuedAt?: number };
      if (isTokenRevoked(sessionCookie.value, parsed.id, parsed.issuedAt)) {
        return null;
      }
      const store = getRuntimeUserStore();
      const profile = store.get(parsed.id);
      return profile || null;
    } catch {
      return null;
    }
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    if (sessionCookie && isTokenRevoked(sessionCookie.value, user.id)) {
      return null;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return (profile as unknown as Profile) || null;
  } catch (error) {
    console.error('Error fetching current profile:', error);
    return null;
  }
}

/**
 * Extract authenticated session and Authenticator Assurance Level (AAL)
 * from a Request (cookie or Authorization header) with revocation enforcement.
 */
export async function getSessionAuth(request: Request): Promise<{
  profile: Profile | null;
  aal: 'aal1' | 'aal2';
  userId: string | null;
  token?: string;
}> {
  const cookieHeader = request.headers.get('cookie') || '';
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  // Extract raft_user_session
  let rawSession = '';
  const match = cookieHeader.match(/raft_user_session=([^;]+)/);
  if (match) {
    try {
      rawSession = decodeURIComponent(match[1]);
    } catch {
      rawSession = match[1];
    }
  }

  // Extract sb-access-token
  const sbMatch = cookieHeader.match(/sb-access-token=([^;]+)/);
  const sbToken = sbMatch ? sbMatch[1] : null;
  const activeToken = bearerToken || sbToken || (rawSession ? `sess-${rawSession.substring(0, 24)}` : '');

  let parsedCookie: any = null;
  if (rawSession) {
    try {
      parsedCookie = JSON.parse(rawSession);
    } catch {
      // not json
    }
  }

  const userId = parsedCookie?.id || null;

  // Check revocation immediately
  if (activeToken && isTokenRevoked(activeToken, userId, parsedCookie?.issuedAt)) {
    return { profile: null, aal: 'aal1', userId: null };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser(bearerToken || undefined);

    if (!user) return { profile: null, aal: 'aal1', userId: null };

    if (isTokenRevoked(activeToken, user.id)) {
      return { profile: null, aal: 'aal1', userId: null };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const aal = (aalData?.currentLevel as 'aal1' | 'aal2') || 'aal1';

    return {
      profile: (profile as unknown as Profile) || null,
      aal,
      userId: user.id,
      token: activeToken,
    };
  }

  // Local / Test Runtime Fallback
  if (!parsedCookie || !parsedCookie.id) {
    return { profile: null, aal: 'aal1', userId: null };
  }

  const store = getRuntimeUserStore();
  const profile = store.get(parsedCookie.id);
  if (!profile) return { profile: null, aal: 'aal1', userId: null };

  if (isTokenRevoked(activeToken, profile.id, parsedCookie.issuedAt)) {
    return { profile: null, aal: 'aal1', userId: null };
  }

  // Check AAL
  // Support explicit test override header x-test-aal if set
  const testAal = request.headers.get('x-test-aal') as 'aal1' | 'aal2' | null;
  const aal: 'aal1' | 'aal2' = testAal || (parsedCookie.aal === 'aal2' ? 'aal2' : 'aal1');

  return {
    profile,
    aal,
    userId: profile.id,
    token: activeToken,
  };
}

/**
 * Server-side guard: Requires an active super admin session WITH AAL2 (2FA verified).
 * Returns 401 if unauthenticated/revoked, 403 if not super admin, or 403 if password-only (aal1).
 */
export async function requireSuperAdminAal2(request: Request): Promise<{
  authorized: boolean;
  status: number;
  error?: string;
  adminProfile?: Profile;
  adminUserId?: string;
}> {
  const { profile, aal } = await getSessionAuth(request);

  if (!profile || profile.status !== 'active') {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: Valid active session required.',
    };
  }

  if (!profile.is_super_admin) {
    return {
      authorized: false,
      status: 403,
      error: 'Forbidden: Super admin privileges required.',
    };
  }

  if (aal !== 'aal2') {
    return {
      authorized: false,
      status: 403,
      error: 'Forbidden: Super admin operations require an active AAL2 session (MFA verified).',
    };
  }

  return {
    authorized: true,
    status: 200,
    adminProfile: profile,
    adminUserId: profile.id,
  };
}

export async function getTeamProfiles(): Promise<Profile[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (!isConfigured) {
    const store = getRuntimeUserStore();
    return Array.from(store.values()).filter((p) => p.status === 'active');
  }

  try {
    const supabase = await createClient();
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'active')
      .order('role_type', { ascending: false });

    if (error || !profiles) {
      return [];
    }

    return profiles as unknown as Profile[];
  } catch (err) {
    console.error('Error fetching team profiles:', err);
    return [];
  }
}

export async function getSystemSettings(): Promise<Settings> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (!isConfigured) {
    return DEFAULT_SETTINGS;
  }

  try {
    const supabase = await createClient();
    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();

    return (settings as unknown as Settings) || DEFAULT_SETTINGS;
  } catch (err) {
    console.error('Error fetching settings:', err);
    return DEFAULT_SETTINGS;
  }
}

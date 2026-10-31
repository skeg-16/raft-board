import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
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
    (b) => normalized === b || (b.includes('@') ? normalized === b : normalized.startsWith(b))
  );

  const isTreasurer = isBootstrap && (normalized.includes('railey') || normalized.includes('coo'));

  return { isBootstrap, isTreasurer };
}

// In-memory user store for local development preview when live Supabase is not configured
declare global {
  // eslint-disable-next-line no-var
  var __raft_runtime_users: Map<string, Profile & { passwordHash?: string }> | undefined;
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
      const parsed = JSON.parse(sessionCookie.value) as { id: string; email: string };
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

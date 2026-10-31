import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { Profile, Settings } from '@/types/database';

export const SEEDED_MEMBERS: Profile[] = [
  {
    id: '11111111-1111-4111-a111-111111111111',
    full_name: 'Samira Chen',
    role_title: 'Chief Operating Officer',
    role_type: 'executive',
    is_super_admin: true,
    is_treasurer: true,
    weekly_target_xp: 80,
    avatar: null,
    active: true,
    must_change_password: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '22222222-2222-4222-a222-222222222222',
    full_name: 'Alex Rivera',
    role_title: 'Chief Technology Officer',
    role_type: 'executive',
    is_super_admin: true,
    is_treasurer: false,
    weekly_target_xp: 80,
    avatar: null,
    active: true,
    must_change_password: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '33333333-3333-4333-a333-333333333333',
    full_name: 'Marcus Vance',
    role_title: 'Chief Marketing Officer',
    role_type: 'executive',
    is_super_admin: false,
    is_treasurer: false,
    weekly_target_xp: 80,
    avatar: null,
    active: true,
    must_change_password: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '44444444-4444-4444-a444-444444444444',
    full_name: 'Chloe Santos',
    role_title: 'Creatives Lead',
    role_type: 'lead',
    is_super_admin: false,
    is_treasurer: false,
    weekly_target_xp: 80,
    avatar: null,
    active: true,
    must_change_password: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '55555555-5555-4555-a555-555555555555',
    full_name: 'David Kim',
    role_title: 'Backend Lead',
    role_type: 'lead',
    is_super_admin: false,
    is_treasurer: false,
    weekly_target_xp: 80,
    avatar: null,
    active: true,
    must_change_password: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '66666666-6666-4666-a666-666666666666',
    full_name: 'Bea Alcantara',
    role_title: 'Operations Lead',
    role_type: 'lead',
    is_super_admin: false,
    is_treasurer: false,
    weekly_target_xp: 80,
    avatar: null,
    active: true,
    must_change_password: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  meeting_weekday: 'Saturday',
  meeting_time: '10:00',
  timezone: 'Asia/Manila',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (!isConfigured) {
    const cookieStore = await cookies();
    const demoCookie = cookieStore.get('raft_demo_user');
    if (!demoCookie) return null;
    try {
      return JSON.parse(demoCookie.value) as Profile;
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

    return profile || null;
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
    return SEEDED_MEMBERS;
  }

  try {
    const supabase = await createClient();
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('active', true)
      .order('role_type', { ascending: false });

    if (error || !profiles || profiles.length === 0) {
      return SEEDED_MEMBERS;
    }

    return profiles;
  } catch (err) {
    console.error('Error fetching team profiles:', err);
    return SEEDED_MEMBERS;
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

    return settings || DEFAULT_SETTINGS;
  } catch (err) {
    console.error('Error fetching settings:', err);
    return DEFAULT_SETTINGS;
  }
}

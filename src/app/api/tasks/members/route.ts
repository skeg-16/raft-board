import { NextResponse } from 'next/server';
import { getCurrentProfile, getRuntimeUserStore } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types/database';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const supabase = await createClient();
    const { data: members, error } = await supabase
      .from('profiles')
      .select('id, full_name, role_title, role_type, avatar')
      .eq('status', 'active')
      .order('full_name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ members });
  }

  // Local fallback
  const store = getRuntimeUserStore();
  const members = Array.from(store.values())
    .filter((p) => p.status === 'active')
    .map((p) => ({
      id: p.id,
      full_name: p.full_name,
      role_title: p.role_title,
      role_type: p.role_type,
      avatar: p.avatar,
    }));

  return NextResponse.json({ members });
}

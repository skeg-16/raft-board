import { NextResponse } from 'next/server';
import { getCurrentProfile, getRuntimeUserStore } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const currentProfile = await getCurrentProfile();

  if (!currentProfile || !currentProfile.is_super_admin || currentProfile.status !== 'active') {
    return NextResponse.json(
      { error: 'Unauthorized: Only active Super Admins can reject members.' },
      { status: 403 }
    );
  }

  const { memberId } = await request.json();

  if (!memberId) {
    return NextResponse.json({ error: 'memberId is required.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const adminClient = createAdminClient();
    const { error } = await (adminClient.from('profiles') as any)
      .update({
        status: 'deactivated',
        active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Member registration rejected.' });
  }

  // Local / Test Runtime Store
  const store = getRuntimeUserStore();
  const profile = store.get(memberId);

  if (!profile) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  }

  profile.status = 'deactivated';
  profile.active = false;
  profile.updated_at = new Date().toISOString();
  store.set(memberId, profile);

  return NextResponse.json({ success: true, message: 'Member registration rejected.' });
}

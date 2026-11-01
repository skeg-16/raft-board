import { NextResponse } from 'next/server';
import { requireSuperAdminAal2, getRuntimeUserStore } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/tasks';

export async function POST(request: Request) {
  const auth = await requireSuperAdminAal2(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const currentProfile = auth.adminProfile!;
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

    await logAdminAction(currentProfile.id, 'reject_member', {
      member_id: memberId,
    });

    return NextResponse.json({ success: true, message: 'Member registration rejected.' });
  }

  // Local / Test Runtime Store
  const store = getRuntimeUserStore();
  const profile = store.get(memberId);

  if (!profile) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  }

  // Fail-closed audit logging
  try {
    await logAdminAction(currentProfile.id, 'reject_member', {
      member_id: memberId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Audit logging failed: ${err instanceof Error ? err.message : 'Unknown error'}. Action aborted.` },
      { status: 500 }
    );
  }

  profile.status = 'deactivated';
  profile.active = false;
  profile.updated_at = new Date().toISOString();
  store.set(memberId, profile);

  return NextResponse.json({ success: true, message: 'Member registration rejected.' });
}

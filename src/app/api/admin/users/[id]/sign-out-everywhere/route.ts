import { NextResponse } from 'next/server';
import { getCurrentProfile, getRuntimeUserStore } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/tasks';
import { invalidateActiveSessions } from '@/lib/security';

// POST /api/admin/users/[id]/sign-out-everywhere
// Super Admins only. Invalidate all active sessions for the user globally.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentProfile = await getCurrentProfile();

  if (!currentProfile || !currentProfile.is_super_admin || currentProfile.status !== 'active') {
    return NextResponse.json(
      { error: 'Forbidden: Super Admin access required.' },
      { status: 403 }
    );
  }

  const { id: targetUserId } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const adminClient = createAdminClient();
    const { error: rpcError } = await (adminClient as any).rpc('admin_sign_out_user', {
      p_admin_id: currentProfile.id,
      p_target_user_id: targetUserId,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    await invalidateActiveSessions(targetUserId);

    return NextResponse.json({
      success: true,
      message: 'User signed out everywhere. All active sessions invalidated.',
    });
  }

  // Local / Test Runtime Store
  const store = getRuntimeUserStore();
  const targetUser = store.get(targetUserId);

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  // Fail-closed audit logging
  try {
    await logAdminAction(currentProfile.id, 'sign_out_everywhere', {
      target_user_id: targetUserId,
      target_name: targetUser.full_name,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Audit logging failed: ${err instanceof Error ? err.message : 'Unknown error'}. Action aborted.` },
      { status: 500 }
    );
  }

  await invalidateActiveSessions(targetUserId);

  return NextResponse.json({
    success: true,
    message: 'User signed out everywhere. All active sessions invalidated.',
  });
}

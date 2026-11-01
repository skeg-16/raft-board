import { NextResponse } from 'next/server';
import { requireSuperAdminAal2, getRuntimeUserStore } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/tasks';
import { revokeUserAuthSessions } from '@/lib/security';

// POST /api/admin/users/[id]/force-password-reset
// Super Admins with AAL2 only. Admins NEVER see or choose passwords.
// Triggers recovery email, revokes existing sessions, and sets must_change_password = true.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdminAal2(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const currentProfile = auth.adminProfile!;
  const { id: targetUserId } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const adminClient = createAdminClient();
    const { data: user, error: userError } = await adminClient.auth.admin.getUserById(targetUserId);

    if (userError || !user?.user?.email) {
      return NextResponse.json({ error: 'User auth account not found.' }, { status: 404 });
    }

    // Trigger Supabase password recovery link/email. Admin never sees or generates password.
    await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: user.user.email,
    });

    // Atomic fail-closed function
    const { error: rpcError } = await (adminClient as any).rpc('admin_force_password_reset', {
      p_admin_id: currentProfile.id,
      p_target_user_id: targetUserId,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    // Revoke real sessions and refresh tokens
    await revokeUserAuthSessions(targetUserId);

    return NextResponse.json({
      success: true,
      message: 'Password reset link generated and sent to user email. All previous sessions revoked.',
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
    await logAdminAction(currentProfile.id, 'force_password_reset', {
      target_user_id: targetUserId,
      target_email: (targetUser as any).email,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Audit logging failed: ${err instanceof Error ? err.message : 'Unknown error'}. Action aborted.` },
      { status: 500 }
    );
  }

  targetUser.must_change_password = true;
  targetUser.updated_at = new Date().toISOString();
  store.set(targetUserId, targetUser);

  // Revoke real sessions and refresh tokens
  await revokeUserAuthSessions(targetUserId);

  return NextResponse.json({
    success: true,
    message: 'Password reset triggered successfully. All previous sessions revoked.',
  });
}

import { NextResponse } from 'next/server';
import { requireSuperAdminAal2, getRuntimeUserStore } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/tasks';
import { revokeUserAuthSessions } from '@/lib/security';

// POST /api/admin/users/[id]/reset-2fa
// Super Admin Recovery Path: A second super admin with AAL2 can remove a locked-out admin's 2FA factor.
// An admin CANNOT remove their own 2FA factor via this endpoint.
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

  // Recovery protection: Must be performed by a SECOND super admin
  if (currentProfile.id === targetUserId) {
    return NextResponse.json(
      { error: 'Recovery Protection: An admin cannot reset their own 2FA factor. A second super admin must perform the recovery.' },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const adminClient = createAdminClient();

    // Call atomic fail-closed stored procedure
    const { error: rpcError } = await (adminClient as any).rpc('admin_reset_user_2fa', {
      p_admin_id: currentProfile.id,
      p_target_user_id: targetUserId,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    // Try deleting TOTP factors from Supabase Auth if present
    try {
      const { data: factors } = await (adminClient.auth.admin.mfa as any).listFactors({ userId: targetUserId });
      if (factors?.factors) {
        for (const f of factors.factors) {
          await (adminClient.auth.admin.mfa as any).deleteFactor({ id: f.id, userId: targetUserId });
        }
      }
    } catch {
      // In case factor is already missing
    }

    await revokeUserAuthSessions(targetUserId);

    return NextResponse.json({
      success: true,
      message: 'User 2FA factor successfully removed. The admin can now log in with their credentials and will be prompted to re-enroll.',
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
    await logAdminAction(currentProfile.id, 'reset_2fa', {
      target_user_id: targetUserId,
      target_name: targetUser.full_name,
      recovered_by_admin: currentProfile.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Audit logging failed: ${err instanceof Error ? err.message : 'Unknown error'}. Action aborted.` },
      { status: 500 }
    );
  }

  targetUser.mfa_enabled = false;
  targetUser.mfa_enrolled_at = null;
  targetUser.updated_at = new Date().toISOString();
  store.set(targetUserId, targetUser);

  await revokeUserAuthSessions(targetUserId);

  return NextResponse.json({
    success: true,
    message: 'User 2FA factor successfully removed. The admin can now log in with their credentials and will be prompted to re-enroll.',
  });
}

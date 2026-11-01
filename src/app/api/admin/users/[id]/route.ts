import { NextResponse } from 'next/server';
import { requireSuperAdminAal2, getRuntimeUserStore } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/tasks';
import { revokeUserAuthSessions } from '@/lib/security';
import type { Profile } from '@/types/database';

// PATCH /api/admin/users/[id] - Update user role, flags, or status (Super Admins with AAL2 only)
// ENFORCES LOCKOUT PROTECTION, AAL2 REQUIREMENT & FAIL-CLOSED AUDIT LOGGING
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdminAal2(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const currentProfile = auth.adminProfile!;

  const { id: targetUserId } = await params;
  const body = await request.json();
  const { role_title, role_type, is_super_admin, is_treasurer, status } = body;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  // 1. Live Supabase Execution via Atomic RPC
  if (isConfigured) {
    const adminClient = createAdminClient();
    const { data, error } = await (adminClient as any).rpc('admin_update_user', {
      p_admin_id: currentProfile.id,
      p_target_user_id: targetUserId,
      p_role_title: role_title ?? null,
      p_role_type: role_type ?? null,
      p_status: status ?? null,
      p_is_super_admin: typeof is_super_admin === 'boolean' ? is_super_admin : null,
      p_is_treasurer: typeof is_treasurer === 'boolean' ? is_treasurer : null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (status === 'deactivated') {
      await revokeUserAuthSessions(targetUserId);
    }

    return NextResponse.json({ success: true, message: 'User updated successfully.' });
  }

  // 2. Local / Test Runtime Store Execution with Lockout Protection & Fail-Closed Logging
  const store = getRuntimeUserStore();
  const targetUser = store.get(targetUserId);

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  // --- LOCKOUT PROTECTION CHECK 1: An admin cannot remove their own admin status ---
  if (
    currentProfile.id === targetUserId &&
    targetUser.is_super_admin === true &&
    (is_super_admin === false || (status && status !== 'active'))
  ) {
    return NextResponse.json(
      { error: 'Lockout Protection: An admin cannot remove their own admin status.' },
      { status: 400 }
    );
  }

  // --- LOCKOUT PROTECTION CHECK 2: The last remaining super admin cannot be demoted or deactivated ---
  if (
    targetUser.is_super_admin === true &&
    targetUser.status === 'active' &&
    (is_super_admin === false || (status && status !== 'active'))
  ) {
    const remainingActiveAdmins = Array.from(store.values()).filter(
      (p) => p.id !== targetUserId && p.is_super_admin === true && p.status === 'active'
    );

    if (remainingActiveAdmins.length === 0) {
      return NextResponse.json(
        { error: 'Lockout Protection: The last remaining super admin cannot be demoted or deactivated.' },
        { status: 400 }
      );
    }
  }

  // Snapshot previous values for audit logging
  const previousValues = {
    role_title: targetUser.role_title,
    role_type: targetUser.role_type,
    status: targetUser.status,
    is_super_admin: targetUser.is_super_admin,
    is_treasurer: targetUser.is_treasurer,
  };

  const newValues = {
    role_title: role_title !== undefined ? role_title : targetUser.role_title,
    role_type: role_type !== undefined ? role_type : targetUser.role_type,
    status: status !== undefined ? status : targetUser.status,
    is_super_admin: typeof is_super_admin === 'boolean' ? is_super_admin : targetUser.is_super_admin,
    is_treasurer: typeof is_treasurer === 'boolean' ? is_treasurer : targetUser.is_treasurer,
  };

  // Mutate candidate in memory
  const updatedUser: Profile = {
    ...targetUser,
    role_title: newValues.role_title,
    role_type: newValues.role_type,
    status: newValues.status,
    active: newValues.status === 'active',
    is_super_admin: newValues.is_super_admin,
    is_treasurer: newValues.is_treasurer,
    updated_at: new Date().toISOString(),
  };

  // FAIL-CLOSED AUDIT LOGGING: If audit log insertion fails, the user mutation MUST NOT be saved!
  try {
    await logAdminAction(currentProfile.id, 'update_user', {
      target_user_id: targetUserId,
      previous_values: previousValues,
      new_values: newValues,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Audit logging failed: ${err instanceof Error ? err.message : 'Unknown error'}. Action aborted (fail-closed).` },
      { status: 500 }
    );
  }

  // Only commit after audit log succeeds
  store.set(targetUserId, updatedUser);

  if (newValues.status === 'deactivated') {
    await revokeUserAuthSessions(targetUserId);
  }

  return NextResponse.json({
    success: true,
    message: 'User updated successfully.',
    user: updatedUser,
  });
}

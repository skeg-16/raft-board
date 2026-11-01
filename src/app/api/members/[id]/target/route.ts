import { NextResponse } from 'next/server';
import { getCurrentProfile, getRuntimeUserStore } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/tasks';

// PATCH /api/members/[id]/target - Edit a member's weekly target XP
// Rules: Executives only, never the member themselves.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id: targetMemberId } = await params;

  // Rule 1: A member can never edit their own target
  if (profile.id === targetMemberId) {
    return NextResponse.json(
      { error: 'Forbidden: Members cannot edit their own weekly target. Targets must be set by an executive.' },
      { status: 403 }
    );
  }

  // Rule 2: Only executives or super admins can edit target
  const isExec = profile.role_type === 'executive' || profile.is_super_admin;
  if (!isExec) {
    return NextResponse.json(
      { error: 'Forbidden: Only executives can edit member weekly targets.' },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { weekly_target_xp } = body;

  const targetXP = Number(weekly_target_xp);
  if (!targetXP || targetXP <= 0) {
    return NextResponse.json(
      { error: 'weekly_target_xp must be a positive integer.' },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data, error } = await (admin.from('profiles') as any)
      .update({ weekly_target_xp: targetXP, updated_at: new Date().toISOString() })
      .eq('id', targetMemberId)
      .select('id, full_name, weekly_target_xp')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction(profile.id, 'update_weekly_target', {
      member_id: targetMemberId,
      new_target_xp: targetXP,
    });

    return NextResponse.json({ success: true, profile: data });
  }

  // Local fallback
  const userStore = getRuntimeUserStore();
  const targetUser = userStore.get(targetMemberId);
  if (!targetUser) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  }

  const oldTarget = targetUser.weekly_target_xp;
  targetUser.weekly_target_xp = targetXP;
  targetUser.updated_at = new Date().toISOString();
  userStore.set(targetMemberId, targetUser);

  await logAdminAction(profile.id, 'update_weekly_target', {
    member_id: targetMemberId,
    old_target_xp: oldTarget,
    new_target_xp: targetXP,
  });

  return NextResponse.json({
    success: true,
    profile: {
      id: targetUser.id,
      full_name: targetUser.full_name,
      weekly_target_xp: targetUser.weekly_target_xp,
    },
  });
}

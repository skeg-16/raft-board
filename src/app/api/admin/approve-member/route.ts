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

  const { memberId, roleTitle, roleType, isSuperAdmin, isTreasurer } = await request.json();

  if (!memberId || !roleTitle || !roleType) {
    return NextResponse.json(
      { error: 'memberId, roleTitle, and roleType (executive | lead) are required.' },
      { status: 400 }
    );
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
        status: 'active',
        active: true,
        role_title: roleTitle,
        role_type: roleType,
        is_super_admin: Boolean(isSuperAdmin),
        is_treasurer: Boolean(isTreasurer),
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction(currentProfile.id, 'approve_member', {
      member_id: memberId,
      role_title: roleTitle,
      role_type: roleType,
      is_super_admin: Boolean(isSuperAdmin),
      is_treasurer: Boolean(isTreasurer),
    });

    return NextResponse.json({ success: true, message: 'Member approved successfully!' });
  }

  // Local / Test Runtime Store
  const store = getRuntimeUserStore();
  const member = store.get(memberId);

  if (!member) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  }

  // Fail-closed audit logging
  try {
    await logAdminAction(currentProfile.id, 'approve_member', {
      member_id: memberId,
      role_title: roleTitle,
      role_type: roleType,
      is_super_admin: Boolean(isSuperAdmin),
      is_treasurer: Boolean(isTreasurer),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Audit logging failed: ${err instanceof Error ? err.message : 'Unknown error'}. Action aborted.` },
      { status: 500 }
    );
  }

  member.status = 'active';
  member.active = true;
  member.role_title = roleTitle;
  member.role_type = roleType;
  member.is_super_admin = Boolean(isSuperAdmin);
  member.is_treasurer = Boolean(isTreasurer);
  member.updated_at = new Date().toISOString();
  store.set(memberId, member);

  return NextResponse.json({ success: true, message: 'Member approved successfully!' });
}

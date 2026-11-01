import { NextResponse } from 'next/server';
import { getCurrentProfile, getRuntimeUserStore } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/tasks';

export async function POST(request: Request) {
  const currentProfile = await getCurrentProfile();

  if (!currentProfile || !currentProfile.is_super_admin || currentProfile.status !== 'active') {
    return NextResponse.json(
      { error: 'Unauthorized: Only active Super Admins can approve members.' },
      { status: 403 }
    );
  }

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
  const profile = store.get(memberId);

  if (!profile) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  }

  profile.status = 'active';
  profile.active = true;
  profile.role_title = roleTitle;
  profile.role_type = roleType;
  profile.is_super_admin = Boolean(isSuperAdmin);
  profile.is_treasurer = Boolean(isTreasurer);
  profile.updated_at = new Date().toISOString();

  store.set(memberId, profile);

  await logAdminAction(currentProfile.id, 'approve_member', {
    member_id: memberId,
    role_title: roleTitle,
    role_type: roleType,
    is_super_admin: Boolean(isSuperAdmin),
    is_treasurer: Boolean(isTreasurer),
  });

  return NextResponse.json({ success: true, message: 'Member approved successfully!' });
}

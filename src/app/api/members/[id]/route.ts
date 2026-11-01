import { NextResponse } from 'next/server';
import { getSessionAuth, getRuntimeUserStore } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

// PATCH /api/members/[id] - Update member profile
// Enforces column restrictions: normal members cannot update system columns.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile: currentProfile, aal } = await getSessionAuth(request);

  if (!currentProfile || currentProfile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id: targetId } = await params;
  const body = await request.json();

  const isSuperAdminWithAal2 = currentProfile.is_super_admin && aal === 'aal2';

  // System columns protected from normal members / non-AAL2 users
  const protectedColumns = [
    'last_login_at',
    'last_device_browser',
    'mfa_enabled',
    'mfa_enrolled_at',
    'status',
    'active',
    'role_title',
    'role_type',
    'is_super_admin',
    'is_treasurer',
    'weekly_target_xp',
  ];

  const hasProtectedField = protectedColumns.some((col) => body[col] !== undefined);

  if (hasProtectedField && !isSuperAdminWithAal2) {
    return NextResponse.json(
      {
        error:
          'Forbidden: Members are not permitted to modify system columns (role, status, admin flags, MFA, login metadata, or target).',
      },
      { status: 403 }
    );
  }

  // Non-admins can only update their own profile
  if (currentProfile.id !== targetId && !isSuperAdminWithAal2) {
    return NextResponse.json(
      { error: 'Forbidden: You can only update your own profile.' },
      { status: 403 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const supabase = await createClient();
    const { data, error } = await (supabase.from('profiles') as any)
      .update(body)
      .eq('id', targetId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, profile: data });
  }

  // Local / Test Runtime Store
  const store = getRuntimeUserStore();
  const targetUser = store.get(targetId);

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const updated = {
    ...targetUser,
    ...body,
    updated_at: new Date().toISOString(),
  };

  store.set(targetId, updated);
  return NextResponse.json({ success: true, profile: updated });
}

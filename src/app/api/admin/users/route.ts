import { NextResponse } from 'next/server';
import { requireSuperAdminAal2, getRuntimeUserStore } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStores } from '@/lib/tasks';

// GET /api/admin/users - List all users with security metadata (Super Admins with AAL2 only)
export async function GET(request: Request) {
  const auth = await requireSuperAdminAal2(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const currentProfile = auth.adminProfile!;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const adminClient = createAdminClient();
    const { data: profiles, error } = await (adminClient.from('profiles') as any)
      .select('id, full_name, role_title, role_type, requested_role_title, status, is_super_admin, is_treasurer, weekly_target_xp, mfa_enabled, last_login_at, last_device_browser, created_at, updated_at')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get auth emails and active sessions count
    const { data: authUsers } = await adminClient.auth.admin.listUsers();
    const { data: sessions } = await (adminClient.from('active_sessions') as any).select('user_id');

    const enriched = (profiles || []).map((p: any) => {
      const authUser = authUsers?.users?.find((u) => u.id === p.id);
      const userSessions = (sessions || []).filter((s: any) => s.user_id === p.id);
      return {
        ...p,
        email: authUser?.email || p.email || 'unknown',
        active_sessions_count: userSessions.length,
      };
    });

    return NextResponse.json({ users: enriched });
  }

  // Local / Test Runtime Fallback
  const store = getRuntimeUserStore();
  const { activeSessions } = getStores();

  const users = Array.from(store.values()).map((p) => {
    const sessionCount = Array.from(activeSessions.values()).filter((s) => s.user_id === p.id).length;
    return {
      id: p.id,
      full_name: p.full_name,
      email: (p as any).email || `${p.full_name.toLowerCase().replace(/\s+/g, '.')}@otter.systems`,
      role_title: p.role_title,
      role_type: p.role_type,
      requested_role_title: p.requested_role_title,
      status: p.status,
      is_super_admin: p.is_super_admin,
      is_treasurer: p.is_treasurer,
      weekly_target_xp: p.weekly_target_xp,
      mfa_enabled: Boolean(p.mfa_enabled),
      last_login_at: p.last_login_at || null,
      last_device_browser: p.last_device_browser || null,
      active_sessions_count: sessionCount,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  });

  return NextResponse.json({ users });
}

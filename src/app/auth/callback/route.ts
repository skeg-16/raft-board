import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkBootstrapAdmin, getRuntimeUserStore } from '@/lib/auth';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const simulatedEmail = requestUrl.searchParams.get('simulate_confirm_email');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  // 1. Live Supabase Email Confirmation
  if (isConfigured && code) {
    const supabase = await createClient();
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && sessionData.user) {
      const user = sessionData.user;
      const { isBootstrap, isTreasurer } = checkBootstrapAdmin(user.email || '');

      // Check if this confirmed user is a bootstrap admin
      if (isBootstrap && user.email_confirmed_at) {
        const adminClient = createAdminClient();
        await (adminClient.from('profiles') as any)
          .update({
            status: 'active',
            active: true,
            is_super_admin: true,
            is_treasurer: isTreasurer,
            role_type: 'executive',
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        return NextResponse.redirect(new URL('/', requestUrl.origin));
      }

      // Regular confirmed user: still requires super admin approval
      return NextResponse.redirect(new URL('/pending-approval', requestUrl.origin));
    }
  }

  // 2. Simulated Confirmation (For automated testing & local development)
  if (simulatedEmail) {
    const normalized = simulatedEmail.trim().toLowerCase();
    const store = getRuntimeUserStore();
    for (const [id, user] of store.entries()) {
      if ((user as any).email === normalized) {
        user.email_confirmed = true;
        const { isBootstrap, isTreasurer } = checkBootstrapAdmin(normalized);

        // ONLY trigger bootstrap auto-approval if email is now confirmed!
        if (isBootstrap) {
          user.status = 'active';
          user.active = true;
          user.is_super_admin = true;
          user.is_treasurer = isTreasurer;
          user.role_type = 'executive';
          user.role_title = user.requested_role_title || 'Chief Operating Officer';
        }
        store.set(id, user);

        const res = NextResponse.redirect(
          new URL(user.status === 'active' ? '/' : '/pending-approval', requestUrl.origin)
        );

        res.cookies.set(
          'raft_user_session',
          JSON.stringify({
            id,
            email: normalized,
            status: user.status,
            is_super_admin: user.is_super_admin,
            issuedAt: Date.now(),
          }),
          {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7,
          }
        );

        return res;
      }
    }
  }

  return NextResponse.redirect(new URL('/login', requestUrl.origin));
}

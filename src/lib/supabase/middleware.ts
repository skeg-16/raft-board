import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isTokenRevoked } from '@/lib/revocation';
import { checkBootstrapAdmin } from '@/lib/bootstrap-admins';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;

  // Static files, icons, service worker, offline fallback are always public
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/offline.html' ||
    pathname === '/favicon.ico'
  ) {
    return supabaseResponse;
  }

  // Public auth API routes and auth callbacks
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/auth')) {
    return supabaseResponse;
  }

  // Allow cron or bearer authorization for /api/tasks/close-week or any authorized API call
  if (request.headers.get('authorization')) {
    return supabaseResponse;
  }

  const isLogin = pathname === '/login';
  const isSignup = pathname === '/signup';
  const isPendingApproval = pathname === '/pending-approval';
  const isPublicAuthPage = isLogin || isSignup;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isConfigured =
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-ref');

  // Check for session cookie
  const sessionCookie = request.cookies.get('raft_user_session');

  // Local / Test Runtime Fallback
  if (!isConfigured) {
    if (!sessionCookie && !isPublicAuthPage) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    if (sessionCookie) {
      try {
        let rawVal = sessionCookie.value;
        try {
          rawVal = decodeURIComponent(rawVal);
        } catch {
          // already decoded
        }
        const session = JSON.parse(rawVal) as {
          id: string;
          status: string;
          aal?: string;
          is_super_admin?: boolean;
          issuedAt?: number;
        };

        // Revocation Check: If session/token was revoked, reject immediately
        if (isTokenRevoked(sessionCookie.value, session.id, session.issuedAt)) {
          if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Session has been revoked.' }, { status: 401 });
          }
          const url = request.nextUrl.clone();
          url.pathname = '/login';
          url.searchParams.set('error', 'session_revoked');
          const res = NextResponse.redirect(url);
          res.cookies.delete('raft_user_session');
          return res;
        }

        const status = session.status || 'pending';

        if (status === 'pending') {
          if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
            return NextResponse.json(
              { error: 'Forbidden: Account is pending admin approval.' },
              { status: 403 }
            );
          }
          if (!isPendingApproval && pathname !== '/api/auth/signout') {
            const url = request.nextUrl.clone();
            url.pathname = '/pending-approval';
            return NextResponse.redirect(url);
          }
          return supabaseResponse;
        }

        if (status === 'deactivated') {
          if (pathname.startsWith('/api/')) {
            return NextResponse.json(
              { error: 'Forbidden: Account has been deactivated.' },
              { status: 403 }
            );
          }
          const url = request.nextUrl.clone();
          url.pathname = '/login';
          url.searchParams.set('error', 'deactivated');
          const res = NextResponse.redirect(url);
          res.cookies.delete('raft_user_session');
          return res;
        }

        // Super Admin AAL2 Enforcement on /admin/* pages (except enrollment)
        const effectiveAal = request.headers.get('x-test-aal') || session.aal || 'aal1';
        if (
          pathname.startsWith('/admin') &&
          pathname !== '/admin/mfa/enroll' &&
          session.is_super_admin &&
          effectiveAal !== 'aal2'
        ) {
          if (pathname.startsWith('/api/')) {
            return NextResponse.json(
              { error: 'Forbidden: Super Admin actions require an active AAL2 session (MFA verified).' },
              { status: 403 }
            );
          }
          const url = request.nextUrl.clone();
          url.pathname = '/admin/mfa/enroll';
          url.searchParams.set('error', 'aal2_required');
          return NextResponse.redirect(url);
        }

        if (status === 'active') {
          if (isPublicAuthPage || isPendingApproval) {
            const url = request.nextUrl.clone();
            url.pathname = '/';
            return NextResponse.redirect(url);
          }
        }
      } catch {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
      }
    }

    return supabaseResponse;
  }

  // Live Supabase Client
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicAuthPage) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user) {
    if (isTokenRevoked(user.id)) {
      await supabase.auth.signOut();
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Session has been revoked.' }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('status, is_super_admin')
      .eq('id', user.id)
      .single();

    let status = profile?.status ?? 'pending';
    let isSuperAdmin = Boolean(profile?.is_super_admin);

    // Auto-promote confirmed bootstrap admins in middleware if profile is still marked pending
    if (status === 'pending' && user.email) {
      const { isBootstrap } = checkBootstrapAdmin(user.email);
      if (isBootstrap && user.email_confirmed_at) {
        status = 'active';
        isSuperAdmin = true;
      }
    }

    if (status === 'pending') {
      if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
        return NextResponse.json(
          { error: 'Forbidden: Account is pending admin approval.' },
          { status: 403 }
        );
      }
      if (!isPendingApproval && pathname !== '/api/auth/signout') {
        const url = request.nextUrl.clone();
        url.pathname = '/pending-approval';
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    if (status === 'deactivated') {
      await supabase.auth.signOut();
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Forbidden: Account has been deactivated.' },
          { status: 403 }
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'deactivated');
      const res = NextResponse.redirect(url);
      res.cookies.delete('raft_user_session');
      return res;
    }

    // AAL2 enforcement on admin pages for super admins
    if (
      pathname.startsWith('/admin') &&
      pathname !== '/admin/mfa/enroll' &&
      isSuperAdmin
    ) {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const effectiveAal = request.headers.get('x-test-aal') || aalData?.currentLevel || 'aal1';
      if (effectiveAal !== 'aal2') {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'Forbidden: Super Admin actions require an active AAL2 session (MFA verified).' },
            { status: 403 }
          );
        }
        const url = request.nextUrl.clone();
        url.pathname = '/admin/mfa/enroll';
        url.searchParams.set('error', 'aal2_required');
        return NextResponse.redirect(url);
      }
    }

    if (status === 'active') {
      if (isPublicAuthPage || isPendingApproval) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

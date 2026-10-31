import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

  // Public auth API routes
  if (pathname.startsWith('/api/auth')) {
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
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    if (sessionCookie) {
      try {
        const session = JSON.parse(sessionCookie.value) as {
          id: string;
          status: string;
        };

        if (session.status === 'pending') {
          if (!isPendingApproval && pathname !== '/api/auth/signout') {
            const url = request.nextUrl.clone();
            url.pathname = '/pending-approval';
            return NextResponse.redirect(url);
          }
          return supabaseResponse;
        }

        if (session.status === 'deactivated') {
          const url = request.nextUrl.clone();
          url.pathname = '/login';
          url.searchParams.set('error', 'deactivated');
          return NextResponse.redirect(url);
        }

        if (session.status === 'active') {
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
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, is_super_admin')
      .eq('id', user.id)
      .single();

    const status = profile?.status ?? 'pending';

    if (status === 'pending') {
      if (!isPendingApproval && pathname !== '/api/auth/signout') {
        const url = request.nextUrl.clone();
        url.pathname = '/pending-approval';
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    if (status === 'deactivated') {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'deactivated');
      return NextResponse.redirect(url);
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

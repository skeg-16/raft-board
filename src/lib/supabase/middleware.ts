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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isConfigured =
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-ref');

  // Check for local demo session cookie if live Supabase is not configured
  const demoUserCookie = request.cookies.get('raft_demo_user');

  if (!isConfigured) {
    const isLogin = pathname === '/login';
    const isChangePassword = pathname === '/change-password';

    // In local demo mode
    if (!demoUserCookie && !isLogin) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    if (demoUserCookie) {
      try {
        const user = JSON.parse(demoUserCookie.value);
        if (user.must_change_password && !isChangePassword && pathname !== '/api/auth/change-password' && pathname !== '/api/auth/signout') {
          const url = request.nextUrl.clone();
          url.pathname = '/change-password';
          return NextResponse.redirect(url);
        }
        if (isLogin) {
          const url = request.nextUrl.clone();
          url.pathname = user.must_change_password ? '/change-password' : '/';
          return NextResponse.redirect(url);
        }
      } catch {
        // Invalid cookie
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
      }
    }

    return supabaseResponse;
  }

  // Live Supabase client configuration
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

  // IMPORTANT: Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = pathname === '/login';
  const isChangePassword = pathname === '/change-password';
  const isApiAuth = pathname.startsWith('/api/auth');

  if (!user && !isLogin && !isApiAuth) {
    // Unauthenticated users are redirected to login
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user) {
    // Query user profile to check must_change_password status
    const { data: profile } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .single();

    const mustChangePassword = profile?.must_change_password ?? false;

    if (mustChangePassword && !isChangePassword && !isApiAuth) {
      // Force password change on first login
      const url = request.nextUrl.clone();
      url.pathname = '/change-password';
      return NextResponse.redirect(url);
    }

    if (!mustChangePassword && isChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    if (isLogin) {
      const url = request.nextUrl.clone();
      url.pathname = mustChangePassword ? '/change-password' : '/';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

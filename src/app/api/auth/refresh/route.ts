import { NextResponse } from 'next/server';
import { isTokenRevoked } from '@/lib/security';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const refreshToken =
      body.refresh_token ||
      request.headers.get('x-refresh-token') ||
      '';

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token is required.' },
        { status: 400 }
      );
    }

    // Check if refresh token has been revoked
    if (isTokenRevoked(refreshToken)) {
      return NextResponse.json(
        { error: 'Session has been revoked or expired. Please log in again.' },
        { status: 401 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isConfigured =
      supabaseUrl &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !supabaseUrl.includes('your-project-ref');

    if (isConfigured) {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error || !data.session) {
        return NextResponse.json(
          { error: error?.message || 'Invalid or revoked refresh token.' },
          { status: 401 }
        );
      }

      return NextResponse.json({
        success: true,
        session: data.session,
      });
    }

    // Local / Test Runtime Fallback
    const newAccessToken = `token-refreshed-${Date.now()}`;
    const newRefreshToken = `refresh-refreshed-${Date.now()}`;

    return NextResponse.json({
      success: true,
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Refresh failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

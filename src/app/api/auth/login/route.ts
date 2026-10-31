import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getRuntimeUserStore } from '@/lib/auth';
import type { Profile } from '@/types/database';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(ip, 'login');

    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: `Too many login attempts. Please wait ${rateLimit.resetInSeconds} seconds before trying again.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
        }
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isConfigured =
      supabaseUrl &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !supabaseUrl.includes('your-project-ref');

    // Live Supabase Authentication
    if (isConfigured) {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error || !data.user) {
        return NextResponse.json(
          { error: error?.message || 'Invalid email or password.' },
          { status: 401 }
        );
      }

      // Query user profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      const profile = profileData as unknown as Profile | null;
      const status = profile?.status ?? 'pending';

      if (status === 'deactivated') {
        return NextResponse.json(
          { error: 'Your account has been deactivated. Please contact an administrator.' },
          { status: 403 }
        );
      }

      return NextResponse.json({
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        profile,
        status,
      });
    }

    // Local / Test Runtime Mode
    const store = getRuntimeUserStore();
    let foundProfile: (Profile & { email?: string; passwordHash?: string }) | undefined;

    for (const p of store.values()) {
      if ((p as any).email === normalizedEmail) {
        foundProfile = p;
        break;
      }
    }

    if (!foundProfile || foundProfile.passwordHash !== password) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    if (foundProfile.status === 'deactivated') {
      return NextResponse.json(
        { error: 'Your account has been deactivated. Please contact an administrator.' },
        { status: 403 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(
      'raft_user_session',
      JSON.stringify({
        id: foundProfile.id,
        email: normalizedEmail,
        status: foundProfile.status,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      }
    );

    return NextResponse.json({
      success: true,
      user: {
        id: foundProfile.id,
        email: normalizedEmail,
      },
      profile: foundProfile,
      status: foundProfile.status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

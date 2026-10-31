import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { checkBootstrapAdmin, getRuntimeUserStore } from '@/lib/auth';
import type { Profile } from '@/types/database';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    // Persistent Rate Limit Check
    const rateLimit = await checkRateLimit(ip, 'login');

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

    // 1. Live Supabase Authentication
    if (isConfigured) {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error || !data.user) {
        if (error?.message?.toLowerCase().includes('email not confirmed')) {
          return NextResponse.json(
            { error: 'Email confirmation required. Please check your inbox and verify your email.' },
            { status: 403 }
          );
        }
        return NextResponse.json(
          { error: error?.message || 'Invalid email or password.' },
          { status: 401 }
        );
      }

      // Check user profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      let profile = profileData as unknown as Profile | null;
      let status = profile?.status ?? 'pending';

      // Check if user is a confirmed Bootstrap Admin whose approval should activate now
      const { isBootstrap, isTreasurer } = checkBootstrapAdmin(normalizedEmail);
      if (isBootstrap && data.user.email_confirmed_at && status === 'pending') {
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
          .eq('id', data.user.id);

        status = 'active';
      }

      // Block rejected or deactivated accounts
      if (status === 'deactivated' || profile?.active === false) {
        return NextResponse.json(
          { error: 'Your account has been rejected or deactivated by an administrator.' },
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

    // 2. Local / Test Runtime Fallback Mode
    const store = getRuntimeUserStore();
    let foundProfile: (Profile & { email?: string; passwordHash?: string; email_confirmed?: boolean }) | undefined;

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

    // RULE 1: Email confirmation required
    if (foundProfile.email_confirmed === false) {
      return NextResponse.json(
        { error: 'Email confirmation required. Please verify your email before logging in.' },
        { status: 403 }
      );
    }

    // Check Bootstrap auto-approval (Only triggers if email is confirmed!)
    const { isBootstrap, isTreasurer } = checkBootstrapAdmin(normalizedEmail);
    if (isBootstrap && foundProfile.email_confirmed && foundProfile.status === 'pending') {
      foundProfile.status = 'active';
      foundProfile.active = true;
      foundProfile.is_super_admin = true;
      foundProfile.is_treasurer = isTreasurer;
      foundProfile.role_type = 'executive';
      store.set(foundProfile.id, foundProfile);
    }

    // Block rejected or deactivated accounts
    if (foundProfile.status === 'deactivated') {
      return NextResponse.json(
        { error: 'Your account has been rejected or deactivated by an administrator.' },
        { status: 403 }
      );
    }

    const res = NextResponse.json({
      success: true,
      user: {
        id: foundProfile.id,
        email: normalizedEmail,
      },
      profile: foundProfile,
      status: foundProfile.status,
    });

    res.cookies.set(
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

    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

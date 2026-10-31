import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { checkBootstrapAdmin, getRuntimeUserStore } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Profile } from '@/types/database';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    // Persistent rate limit check
    const rateLimit = await checkRateLimit(ip, 'signup');

    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: `Too many sign-up attempts. Please wait ${rateLimit.resetInSeconds} seconds before trying again.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
        }
      );
    }

    const body = await request.json();
    const { full_name, email, password, desired_role_title, team_join_code } = body;

    // Basic Validations
    if (!full_name || !email || !password || !desired_role_title || !team_join_code) {
      return NextResponse.json(
        { error: 'All fields are required, including the Team Join Code.' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    // SERVER-SIDE Team Join Code Validation
    const expectedJoinCode = process.env.TEAM_JOIN_CODE || 'OTTER-RAFT-2026';
    if (team_join_code.trim() !== expectedJoinCode.trim()) {
      return NextResponse.json(
        { error: 'Invalid Team Join Code. Please obtain the code from an executive.' },
        { status: 403 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const { isBootstrap } = checkBootstrapAdmin(normalizedEmail);

    // RULE 1: All signups start as "pending". NO auto-approval at sign-up time, even for bootstrap admins.
    // Bootstrap admin auto-approval happens strictly AFTER email confirmation.
    const initialStatus = 'pending';
    const isSuperAdmin = false;
    const isTreasurer = false;
    const roleType = null;
    const roleTitle = null;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isConfigured =
      supabaseUrl &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !supabaseUrl.includes('your-project-ref');

    // Live Supabase Auth Flow
    if (isConfigured) {
      const adminClient = createAdminClient();

      // Create Supabase Auth user with email_confirm: false so Supabase sends verification email
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: false, // Email confirmation is strictly required!
        user_metadata: {
          full_name,
          desired_role_title,
          is_bootstrap_candidate: isBootstrap,
        },
      });

      if (authError || !authData.user) {
        return NextResponse.json(
          { error: authError?.message || 'Could not register user.' },
          { status: 400 }
        );
      }

      // Insert profile with status = 'pending'
      const { error: profileError } = await (adminClient.from('profiles') as any).upsert({
        id: authData.user.id,
        full_name,
        role_title: roleTitle,
        role_type: roleType,
        requested_role_title: desired_role_title,
        status: initialStatus,
        is_super_admin: isSuperAdmin,
        is_treasurer: isTreasurer,
        weekly_target_xp: 80,
        active: false,
        must_change_password: false,
      });

      if (profileError) {
        console.error('Failed to create profile:', profileError);
      }

      return NextResponse.json({
        success: true,
        status: 'pending',
        isBootstrap,
        message:
          'Account created! Please check your email to confirm your address. Once confirmed, ' +
          (isBootstrap
            ? 'your bootstrap Super Admin access will activate.'
            : 'a Super Admin will review your join request.'),
      });
    }

    // Local / Test Runtime Fallback Mode
    const store = getRuntimeUserStore();

    for (const u of store.values()) {
      if ((u as any).email === normalizedEmail) {
        return NextResponse.json(
          { error: 'An account with this email already exists.' },
          { status: 400 }
        );
      }
    }

    const userId = crypto.randomUUID();
    const newProfile: Profile & { email: string; passwordHash: string; email_confirmed: boolean } = {
      id: userId,
      email: normalizedEmail,
      full_name,
      role_title: roleTitle,
      role_type: roleType,
      requested_role_title: desired_role_title,
      status: 'pending', // Always pending at signup!
      is_super_admin: false,
      is_treasurer: false,
      weekly_target_xp: 80,
      avatar: null,
      active: false,
      must_change_password: false,
      passwordHash: password,
      email_confirmed: false, // Starts unconfirmed
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    store.set(userId, newProfile);

    // Set unconfirmed pending session
    const res = NextResponse.json({
      success: true,
      status: 'pending',
      isBootstrap,
      message:
        'Account created! Please confirm your email address. Bootstrap auto-approval will trigger only after confirmation.',
    });

    res.cookies.set(
      'raft_user_session',
      JSON.stringify({ id: userId, email: normalizedEmail, status: 'pending', email_confirmed: false }),
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
    const message = err instanceof Error ? err.message : 'Sign up failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

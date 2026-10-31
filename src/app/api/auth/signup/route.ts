import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { checkBootstrapAdmin, getRuntimeUserStore } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Profile, RoleType } from '@/types/database';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(ip, 'signup');

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
    const { isBootstrap, isTreasurer } = checkBootstrapAdmin(normalizedEmail);

    const initialStatus = isBootstrap ? 'active' : 'pending';
    const isSuperAdmin = isBootstrap;
    const isExecutive = isBootstrap;
    const roleType: RoleType | null = isBootstrap ? 'executive' : null;
    const roleTitle = isBootstrap ? desired_role_title : null;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isConfigured =
      supabaseUrl &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !supabaseUrl.includes('your-project-ref');

    // Live Supabase Auth Flow
    if (isConfigured) {
      const adminClient = createAdminClient();

      // Create Supabase Auth user
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: isBootstrap, // Auto-confirm bootstrap admins; regular users follow email confirmation
        user_metadata: {
          full_name,
          desired_role_title,
        },
      });

      if (authError || !authData.user) {
        return NextResponse.json(
          { error: authError?.message || 'Could not register user.' },
          { status: 400 }
        );
      }

      // Insert profile
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
        active: initialStatus === 'active',
        must_change_password: false,
      });

      if (profileError) {
        console.error('Failed to create profile:', profileError);
      }

      return NextResponse.json({
        success: true,
        status: initialStatus,
        isBootstrap,
        message: isBootstrap
          ? 'Bootstrap Super Admin registered and activated!'
          : 'Account created! Please check your email to confirm, then wait for admin approval.',
      });
    }

    // Local / Test In-Memory Mode
    const store = getRuntimeUserStore();

    // Check existing email
    for (const u of store.values()) {
      if ((u as any).email === normalizedEmail) {
        return NextResponse.json(
          { error: 'An account with this email already exists.' },
          { status: 400 }
        );
      }
    }

    const userId = crypto.randomUUID();
    const newProfile: Profile & { email: string; passwordHash: string } = {
      id: userId,
      email: normalizedEmail,
      full_name,
      role_title: roleTitle,
      role_type: roleType,
      requested_role_title: desired_role_title,
      status: initialStatus,
      is_super_admin: isSuperAdmin,
      is_treasurer: isTreasurer,
      weekly_target_xp: 80,
      avatar: null,
      active: initialStatus === 'active',
      must_change_password: false,
      passwordHash: password, // In test mode
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    store.set(userId, newProfile);

    // Set active session cookie
    const cookieStore = await cookies();
    cookieStore.set(
      'raft_user_session',
      JSON.stringify({ id: userId, email: normalizedEmail, status: initialStatus }),
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
      status: initialStatus,
      isBootstrap,
      message: isBootstrap
        ? 'Bootstrap Super Admin registered and activated!'
        : 'Account created and waiting for approval.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sign up failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

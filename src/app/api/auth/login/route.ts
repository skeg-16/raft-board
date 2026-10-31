import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { SEEDED_MEMBERS } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isConfigured =
      supabaseUrl &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !supabaseUrl.includes('your-project-ref');

    // Live Supabase Authentication
    if (isConfigured) {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error || !data.user) {
        return NextResponse.json(
          { error: error?.message || 'Invalid email or password.' },
          { status: 401 }
        );
      }

      // Fetch profile to check must_change_password
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      const memberProfile = profile as unknown as { must_change_password?: boolean } | null;

      return NextResponse.json({
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        profile,
        mustChangePassword: memberProfile?.must_change_password ?? false,
      });
    }

    // Local Demo / Test Mode (Instant testing for seeded members)
    const normalizedEmail = email.trim().toLowerCase();
    const seededMember = SEEDED_MEMBERS.find((m) => {
      const slug = m.role_title.toLowerCase().replace(/[^a-z]/g, '');
      return (
        (m.role_type === 'executive' && normalizedEmail === `${m.role_title.toLowerCase().split(' ')[1] || 'exec'}@otter.systems`) ||
        (m.role_title === 'Chief Operating Officer' && normalizedEmail === 'coo@otter.systems') ||
        (m.role_title === 'Chief Technology Officer' && normalizedEmail === 'cto@otter.systems') ||
        (m.role_title === 'Chief Marketing Officer' && normalizedEmail === 'cmo@otter.systems') ||
        (m.role_title === 'Creatives Lead' && normalizedEmail === 'creatives@otter.systems') ||
        (m.role_title === 'Backend Lead' && normalizedEmail === 'backend@otter.systems') ||
        (m.role_title === 'Operations Lead' && normalizedEmail === 'operations@otter.systems')
      );
    });

    if (!seededMember) {
      return NextResponse.json(
        { error: 'Account not found. Access to Raft Board is invite-only.' },
        { status: 401 }
      );
    }

    // Accept initial password "OtterPass2026!" or any updated password
    if (password !== 'OtterPass2026!' && password.length < 8) {
      return NextResponse.json(
        { error: 'Invalid password. (Default seed password is OtterPass2026!)' },
        { status: 401 }
      );
    }

    // Set demo cookie
    const cookieStore = await cookies();
    cookieStore.set('raft_demo_user', JSON.stringify(seededMember), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({
      success: true,
      user: {
        id: seededMember.id,
        email: normalizedEmail,
      },
      profile: seededMember,
      mustChangePassword: seededMember.must_change_password,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

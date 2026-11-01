import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const { newPassword } = await request.json();

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isConfigured =
      supabaseUrl &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !supabaseUrl.includes('your-project-ref');

    // Live Supabase Password Update
    if (isConfigured) {
      const supabase = await createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return NextResponse.json(
          { error: 'Unauthorized. Please log in first.' },
          { status: 401 }
        );
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 400 }
        );
      }

      // Mark must_change_password as false
      const { error: profileError } = await (supabase
        .from('profiles') as any)
        .update({ must_change_password: false })
        .eq('id', user.id);

      if (profileError) {
        console.error('Failed to update must_change_password flag:', profileError);
      }

      return NextResponse.json({
        success: true,
        message: 'Password successfully updated!',
      });
    }

    // Local / Test Runtime Fallback Mode
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('raft_user_session') || cookieStore.get('raft_demo_user');
    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in first.' },
        { status: 401 }
      );
    }

    try {
      let rawVal = sessionCookie.value;
      try {
        rawVal = decodeURIComponent(rawVal);
      } catch {
        // already decoded
      }
      const parsed = JSON.parse(rawVal);
      const userId = parsed.id;
      const { getRuntimeUserStore } = await import('@/lib/auth');
      const store = getRuntimeUserStore();
      const user = store.get(userId);

      if (!user) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 });
      }

      (user as any).passwordHash = newPassword;
      (user as any).must_change_password = false;
      user.updated_at = new Date().toISOString();
      store.set(userId, user);

      return NextResponse.json({
        success: true,
        message: 'Password successfully updated!',
      });
    } catch {
      return NextResponse.json({ error: 'Session invalid' }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Password update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

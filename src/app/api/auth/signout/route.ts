import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  const cookieStore = await cookies();
  cookieStore.delete('raft_user_session');
  cookieStore.delete('raft_demo_user');

  return NextResponse.json({ success: true });
}

export async function GET() {
  return POST();
}

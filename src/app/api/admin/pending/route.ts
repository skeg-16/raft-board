import { NextResponse } from 'next/server';
import { requireSuperAdminAal2, getRuntimeUserStore } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types/database';

export async function GET(request: Request) {
  const auth = await requireSuperAdminAal2(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const supabase = await createClient();
    const { data: pending, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pending: pending || [] });
  }

  // Local / Test Runtime Store
  const store = getRuntimeUserStore();
  const pending = Array.from(store.values()).filter((p) => p.status === 'pending');
  return NextResponse.json({ pending });
}

import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { QuickPick, TaskCategory, TaskSize } from '@/types/database';

// GET /api/quick-picks: Active members can read quick picks
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('quick_picks')
      .select('*')
      .eq('active', true)
      .order('category', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ quickPicks: data });
  }

  // Local fallback
  const { __raft_quick_picks } = globalThis as any;
  const list = __raft_quick_picks
    ? (Array.from(__raft_quick_picks.values()).filter((qp: any) => qp.active) as QuickPick[])
    : [];
  return NextResponse.json({ quickPicks: list });
}

// POST /api/quick-picks: Only executives and super admins can create quick picks
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const isExec = profile.role_type === 'executive' || profile.is_super_admin;
  if (!isExec) {
    return NextResponse.json(
      { error: 'Forbidden: Only executives can edit or add quick picks.' },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { category, label, default_size } = body;

  if (!category || !label || !default_size) {
    return NextResponse.json(
      { error: 'category, label, and default_size are required.' },
      { status: 400 }
    );
  }

  const validCategories: TaskCategory[] = [
    'Platforms',
    'Marketing',
    'Clients',
    'Operations',
    'Growth',
    'Other',
  ];
  const validSizes: TaskSize[] = ['small', 'medium', 'big'];

  if (!validCategories.includes(category) || !validSizes.includes(default_size)) {
    return NextResponse.json({ error: 'Invalid category or size.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data, error } = await (admin.from('quick_picks') as any)
      .insert({
        category,
        label: label.trim(),
        default_size,
        active: true,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, quickPick: data });
  }

  // Local fallback
  const { __raft_quick_picks } = globalThis as any;
  const id = `qp-${Date.now()}`;
  const newQP: QuickPick = {
    id,
    category,
    label: label.trim(),
    default_size,
    active: true,
    created_at: new Date().toISOString(),
  };

  if (__raft_quick_picks) {
    __raft_quick_picks.set(id, newQP);
  }

  return NextResponse.json({ success: true, quickPick: newQP });
}

// PUT /api/quick-picks: Only executives and super admins can edit quick picks
export async function PUT(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const isExec = profile.role_type === 'executive' || profile.is_super_admin;
  if (!isExec) {
    return NextResponse.json(
      { error: 'Forbidden: Only executives can edit or modify quick picks.' },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { id, category, label, default_size, active } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const updateData: any = {};
    if (category) updateData.category = category;
    if (label) updateData.label = label.trim();
    if (default_size) updateData.default_size = default_size;
    if (typeof active === 'boolean') updateData.active = active;

    const { data, error } = await (admin.from('quick_picks') as any)
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, quickPick: data });
  }

  // Local fallback
  const { __raft_quick_picks } = globalThis as any;
  const qp = __raft_quick_picks?.get(id);
  if (!qp) {
    return NextResponse.json({ error: 'Quick pick not found.' }, { status: 404 });
  }

  if (category) qp.category = category;
  if (label) qp.label = label.trim();
  if (default_size) qp.default_size = default_size;
  if (typeof active === 'boolean') qp.active = active;
  __raft_quick_picks.set(id, qp);

  return NextResponse.json({ success: true, quickPick: qp });
}

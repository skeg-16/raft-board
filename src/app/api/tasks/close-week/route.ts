import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { closeWeek } from '@/lib/tasks';

export async function POST(request: Request) {
  const profile = await getCurrentProfile();

  // Run Close Now is restricted to Super Admins only (or an authorized scheduler)
  const cronSecret = process.env.CRON_SECRET || 'cron-secret-key-phase3';
  const authHeader = request.headers.get('authorization');
  const isCronAuth = authHeader === `Bearer ${cronSecret}`;

  const isSuperAdmin = profile?.is_super_admin === true;

  if (!isCronAuth && (!profile || !isSuperAdmin)) {
    return NextResponse.json(
      { error: 'Forbidden: Only super admins can run weekly close.' },
      { status: 403 }
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await closeWeek(body.weekId, true);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to close week.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

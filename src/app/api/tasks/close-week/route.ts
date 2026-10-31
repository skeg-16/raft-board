import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { closeWeek } from '@/lib/tasks';

export async function POST(request: Request) {
  const profile = await getCurrentProfile();

  // Allow Super Admins or Executives (or a Cron header with CRON_SECRET if configured)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  const isSuperAdmin = profile?.is_super_admin === true;
  const isExec = profile?.role_type === 'executive';

  if (!isCronAuth && (!profile || (!isSuperAdmin && !isExec))) {
    return NextResponse.json(
      { error: 'Forbidden: Only super admins or schedulers can close weeks.' },
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

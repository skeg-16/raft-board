import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { closeWeek, logAdminAction } from '@/lib/tasks';

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
    const isSuperAdminTriggered = !isCronAuth && isSuperAdmin && body.force !== false;
    const result = await closeWeek(body.weekId, isSuperAdminTriggered, body.simulatedNow);

    if (isSuperAdminTriggered && profile) {
      await logAdminAction(profile.id, 'manual_close_week', {
        week_id: body.weekId,
        force: body.force !== false,
        simulated_now: body.simulatedNow,
      });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to close week.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

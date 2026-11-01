import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { updateCurrentWeekCutoff, getAuditLogs, getCurrentWeek } from '@/lib/tasks';

// GET /api/settings/current-week-cutoff - List audit logs (Super Admin only)
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  if (!profile.is_super_admin) {
    return NextResponse.json(
      { error: 'Forbidden: Only super admins can view cutoff audit logs.' },
      { status: 403 }
    );
  }

  const logs = await getAuditLogs(20);
  const currentWeek = await getCurrentWeek();
  return NextResponse.json({ currentWeek, auditLogs: logs });
}

// POST /api/settings/current-week-cutoff - Super Admin action to adjust current week cutoff
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  if (!profile.is_super_admin) {
    return NextResponse.json(
      { error: 'Forbidden: Only super admins can change the current week cutoff.' },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const { new_cutoff_at, confirmed, reason } = body;

  // 1. Confirmation Step Required
  if (confirmed !== true) {
    return NextResponse.json(
      { error: 'Confirmation required: Changing the current week cutoff requires explicit confirmation.' },
      { status: 400 }
    );
  }

  // 2. new_cutoff_at required
  if (!new_cutoff_at) {
    return NextResponse.json(
      { error: 'new_cutoff_at is required.' },
      { status: 400 }
    );
  }

  // 3. Reject any time that has already passed
  const targetDate = new Date(new_cutoff_at);
  if (isNaN(targetDate.getTime())) {
    return NextResponse.json(
      { error: 'Invalid cutoff date format.' },
      { status: 400 }
    );
  }

  if (targetDate.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'Cannot set cutoff in the past. New cutoff must be in the future.' },
      { status: 400 }
    );
  }

  try {
    const result = await updateCurrentWeekCutoff(
      profile.id,
      targetDate.toISOString(),
      confirmed,
      reason
    );
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update current week cutoff.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

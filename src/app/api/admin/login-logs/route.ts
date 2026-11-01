import { NextResponse } from 'next/server';
import { requireSuperAdminAal2 } from '@/lib/auth';
import { getLoginLogs } from '@/lib/security';

// GET /api/admin/login-logs - List login attempts (Super Admins with AAL2 only)
export async function GET(request: Request) {
  const auth = await requireSuperAdminAal2(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const logs = await getLoginLogs(100);
  return NextResponse.json({ loginLogs: logs });
}

import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { getLoginLogs } from '@/lib/security';

// GET /api/admin/login-logs - List login attempts with anonymized IP and device info (Super Admins only)
export async function GET() {
  const currentProfile = await getCurrentProfile();

  if (!currentProfile || !currentProfile.is_super_admin || currentProfile.status !== 'active') {
    return NextResponse.json(
      { error: 'Forbidden: Super Admin access required.' },
      { status: 403 }
    );
  }

  const logs = await getLoginLogs(100);
  return NextResponse.json({ loginLogs: logs });
}

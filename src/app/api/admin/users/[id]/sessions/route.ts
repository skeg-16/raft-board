import { NextResponse } from 'next/server';
import { requireSuperAdminAal2 } from '@/lib/auth';
import { getUserActiveSessions } from '@/lib/security';

// GET /api/admin/users/[id]/sessions - List active sessions for user (Super Admins with AAL2 only)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdminAal2(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: targetUserId } = await params;
  const sessions = await getUserActiveSessions(targetUserId);

  return NextResponse.json({ sessions });
}

import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { getUserActiveSessions } from '@/lib/security';

// GET /api/admin/users/[id]/sessions - List active sessions for user (Super Admins only)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentProfile = await getCurrentProfile();

  if (!currentProfile || !currentProfile.is_super_admin || currentProfile.status !== 'active') {
    return NextResponse.json(
      { error: 'Forbidden: Super Admin access required.' },
      { status: 403 }
    );
  }

  const { id: targetUserId } = await params;
  const sessions = await getUserActiveSessions(targetUserId);

  return NextResponse.json({ sessions });
}

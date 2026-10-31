import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { getWeeklyLeaderboard } from '@/lib/tasks';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const isExecutive = profile.role_type === 'executive' || profile.is_super_admin;

  try {
    const data = await getWeeklyLeaderboard(profile.id, isExecutive);
    return NextResponse.json({
      ...data,
      viewerRole: profile.role_type,
      isExecutive,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch leaderboard.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

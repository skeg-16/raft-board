import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { getMonthlySeasonLeaderboard } from '@/lib/tasks';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') || undefined;

  try {
    const data = await getMonthlySeasonLeaderboard(month);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch monthly season.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

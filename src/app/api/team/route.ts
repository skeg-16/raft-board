import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { getTeamProgress } from '@/lib/tasks';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const data = await getTeamProgress();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch team progress.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

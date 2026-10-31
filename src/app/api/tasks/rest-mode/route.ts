import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { toggleRestMode, getCurrentWeek } from '@/lib/tasks';

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const currentWeek = await getCurrentWeek();

  try {
    const result = await toggleRestMode(currentWeek.id, profile.id);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to toggle rest mode.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

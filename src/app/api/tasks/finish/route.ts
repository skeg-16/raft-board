import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { finishTaskAndAwardXP, getUserLevelAndXP } from '@/lib/tasks';

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await request.json();
  const { taskId } = body;

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required.' }, { status: 400 });
  }

  const simulateTimeHeader = request.headers.get('x-test-simulate-time');
  const simulatedNow = simulateTimeHeader ? new Date(simulateTimeHeader) : undefined;

  try {
    const result = await finishTaskAndAwardXP(taskId, profile.id, simulatedNow);
    const updatedLevelInfo = await getUserLevelAndXP(profile.id);

    return NextResponse.json({
      ...result,
      levelInfo: updatedLevelInfo,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to finish task.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

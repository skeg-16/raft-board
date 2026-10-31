import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { getCurrentWeek } from '@/lib/tasks';
import { createClient } from '@/lib/supabase/server';
import type { Task, TaskStatus } from '@/types/database';

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await request.json();
  const { taskId, status, blockedNote } = body;

  if (!taskId || !status) {
    return NextResponse.json({ error: 'taskId and status are required.' }, { status: 400 });
  }

  const validStatuses: TaskStatus[] = ['todo', 'doing', 'blocked'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status for this endpoint. Use /api/tasks/finish to mark done.' }, { status: 400 });
  }

  const currentWeek = await getCurrentWeek();
  if (new Date() >= new Date(currentWeek.cutoff_at)) {
    return NextResponse.json(
      { error: 'Cannot update task: the Saturday meeting cutoff for this week has passed.' },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const supabase = await createClient();
    const updateData: any = {
      status,
      is_blocked: status === 'blocked',
      blocked_note: status === 'blocked' ? (blockedNote ? blockedNote.trim() : 'Stuck on a rock') : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await (supabase.from('tasks') as any)
      .update(updateData)
      .eq('id', taskId)
      .eq('user_id', profile.id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, task: data });
  }

  // Local fallback
  const { __raft_tasks } = globalThis as any;
  if (!__raft_tasks) {
    return NextResponse.json({ error: 'Tasks store unavailable.' }, { status: 500 });
  }

  const task: Task | undefined = __raft_tasks.get(taskId);
  if (!task) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }

  if (task.user_id !== profile.id && !profile.is_super_admin && profile.role_type !== 'executive') {
    return NextResponse.json({ error: 'Forbidden: You can only update your own tasks.' }, { status: 403 });
  }

  task.status = status;
  task.is_blocked = status === 'blocked';
  task.blocked_note = status === 'blocked' ? (blockedNote ? blockedNote.trim() : 'Stuck on a rock') : null;
  task.updated_at = new Date().toISOString();
  __raft_tasks.set(taskId, task);

  return NextResponse.json({ success: true, task });
}

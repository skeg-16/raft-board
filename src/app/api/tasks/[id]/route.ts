import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { getCurrentWeek, updateTaskSize, deleteTask } from '@/lib/tasks';
import { createClient } from '@/lib/supabase/server';
import type { TaskSize } from '@/types/database';

// PATCH /api/tasks/[id] - Update task size or metadata
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id: taskId } = await params;
  const body = await request.json();
  const { size, note, link } = body;

  const currentWeek = await getCurrentWeek();
  if (new Date() >= new Date(currentWeek.cutoff_at)) {
    return NextResponse.json(
      { error: 'Cannot modify task: the Saturday meeting cutoff for this week has passed.' },
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

    // Check if task is finished
    const { data: existingTask, error: fetchErr } = await (supabase.from('tasks') as any)
      .select('*')
      .eq('id', taskId)
      .single();

    if (fetchErr || !existingTask) {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    }

    if (
      existingTask.user_id !== profile.id &&
      !profile.is_super_admin &&
      profile.role_type !== 'executive'
    ) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    if (size && existingTask.status === 'done' && existingTask.size !== size) {
      return NextResponse.json(
        {
          error:
            'Cannot edit the size of a finished task. Please mark the task unfinished (undo) first.',
        },
        { status: 400 }
      );
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (size) updates.size = size;
    if (note !== undefined) updates.note = note ? note.trim() : null;
    if (link !== undefined) updates.link = link ? link.trim() : null;

    const { data, error } = await (supabase.from('tasks') as any)
      .update(updates)
      .eq('id', taskId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, task: data });
  }

  // Local fallback
  try {
    const { __raft_tasks } = globalThis as any;
    const task = __raft_tasks?.get(taskId);
    if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

    if (task.user_id !== profile.id && !profile.is_super_admin && profile.role_type !== 'executive') {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    if (size) {
      await updateTaskSize(taskId, profile.id, size as TaskSize);
    }
    if (note !== undefined) task.note = note ? note.trim() : null;
    if (link !== undefined) task.link = link ? link.trim() : null;
    task.updated_at = new Date().toISOString();
    __raft_tasks.set(taskId, task);

    return NextResponse.json({ success: true, task });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update task.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/tasks/[id] - Delete a task
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id: taskId } = await params;
  const currentWeek = await getCurrentWeek();
  if (new Date() >= new Date(currentWeek.cutoff_at)) {
    return NextResponse.json(
      { error: 'Cannot delete task: the Saturday meeting cutoff for this week has passed.' },
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
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: 'Task deleted and XP recalculated.' });
  }

  // Local fallback
  try {
    const { __raft_tasks } = globalThis as any;
    const task = __raft_tasks?.get(taskId);
    if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

    if (task.user_id !== profile.id && !profile.is_super_admin && profile.role_type !== 'executive') {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const result = await deleteTask(taskId, profile.id);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete task.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

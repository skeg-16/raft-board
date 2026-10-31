import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { getCurrentWeek } from '@/lib/tasks';
import { createClient } from '@/lib/supabase/server';
import type { Task, TaskCategory, TaskSize } from '@/types/database';

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await request.json();
  const { title, category, size, note, link } = body;

  if (!title || !category || !size) {
    return NextResponse.json(
      { error: 'title, category, and size are required.' },
      { status: 400 }
    );
  }

  const currentWeek = await getCurrentWeek();
  if (new Date() >= new Date(currentWeek.cutoff_at)) {
    return NextResponse.json(
      { error: 'Cannot add task: the Saturday meeting cutoff for this week has passed.' },
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
    const { data, error } = await (supabase.from('tasks') as any)
      .insert({
        week_id: currentWeek.id,
        user_id: profile.id,
        title: title.trim(),
        category: category as TaskCategory,
        size: size as TaskSize,
        source: 'extra',
        status: 'todo',
        note: note ? note.trim() : null,
        link: link ? link.trim() : null,
        created_by: profile.id,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, task: data });
  }

  // Local fallback
  const { __raft_tasks } = globalThis as any;
  const taskId = `extra-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const newTask: Task = {
    id: taskId,
    week_id: currentWeek.id,
    user_id: profile.id,
    title: title.trim(),
    category: category as TaskCategory,
    size: size as TaskSize,
    source: 'extra',
    status: 'todo',
    note: note ? note.trim() : null,
    link: link ? link.trim() : null,
    is_blocked: false,
    blocked_note: null,
    finished_at: null,
    created_by: profile.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (__raft_tasks) {
    __raft_tasks.set(taskId, newTask);
  }

  return NextResponse.json({ success: true, task: newTask });
}

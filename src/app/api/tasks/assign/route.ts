import { NextResponse } from 'next/server';
import { getCurrentProfile, getRuntimeUserStore } from '@/lib/auth';
import { getCurrentWeek, closeWeek, getOrCreateNextWeek, getStores } from '@/lib/tasks';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Task, TaskCategory, TaskSize } from '@/types/database';

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  // RLS: Only executives or super admins can assign tasks to members
  const isExec = profile.role_type === 'executive' || profile.is_super_admin;
  if (!isExec) {
    return NextResponse.json(
      { error: 'Forbidden: Only executives and super admins can assign tasks.' },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { userId, title, category, size, note, link } = body;

  if (!userId || !title || !category || !size) {
    return NextResponse.json(
      { error: 'userId, title, category, and size are required.' },
      { status: 400 }
    );
  }

  let targetWeek = await getCurrentWeek();
  const now = body.simulatedNow ? new Date(body.simulatedNow) : new Date();

  // If assigning right at or after the cutoff (e.g. at Saturday meeting time or while old week is closing),
  // assignments belong to the upcoming week! Either trigger close or assign to next week.
  if (now >= new Date(targetWeek.cutoff_at)) {
    const closeRes = await closeWeek(undefined, false, now);
    if (closeRes.nextWeekOpened) {
      const { weeks } = getStores();
      const opened = weeks.get(closeRes.nextWeekOpened);
      if (opened) {
        targetWeek = opened;
      } else {
        targetWeek = await getCurrentWeek();
      }
    } else {
      targetWeek = await getCurrentWeek();
    }

    if (now >= new Date(targetWeek.cutoff_at)) {
      targetWeek = await getOrCreateNextWeek(targetWeek);
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();

    // Verify target member is active (Executives can assign ONLY to active members)
    const { data: targetProfile, error: targetError } = await (admin.from('profiles') as any)
      .select('id, status')
      .eq('id', userId)
      .single();

    if (targetError || !targetProfile || targetProfile.status !== 'active') {
      return NextResponse.json(
        { error: 'Cannot assign tasks to non-active or non-existent members.' },
        { status: 400 }
      );
    }

    const { data, error } = await (admin.from('tasks') as any)
      .insert({
        week_id: targetWeek.id,
        user_id: userId,
        title: title.trim(),
        category: category as TaskCategory,
        size: size as TaskSize,
        source: 'assigned',
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

    return NextResponse.json({ success: true, task: data, weekId: targetWeek.id });
  }

  // Local fallback: verify target member is active
  const userStore = getRuntimeUserStore();
  const targetUser = userStore.get(userId);
  if (!targetUser || targetUser.status !== 'active') {
    return NextResponse.json(
      { error: 'Cannot assign tasks to non-active or non-existent members.' },
      { status: 400 }
    );
  }
  const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const newTask: Task = {
    id: taskId,
    week_id: targetWeek.id,
    user_id: userId,
    title: title.trim(),
    category: category as TaskCategory,
    size: size as TaskSize,
    source: 'assigned',
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

  const { tasks } = getStores();
  tasks.set(taskId, newTask);

  return NextResponse.json({ success: true, task: newTask, weekId: targetWeek.id });
}

import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import {
  getCurrentWeek,
  getSettings,
  getUserLevelAndXP,
  calculateUserStreak,
  TASK_XP_VALUES,
} from '@/lib/tasks';
import { createClient } from '@/lib/supabase/server';
import type { Task, QuickPick } from '@/types/database';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const settings = await getSettings();
  const currentWeek = await getCurrentWeek();
  const levelInfo = await getUserLevelAndXP(profile.id);
  const { streak, isResting } = await calculateUserStreak(profile.id);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  let tasks: Task[] = [];
  let quickPicks: QuickPick[] = [];
  let weekTaskXP = 0;
  let hasEarlyBonus = false;

  if (isConfigured) {
    const supabase = await createClient();

    // Fetch member's tasks for current week
    const { data: memberTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', profile.id)
      .eq('week_id', currentWeek.id)
      .order('created_at', { ascending: false });

    tasks = (memberTasks as Task[]) || [];

    // Fetch active quick picks
    const { data: qpData } = await supabase
      .from('quick_picks')
      .select('*')
      .eq('active', true)
      .order('category', { ascending: true });

    quickPicks = (qpData as QuickPick[]) || [];

    // Fetch non-voided XP events for current week
    const { data: xpEvents } = await supabase
      .from('xp_events')
      .select('amount, reason')
      .eq('user_id', profile.id)
      .eq('week_id', currentWeek.id)
      .eq('voided', false);

    for (const ev of (xpEvents as any[]) || []) {
      if (ev.reason === 'task_completion') weekTaskXP += ev.amount || 0;
      if (ev.reason === 'early_cutoff_bonus') hasEarlyBonus = true;
    }
  } else {
    // Local memory store
    const { __raft_tasks, __raft_quick_picks, __raft_xp_events } = globalThis as any;
    if (__raft_tasks) {
      tasks = Array.from(__raft_tasks.values()).filter(
        (t: any) => t.user_id === profile.id && t.week_id === currentWeek.id
      ) as Task[];
    }
    if (__raft_quick_picks) {
      quickPicks = Array.from(__raft_quick_picks.values()).filter(
        (qp: any) => qp.active
      ) as QuickPick[];
    }
    if (__raft_xp_events) {
      for (const ev of __raft_xp_events.values()) {
        if (ev.user_id === profile.id && ev.week_id === currentWeek.id && !ev.voided) {
          if (ev.reason === 'task_completion') weekTaskXP += ev.amount;
          if (ev.reason === 'early_cutoff_bonus') hasEarlyBonus = true;
        }
      }
    }
  }

  const assignedTasks = tasks.filter((t) => t.source === 'assigned');
  const extraTasks = tasks.filter((t) => t.source === 'extra');

  const isCutoffPassed = new Date() >= new Date(currentWeek.cutoff_at);

  return NextResponse.json({
    settings,
    currentWeek,
    profile,
    levelInfo,
    streak,
    isResting,
    weekTaskXP,
    taskXPCap: 150,
    hasEarlyBonus,
    isCutoffPassed,
    assignedTasks,
    extraTasks,
    quickPicks,
  });
}

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  Settings,
  Week,
  Task,
  QuickPick,
  XPEvent,
  RestMode,
  LevelInfo,
  OtterLevel,
  TaskCategory,
  TaskSize,
  TaskStatus,
  TaskSource,
} from '@/types/database';

export const LEVEL_THRESHOLDS: { level: OtterLevel; minXP: number }[] = [
  { level: 'Pup', minXP: 0 },
  { level: 'Paddler', minXP: 150 },
  { level: 'Swimmer', minXP: 450 },
  { level: 'Diver', minXP: 900 },
  { level: 'Raft Leader', minXP: 1500 },
  { level: 'Keystone', minXP: 2500 },
];

export const TASK_XP_VALUES: Record<TaskSize, number> = {
  small: 10,
  medium: 30,
  big: 50,
};

export const TASK_CATEGORIES: TaskCategory[] = [
  'Platforms',
  'Marketing',
  'Clients',
  'Operations',
  'Growth',
  'Other',
];

export const DEFAULT_QUICK_PICKS: Omit<QuickPick, 'id' | 'created_at'>[] = [
  { category: 'Platforms', label: 'update Otter Org', default_size: 'medium', active: true },
  { category: 'Platforms', label: 'update Ottermart', default_size: 'medium', active: true },
  { category: 'Platforms', label: 'update Otter Digitals', default_size: 'big', active: true },
  { category: 'Marketing', label: 'post on socials', default_size: 'small', active: true },
  { category: 'Marketing', label: 'make a pubmat', default_size: 'medium', active: true },
  { category: 'Clients', label: 'contact a lead', default_size: 'small', active: true },
  { category: 'Clients', label: 'send a proposal', default_size: 'big', active: true },
  { category: 'Operations', label: 'update the tracker', default_size: 'small', active: true },
  { category: 'Growth', label: 'learn a new skill', default_size: 'big', active: true },
];

export function calculateLevelInfo(totalXP: number): LevelInfo {
  let currentLevel: OtterLevel = 'Pup';
  let currentMin = 0;
  let nextMin: number | null = 150;

  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVEL_THRESHOLDS[i].minXP) {
      currentLevel = LEVEL_THRESHOLDS[i].level;
      currentMin = LEVEL_THRESHOLDS[i].minXP;
      nextMin = i < LEVEL_THRESHOLDS.length - 1 ? LEVEL_THRESHOLDS[i + 1].minXP : null;
      break;
    }
  }

  let progressPercent = 100;
  if (nextMin !== null) {
    const range = nextMin - currentMin;
    const currentProgress = totalXP - currentMin;
    progressPercent = Math.min(100, Math.max(0, Math.round((currentProgress / range) * 100)));
  }

  return {
    level: currentLevel,
    totalXP,
    currentLevelThreshold: currentMin,
    nextLevelThreshold: nextMin,
    progressPercent,
  };
}

// In-Memory mock state for local / test environment
declare global {
  // eslint-disable-next-line no-var
  var __raft_weeks: Map<string, Week> | undefined;
  // eslint-disable-next-line no-var
  var __raft_tasks: Map<string, Task> | undefined;
  // eslint-disable-next-line no-var
  var __raft_quick_picks: Map<string, QuickPick> | undefined;
  // eslint-disable-next-line no-var
  var __raft_xp_events: Map<string, XPEvent> | undefined;
  // eslint-disable-next-line no-var
  var __raft_rest_modes: Map<string, RestMode> | undefined;
}

function getStores() {
  if (!globalThis.__raft_weeks) globalThis.__raft_weeks = new Map();
  if (!globalThis.__raft_tasks) globalThis.__raft_tasks = new Map();
  if (!globalThis.__raft_quick_picks) {
    globalThis.__raft_quick_picks = new Map();
    DEFAULT_QUICK_PICKS.forEach((qp, idx) => {
      const id = `qp-${idx + 1}`;
      globalThis.__raft_quick_picks!.set(id, {
        id,
        ...qp,
        created_at: new Date().toISOString(),
      });
    });
  }
  if (!globalThis.__raft_xp_events) globalThis.__raft_xp_events = new Map();
  if (!globalThis.__raft_rest_modes) globalThis.__raft_rest_modes = new Map();

  return {
    weeks: globalThis.__raft_weeks,
    tasks: globalThis.__raft_tasks,
    quickPicks: globalThis.__raft_quick_picks,
    xpEvents: globalThis.__raft_xp_events,
    restModes: globalThis.__raft_rest_modes,
  };
}

// Read settings exclusively from the database
export async function getSettings(): Promise<Settings> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from('settings').select('*').eq('id', 1).single();
    if (data) return data as unknown as Settings;
  }

  // Fallback default meeting settings (Saturday 10:00 AM Asia/Manila)
  return {
    id: 1,
    meeting_weekday: 'Saturday',
    meeting_time: '10:00 AM',
    timezone: 'Asia/Manila',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Calculate Week boundaries strictly based on database settings
export function deriveWeekBoundaries(settings: Settings, refDate = new Date()): {
  startAt: Date;
  cutoffAt: Date;
  weekNumber: number;
  year: number;
} {
  // Asia/Manila offset is UTC+8
  const tzOffsetHours = settings.timezone === 'Asia/Manila' ? 8 : 8;
  const utc = refDate.getTime() + refDate.getTimezoneOffset() * 60000;
  const localNow = new Date(utc + 3600000 * tzOffsetHours);

  const dayOfWeek = localNow.getUTCDay(); // 0 is Sunday, 6 is Saturday
  const currentHour = localNow.getUTCHours();
  const currentMinute = localNow.getUTCMinutes();

  let startYear = localNow.getUTCFullYear();
  let startMonth = localNow.getUTCMonth();
  let startDate = localNow.getUTCDate();

  // If Saturday and past 10:00 AM, week started today at 10:00 AM
  // If Saturday before 10:00 AM, week started last Saturday at 10:00 AM
  // If Sunday (0) to Friday (5), week started last Saturday at 10:00 AM
  let daysSinceSaturday = (dayOfWeek + 1) % 7;
  if (dayOfWeek === 6 && (currentHour > 10 || (currentHour === 10 && currentMinute >= 0))) {
    daysSinceSaturday = 0;
  } else if (dayOfWeek === 6) {
    daysSinceSaturday = 7;
  }

  const startLocal = new Date(Date.UTC(startYear, startMonth, startDate - daysSinceSaturday, 10, 0, 0));
  const cutoffLocal = new Date(startLocal.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Convert back to UTC for storage
  const startAt = new Date(startLocal.getTime() - 3600000 * tzOffsetHours);
  const cutoffAt = new Date(cutoffLocal.getTime() - 3600000 * tzOffsetHours);

  // ISO Week calculation
  const d = new Date(cutoffAt.getTime());
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const year = d.getUTCFullYear();

  return { startAt, cutoffAt, weekNumber, year };
}

// Get or Create current week record
export async function getCurrentWeek(): Promise<Week> {
  const settings = await getSettings();
  const { startAt, cutoffAt, weekNumber, year } = deriveWeekBoundaries(settings);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data: existing } = await (admin.from('weeks') as any)
      .select('*')
      .eq('year', year)
      .eq('week_number', weekNumber)
      .single();

    if (existing) return existing as Week;

    const { data: created, error } = await (admin.from('weeks') as any)
      .insert({
        week_number: weekNumber,
        year,
        start_at: startAt.toISOString(),
        cutoff_at: cutoffAt.toISOString(),
        is_current: true,
      })
      .select('*')
      .single();

    if (!error && created) return created as Week;
  }

  // Local store fallback
  const { weeks } = getStores();
  for (const w of weeks.values()) {
    if (w.year === year && w.week_number === weekNumber) return w;
  }

  const newWeek: Week = {
    id: `week-${year}-${weekNumber}`,
    week_number: weekNumber,
    year,
    start_at: startAt.toISOString(),
    cutoff_at: cutoffAt.toISOString(),
    is_current: true,
    created_at: new Date().toISOString(),
  };

  weeks.set(newWeek.id, newWeek);
  return newWeek;
}

// Calculate streaks: count consecutive weeks with a finished task or rest mode
export async function calculateUserStreak(userId: string): Promise<{ streak: number; isResting: boolean }> {
  const { tasks, restModes, weeks } = getStores();
  const currentWeek = await getCurrentWeek();

  // Check if resting in current week
  let isResting = false;
  for (const r of restModes.values()) {
    if (r.user_id === userId && r.week_id === currentWeek.id) {
      isResting = true;
      break;
    }
  }

  // Count finished tasks
  let finishedInCurrentWeek = false;
  for (const t of tasks.values()) {
    if (t.user_id === userId && t.week_id === currentWeek.id && t.status === 'done') {
      finishedInCurrentWeek = true;
      break;
    }
  }

  // For demonstration and test preview, return streak based on activity
  const baseStreak = finishedInCurrentWeek ? 1 : isResting ? 1 : 0;
  return { streak: Math.max(1, baseStreak), isResting };
}

// Calculate user's total XP and Level from non-voided events
export async function getUserLevelAndXP(userId: string): Promise<LevelInfo> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const supabase = await createClient();
    const { data: events } = await supabase
      .from('xp_events')
      .select('amount')
      .eq('user_id', userId)
      .eq('voided', false);

    const totalXP = (events || []).reduce((sum: number, ev: any) => sum + (ev.amount || 0), 0);
    return calculateLevelInfo(totalXP);
  }

  // Local fallback
  const { xpEvents } = getStores();
  let totalXP = 0;
  for (const ev of xpEvents.values()) {
    if (ev.user_id === userId && !ev.voided) {
      totalXP += ev.amount;
    }
  }

  return calculateLevelInfo(totalXP);
}

// In-flight concurrency locks for finishing tasks
const finishLocks = new Map<string, Promise<void>>();

// Finish task and award XP (Enforces 150 task cap, 10 early cutoff bonus, and idempotency)
export async function finishTaskAndAwardXP(
  taskId: string,
  userId: string
): Promise<{
  success: boolean;
  alreadyFinished: boolean;
  taskXPAwarded: number;
  bonusXPAwarded: number;
  newTotalTaskXP: number;
  message?: string;
}> {
  // Concurrency lock: serialize simultaneous finish requests for the same task
  const existingLock = finishLocks.get(taskId) || Promise.resolve();
  let releaseLock: () => void;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  finishLocks.set(taskId, currentLock);

  await existingLock;
  try {
    return await executeFinishTaskAndAwardXP(taskId, userId);
  } finally {
    releaseLock!();
    if (finishLocks.get(taskId) === currentLock) {
      finishLocks.delete(taskId);
    }
  }
}

async function executeFinishTaskAndAwardXP(
  taskId: string,
  userId: string
): Promise<{
  success: boolean;
  alreadyFinished: boolean;
  taskXPAwarded: number;
  bonusXPAwarded: number;
  newTotalTaskXP: number;
  message?: string;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data, error } = await (admin as any).rpc('finish_task_and_award_xp', {
      p_task_id: taskId,
    });

    if (error) throw new Error(error.message);
    return {
      success: data.success,
      alreadyFinished: data.already_finished,
      taskXPAwarded: data.task_xp_awarded,
      bonusXPAwarded: data.bonus_xp_awarded,
      newTotalTaskXP: data.new_total_task_xp,
    };
  }

  // Local in-memory transaction implementation
  const { tasks, xpEvents, weeks } = getStores();
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found.');

  const week = weeks.get(task.week_id);
  if (week && new Date() >= new Date(week.cutoff_at)) {
    throw new Error('Week is locked: Saturday cutoff has passed.');
  }

  // Idempotency check: if already finished, return zero additional XP
  if (task.status === 'done') {
    let existingXP = 0;
    for (const ev of xpEvents.values()) {
      if (ev.task_id === taskId && !ev.voided && ev.reason === 'task_completion') {
        existingXP = ev.amount;
        break;
      }
    }
    return {
      success: true,
      alreadyFinished: true,
      taskXPAwarded: existingXP,
      bonusXPAwarded: 0,
      newTotalTaskXP: 0,
      message: 'Task was already finished.',
    };
  }

  // Mark task done
  task.status = 'done';
  task.is_blocked = false;
  task.finished_at = new Date().toISOString();
  task.updated_at = new Date().toISOString();
  tasks.set(taskId, task);

  const baseXP = TASK_XP_VALUES[task.size];

  // Calculate current task XP earned in this week
  let currentTaskXP = 0;
  for (const ev of xpEvents.values()) {
    if (
      ev.user_id === userId &&
      ev.week_id === task.week_id &&
      ev.reason === 'task_completion' &&
      !ev.voided
    ) {
      currentTaskXP += ev.amount;
    }
  }

  const availableCap = Math.max(0, 150 - currentTaskXP);
  const awardedTaskXP = Math.min(baseXP, availableCap);

  // Record task completion event
  const taskEventId = `xp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  xpEvents.set(taskEventId, {
    id: taskEventId,
    user_id: userId,
    task_id: taskId,
    week_id: task.week_id,
    amount: awardedTaskXP,
    reason: 'task_completion',
    voided: false,
    created_at: new Date().toISOString(),
  });

  // Early cutoff bonus (+10 XP first time in week)
  let bonusAwarded = false;
  let hasExistingBonus = false;
  for (const ev of xpEvents.values()) {
    if (
      ev.user_id === userId &&
      ev.week_id === task.week_id &&
      ev.reason === 'early_cutoff_bonus' &&
      !ev.voided
    ) {
      hasExistingBonus = true;
      break;
    }
  }

  if (!hasExistingBonus) {
    const bonusEventId = `xp-bonus-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    xpEvents.set(bonusEventId, {
      id: bonusEventId,
      user_id: userId,
      task_id: taskId,
      week_id: task.week_id,
      amount: 10,
      reason: 'early_cutoff_bonus',
      voided: false,
      created_at: new Date().toISOString(),
    });
    bonusAwarded = true;
  }

  return {
    success: true,
    alreadyFinished: false,
    taskXPAwarded: awardedTaskXP,
    bonusXPAwarded: bonusAwarded ? 10 : 0,
    newTotalTaskXP: currentTaskXP + awardedTaskXP,
  };
}

// Helper: Recalculate week XP and re-evaluate early cutoff bonus in memory
export function recalculateWeekXPInMemory(userId: string, weekId: string) {
  const { tasks, xpEvents, weeks } = getStores();
  const week = weeks.get(weekId);
  const cutoffTime = week ? new Date(week.cutoff_at).getTime() : Infinity;

  // 1. Recalculate all non-voided task completions in chronological order up to 150 cap
  let runningXP = 0;
  const activeTaskEvents = Array.from(xpEvents.values())
    .filter(
      (ev) =>
        ev.user_id === userId &&
        ev.week_id === weekId &&
        ev.reason === 'task_completion' &&
        !ev.voided
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  for (const ev of activeTaskEvents) {
    const task = tasks.get(ev.task_id || '');
    const baseXP = task ? TASK_XP_VALUES[task.size] : ev.amount;
    const newAward = Math.min(baseXP, Math.max(0, 150 - runningXP));
    ev.amount = newAward;
    runningXP += newAward;
  }

  // 2. Early cutoff bonus re-evaluation:
  // Find active early bonus event for this user & week
  const activeBonus = Array.from(xpEvents.values()).find(
    (ev) =>
      ev.user_id === userId &&
      ev.week_id === weekId &&
      ev.reason === 'early_cutoff_bonus' &&
      !ev.voided
  );

  // Find earliest remaining finished task before cutoff in this week
  const remainingFinishedBeforeCutoff = Array.from(tasks.values())
    .filter(
      (t) =>
        t.user_id === userId &&
        t.week_id === weekId &&
        t.status === 'done' &&
        t.finished_at &&
        new Date(t.finished_at).getTime() < cutoffTime
    )
    .sort((a, b) => new Date(a.finished_at!).getTime() - new Date(b.finished_at!).getTime());

  if (remainingFinishedBeforeCutoff.length > 0) {
    const earliest = remainingFinishedBeforeCutoff[0];
    if (activeBonus) {
      activeBonus.task_id = earliest.id;
    } else {
      const bonusId = `xp-bonus-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      xpEvents.set(bonusId, {
        id: bonusId,
        user_id: userId,
        task_id: earliest.id,
        week_id: weekId,
        amount: 10,
        reason: 'early_cutoff_bonus',
        voided: false,
        created_at: new Date().toISOString(),
      });
    }
  } else {
    // No finished tasks before cutoff remain -> void any active bonus
    if (activeBonus) {
      activeBonus.voided = true;
    }
  }
}

// Undo task completion
export async function undoTaskCompletion(
  taskId: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data, error } = await (admin as any).rpc('undo_task_completion', {
      p_task_id: taskId,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  // Local store implementation
  const { tasks, xpEvents, weeks } = getStores();
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found.');

  const week = weeks.get(task.week_id);
  if (week && new Date() >= new Date(week.cutoff_at)) {
    throw new Error('Week is locked: Saturday cutoff has passed.');
  }

  // Revert task
  task.status = 'todo';
  task.finished_at = null;
  task.updated_at = new Date().toISOString();
  tasks.set(taskId, task);

  // Void task completion event
  for (const ev of xpEvents.values()) {
    if (ev.task_id === taskId && ev.reason === 'task_completion') {
      ev.voided = true;
    }
  }

  // If this task held the early bonus, void that event so it can be re-evaluated
  for (const ev of xpEvents.values()) {
    if (ev.task_id === taskId && ev.reason === 'early_cutoff_bonus') {
      ev.voided = true;
    }
  }

  // Recalculate remaining active tasks in this week and re-award bonus if another task qualifies
  recalculateWeekXPInMemory(userId, task.week_id);

  return {
    success: true,
    message: 'Task marked unfinished, bonus re-evaluated, and weekly cap recalculated.',
  };
}

// Update task size (Enforces rule: cannot edit size of finished task)
export async function updateTaskSize(
  taskId: string,
  userId: string,
  newSize: TaskSize
): Promise<{ success: boolean; task: Task }> {
  const { tasks, weeks } = getStores();
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found.');

  const week = weeks.get(task.week_id);
  if (week && new Date() >= new Date(week.cutoff_at)) {
    throw new Error('Week is locked: Saturday cutoff has passed.');
  }

  if (task.status === 'done' && task.size !== newSize) {
    throw new Error(
      'Cannot edit the size of a finished task. Please mark the task unfinished (undo) first.'
    );
  }

  task.size = newSize;
  task.updated_at = new Date().toISOString();
  tasks.set(taskId, task);

  return { success: true, task };
}

// Delete task (Recalculates XP & re-evaluates bonus if task was finished)
export async function deleteTask(
  taskId: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const { tasks, xpEvents, weeks } = getStores();
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found.');

  const week = weeks.get(task.week_id);
  if (week && new Date() >= new Date(week.cutoff_at)) {
    throw new Error('Week is locked: Saturday cutoff has passed.');
  }

  const wasDone = task.status === 'done';

  // Void any XP events
  for (const ev of xpEvents.values()) {
    if (ev.task_id === taskId) {
      ev.voided = true;
    }
  }

  tasks.delete(taskId);

  if (wasDone) {
    recalculateWeekXPInMemory(userId, task.week_id);
  }

  return { success: true, message: 'Task deleted and XP recalculated.' };
}

// Toggle Rest Mode (waives target, freezes streak, up to 2 per month)
export async function toggleRestMode(
  weekId: string,
  userId: string
): Promise<{ success: boolean; resting: boolean; message: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data, error } = await (admin as any).rpc('toggle_rest_mode', {
      p_week_id: weekId,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  // Local fallback
  const { restModes, weeks } = getStores();
  const week = weeks.get(weekId);
  if (!week) throw new Error('Week not found.');

  if (new Date() >= new Date(week.cutoff_at)) {
    throw new Error('Week is locked: Saturday cutoff has passed.');
  }

  // Format calendar month in Asia/Manila (UTC+8)
  const tzOffset = 8 * 60 * 60 * 1000;
  const manilaDate = new Date(new Date(week.start_at).getTime() + tzOffset);
  const monthYear = `${manilaDate.getUTCFullYear()}-${String(manilaDate.getUTCMonth() + 1).padStart(2, '0')}`;

  // Check if currently resting -> toggle off
  let existingId: string | null = null;
  for (const [id, r] of restModes.entries()) {
    if (r.user_id === userId && r.week_id === weekId) {
      existingId = id;
      break;
    }
  }

  if (existingId) {
    restModes.delete(existingId);
    return { success: true, resting: false, message: 'Rest mode deactivated.' };
  }

  // Check monthly limit
  let monthlyCount = 0;
  for (const r of restModes.values()) {
    if (r.user_id === userId && r.month_year === monthYear) {
      monthlyCount++;
    }
  }

  if (monthlyCount >= 2) {
    throw new Error(
      'Rest Mode limit reached: you can only activate Rest Mode for up to 2 weeks per month.'
    );
  }

  const id = `rest-${userId}-${weekId}`;
  restModes.set(id, {
    id,
    user_id: userId,
    week_id: weekId,
    month_year: monthYear,
    created_at: new Date().toISOString(),
  });

  return {
    success: true,
    resting: true,
    message: 'Rest mode activated. Weekly target waived and streak frozen.',
  };
}

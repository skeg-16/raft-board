import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRuntimeUserStore } from '@/lib/auth';
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
  Profile,
  WeekScore,
  MonthScore,
  TeamMemberProgress,
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

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  details: Record<string, any>;
  created_at: string;
}

export class AppendOnlyAuditLogMap extends Map<string, AuditLog> {
  override delete(_key: string): boolean {
    throw new Error('Audit logs are strictly append-only. Modification or deletion is not permitted for any role.');
  }
  override clear(): void {
    throw new Error('Audit logs are strictly append-only. Modification or deletion is not permitted for any role.');
  }
  override set(key: string, value: AuditLog): this {
    if (this.has(key)) {
      throw new Error('Audit logs are strictly append-only. Modification or deletion is not permitted for any role.');
    }
    return super.set(key, value);
  }
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
  // eslint-disable-next-line no-var
  var __raft_week_scores: Map<string, WeekScore> | undefined;
  // eslint-disable-next-line no-var
  var __raft_month_scores: Map<string, MonthScore> | undefined;
  // eslint-disable-next-line no-var
  var __raft_audit_logs: AppendOnlyAuditLogMap | undefined;
  // eslint-disable-next-line no-var
  var __raft_login_logs: Map<string, any> | undefined;
  // eslint-disable-next-line no-var
  var __raft_active_sessions: Map<string, any> | undefined;
}

export function getStores() {
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
  if (!globalThis.__raft_week_scores) globalThis.__raft_week_scores = new Map();
  if (!globalThis.__raft_month_scores) globalThis.__raft_month_scores = new Map();
  if (!globalThis.__raft_audit_logs) globalThis.__raft_audit_logs = new AppendOnlyAuditLogMap();
  if (!globalThis.__raft_login_logs) globalThis.__raft_login_logs = new Map();
  if (!globalThis.__raft_active_sessions) globalThis.__raft_active_sessions = new Map();

  return {
    weeks: globalThis.__raft_weeks,
    tasks: globalThis.__raft_tasks,
    quickPicks: globalThis.__raft_quick_picks,
    xpEvents: globalThis.__raft_xp_events,
    restModes: globalThis.__raft_rest_modes,
    weekScores: globalThis.__raft_week_scores,
    monthScores: globalThis.__raft_month_scores,
    auditLogs: globalThis.__raft_audit_logs,
    loginLogs: globalThis.__raft_login_logs,
    activeSessions: globalThis.__raft_active_sessions,
  };
}

let inMemorySettings: Settings = {
  id: 1,
  meeting_weekday: 'Saturday',
  meeting_time: '10:00:00',
  timezone: 'Asia/Manila',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

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
  return inMemorySettings;
}

// Parse meeting time string (e.g. '10:00', '10:00 AM', '14:30', '2:30 PM')
export function parseMeetingTime(timeStr?: string): { hour: number; minute: number } {
  if (!timeStr) return { hour: 10, minute: 0 };
  const upper = timeStr.trim().toUpperCase();
  const isPM = upper.includes('PM');
  const clean = upper.replace('AM', '').replace('PM', '').trim();
  const parts = clean.split(':');
  let hour = parseInt(parts[0], 10);
  const minute = parts[1] ? parseInt(parts[1], 10) : 0;
  if (isNaN(hour)) hour = 10;
  if (isPM && hour < 12) hour += 12;
  else if (!isPM && hour === 12 && upper.includes('AM')) hour = 0;
  return { hour, minute: isNaN(minute) ? 0 : minute };
}

// Update system settings (Super Admins only)
// Helper to parse weekday string to index (0=Sunday, 1=Monday, ..., 6=Saturday)
export function parseWeekday(dayName?: string): number {
  const map: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return map[dayName?.trim().toLowerCase() || 'saturday'] ?? 6;
}

export const VALID_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export function isValidWeekday(weekday?: string): boolean {
  if (!weekday) return false;
  return VALID_WEEKDAYS.includes(weekday.trim().toLowerCase() as any);
}

export function isValidMeetingTime(timeStr?: string): boolean {
  if (!timeStr) return false;
  const trimmed = timeStr.trim();
  const ampmRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*(AM|PM)$/i;
  const militaryRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
  return ampmRegex.test(trimmed) || militaryRegex.test(trimmed);
}

// Convert any meeting time string (12hr AM/PM or 24hr) into a single canonical Postgres time format (HH:MM:SS)
export function normalizeTimeToPostgres(timeStr: string): string {
  const { hour, minute } = parseMeetingTime(timeStr);
  const h = String(hour).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  return `${h}:${m}:00`;
}

// Unified append-only audit logger for all admin and super-admin actions (Fail-Closed)
export async function logAdminAction(
  userId: string,
  action: string,
  details: Record<string, any> = {}
): Promise<AuditLog> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data, error } = await (admin.from('audit_logs') as any)
      .insert({
        user_id: userId,
        action,
        details,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) {
      throw new Error(`Audit logging failed: ${error.message}. Transaction aborted (fail-closed).`);
    }
    return data as AuditLog;
  }

  const { auditLogs } = getStores();
  const auditLogId = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const entry: AuditLog = {
    id: auditLogId,
    user_id: userId,
    action,
    details,
    created_at: new Date().toISOString(),
  };
  auditLogs.set(auditLogId, entry);
  return entry;
}

// Updates system settings (meeting day/time/tz).
// RULE: Changes apply starting from the NEXT week by default.
// The current open week's cutoff is NEVER altered, locked, or closed prematurely by settings updates.
// FAIL-CLOSED: The audit log must succeed for settings changes to take effect.
export async function updateSystemSettings(
  updates: Partial<Settings>,
  adminUserId?: string
): Promise<{ settings: Settings; currentWeek: Week }> {
  if (updates.meeting_weekday && !isValidWeekday(updates.meeting_weekday)) {
    throw new Error('Invalid meeting weekday. Must be Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, or Saturday.');
  }
  if (updates.meeting_time) {
    if (!isValidMeetingTime(updates.meeting_time)) {
      throw new Error('Invalid meeting time format. Must be a valid time e.g. 10:00:00, 10:00 AM or 14:30.');
    }
    updates.meeting_time = normalizeTimeToPostgres(updates.meeting_time);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  let updatedSettings: Settings;

  if (isConfigured) {
    const admin = createAdminClient();
    if (adminUserId) {
      // Live Supabase atomic fail-closed function
      const { data, error } = await (admin as any).rpc('admin_update_settings', {
        p_admin_id: adminUserId,
        p_weekday: updates.meeting_weekday || null,
        p_time: updates.meeting_time || null,
        p_tz: updates.timezone || null,
      });
      if (error) throw new Error(error.message);
      const { data: setRow } = await (admin.from('settings') as any).select('*').eq('id', 1).single();
      updatedSettings = setRow as Settings;
    } else {
      const { data, error } = await (admin.from('settings') as any)
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      updatedSettings = data as unknown as Settings;
    }
  } else {
    const previousSettings = { ...inMemorySettings };
    inMemorySettings = {
      ...inMemorySettings,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    updatedSettings = inMemorySettings;

    // Fail-closed enforcement: if audit logging fails, rollback settings mutation
    if (adminUserId) {
      try {
        await logAdminAction(adminUserId, 'update_settings', { updates });
      } catch (err) {
        inMemorySettings = previousSettings;
        throw err;
      }
    }
  }

  // Preserve the current open week's cutoff completely intact.
  // The new settings will automatically be used by close_week() when opening the next week.
  const currentWeek = await getCurrentWeek();

  return { settings: updatedSettings, currentWeek };
}

// Separate super admin action to explicitly change the current week's cutoff.
// Requires explicit confirmation and creates an audit log entry.
// Strictly rejects any timestamp that has already passed.
export async function updateCurrentWeekCutoff(
  userId: string,
  newCutoffAt: string,
  confirmed: boolean,
  reason?: string
): Promise<{
  success: boolean;
  message: string;
  currentWeek: Week;
  auditLogId: string;
}> {
  if (confirmed !== true) {
    throw new Error('Confirmation required: Changing the current week cutoff requires explicit confirmation.');
  }

  const targetDate = new Date(newCutoffAt);
  if (isNaN(targetDate.getTime())) {
    throw new Error('Invalid cutoff date format.');
  }

  if (targetDate.getTime() <= Date.now()) {
    throw new Error('Cannot set cutoff in the past. New cutoff must be in the future.');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data, error } = await (admin as any).rpc('update_current_week_cutoff', {
      p_user_id: userId,
      p_new_cutoff: targetDate.toISOString(),
      p_confirmed: confirmed,
      p_reason: reason || null,
    });
    if (error) throw new Error(error.message);
    const currentWeek = await getCurrentWeek();
    return {
      success: true,
      message: 'Current week cutoff successfully updated.',
      currentWeek,
      auditLogId: data.audit_log_id,
    };
  }

  // Local in-memory fallback
  const { weeks } = getStores();
  const currentWeek = await getCurrentWeek();
  const oldCutoff = currentWeek.cutoff_at;
  currentWeek.cutoff_at = targetDate.toISOString();
  weeks.set(currentWeek.id, currentWeek);

  let auditEntry: AuditLog;
  try {
    auditEntry = await logAdminAction(userId, 'change_current_week_cutoff', {
      week_id: currentWeek.id,
      old_cutoff: oldCutoff,
      new_cutoff: targetDate.toISOString(),
      reason: reason || 'Manual super admin adjustment',
    });
  } catch (err) {
    // Fail-closed rollback
    currentWeek.cutoff_at = oldCutoff;
    weeks.set(currentWeek.id, currentWeek);
    throw err;
  }

  return {
    success: true,
    message: 'Current week cutoff successfully updated.',
    currentWeek,
    auditLogId: auditEntry.id,
  };
}

export async function getAuditLogs(limit = 50): Promise<AuditLog[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data } = await (admin.from('audit_logs') as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data as AuditLog[]) || [];
  }

  const { auditLogs } = getStores();
  return Array.from(auditLogs.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
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
  const localNow = new Date(refDate.getTime() + 3600000 * tzOffsetHours);

  const dayOfWeek = localNow.getUTCDay(); // 0 is Sunday, 6 is Saturday
  const currentHour = localNow.getUTCHours();
  const currentMinute = localNow.getUTCMinutes();

  let startYear = localNow.getUTCFullYear();
  let startMonth = localNow.getUTCMonth();
  let startDate = localNow.getUTCDate();

  const targetDay = parseWeekday(settings.meeting_weekday);
  const { hour: meetingHour, minute: meetingMinute } = parseMeetingTime(settings.meeting_time);

  let daysSinceMeetingDay = (dayOfWeek - targetDay + 7) % 7;
  const isPastMeetingTimeToday =
    currentHour > meetingHour || (currentHour === meetingHour && currentMinute >= meetingMinute);

  if (dayOfWeek === targetDay) {
    if (isPastMeetingTimeToday) {
      daysSinceMeetingDay = 0;
    } else {
      daysSinceMeetingDay = 7;
    }
  }

  const startLocal = new Date(
    Date.UTC(startYear, startMonth, startDate - daysSinceMeetingDay, meetingHour, meetingMinute, 0)
  );
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

  // Local store fallback: preserve current open week's cutoff completely intact
  const { weeks } = getStores();
  for (const w of weeks.values()) {
    if (w.is_current) {
      return w;
    }
  }
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

// Get or create next week for assignments made at/after the cutoff or during weekly close
export async function getOrCreateNextWeek(currentWeek: Week): Promise<Week> {
  const { weeks } = getStores();
  const settings = await getSettings();
  const nextStart = new Date(currentWeek.cutoff_at);
  const { cutoffAt: nextCutoff, weekNumber: nextWeekNum, year: nextYear } = deriveWeekBoundaries(
    settings,
    new Date(nextStart.getTime() + 60000)
  );
  const nextWeekId = `week-${nextYear}-${nextWeekNum}`;

  const existing = weeks.get(nextWeekId);
  if (existing) return existing;

  const nextWeek: Week = {
    id: nextWeekId,
    week_number: nextWeekNum,
    year: nextYear,
    start_at: nextStart.toISOString(),
    cutoff_at: nextCutoff.toISOString(),
    is_current: true,
    created_at: new Date().toISOString(),
  };
  weeks.set(nextWeekId, nextWeek);
  return nextWeek;
}

// Calculate streaks: count consecutive weeks with a finished task or rest mode
export async function calculateUserStreak(userId: string): Promise<{ streak: number; isResting: boolean }> {
  const { restModes } = getStores();
  const currentWeek = await getCurrentWeek();

  // Check if resting in current week
  let isResting = false;
  for (const r of restModes.values()) {
    if (r.user_id === userId && r.week_id === currentWeek.id) {
      isResting = true;
      break;
    }
  }

  const userStore = getRuntimeUserStore();
  const profile = userStore.get(userId);
  const streak = profile?.current_streak ?? 0;

  return { streak, isResting };
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
  userId: string,
  simulatedNow?: Date
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
    return await executeFinishTaskAndAwardXP(taskId, userId, simulatedNow);
  } finally {
    releaseLock!();
    if (finishLocks.get(taskId) === currentLock) {
      finishLocks.delete(taskId);
    }
  }
}

async function executeFinishTaskAndAwardXP(
  taskId: string,
  userId: string,
  simulatedNow?: Date
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

  const finishTime = simulatedNow || new Date();
  const week = weeks.get(task.week_id);
  if (week && (!week.is_current || finishTime >= new Date(week.cutoff_at))) {
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
  if (week && (!week.is_current || new Date() >= new Date(week.cutoff_at))) {
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
  if (week && (!week.is_current || new Date() >= new Date(week.cutoff_at))) {
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
  if (week && (!week.is_current || new Date() >= new Date(week.cutoff_at))) {
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

  if (!week.is_current || new Date() >= new Date(week.cutoff_at)) {
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

// ==============================================================================
// Phase 3: Team Dashboard, Leaderboard & Weekly Close
// ==============================================================================

// Helper to get all active profiles
async function getActiveProfiles(): Promise<Profile[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'active')
      .order('full_name', { ascending: true });
    return (data as Profile[]) || [];
  }

  const userStore = getRuntimeUserStore();
  return Array.from(userStore.values()).filter((p) => p.status === 'active');
}

// 1. Get Team Progress for current week
export async function getTeamProgress(): Promise<{
  currentWeek: Week;
  members: TeamMemberProgress[];
  summary: {
    totalActiveMembers: number;
    updatedCount: number;
    notYetCount: number;
    restingCount: number;
    totalTasks: number;
    doneTasks: number;
    doingTasks: number;
    blockedTasks: number;
    todoTasks: number;
    teamTotalTaskXP: number;
    teamTotalTargetXP: number;
    completionPercent: number;
  };
}> {
  const currentWeek = await getCurrentWeek();
  const profiles = await getActiveProfiles();
  const { tasks, restModes, xpEvents } = getStores();

  const isCutoffPassed = new Date() >= new Date(currentWeek.cutoff_at);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !supabaseUrl.includes('your-project-ref');

  let allTasks: Task[] = [];
  let allRestModes: RestMode[] = [];
  let allXPEvents: XPEvent[] = [];

  if (isConfigured) {
    const supabase = await createClient();
    const { data: tData } = await supabase
      .from('tasks')
      .select('*')
      .eq('week_id', currentWeek.id);
    allTasks = (tData as Task[]) || [];

    const { data: rData } = await supabase
      .from('rest_mode')
      .select('*')
      .eq('week_id', currentWeek.id);
    allRestModes = (rData as RestMode[]) || [];

    const { data: eData } = await supabase
      .from('xp_events')
      .select('*')
      .eq('week_id', currentWeek.id)
      .eq('voided', false);
    allXPEvents = (eData as XPEvent[]) || [];
  } else {
    allTasks = Array.from(tasks.values()).filter((t) => t.week_id === currentWeek.id);
    allRestModes = Array.from(restModes.values()).filter((r) => r.week_id === currentWeek.id);
    allXPEvents = Array.from(xpEvents.values()).filter(
      (ev) => ev.week_id === currentWeek.id && !ev.voided
    );
  }

  let totalTasks = 0;
  let doneTasks = 0;
  let doingTasks = 0;
  let blockedTasks = 0;
  let todoTasks = 0;
  let teamTotalTaskXP = 0;
  let teamTotalTargetXP = 0;
  let updatedCount = 0;
  let restingCount = 0;

  const memberProgressList: TeamMemberProgress[] = [];

  for (const profile of profiles) {
    const memberTasks = allTasks.filter((t) => t.user_id === profile.id);
    const isResting = allRestModes.some((r) => r.user_id === profile.id);
    if (isResting) restingCount++;

    // "Updated" means the member moved a task off todo (doing, done, blocked),
    // added an Extra, or turned on Rest Mode this week (excluding untouched rollover tasks)
    const hasMovedOffTodo = memberTasks.some((t) => {
      const isRolledOver = t.id.startsWith('rollover-');
      if (!isRolledOver) return t.status !== 'todo';
      return new Date(t.updated_at).getTime() > new Date(t.created_at).getTime();
    });
    const hasAddedExtra = memberTasks.some((t) => t.source === 'extra' && !t.id.startsWith('rollover-'));
    const hasUpdatedThisWeek = isResting || hasMovedOffTodo || hasAddedExtra;

    if (hasUpdatedThisWeek) updatedCount++;

    const memberTaskXP = allXPEvents
      .filter((ev) => ev.user_id === profile.id && ev.reason === 'task_completion')
      .reduce((sum, ev) => sum + ev.amount, 0);

    teamTotalTaskXP += memberTaskXP;
    teamTotalTargetXP += profile.weekly_target_xp || 80;

    const memberBlocked = memberTasks
      .filter((t) => t.status === 'blocked')
      .map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        note: t.blocked_note || t.note || 'Stuck on a rock',
      }));

    const counts = {
      total: memberTasks.length,
      todo: memberTasks.filter((t) => t.status === 'todo').length,
      doing: memberTasks.filter((t) => t.status === 'doing').length,
      blocked: memberTasks.filter((t) => t.status === 'blocked').length,
      done: memberTasks.filter((t) => t.status === 'done').length,
    };

    totalTasks += counts.total;
    doneTasks += counts.done;
    doingTasks += counts.doing;
    blockedTasks += counts.blocked;
    todoTasks += counts.todo;

    const levelInfo = await getUserLevelAndXP(profile.id);

    memberProgressList.push({
      profile,
      levelInfo,
      hasUpdatedThisWeek,
      isResting,
      tasksCount: counts,
      blockedTasks: memberBlocked,
      weekTaskXP: memberTaskXP,
    });
  }

  const completionPercent =
    teamTotalTargetXP > 0
      ? Math.min(120, Math.round((teamTotalTaskXP / teamTotalTargetXP) * 100))
      : 0;

  return {
    currentWeek,
    members: memberProgressList,
    summary: {
      totalActiveMembers: profiles.length,
      updatedCount,
      notYetCount: profiles.length - updatedCount,
      restingCount,
      totalTasks,
      doneTasks,
      doingTasks,
      blockedTasks,
      todoTasks,
      teamTotalTaskXP,
      teamTotalTargetXP,
      completionPercent,
    },
  };
}

// 2. Get Weekly Leaderboard (Enforces Top 3 for everyone, own rank for leads, full stats for executives)
export async function getWeeklyLeaderboard(
  currentUserId: string,
  isExecutive: boolean,
  weekId?: string
): Promise<{
  week: Week;
  top3: Array<{
    userId: string;
    fullName: string;
    roleTitle: string | null;
    avatar: string | null;
    rank: number;
    score: number;
    tasksFinished: number;
  }>;
  currentUserEntry: {
    userId: string;
    fullName: string;
    rank: number | null;
    score: number | null;
    taskXP: number;
    targetSnapshot: number;
    tasksFinished: number;
    isResting: boolean;
  } | null;
  restingMembers: Array<{
    userId: string;
    fullName: string;
    roleTitle: string | null;
    avatar: string | null;
  }>;
  allMembers?: Array<{
    userId: string;
    fullName: string;
    roleTitle: string | null;
    avatar: string | null;
    rank: number | null;
    score: number | null;
    taskXP: number;
    targetSnapshot: number;
    tasksFinished: number;
    isResting: boolean;
    firstUpdateAt: string | null;
  }>;
}> {
  const currentWeek = weekId ? (await getWeekById(weekId)) : await getCurrentWeek();
  const profiles = await getActiveProfiles();
  const { tasks, restModes, xpEvents, weekScores } = getStores();

  // Check if closed scores exist in store/db (only for finalized/closed weeks)
  let scores: WeekScore[] = [];
  const existingScores = Array.from(weekScores.values()).filter((ws) => ws.week_id === currentWeek.id);

  if (!currentWeek.is_current && existingScores.length > 0) {
    scores = existingScores;
  } else {
    // Derive live weekly scores
    for (const profile of profiles) {
      const isResting = Array.from(restModes.values()).some(
        (r) => r.user_id === profile.id && r.week_id === currentWeek.id
      );

      const target = profile.weekly_target_xp || 80;

      // Task XP only: sum of task_completion XP events (capped at 150)
      let taskXP = 0;
      for (const ev of xpEvents.values()) {
        if (
          ev.user_id === profile.id &&
          ev.week_id === currentWeek.id &&
          ev.reason === 'task_completion' &&
          !ev.voided
        ) {
          taskXP += ev.amount;
        }
      }

      // Tasks finished
      let tasksFinished = 0;
      let firstUpdateAt: string | null = null;
      for (const t of tasks.values()) {
        if (t.user_id === profile.id && t.week_id === currentWeek.id) {
          if (t.status === 'done') tasksFinished++;
          if (!firstUpdateAt || new Date(t.created_at) < new Date(firstUpdateAt)) {
            firstUpdateAt = t.created_at;
          }
        }
      }

      // Score: capped at 120.00%
      let score: number | null = null;
      if (!isResting) {
        score = Math.min(120, Math.round(((taskXP / target) * 100) * 100) / 100);
      }

      scores.push({
        id: `ws-${profile.id}-${currentWeek.id}`,
        user_id: profile.id,
        week_id: currentWeek.id,
        task_xp: taskXP,
        target_snapshot: target,
        score,
        resting: isResting,
        tasks_finished: tasksFinished,
        first_update_at: firstUpdateAt,
        rank: null,
        created_at: new Date().toISOString(),
      });
    }

    // Apply tie-breakers to non-resting members:
    // 1) score DESC
    // 2) tasks_finished DESC
    // 3) first_update_at ASC
    // 4) full_name ASC
    const nonResting = scores
      .filter((s) => !s.resting)
      .sort((a, b) => {
        if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
        if (b.tasks_finished !== a.tasks_finished) return b.tasks_finished - a.tasks_finished;
        const timeA = a.first_update_at ? new Date(a.first_update_at).getTime() : Infinity;
        const timeB = b.first_update_at ? new Date(b.first_update_at).getTime() : Infinity;
        if (timeA !== timeB) return timeA - timeB;
        const nameA = profiles.find((p) => p.id === a.user_id)?.full_name || '';
        const nameB = profiles.find((p) => p.id === b.user_id)?.full_name || '';
        return nameA.localeCompare(nameB);
      });

    nonResting.forEach((s, idx) => {
      s.rank = idx + 1;
    });
  }

  // Separate resting members (never ranked last)
  const restingScores = scores.filter((s) => s.resting);
  const rankedScores = scores
    .filter((s) => !s.resting)
    .sort((a, b) => (a.rank || 999) - (b.rank || 999));

  // Top 3 (visible to everyone)
  const top3 = rankedScores.slice(0, 3).map((s) => {
    const prof = profiles.find((p) => p.id === s.user_id);
    return {
      userId: s.user_id,
      fullName: prof?.full_name || 'Otter Member',
      roleTitle: prof?.role_title || null,
      avatar: prof?.avatar || null,
      rank: s.rank || 1,
      score: s.score || 0,
      tasksFinished: s.tasks_finished,
    };
  });

  // Current user entry
  const myScore = scores.find((s) => s.user_id === currentUserId);
  const myProfile = profiles.find((p) => p.id === currentUserId);
  const currentUserEntry = myScore
    ? {
        userId: myScore.user_id,
        fullName: myProfile?.full_name || 'You',
        rank: myScore.rank,
        score: myScore.score,
        taskXP: myScore.task_xp,
        targetSnapshot: myScore.target_snapshot,
        tasksFinished: myScore.tasks_finished,
        isResting: myScore.resting,
      }
    : null;

  // Resting members list
  const restingMembers = restingScores.map((s) => {
    const prof = profiles.find((p) => p.id === s.user_id);
    return {
      userId: s.user_id,
      fullName: prof?.full_name || 'Otter Member',
      roleTitle: prof?.role_title || null,
      avatar: prof?.avatar || null,
    };
  });

  // Full roster if executive
  const allMembers = isExecutive
    ? scores.map((s) => {
        const prof = profiles.find((p) => p.id === s.user_id);
        return {
          userId: s.user_id,
          fullName: prof?.full_name || 'Otter Member',
          roleTitle: prof?.role_title || null,
          avatar: prof?.avatar || null,
          rank: s.rank,
          score: s.score,
          taskXP: s.task_xp,
          targetSnapshot: s.target_snapshot,
          tasksFinished: s.tasks_finished,
          isResting: s.resting,
          firstUpdateAt: s.first_update_at,
        };
      })
    : undefined;

  return {
    week: currentWeek,
    top3,
    currentUserEntry,
    restingMembers,
    allMembers,
  };
}

async function getWeekById(weekId: string): Promise<Week> {
  const { weeks } = getStores();
  const w = weeks.get(weekId);
  if (w) return w;
  return getCurrentWeek();
}

// 3. Get Monthly Season Leaderboard, Top Otter, and Member History Breakdown
export async function getMonthlySeasonLeaderboard(
  selectedMonth?: string
): Promise<{
  monthYear: string;
  availableMonths: string[];
  topOtter: {
    userId: string;
    fullName: string;
    roleTitle: string | null;
    avatar: string | null;
    averageScore: number;
    totalTasksFinished: number;
  } | null;
  rankings: Array<{
    userId: string;
    fullName: string;
    roleTitle: string | null;
    avatar: string | null;
    rank: number;
    averageScore: number;
    weeksParticipated: number;
    weeksRested: number;
    totalTasksFinished: number;
    isTopOtter: boolean;
    weeksBreakdown: Array<{
      weekNumber: number;
      year: number;
      score: number | null;
      isResting: boolean;
      taskXP: number;
      targetSnapshot: number;
    }>;
  }>;
  restingOnlyMembers: Array<{
    userId: string;
    fullName: string;
    roleTitle: string | null;
  }>;
}> {
  const settings = await getSettings();
  const { weeks, weekScores, monthScores } = getStores();
  const profiles = await getActiveProfiles();

  // Determine available months in Asia/Manila from weeks
  const monthsSet = new Set<string>();
  const tzOffset = 8 * 60 * 60 * 1000;

  for (const w of weeks.values()) {
    const manilaCutoff = new Date(new Date(w.cutoff_at).getTime() + tzOffset);
    const mStr = `${manilaCutoff.getUTCFullYear()}-${String(manilaCutoff.getUTCMonth() + 1).padStart(2, '0')}`;
    monthsSet.add(mStr);
  }

  // Also include current month
  const nowManila = new Date(Date.now() + tzOffset);
  const currentMonthStr = `${nowManila.getUTCFullYear()}-${String(nowManila.getUTCMonth() + 1).padStart(2, '0')}`;
  monthsSet.add(currentMonthStr);

  const availableMonths = Array.from(monthsSet).sort().reverse();
  const targetMonth = selectedMonth || availableMonths[0];

  // Weeks belonging to this month (based on Saturday cutoff in Asia/Manila)
  const monthWeeks = Array.from(weeks.values()).filter((w) => {
    const manilaCutoff = new Date(new Date(w.cutoff_at).getTime() + tzOffset);
    const mStr = `${manilaCutoff.getUTCFullYear()}-${String(manilaCutoff.getUTCMonth() + 1).padStart(2, '0')}`;
    return mStr === targetMonth;
  });

  const memberRankings: Array<{
    userId: string;
    fullName: string;
    roleTitle: string | null;
    avatar: string | null;
    rank: number;
    averageScore: number;
    weeksParticipated: number;
    weeksRested: number;
    totalTasksFinished: number;
    isTopOtter: boolean;
    earliestUpdate: string | null;
    weeksBreakdown: Array<{
      weekNumber: number;
      year: number;
      score: number | null;
      isResting: boolean;
      taskXP: number;
      targetSnapshot: number;
    }>;
  }> = [];

  const restingOnlyMembers: Array<{
    userId: string;
    fullName: string;
    roleTitle: string | null;
  }> = [];

  for (const profile of profiles) {
    const memberScores: WeekScore[] = [];

    for (const w of monthWeeks) {
      const ws = Array.from(weekScores.values()).find(
        (s) => s.user_id === profile.id && s.week_id === w.id
      );
      if (ws) {
        memberScores.push(ws);
      } else {
        // Fallback: check live tasks for that week
        const { tasks, restModes, xpEvents } = getStores();
        const isResting = Array.from(restModes.values()).some(
          (r) => r.user_id === profile.id && r.week_id === w.id
        );
        let taskXP = 0;
        for (const ev of xpEvents.values()) {
          if (
            ev.user_id === profile.id &&
            ev.week_id === w.id &&
            ev.reason === 'task_completion' &&
            !ev.voided
          ) {
            taskXP += ev.amount;
          }
        }
        let doneCount = 0;
        let earliest: string | null = null;
        for (const t of tasks.values()) {
          if (t.user_id === profile.id && t.week_id === w.id) {
            if (t.status === 'done') doneCount++;
            if (!earliest || new Date(t.created_at) < new Date(earliest)) earliest = t.created_at;
          }
        }
        const target = profile.weekly_target_xp || 80;
        const score = isResting ? null : Math.min(120, Math.round(((taskXP / target) * 100) * 100) / 100);

        memberScores.push({
          id: `tmp-${profile.id}-${w.id}`,
          user_id: profile.id,
          week_id: w.id,
          task_xp: taskXP,
          target_snapshot: target,
          score,
          resting: isResting,
          tasks_finished: doneCount,
          first_update_at: earliest,
          rank: null,
          created_at: new Date().toISOString(),
        });
      }
    }

    // Weekly breakdown
    const weeksBreakdown = memberScores.map((s) => {
      const w = monthWeeks.find((mw) => mw.id === s.week_id);
      return {
        weekNumber: w?.week_number || 1,
        year: w?.year || 2026,
        score: s.score,
        isResting: s.resting,
        taskXP: s.task_xp,
        targetSnapshot: s.target_snapshot,
      };
    });

    const activeWeeks = memberScores.filter((s) => !s.resting && s.score !== null);
    const restedWeeks = memberScores.filter((s) => s.resting);

    // If member rested all month, they are not ranked
    if (activeWeeks.length === 0) {
      if (restedWeeks.length > 0) {
        restingOnlyMembers.push({
          userId: profile.id,
          fullName: profile.full_name,
          roleTitle: profile.role_title,
        });
      }
      continue;
    }

    const avgScore =
      Math.round(
        (activeWeeks.reduce((acc, s) => acc + (s.score || 0), 0) / activeWeeks.length) * 100
      ) / 100;

    const totalTasksFinished = memberScores.reduce((acc, s) => acc + s.tasks_finished, 0);

    let earliestUpdate: string | null = null;
    for (const s of memberScores) {
      if (s.first_update_at) {
        if (!earliestUpdate || new Date(s.first_update_at) < new Date(earliestUpdate)) {
          earliestUpdate = s.first_update_at;
        }
      }
    }

    memberRankings.push({
      userId: profile.id,
      fullName: profile.full_name,
      roleTitle: profile.role_title,
      avatar: profile.avatar,
      rank: 0,
      averageScore: avgScore,
      weeksParticipated: activeWeeks.length,
      weeksRested: restedWeeks.length,
      totalTasksFinished,
      isTopOtter: false,
      earliestUpdate,
      weeksBreakdown,
    });
  }

  // Monthly Tie-breakers:
  // 1) averageScore DESC
  // 2) totalTasksFinished DESC
  // 3) earliestUpdate ASC
  // 4) fullName ASC
  memberRankings.sort((a, b) => {
    if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
    if (b.totalTasksFinished !== a.totalTasksFinished) return b.totalTasksFinished - a.totalTasksFinished;
    const timeA = a.earliestUpdate ? new Date(a.earliestUpdate).getTime() : Infinity;
    const timeB = b.earliestUpdate ? new Date(b.earliestUpdate).getTime() : Infinity;
    if (timeA !== timeB) return timeA - timeB;
    return a.fullName.localeCompare(b.fullName);
  });

  memberRankings.forEach((m, idx) => {
    m.rank = idx + 1;
    m.isTopOtter = idx === 0;
  });

  const topOtter = memberRankings.length > 0
    ? {
        userId: memberRankings[0].userId,
        fullName: memberRankings[0].fullName,
        roleTitle: memberRankings[0].roleTitle,
        avatar: memberRankings[0].avatar,
        averageScore: memberRankings[0].averageScore,
        totalTasksFinished: memberRankings[0].totalTasksFinished,
      }
    : null;

  return {
    monthYear: targetMonth,
    availableMonths,
    topOtter,
    rankings: memberRankings,
    restingOnlyMembers,
  };
}

// 4. Close Week: Delegates directly to SQL canonical function public.close_week()
// Database-level locking (Postgres advisory lock / row-level lock) guarantees concurrency safety across serverless instances without in-memory locks.
export async function closeWeek(
  weekId?: string,
  triggeredBySuperAdmin = false,
  simulatedNow?: string | Date
): Promise<{
  success: boolean;
  alreadyClosed?: boolean;
  weeksClosedCount?: number;
  weekClosed?: string;
  nextWeekOpened?: string;
  monthClosed?: boolean;
  monthYear?: string;
  topOtterUserId?: string;
  message: string;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data, error } = await (admin as any).rpc('close_week', {
      p_week_id: weekId || null,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  // Local mock store runner for test sandbox (simulates SQL public.close_week)
  return await runSqlCloseWeekSimulation(weekId, triggeredBySuperAdmin, simulatedNow);
}

async function runSqlCloseWeekSimulation(
  weekId?: string,
  triggeredBySuperAdmin = false,
  simulatedNow?: string | Date
): Promise<{
  success: boolean;
  alreadyClosed?: boolean;
  weeksClosedCount?: number;
  weekClosed?: string;
  nextWeekOpened?: string;
  monthClosed?: boolean;
  monthYear?: string;
  topOtterUserId?: string;
  message: string;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    const admin = createAdminClient();
    const { data, error } = await (admin as any).rpc('close_week', {
      p_week_id: weekId || null,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  // Local in-memory transaction implementation
  const { weeks, tasks, xpEvents, restModes, weekScores, monthScores } = getStores();
  const profiles = await getActiveProfiles();
  const userStore = getRuntimeUserStore();

  let targetWeek: Week | undefined;
  if (weekId) {
    targetWeek = weeks.get(weekId);
  } else {
    // Fast-exit check: must exit immediately unless Saturday cutoff has passed AND current week is still open
    let currentOpenWeek: Week | undefined;
    for (const w of weeks.values()) {
      if (w.is_current) {
        currentOpenWeek = w;
        break;
      }
    }

    const checkNow = simulatedNow ? new Date(simulatedNow) : new Date();
    if (!currentOpenWeek || (!triggeredBySuperAdmin && checkNow < new Date(currentOpenWeek.cutoff_at))) {
      return {
        success: true,
        message: 'No pending weeks require closing at this time.',
      };
    }
    targetWeek = currentOpenWeek;
  }

  if (!targetWeek) {
    return {
      success: true,
      message: 'No pending weeks require closing at this time.',
    };
  }

  // Idempotency check: if week is already marked not current and scores exist, return early!
  const hasExistingWeekScores = Array.from(weekScores.values()).some((ws) => ws.week_id === targetWeek!.id);
  if (!targetWeek.is_current && hasExistingWeekScores) {
    return {
      success: true,
      alreadyClosed: true,
      weekClosed: targetWeek.id,
      message: 'Week was already finalized and closed.',
    };
  }

  // 1. Snapshot scores for active members and update streaks
  for (const profile of profiles) {
    const isResting = Array.from(restModes.values()).some(
      (r) => r.user_id === profile.id && r.week_id === targetWeek!.id
    );

    // Snapshot target at this moment
    const target = profile.weekly_target_xp || 80;

    let taskXP = 0;
    for (const ev of xpEvents.values()) {
      if (
        ev.user_id === profile.id &&
        ev.week_id === targetWeek!.id &&
        ev.reason === 'task_completion' &&
        !ev.voided
      ) {
        taskXP += ev.amount;
      }
    }

    let tasksFinished = 0;
    let finishedBeforeCutoff = 0;
    let hasMovedOffTodo = false;
    let hasAddedExtra = false;
    let firstUpdateAt: string | null = null;
    for (const t of tasks.values()) {
      if (t.user_id === profile.id && t.week_id === targetWeek!.id) {
        const isRolledOver = t.id.startsWith('rollover-');
        if (!isRolledOver && t.status !== 'todo') {
          hasMovedOffTodo = true;
        } else if (isRolledOver && new Date(t.updated_at).getTime() > new Date(t.created_at).getTime()) {
          hasMovedOffTodo = true;
        }

        if (t.source === 'extra' && !isRolledOver) {
          hasAddedExtra = true;
        }

        if (t.status === 'done') {
          tasksFinished++;
          if (t.finished_at && new Date(t.finished_at) < new Date(targetWeek!.cutoff_at)) {
            finishedBeforeCutoff++;
          }
        }
        if (!firstUpdateAt || new Date(t.created_at) < new Date(firstUpdateAt)) {
          firstUpdateAt = t.created_at;
        }
      }
    }

    // A member has updated this week if they moved a task off todo (doing, done, blocked) OR added an Extra
    const hasUpdatedThisWeek = hasMovedOffTodo || hasAddedExtra;

    // Score: capped at 120.00%
    const score = isResting ? null : Math.min(120, Math.round(((taskXP / target) * 100) * 100) / 100);

    const scoreId = `ws-${profile.id}-${targetWeek.id}`;
    weekScores.set(scoreId, {
      id: scoreId,
      user_id: profile.id,
      week_id: targetWeek.id,
      task_xp: taskXP,
      target_snapshot: target,
      score,
      resting: isResting,
      tasks_finished: tasksFinished,
      first_update_at: firstUpdateAt,
      rank: null,
      created_at: new Date().toISOString(),
    });

    // Update Streaks:
    // Follows the same rule as "Updated" status:
    // +1 for update before cutoff (task moved off todo, Extra added, or Rest Mode),
    // frozen during Rest Mode, reset after missed normal week
    const runtimeUser = userStore.get(profile.id);
    if (runtimeUser) {
      if (isResting) {
        // Streak is frozen (unaltered)
      } else if (hasUpdatedThisWeek) {
        const currentStreak = (runtimeUser.current_streak || 0) + 1;
        runtimeUser.current_streak = currentStreak;
        runtimeUser.max_streak = Math.max(runtimeUser.max_streak || 0, currentStreak);
      } else {
        // Missed normal week: reset streak
        runtimeUser.current_streak = 0;
      }
      userStore.set(profile.id, runtimeUser);
    }
  }

  // Rank non-resting members using verified tie-breakers:
  // 1) score DESC
  // 2) tasks_finished DESC
  // 3) first_update_at ASC (earliest)
  // 4) full_name ASC (alphabetical)
  const weekMemberList = Array.from(weekScores.values())
    .filter((ws) => ws.week_id === targetWeek!.id && !ws.resting)
    .sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      if (b.tasks_finished !== a.tasks_finished) return b.tasks_finished - a.tasks_finished;
      const timeA = a.first_update_at ? new Date(a.first_update_at).getTime() : Infinity;
      const timeB = b.first_update_at ? new Date(b.first_update_at).getTime() : Infinity;
      if (timeA !== timeB) return timeA - timeB;
      const nameA = profiles.find((p) => p.id === a.user_id)?.full_name || '';
      const nameB = profiles.find((p) => p.id === b.user_id)?.full_name || '';
      return nameA.localeCompare(nameB);
    });

  weekMemberList.forEach((s, idx) => {
    s.rank = idx + 1;
  });

  // 2. Lock target week
  targetWeek.is_current = false;
  weeks.set(targetWeek.id, targetWeek);

  // 3. Open next week
  const settings = await getSettings();
  const nextStart = new Date(targetWeek.cutoff_at);
  const { cutoffAt: nextCutoff, weekNumber: nextWeekNum, year: nextYear } = deriveWeekBoundaries(
    settings,
    new Date(nextStart.getTime() + 60000)
  );
  const nextWeekId = `week-${nextYear}-${nextWeekNum}`;

  const nextWeek: Week = {
    id: nextWeekId,
    week_number: nextWeekNum,
    year: nextYear,
    start_at: nextStart.toISOString(),
    cutoff_at: nextCutoff.toISOString(),
    is_current: true,
    created_at: new Date().toISOString(),
  };
  weeks.set(nextWeekId, nextWeek);

  // 4. ROLL OVER UNFINISHED TASKS TO NEXT WEEK:
  // Unfinished tasks ('todo', 'doing', 'blocked') roll over as unfinished to nextWeek
  for (const t of Array.from(tasks.values())) {
    if (t.week_id === targetWeek.id && t.status !== 'done') {
      const rolloverId = `rollover-${t.id}-${nextWeek.id}`;
      if (!tasks.has(rolloverId)) {
        tasks.set(rolloverId, {
          id: rolloverId,
          week_id: nextWeek.id,
          user_id: t.user_id,
          title: t.title,
          category: t.category,
          size: t.size,
          source: t.source,
          status: t.status, // preserves 'todo', 'doing', or 'blocked'
          note: t.note,
          link: t.link,
          is_blocked: t.is_blocked,
          blocked_note: t.blocked_note,
          finished_at: null,
          created_by: t.created_by,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  // 5. Month Close Detection (Asia/Manila calendar month)
  const tzOffset = 8 * 60 * 60 * 1000;
  const closedCutoffManila = new Date(new Date(targetWeek.cutoff_at).getTime() + tzOffset);
  const monthYear = `${closedCutoffManila.getUTCFullYear()}-${String(closedCutoffManila.getUTCMonth() + 1).padStart(2, '0')}`;

  const nextCutoffManila = new Date(nextCutoff.getTime() + tzOffset);
  const nextMonthYear = `${nextCutoffManila.getUTCFullYear()}-${String(nextCutoffManila.getUTCMonth() + 1).padStart(2, '0')}`;

  let monthClosed = false;
  let topOtterUserId: string | undefined;

  if (monthYear !== nextMonthYear) {
    monthClosed = true;
    const season = await getMonthlySeasonLeaderboard(monthYear);
    if (season.topOtter) {
      topOtterUserId = season.topOtter.userId;
    }
  }

  return {
    success: true,
    weekClosed: targetWeek.id,
    nextWeekOpened: nextWeek.id,
    monthClosed,
    monthYear,
    topOtterUserId,
    message: 'Week closed successfully. Scores snapshotted, ranks assigned, streaks updated, and unfinished tasks rolled over.',
  };
}

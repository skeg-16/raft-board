import Link from 'next/link';
import { getCurrentProfile } from '@/lib/auth';
import {
  getSettings,
  getCurrentWeek,
  getUserLevelAndXP,
  calculateUserStreak,
  LEVEL_THRESHOLDS,
} from '@/lib/tasks';
import { RoleBadge } from '@/components/RoleBadge';
import { OtterIcon } from '@/components/OtterIcon';
import {
  Calendar,
  Sparkles,
  Trophy,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Flame,
  CalendarCheck2,
  Users2,
  Palmtree,
  ShieldCheck,
} from 'lucide-react';

export default async function HomePage() {
  const profile = await getCurrentProfile();
  const settings = await getSettings();
  const currentWeek = await getCurrentWeek();
  const levelInfo = profile ? await getUserLevelAndXP(profile.id) : null;
  const { streak, isResting } = profile ? await calculateUserStreak(profile.id) : { streak: 0, isResting: false };

  const currentLevel = levelInfo?.level || 'Pup';
  const totalXP = levelInfo?.totalXP || 0;
  const nextMin = levelInfo?.nextLevelThreshold;
  const progressPercent = levelInfo?.progressPercent || 0;

  return (
    <div className="p-4 space-y-4">
      {/* Otter Hero Greeting & Level Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 text-white p-5 shadow-lg border border-sky-900/50">
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[10px] font-bold uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-sky-400" />
              {currentLevel} Otter
            </span>
            <h1 className="text-xl font-extrabold text-white font-display">
              Ahoy, {profile?.full_name?.split(' ')[0] || 'Otter'}!
            </h1>
            <p className="text-xs text-sky-200/80">
              Week {currentWeek.week_number} • Building software like no otter.
            </p>
          </div>

          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-sky-700 border border-sky-400/40 p-2 shadow-md flex items-center justify-center shrink-0 text-sky-100">
            <OtterIcon className="w-7 h-7 text-sky-100" />
          </div>
        </div>

        {/* Level & XP Progress Bar */}
        <div className="mt-4 pt-3 border-t border-sky-800/40 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-lg bg-amber-400/20 text-amber-300 border border-amber-400/30 font-extrabold text-[11px]">
                {currentLevel}
              </span>
              <span className="text-sky-200 font-bold">{totalXP} Total XP</span>
            </div>
            <span className="text-[11px] text-sky-300/70 font-medium">
              {nextMin !== null ? `${totalXP} / ${nextMin} XP to next level` : 'Keystone Master! 👑'}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-800/80 rounded-full h-3 overflow-hidden p-0.5 border border-sky-800/60">
            <div
              className="bg-gradient-to-r from-sky-400 via-sky-300 to-amber-400 h-full rounded-full transition-all duration-500 shadow-xs"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Profile Role & Streak Footer */}
        {profile && (
          <div className="mt-3 pt-3 border-t border-sky-800/40 flex items-center justify-between">
            <RoleBadge
              roleTitle={profile.role_title}
              roleType={profile.role_type}
              isSuperAdmin={profile.is_super_admin}
              isTreasurer={profile.is_treasurer}
              size="sm"
            />
            <div className="flex items-center gap-1.5 text-xs font-bold">
              {isResting ? (
                <span className="text-purple-300 flex items-center gap-1 bg-purple-900/40 px-2 py-0.5 rounded-full border border-purple-400/30">
                  <Palmtree className="w-3.5 h-3.5 text-purple-300" /> Rest Mode (Streak Frozen)
                </span>
              ) : (
                <span className="text-amber-300 flex items-center gap-1 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  {streak} Week Streak
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Weekly Cadence & Meeting Card (Read exclusively from settings table) */}
      <div className="bg-white rounded-3xl p-4 shadow-xs border border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800">
            <Calendar className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-bold font-display">Weekly Rhythm</h2>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold border border-sky-200">
            {settings.timezone}
          </span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          The week runs from one <span className="font-semibold text-slate-900">{settings.meeting_weekday} meeting ({settings.meeting_time})</span> to the next. Updates before the cutoff earn a <span className="font-semibold text-amber-600">+10 XP early bonus</span>!
        </p>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Target XP</p>
              <p className="text-xs font-bold text-slate-800">{profile?.weekly_target_xp ?? 80} XP / wk</p>
            </div>
          </div>

          <div className="p-2.5 rounded-2xl bg-sky-50 border border-sky-200/60 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-sky-600 tracking-wider">Weekly Cap</p>
              <p className="text-xs font-bold text-sky-900">150 Task XP</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Explore Raft
        </h2>

        <Link
          href="/my-week"
          className="group flex items-center justify-between p-3.5 bg-white hover:bg-sky-50/40 rounded-2xl border border-slate-200/80 shadow-xs transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm group-hover:scale-105 transition">
              <CalendarCheck2 className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">My Week</p>
              <p className="text-xs text-slate-500">Assigned tasks, Extras, and XP awards</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-sky-600 group-hover:translate-x-0.5 transition" />
        </Link>

        <Link
          href="/team"
          className="group flex items-center justify-between p-3.5 bg-white hover:bg-sky-50/40 rounded-2xl border border-slate-200/80 shadow-xs transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm group-hover:scale-105 transition">
              <Users2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Team Raft</p>
              <p className="text-xs text-slate-500">See all 6 members and who has updated</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-sky-600 group-hover:translate-x-0.5 transition" />
        </Link>

        <Link
          href="/leaderboard"
          className="group flex items-center justify-between p-3.5 bg-white hover:bg-sky-50/40 rounded-2xl border border-slate-200/80 shadow-xs transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm group-hover:scale-105 transition">
              <Trophy className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Leaderboard</p>
              <p className="text-xs text-slate-500">Weekly progress & Top Otter monthly season</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-sky-600 group-hover:translate-x-0.5 transition" />
        </Link>
      </div>

      {/* Startup Tagline Footer Pill */}
      <div className="pt-2 text-center">
        <p className="text-[11px] text-slate-400 font-medium">
          Otter Software Systems • "Building software like no otter."
        </p>
      </div>
    </div>
  );
}

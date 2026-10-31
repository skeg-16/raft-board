import Link from 'next/link';
import { getCurrentProfile, getSystemSettings } from '@/lib/auth';
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
} from 'lucide-react';

export default async function HomePage() {
  const profile = await getCurrentProfile();
  const settings = await getSystemSettings();

  return (
    <div className="p-4 space-y-4">
      {/* Otter Hero Greeting Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 text-white p-5 shadow-lg border border-sky-900/50">
        {/* Subtle aquatic background pattern */}
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[10px] font-bold uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-sky-400" />
              Raft Member
            </span>
            <h1 className="text-xl font-extrabold text-white font-display">
              Ahoy, {profile?.full_name?.split(' ')[0] || 'Otter'}!
            </h1>
            <p className="text-xs text-sky-200/80">
              Welcome to your OSS weekly progress game.
            </p>
          </div>

          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-sky-700 border border-sky-400/40 p-2 shadow-md flex items-center justify-center shrink-0 text-sky-100">
            <OtterIcon className="w-7 h-7 text-sky-100" />
          </div>
        </div>

        {profile && (
          <div className="mt-4 pt-3 border-t border-sky-800/40 flex items-center justify-between">
            <RoleBadge
              roleTitle={profile.role_title}
              roleType={profile.role_type}
              isSuperAdmin={profile.is_super_admin}
              isTreasurer={profile.is_treasurer}
              size="sm"
            />
            <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Level 1: Pup (0 XP)
            </span>
          </div>
        )}
      </div>

      {/* Weekly Cadence & Meeting Card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800">
            <Calendar className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-bold font-display">Weekly Cycle</h2>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[11px] font-semibold border border-sky-200">
            {settings.timezone}
          </span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          The week runs from one <span className="font-semibold text-slate-900">{settings.meeting_weekday} meeting ({settings.meeting_time})</span> to the next. Updates before the cutoff earn a <span className="font-semibold text-amber-600">+10 XP bonus</span>!
        </p>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Target XP</p>
              <p className="text-xs font-bold text-slate-800">{profile?.weekly_target_xp ?? 80} XP / wk</p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/60 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">Weekly Status</p>
              <p className="text-xs font-bold text-amber-800">Needs Update</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Explore App
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
              <p className="text-xs text-slate-500">Log tasks & earn XP before Saturday cutoff</p>
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

'use client';

import { useState, useEffect } from 'react';
import { OtterIcon } from '@/components/OtterIcon';
import { RoleBadge } from '@/components/RoleBadge';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Palmtree,
  Sparkles,
  BarChart3,
  Flame,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import type { TeamMemberProgress } from '@/types/database';

export default function TeamPage() {
  const [data, setData] = useState<{
    members: TeamMemberProgress[];
    summary: any;
    currentWeek: any;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'updated' | 'not-yet' | 'blocked'>('all');

  const fetchTeam = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/team');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load team:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  if (loading && !data) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
        <p className="text-xs font-semibold text-slate-500">Checking the raft...</p>
      </div>
    );
  }

  const members = data?.members || [];
  const summary = data?.summary || {
    totalActiveMembers: 0,
    updatedCount: 0,
    notYetCount: 0,
    restingCount: 0,
    totalTasks: 0,
    doneTasks: 0,
    doingTasks: 0,
    blockedTasks: 0,
    todoTasks: 0,
    teamTotalTaskXP: 0,
    teamTotalTargetXP: 0,
    completionPercent: 0,
  };

  const filteredMembers = members.filter((m) => {
    if (filter === 'updated') return m.hasUpdatedThisWeek;
    if (filter === 'not-yet') return !m.hasUpdatedThisWeek;
    if (filter === 'blocked') return m.blockedTasks.length > 0;
    return true;
  });

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-5 pb-28">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 font-display flex items-center gap-2">
            Team Raft
            <span className="text-[11px] sm:text-xs px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 font-bold shrink-0">
              {summary.totalActiveMembers} Otters
            </span>
          </h1>
          <p className="text-xs text-slate-500 truncate">
            Week {data?.currentWeek?.week_number || 1} • Progress & Update Tracker
          </p>
        </div>

        <button
          onClick={fetchTeam}
          className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95 transition-transform shrink-0"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Philosophy Callout Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-200/80 text-xs text-sky-950 flex items-start gap-3 shadow-sm">
        <div className="w-9 h-9 rounded-xl bg-sky-600/10 border border-sky-400/30 text-sky-700 flex items-center justify-center shrink-0 mt-0.5">
          <OtterIcon className="w-5 h-5 text-sky-700" />
        </div>
        <div>
          <p className="font-bold text-sky-900 text-sm">A raft stays afloat together.</p>
          <p className="text-slate-600 leading-relaxed mt-0.5">
            This dashboard highlights who has updated their weekly tasks and who needs support. Team progress, not surveillance!
          </p>
        </div>
      </div>

      {/* Team Progress Chart & Summary Card */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 font-display">Team Weekly Progress</h2>
              <p className="text-[11px] text-slate-400">Aggregated task pace for current week</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xl font-black text-sky-600 font-display">
              {summary.completionPercent}%
            </span>
            <p className="text-[10px] text-slate-400">of team target</p>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
            {summary.totalTasks > 0 ? (
              <>
                <div
                  style={{ width: `${(summary.doneTasks / summary.totalTasks) * 100}%` }}
                  className="bg-emerald-500 h-full transition-all duration-500"
                  title={`Done: ${summary.doneTasks}`}
                />
                <div
                  style={{ width: `${(summary.doingTasks / summary.totalTasks) * 100}%` }}
                  className="bg-sky-500 h-full transition-all duration-500"
                  title={`In Progress: ${summary.doingTasks}`}
                />
                <div
                  style={{ width: `${(summary.blockedTasks / summary.totalTasks) * 100}%` }}
                  className="bg-amber-500 h-full transition-all duration-500"
                  title={`Blocked: ${summary.blockedTasks}`}
                />
              </>
            ) : (
              <div className="w-full bg-slate-200 h-full" />
            )}
          </div>

          {/* Chart Legend */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Done ({summary.doneTasks})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
              In Progress ({summary.doingTasks})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              Blocked ({summary.blockedTasks})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
              To Do ({summary.todoTasks})
            </span>
          </div>
        </div>

        {/* Quick Stat Tiles */}
        <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 text-center">
          <div className="p-2 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-500 block">Updated</span>
            <span className="text-base font-extrabold text-emerald-600">
              {summary.updatedCount}/{summary.totalActiveMembers}
            </span>
          </div>
          <div className="p-2 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-500 block">Pending</span>
            <span className="text-base font-extrabold text-amber-600">
              {summary.notYetCount}
            </span>
          </div>
          <div className="p-2 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-500 block">Resting</span>
            <span className="text-base font-extrabold text-purple-600">
              {summary.restingCount}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilter('all')}
          className={`px-3.5 py-1.5 rounded-full font-bold transition-colors shrink-0 ${
            filter === 'all'
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          All Members ({members.length})
        </button>
        <button
          onClick={() => setFilter('updated')}
          className={`px-3.5 py-1.5 rounded-full font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
            filter === 'updated'
              ? 'bg-emerald-600 text-white'
              : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Updated ({summary.updatedCount})
        </button>
        <button
          onClick={() => setFilter('not-yet')}
          className={`px-3.5 py-1.5 rounded-full font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
            filter === 'not-yet'
              ? 'bg-amber-600 text-white'
              : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Not yet ({summary.notYetCount})
        </button>
        <button
          onClick={() => setFilter('blocked')}
          className={`px-3.5 py-1.5 rounded-full font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
            filter === 'blocked'
              ? 'bg-rose-600 text-white'
              : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Stuck on a rock ({summary.blockedTasks})
        </button>
      </div>

      {/* Members List */}
      <div className="space-y-3">
        {filteredMembers.map((m) => {
          const profile = m.profile;
          const levelInfo = m.levelInfo;

          return (
            <div
              key={profile.id}
              className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm space-y-3 transition-shadow hover:shadow-md"
            >
              {/* Member Card Header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-white font-bold text-base flex items-center justify-center shrink-0 shadow-sm">
                    {profile.full_name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900 font-display truncate">
                        {profile.full_name}
                      </h3>
                      <RoleBadge
                        roleType={profile.role_type}
                        isSuperAdmin={profile.is_super_admin}
                        isTreasurer={profile.is_treasurer}
                      />
                    </div>
                    <p className="text-xs text-slate-400 truncate">
                      {profile.role_title || 'Team Member'}
                    </p>
                  </div>
                </div>

                {/* Update Status Badge */}
                <div className="shrink-0">
                  {m.hasUpdatedThisWeek ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Updated
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Not yet
                    </span>
                  )}
                </div>
              </div>

              {/* Otter Level & Progress Row */}
              <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-[10px]">
                    <Sparkles className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <span className="font-bold text-slate-800">
                      Level: {levelInfo.level}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      {levelInfo.totalXP} Total XP
                    </span>
                  </div>
                </div>

                {/* Rest Mode Indicator if applicable */}
                {m.isResting && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                    <Palmtree className="w-3 h-3 text-purple-600" />
                    Resting on Riverbank
                  </span>
                )}

                {/* This week task XP */}
                <div className="text-right">
                  <span className="font-extrabold text-sky-700">
                    {m.weekTaskXP} XP
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Target: {profile.weekly_target_xp || 80}
                  </span>
                </div>
              </div>

              {/* Blocked Tasks Alert Box (Stuck on a rock) */}
              {m.blockedTasks.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300/80 text-xs text-amber-950 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <span className="text-base">🪨</span>
                    <span>Stuck on a rock ({m.blockedTasks.length} task blocked)</span>
                  </div>
                  {m.blockedTasks.map((bt) => (
                    <div
                      key={bt.id}
                      className="p-2 rounded-xl bg-white/80 border border-amber-200 text-xs space-y-0.5"
                    >
                      <p className="font-semibold text-slate-800">{bt.title}</p>
                      <p className="text-[11px] text-amber-800 italic">
                        &quot;{bt.note}&quot;
                      </p>
                    </div>
                  ))}
                  <p className="text-[11px] text-amber-800/90 font-medium">
                    Have 5 minutes? Check in with {profile.full_name.split(' ')[0]} to help dislodge this pebble!
                  </p>
                </div>
              )}
            </div>
          );
        })}

        {filteredMembers.length === 0 && (
          <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 space-y-2">
            <p className="text-sm font-bold text-slate-700">No otters match this filter</p>
            <p className="text-xs text-slate-400">Try switching to &quot;All Members&quot;.</p>
          </div>
        )}
      </div>
    </div>
  );
}

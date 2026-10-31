'use client';

import { useState, useEffect } from 'react';
import {
  Trophy,
  Medal,
  Award,
  Crown,
  Sparkles,
  Palmtree,
  Calendar,
  Lock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertCircle,
  Shield,
  Eye,
  EyeOff,
} from 'lucide-react';

export default function LeaderboardPage() {
  const [tab, setTab] = useState<'weekly' | 'season'>('weekly');
  const [loading, setLoading] = useState(true);

  // Weekly data
  const [weeklyData, setWeeklyData] = useState<{
    week: any;
    top3: any[];
    currentUserEntry: any;
    restingMembers: any[];
    allMembers?: any[];
    viewerRole?: string;
    isExecutive?: boolean;
  } | null>(null);

  // Season data
  const [seasonData, setSeasonData] = useState<{
    monthYear: string;
    availableMonths: string[];
    topOtter: any;
    rankings: any[];
    restingOnlyMembers: any[];
  } | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [closingWeek, setClosingWeek] = useState(false);
  const [closeResult, setCloseResult] = useState<string | null>(null);

  const fetchWeekly = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const json = await res.json();
        setWeeklyData(json);
      }
    } catch (err) {
      console.error('Failed to load weekly leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSeason = async (month?: string) => {
    try {
      const url = month ? `/api/leaderboard/season?month=${month}` : '/api/leaderboard/season';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setSeasonData(json);
        if (!selectedMonth && json.monthYear) {
          setSelectedMonth(json.monthYear);
        }
      }
    } catch (err) {
      console.error('Failed to load season data:', err);
    }
  };

  useEffect(() => {
    fetchWeekly();
    fetchSeason();
  }, []);

  const handleMonthChange = (m: string) => {
    setSelectedMonth(m);
    fetchSeason(m);
  };

  const handleManualClose = async () => {
    if (!confirm('Run the weekly close job now? This will finalize scores, snapshot targets, and open the next week.')) {
      return;
    }

    try {
      setClosingWeek(true);
      setCloseResult(null);
      const res = await fetch('/api/tasks/close-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        setCloseResult(data.message || 'Week closed successfully!');
        await fetchWeekly();
        await fetchSeason(selectedMonth);
      } else {
        setCloseResult(`Error: ${data.error || 'Failed to close week'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to execute close job';
      setCloseResult(`Error: ${msg}`);
    } finally {
      setClosingWeek(false);
    }
  };

  const isExecutive = weeklyData?.isExecutive === true;

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-5 pb-28">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 font-display flex items-center gap-2">
            Leaderboard
            <span className="text-[11px] sm:text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center gap-1 shrink-0">
              <Trophy className="w-3.5 h-3.5" />
              Progress Game
            </span>
          </h1>
          <p className="text-xs text-slate-500 truncate">
            Ranked by % of weekly target (capped at 120%). Task XP only.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Super Admin manual trigger */}
          {isExecutive && (
            <button
              onClick={handleManualClose}
              disabled={closingWeek}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-slate-800 active:scale-95 transition-transform disabled:opacity-50"
              title="Super Admin: Run weekly close job now"
            >
              <Play className="w-3.5 h-3.5 fill-current text-amber-400" />
              {closingWeek ? (
                'Closing...'
              ) : (
                <>
                  <span className="hidden sm:inline">Run Close Now</span>
                  <span className="sm:hidden">Close</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={() => {
              fetchWeekly();
              fetchSeason(selectedMonth);
            }}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95 transition-transform"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Close Result Notification */}
      {closeResult && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center gap-2.5 ${
            closeResult.startsWith('Error')
              ? 'bg-rose-50 text-rose-800 border border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          {closeResult.startsWith('Error') ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span className="font-medium">{closeResult}</span>
        </div>
      )}

      {/* Tabs: Weekly Board vs Monthly Season */}
      <div className="flex p-1 rounded-2xl bg-slate-100 border border-slate-200/80">
        <button
          onClick={() => setTab('weekly')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            tab === 'weekly'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Trophy className="w-4 h-4 text-amber-500" />
          Weekly Board
        </button>
        <button
          onClick={() => setTab('season')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            tab === 'season'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Crown className="w-4 h-4 text-purple-600" />
          Monthly Season (Top Otter)
        </button>
      </div>

      {loading && !weeklyData ? (
        <div className="p-8 flex flex-col items-center justify-center min-h-[40vh] gap-3">
          <div className="w-9 h-9 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Calculating scores & standings...</p>
        </div>
      ) : tab === 'weekly' ? (
        /* ============================================================================== */
        /* TAB 1: WEEKLY BOARD                                                             */
        /* ============================================================================== */
        <div className="space-y-4">
          {/* Week Info Header */}
          <div className="flex items-center justify-between text-xs px-1 text-slate-500">
            <span>
              Week {weeklyData?.week?.week_number || 1} • Saturday Meeting Cycle
            </span>
            <span>Capped at 120.00%</span>
          </div>

          {/* Podium (Top 3) Showcase */}
          <div className="bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 rounded-3xl p-5 text-white shadow-lg border border-sky-900/60 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                This Week&apos;s Top 3 Otters
              </span>
              <span className="text-[11px] text-sky-200/70">Visible to entire raft</span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {/* 2nd Place */}
              {weeklyData?.top3[1] ? (
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 text-center border border-slate-400/20 flex flex-col items-center justify-between">
                  <div className="w-7 h-7 rounded-full bg-slate-300 text-slate-800 font-black text-xs flex items-center justify-center shadow-sm">
                    2
                  </div>
                  <div className="my-2 min-w-0 w-full">
                    <p className="text-xs font-bold text-white truncate">
                      {weeklyData.top3[1].fullName}
                    </p>
                    <p className="text-[10px] text-slate-300 truncate">
                      {weeklyData.top3[1].roleTitle || 'Lead'}
                    </p>
                  </div>
                  <span className="text-sm font-black text-slate-200 font-display">
                    {weeklyData.top3[1].score}%
                  </span>
                </div>
              ) : (
                <div className="rounded-2xl p-3 border border-dashed border-white/10 flex items-center justify-center text-[11px] text-white/30">
                  Pending
                </div>
              )}

              {/* 1st Place (Crown / Gold) */}
              {weeklyData?.top3[0] ? (
                <div className="bg-gradient-to-b from-amber-500/20 to-amber-500/5 backdrop-blur-sm rounded-2xl p-3 text-center border border-amber-400/40 flex flex-col items-center justify-between ring-2 ring-amber-400/30 shadow-lg -translate-y-1">
                  <div className="w-8 h-8 rounded-full bg-amber-400 text-amber-950 font-black text-xs flex items-center justify-center shadow-md">
                    👑 1
                  </div>
                  <div className="my-2 min-w-0 w-full">
                    <p className="text-xs font-black text-amber-200 truncate">
                      {weeklyData.top3[0].fullName}
                    </p>
                    <p className="text-[10px] text-amber-300/80 truncate">
                      {weeklyData.top3[0].roleTitle || 'Lead'}
                    </p>
                  </div>
                  <span className="text-base font-black text-amber-300 font-display">
                    {weeklyData.top3[0].score}%
                  </span>
                </div>
              ) : (
                <div className="rounded-2xl p-3 border border-dashed border-white/10 flex items-center justify-center text-[11px] text-white/30">
                  Pending
                </div>
              )}

              {/* 3rd Place */}
              {weeklyData?.top3[2] ? (
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 text-center border border-amber-700/20 flex flex-col items-center justify-between">
                  <div className="w-7 h-7 rounded-full bg-amber-700 text-amber-100 font-black text-xs flex items-center justify-center shadow-sm">
                    3
                  </div>
                  <div className="my-2 min-w-0 w-full">
                    <p className="text-xs font-bold text-white truncate">
                      {weeklyData.top3[2].fullName}
                    </p>
                    <p className="text-[10px] text-slate-300 truncate">
                      {weeklyData.top3[2].roleTitle || 'Lead'}
                    </p>
                  </div>
                  <span className="text-sm font-black text-amber-200/90 font-display">
                    {weeklyData.top3[2].score}%
                  </span>
                </div>
              ) : (
                <div className="rounded-2xl p-3 border border-dashed border-white/10 flex items-center justify-center text-[11px] text-white/30">
                  Pending
                </div>
              )}
            </div>
          </div>

          {/* Caller's Personal Rank Card (Especially if not in Top 3) */}
          {weeklyData?.currentUserEntry && (
            <div className="p-4 rounded-3xl bg-sky-50 border border-sky-200 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white font-black text-sm flex items-center justify-center">
                  {weeklyData.currentUserEntry.isResting
                    ? '🏖️'
                    : `#${weeklyData.currentUserEntry.rank || '-'}`}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-sky-800">
                      Your Standing
                    </span>
                    {weeklyData.currentUserEntry.isResting && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                        Resting
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-900">
                    {weeklyData.currentUserEntry.fullName}
                  </p>
                </div>
              </div>

              <div className="text-right">
                {weeklyData.currentUserEntry.isResting ? (
                  <span className="text-xs font-bold text-purple-700">Target Waived</span>
                ) : (
                  <>
                    <span className="text-lg font-black text-sky-700 font-display">
                      {weeklyData.currentUserEntry.score}%
                    </span>
                    <p className="text-[10px] text-slate-500">
                      {weeklyData.currentUserEntry.taskXP} XP / {weeklyData.currentUserEntry.targetSnapshot}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Non-Executive Privacy Banner: Leads see top 3 and own row */}
          {!isExecutive && (
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2.5">
              <EyeOff className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                To encourage healthy habits, you see the Top 3 and your own rank. Other teammates&apos; individual standings are private.
              </span>
            </div>
          )}

          {/* Executive Full Standings Table */}
          {isExecutive && weeklyData?.allMembers && (
            <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-sky-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Executive Full Roster
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">All member stats visible</span>
              </div>

              <div className="divide-y divide-slate-100">
                {weeklyData.allMembers
                  .sort((a, b) => {
                    if (a.isResting && !b.isResting) return 1;
                    if (!a.isResting && b.isResting) return -1;
                    return (a.rank || 999) - (b.rank || 999);
                  })
                  .map((m) => (
                    <div
                      key={m.userId}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-full font-bold text-[11px] flex items-center justify-center shrink-0 ${
                            m.rank === 1
                              ? 'bg-amber-100 text-amber-800'
                              : m.rank === 2
                              ? 'bg-slate-200 text-slate-700'
                              : m.rank === 3
                              ? 'bg-amber-800 text-amber-100'
                              : m.isResting
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {m.isResting ? '🏖️' : m.rank || '-'}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{m.fullName}</p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {m.roleTitle || 'Lead'} • {m.tasksFinished} tasks done
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {m.isResting ? (
                          <span className="text-[11px] font-bold text-purple-700">Resting</span>
                        ) : (
                          <>
                            <span className="font-black text-slate-900 font-display">
                              {m.score}%
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              {m.taskXP} XP / {m.targetSnapshot}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Resting Members Section (Never ranked last) */}
          {weeklyData?.restingMembers && weeklyData.restingMembers.length > 0 && (
            <div className="p-4 rounded-3xl bg-purple-50/70 border border-purple-200/80 space-y-2">
              <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
                <Palmtree className="w-4 h-4 text-purple-600" />
                <span>Recharging on the Riverbank ({weeklyData.restingMembers.length})</span>
              </div>
              <p className="text-[11px] text-purple-800/80">
                Weekly targets are waived and streaks remain frozen. Resting members are never ranked last or penalized.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {weeklyData.restingMembers.map((rm) => (
                  <span
                    key={rm.userId}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white border border-purple-200 text-purple-900 shadow-2xs"
                  >
                    <span>🦦</span>
                    <span>{rm.fullName}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ============================================================================== */
        /* TAB 2: MONTHLY SEASON                                                           */
        /* ============================================================================== */
        <div className="space-y-4">
          {/* Month Selector Dropdown */}
          <div className="flex items-center justify-between bg-white rounded-2xl p-3 border border-slate-200 shadow-sm text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-sky-600" />
              Season Month:
            </span>
            <select
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {seasonData?.availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Top Otter Champion Showcase Banner */}
          {seasonData?.topOtter ? (
            <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 rounded-3xl p-5 text-amber-950 shadow-lg border border-amber-300 flex items-center justify-between">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/20 text-xs font-black tracking-wider uppercase">
                  <Crown className="w-3.5 h-3.5 fill-current" />
                  Top Otter of the Month
                </div>
                <h2 className="text-xl font-black font-display tracking-tight text-white drop-shadow-sm">
                  {seasonData.topOtter.fullName}
                </h2>
                <p className="text-xs text-amber-100 font-medium">
                  {seasonData.topOtter.roleTitle || 'Software Otter'} • {seasonData.topOtter.totalTasksFinished} tasks finished
                </p>
              </div>

              <div className="text-right bg-white/20 backdrop-blur-xs rounded-2xl p-3 border border-white/30 text-white shadow-inner">
                <span className="text-2xl font-black font-display block leading-none">
                  {seasonData.topOtter.averageScore}%
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-100 block mt-1">
                  Monthly Avg
                </span>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
              No closed weeks recorded yet for {selectedMonth}. Complete the first Saturday meeting cycle to crown the Top Otter!
            </div>
          )}

          {/* Monthly Season Rankings Table */}
          <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Monthly Season Standings ({seasonData?.rankings.length || 0})
              </h3>
              <span className="text-[11px] text-slate-400">Rest weeks excluded from avg</span>
            </div>

            <div className="divide-y divide-slate-100">
              {seasonData?.rankings.map((r) => {
                const isExpanded = expandedMember === r.userId;

                return (
                  <div key={r.userId} className="py-2.5 space-y-2">
                    <div
                      onClick={() => setExpandedMember(isExpanded ? null : r.userId)}
                      className="flex items-center justify-between gap-3 text-xs cursor-pointer select-none group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-full font-bold text-[11px] flex items-center justify-center shrink-0 ${
                            r.rank === 1
                              ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-400/50'
                              : r.rank === 2
                              ? 'bg-slate-200 text-slate-700'
                              : r.rank === 3
                              ? 'bg-amber-800 text-amber-100'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {r.rank === 1 ? '👑' : r.rank}
                        </span>

                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 group-hover:text-sky-600 transition-colors truncate">
                            {r.fullName}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {r.weeksParticipated} active weeks
                            {r.weeksRested > 0 ? ` • ${r.weeksRested} rested` : ''} •{' '}
                            {r.totalTasksFinished} tasks finished
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="font-black text-slate-900 font-display text-sm">
                            {r.averageScore}%
                          </span>
                          <span className="text-[10px] text-slate-400 block">Season Avg</span>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Member's Individual Week Breakdown Accordion */}
                    {isExpanded && (
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs space-y-2 mt-2">
                        <p className="font-bold text-[11px] text-slate-600 uppercase tracking-wider">
                          Weekly Breakdown for {r.fullName}
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {r.weeksBreakdown.map((wb: any) => (
                            <div
                              key={wb.weekNumber}
                              className="p-2 rounded-xl bg-white border border-slate-200 text-center"
                            >
                              <span className="text-[10px] text-slate-400 font-bold block">
                                Week {wb.weekNumber}
                              </span>
                              {wb.isResting ? (
                                <span className="text-xs font-bold text-purple-700">
                                  Resting (Waived)
                                </span>
                              ) : (
                                <>
                                  <span className="text-sm font-extrabold text-slate-900 font-display">
                                    {wb.score ?? 0}%
                                  </span>
                                  <span className="text-[10px] text-slate-400 block">
                                    {wb.taskXP} XP
                                  </span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {seasonData?.rankings.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">
                  No member scores logged for this season yet.
                </p>
              )}
            </div>
          </div>

          {/* Members who rested all month (Excluded from ranking) */}
          {seasonData?.restingOnlyMembers && seasonData.restingOnlyMembers.length > 0 && (
            <div className="p-4 rounded-3xl bg-purple-50 border border-purple-200 text-xs text-purple-900 space-y-1">
              <span className="font-bold block">Rested Entire Month (Unranked):</span>
              <p className="text-[11px] text-purple-800/80">
                Members with 0 active weeks in a month are excluded from the monthly average ranking.
              </p>
              <div className="flex gap-2 pt-1">
                {seasonData.restingOnlyMembers.map((m) => (
                  <span
                    key={m.userId}
                    className="px-2.5 py-0.5 rounded-full bg-white border border-purple-200 text-xs font-medium"
                  >
                    {m.fullName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

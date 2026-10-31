import { getTeamProfiles } from '@/lib/auth';
import { Trophy, Medal, Award, Flame, Info, Sparkles } from 'lucide-react';

const OTTER_LEVELS = [
  { name: 'Pup', minXp: 0, icon: '🐾' },
  { name: 'Paddler', minXp: 150, icon: '🛶' },
  { name: 'Swimmer', minXp: 450, icon: '🏊' },
  { name: 'Diver', minXp: 900, icon: '🤿' },
  { name: 'Raft Leader', minXp: 1500, icon: '⭐' },
  { name: 'Keystone', minXp: 2500, icon: '👑' },
];

export default async function LeaderboardPage() {
  const members = await getTeamProfiles();

  return (
    <div className="p-4 space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 font-display">
            Leaderboard
          </h1>
          <p className="text-xs text-slate-500">
            Ranked by % of weekly XP target (capped at 120%).
          </p>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
          <Trophy className="w-5 h-5 text-amber-500" />
        </div>
      </div>

      {/* Podium Card (Top 3 Preview) */}
      <div className="bg-gradient-to-b from-slate-900 to-sky-950 rounded-3xl p-5 text-white shadow-lg border border-sky-900/60 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Weekly Top Otters
          </span>
          <span className="text-[11px] text-sky-200/70 font-medium">
            Season 1
          </span>
        </div>

        {/* Podium Pillars */}
        <div className="grid grid-cols-3 gap-2 items-end pt-4 pb-2 text-center">
          {/* Rank 2 */}
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-700/80 border border-slate-500 mx-auto flex items-center justify-center text-xs font-bold">
              2nd
            </div>
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-2.5 h-24 flex flex-col justify-end">
              <p className="text-xs font-bold text-white truncate">{members[1]?.full_name?.split(' ')[0] || 'Otter'}</p>
              <p className="text-[10px] text-sky-300 font-medium">0%</p>
            </div>
          </div>

          {/* Rank 1 */}
          <div className="space-y-2">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-300 mx-auto flex items-center justify-center text-sm font-extrabold shadow-lg shadow-amber-500/20">
              👑 1st
            </div>
            <div className="bg-gradient-to-t from-sky-900 to-sky-800 border border-amber-400/40 rounded-2xl p-2.5 h-32 flex flex-col justify-end">
              <p className="text-xs font-black text-amber-300 truncate">{members[0]?.full_name?.split(' ')[0] || 'Otter'}</p>
              <p className="text-[11px] font-extrabold text-white">0%</p>
              <span className="text-[9px] uppercase tracking-wider text-amber-400 font-bold">Top Otter</span>
            </div>
          </div>

          {/* Rank 3 */}
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-full bg-amber-900/40 border border-amber-700/60 text-amber-300 mx-auto flex items-center justify-center text-xs font-bold">
              3rd
            </div>
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-2.5 h-20 flex flex-col justify-end">
              <p className="text-xs font-bold text-white truncate">{members[2]?.full_name?.split(' ')[0] || 'Otter'}</p>
              <p className="text-[10px] text-sky-300 font-medium">0%</p>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-center text-sky-200/60 pt-1">
          Tie-breaker: Most tasks completed, then earliest updates.
        </p>
      </div>

      {/* Levels Milestone Ladder */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          Otter Lifetime Levels (Total XP never resets)
        </h2>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {OTTER_LEVELS.map((lvl) => (
            <div
              key={lvl.name}
              className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span>{lvl.icon}</span>
                <span className="font-semibold text-slate-800">{lvl.name}</span>
              </div>
              <span className="text-[11px] font-bold text-sky-700">{lvl.minXp} XP</span>
            </div>
          ))}
        </div>
      </div>

      {/* Season Rule Note */}
      <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-xs text-sky-950 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold">Fair & Balanced Scoring</p>
          <p className="text-sky-800/80 leading-relaxed text-[11px]">
            Leaderboard measures percentage of personal target (default 80 XP), ensuring leads and executives compete on equal footing regardless of workload variations. Rest mode waives target for up to 2 weeks a month!
          </p>
        </div>
      </div>
    </div>
  );
}

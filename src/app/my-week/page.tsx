import { getCurrentProfile } from '@/lib/auth';
import { CalendarCheck2, Sparkles, CheckCircle2, Clock, Info } from 'lucide-react';

export default async function MyWeekPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="p-4 space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 font-display">
            My Week
          </h1>
          <p className="text-xs text-slate-500">
            Log your tasks, earn XP, and level up your otter.
          </p>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-700">
          <CalendarCheck2 className="w-5 h-5 text-sky-600" />
        </div>
      </div>

      {/* Target Progress Card */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase font-bold text-slate-400 tracking-wider">Current Week Progress</p>
            <p className="text-2xl font-black text-slate-900 font-display mt-0.5">
              0 <span className="text-sm font-semibold text-slate-400">/ {profile?.weekly_target_xp ?? 80} XP</span>
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
            0% of Target
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5">
          <div className="bg-sky-500 h-full rounded-full transition-all duration-300" style={{ width: '0%' }} />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" /> Cutoff: Saturday 10:00 AM
          </span>
          <span className="text-amber-600 font-semibold">+10 XP On-time Bonus</span>
        </div>
      </div>

      {/* Task Sizes Guide */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 font-display">
          <Sparkles className="w-4 h-4 text-sky-600" />
          Honesty-Based Task XP System
        </h2>
        <p className="text-xs text-slate-500">
          No screenshots or manual approval needed. You are trusted to update your tasks honestly.
        </p>

        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Small</span>
            <span className="text-base font-extrabold text-sky-700 font-display">10 XP</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Quick task</span>
          </div>

          <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200/80">
            <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider block">Medium</span>
            <span className="text-base font-extrabold text-sky-800 font-display">30 XP</span>
            <span className="text-[10px] text-sky-700/80 block mt-0.5">Core feature</span>
          </div>

          <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80">
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Big</span>
            <span className="text-base font-extrabold text-indigo-800 font-display">50 XP</span>
            <span className="text-[10px] text-indigo-700/80 block mt-0.5">Deep sprint</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 text-center">
          Weekly task XP cap: 150 XP • Saturday cutoff bonus: +10 XP
        </p>
      </div>

      {/* Phase Placeholder Notice */}
      <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200/80 flex items-start gap-3">
        <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
        <div className="text-xs text-sky-950 space-y-1">
          <p className="font-bold">Phase 1 Foundation Ready</p>
          <p className="text-sky-800/80 leading-relaxed">
            Interactive task logging, real-time XP accumulation, and undo/edit before cutoff will be implemented in Phase 2.
          </p>
        </div>
      </div>
    </div>
  );
}

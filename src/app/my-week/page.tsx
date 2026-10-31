'use client';

import { useState, useEffect } from 'react';
import {
  CalendarCheck2,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Flame,
  Undo2,
  ChevronRight,
  ExternalLink,
  Shield,
  Palmtree,
  X,
  Play,
  RotateCcw,
  Check,
} from 'lucide-react';
import type {
  Task,
  QuickPick,
  TaskCategory,
  TaskSize,
  Profile,
  Settings,
  Week,
  LevelInfo,
} from '@/types/database';
import { LevelCelebration } from '@/components/LevelCelebration';

const CATEGORY_COLORS: Record<TaskCategory, { bg: string; text: string; border: string }> = {
  Platforms: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  Marketing: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  Clients: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  Operations: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  Growth: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  Other: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
};

const SIZE_XP: Record<TaskSize, number> = {
  small: 10,
  medium: 30,
  big: 50,
};

export default function MyWeekPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [currentWeek, setCurrentWeek] = useState<Week | null>(null);
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
  const [streak, setStreak] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [weekTaskXP, setWeekTaskXP] = useState(0);
  const [hasEarlyBonus, setHasEarlyBonus] = useState(false);
  const [isCutoffPassed, setIsCutoffPassed] = useState(false);
  const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
  const [extraTasks, setExtraTasks] = useState<Task[]>([]);
  const [quickPicks, setQuickPicks] = useState<QuickPick[]>([]);
  const [activeTab, setActiveTab] = useState<'assigned' | 'extras'>('assigned');

  // Modals & Forms
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [blockedModalTask, setBlockedModalTask] = useState<Task | null>(null);
  const [blockedNote, setBlockedNote] = useState('');
  const [activeMembers, setActiveMembers] = useState<{ id: string; full_name: string; role_title: string }[]>([]);

  // Action status message & celebration
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [celebrationLevel, setCelebrationLevel] = useState<LevelInfo | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  // Form inputs for Extra Task
  const [extraTitle, setExtraTitle] = useState('');
  const [extraCategory, setExtraCategory] = useState<TaskCategory>('Platforms');
  const [extraSize, setExtraSize] = useState<TaskSize>('medium');
  const [extraNote, setExtraNote] = useState('');

  // Form inputs for Assign Task (Executives)
  const [assigneeId, setAssigneeId] = useState('');
  const [assignTitle, setAssignTitle] = useState('');
  const [assignCategory, setAssignCategory] = useState<TaskCategory>('Platforms');
  const [assignSize, setAssignSize] = useState<TaskSize>('medium');
  const [assignNote, setAssignNote] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error('Failed to load tasks data.');
      const data = await res.json();

      setProfile(data.profile);
      setSettings(data.settings);
      setCurrentWeek(data.currentWeek);
      setLevelInfo(data.levelInfo);
      setStreak(data.streak);
      setIsResting(data.isResting);
      setWeekTaskXP(data.weekTaskXP);
      setHasEarlyBonus(data.hasEarlyBonus);
      setIsCutoffPassed(data.isCutoffPassed);
      setAssignedTasks(data.assignedTasks || []);
      setExtraTasks(data.extraTasks || []);
      setQuickPicks(data.quickPicks || []);

      if (data.profile?.role_type === 'executive' || data.profile?.is_super_admin) {
        fetch('/api/tasks/members')
          .then((r) => r.json())
          .then((m) => {
            setActiveMembers(m.members || []);
            if (m.members?.length > 0 && !assigneeId) {
              setAssigneeId(m.members[0].id);
            }
          })
          .catch(console.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadMembers = async () => {
    try {
      const res = await fetch('/api/tasks/members');
      if (res.ok) {
        const data = await res.json();
        setActiveMembers(data.members || []);
        if (data.members?.length > 0) {
          setAssigneeId((prev) => prev || data.members[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load active members:', err);
    }
  };

  const handleOpenAssignModal = async () => {
    await loadMembers();
    setShowAssignModal(true);
  };

  // Actions
  const handleSetStatus = async (taskId: string, status: 'doing' | 'todo') => {
    try {
      const res = await fetch('/api/tasks/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, status }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update task.');
      }
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error updating status');
    }
  };

  const handleFinishTask = async (taskId: string) => {
    try {
      const res = await fetch('/api/tasks/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to finish task.');

      let msg = `+${data.taskXPAwarded} XP awarded!`;
      if (data.bonusXPAwarded > 0) {
        msg += ` Plus +10 XP early cutoff bonus! 🌟`;
      }
      setStatusMessage(msg);
      setTimeout(() => setStatusMessage(null), 5000);

      // Check for level-up celebration
      if (levelInfo && data.levelInfo && data.levelInfo.level !== levelInfo.level) {
        setCelebrationLevel(data.levelInfo);
        setShowCelebration(true);
      }

      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error finishing task');
    }
  };

  const handleUndoTask = async (taskId: string) => {
    if (!confirm('Mark this task unfinished? Its XP event will be voided and the weekly cap will be recalculated.')) {
      return;
    }
    try {
      const res = await fetch('/api/tasks/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to undo task.');

      setStatusMessage('Task undone and XP cap recalculated.');
      setTimeout(() => setStatusMessage(null), 4000);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error undoing task');
    }
  };

  const handleConfirmBlocked = async () => {
    if (!blockedModalTask) return;
    try {
      const res = await fetch('/api/tasks/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: blockedModalTask.id,
          status: 'blocked',
          blockedNote: blockedNote.trim() || 'Stuck on a rock',
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to mark blocked.');
      }
      setBlockedModalTask(null);
      setBlockedNote('');
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error marking blocked');
    }
  };

  const handleToggleRestMode = async () => {
    try {
      const res = await fetch('/api/tasks/rest-mode', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to toggle rest mode.');

      setStatusMessage(data.message);
      setTimeout(() => setStatusMessage(null), 4000);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error toggling rest mode');
    }
  };

  const handleQuickPickClick = (qp: QuickPick) => {
    setExtraTitle(qp.label);
    setExtraCategory(qp.category);
    setExtraSize(qp.default_size);
    setExtraNote('');
    setShowExtraModal(true);
  };

  const handleSubmitExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraTitle.trim()) return;

    try {
      const res = await fetch('/api/tasks/extra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: extraTitle,
          category: extraCategory,
          size: extraSize,
          note: extraNote,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add extra task.');
      }
      setShowExtraModal(false);
      setExtraTitle('');
      setExtraNote('');
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error adding extra task');
    }
  };

  const handleSubmitAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTitle.trim() || !assigneeId) return;

    try {
      const res = await fetch('/api/tasks/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: assigneeId,
          title: assignTitle,
          category: assignCategory,
          size: assignSize,
          note: assignNote,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to assign task.');
      }
      setShowAssignModal(false);
      setAssignTitle('');
      setAssignNote('');
      setStatusMessage('Task assigned successfully!');
      setTimeout(() => setStatusMessage(null), 3000);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error assigning task');
    }
  };

  const isExecutive = profile?.role_type === 'executive' || profile?.is_super_admin;
  const targetXP = profile?.weekly_target_xp ?? 80;
  const targetPercent = Math.min(120, Math.round((weekTaskXP / targetXP) * 100));

  return (
    <div className="p-4 space-y-4">
      {/* Toast Notification */}
      {statusMessage && (
        <div className="fixed top-16 left-4 right-4 z-50 max-w-md mx-auto p-3.5 rounded-2xl bg-slate-900 text-white shadow-xl border border-sky-400/40 text-xs font-bold flex items-center justify-between animate-in fade-in slide-in-from-top-4">
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            {statusMessage}
          </span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Level-Up Celebration Modal */}
      {celebrationLevel && (
        <LevelCelebration
          level={celebrationLevel.level}
          totalXP={celebrationLevel.totalXP}
          isOpen={showCelebration}
          onClose={() => setShowCelebration(false)}
        />
      )}

      {/* Week Cadence & Cutoff Banner */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 text-white p-4 shadow-lg border border-sky-900/40 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[10px] font-extrabold uppercase tracking-wider">
                Week {currentWeek?.week_number || 44}
              </span>
              {isCutoffPassed && (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/30 text-[10px] font-extrabold uppercase">
                  Week Locked
                </span>
              )}
            </div>
            <h1 className="text-xl font-extrabold font-display text-white mt-1">
              My Week
            </h1>
            <p className="text-xs text-sky-200/80">
              Cutoff: <span className="font-semibold text-white">{settings?.meeting_weekday} {settings?.meeting_time}</span> ({settings?.timezone})
            </p>
          </div>

          {/* Rest Mode Button */}
          <button
            onClick={handleToggleRestMode}
            disabled={isCutoffPassed}
            className={`px-3 py-1.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition border ${
              isResting
                ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-900/30'
                : 'bg-white/10 hover:bg-white/20 text-sky-200 border-white/15'
            }`}
          >
            <Palmtree className="w-3.5 h-3.5 text-purple-300" />
            {isResting ? 'Resting 🌴' : 'Rest Mode'}
          </button>
        </div>

        {/* Weekly Task XP Progress & Bonus */}
        <div className="pt-2 border-t border-sky-800/40 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-sky-200/90 font-medium">
              Task XP: <strong className="text-white">{weekTaskXP}</strong> / 150 cap
            </span>
            <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
              {hasEarlyBonus ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  <Sparkles className="w-3 h-3 text-amber-400" /> +10 Early Bonus Active
                </span>
              ) : (
                <span className="text-slate-400">Finish a task for +10 bonus</span>
              )}
            </span>
          </div>

          {/* Progress bar to 150 cap */}
          <div className="w-full bg-slate-900/90 rounded-full h-3 overflow-hidden p-0.5 border border-sky-500/30 shadow-inner">
            <div
              className="bg-gradient-to-r from-sky-400 via-sky-300 to-amber-400 h-full rounded-full transition-all duration-300 shadow-xs"
              style={{ width: `${Math.min(100, (weekTaskXP / 150) * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-sky-300/70 pt-0.5">
            <span>Target: {targetXP} XP ({targetPercent}%)</span>
            <span>Streak: {streak} {streak === 1 ? 'week' : 'weeks'} 🔥</span>
          </div>
        </div>
      </div>

      {/* Executive Task Assignment Button */}
      {isExecutive && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-sky-50 border border-sky-200/70">
          <div>
            <p className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-sky-600" /> Executive Console
            </p>
            <p className="text-[11px] text-sky-700">Assign weekly tasks to team leads and members</p>
          </div>
          <button
            onClick={handleOpenAssignModal}
            className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-xs flex items-center gap-1 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Assign Task
          </button>
        </div>
      )}

      {/* Tabs: Assigned vs Extras */}
      <div className="flex rounded-2xl bg-slate-200/60 p-1 border border-slate-300/40">
        <button
          onClick={() => setActiveTab('assigned')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
            activeTab === 'assigned'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Assigned Tasks ({assignedTasks.length})
        </button>
        <button
          onClick={() => setActiveTab('extras')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
            activeTab === 'extras'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Extras ({extraTasks.length})
        </button>
      </div>

      {/* EXTRAS TAB: Quick Picks Carousel/Grid */}
      {activeTab === 'extras' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Quick Picks (Tap to add)
            </span>
            <button
              onClick={() => {
                setExtraTitle('');
                setExtraCategory('Platforms');
                setExtraSize('medium');
                setExtraNote('');
                setShowExtraModal(true);
              }}
              className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-0.5"
            >
              <Plus className="w-3.5 h-3.5" /> Custom Extra
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {quickPicks.map((qp) => {
              const catColor = CATEGORY_COLORS[qp.category] || CATEGORY_COLORS.Other;
              return (
                <button
                  key={qp.id}
                  onClick={() => handleQuickPickClick(qp)}
                  className="p-2.5 rounded-2xl bg-white hover:bg-sky-50/50 border border-slate-200 text-left transition shadow-2xs group flex flex-col justify-between"
                >
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catColor.bg} ${catColor.text} ${catColor.border} w-fit`}>
                    {qp.category}
                  </span>
                  <p className="text-xs font-bold text-slate-800 mt-2 line-clamp-2 group-hover:text-sky-600 transition">
                    {qp.label}
                  </p>
                  <span className="text-[10px] font-semibold text-slate-400 mt-1">
                    {qp.default_size.toUpperCase()} • {SIZE_XP[qp.default_size]} XP
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Task Cards List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400 font-medium">
            Loading tasks...
          </div>
        ) : (activeTab === 'assigned' ? assignedTasks : extraTasks).length === 0 ? (
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
              <CalendarCheck2 className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-800">
              No {activeTab === 'assigned' ? 'assigned' : 'extra'} tasks yet
            </p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              {activeTab === 'assigned'
                ? 'Your executives will assign tasks before or during the Saturday meeting.'
                : 'Pick a quick pick above or add a custom extra to earn more XP!'}
            </p>
          </div>
        ) : (
          (activeTab === 'assigned' ? assignedTasks : extraTasks).map((task) => {
            const catColor = CATEGORY_COLORS[task.category] || CATEGORY_COLORS.Other;
            const xpVal = SIZE_XP[task.size];
            const isDone = task.status === 'done';
            const isBlocked = task.status === 'blocked';
            const isDoing = task.status === 'doing';

            return (
              <div
                key={task.id}
                className={`p-4 rounded-3xl bg-white border transition shadow-xs space-y-3 ${
                  isDone
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : isBlocked
                    ? 'border-amber-300 bg-amber-50/20'
                    : 'border-slate-200/90'
                }`}
              >
                {/* Header: Category & Size Pill */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catColor.bg} ${catColor.text} ${catColor.border}`}>
                      {task.category}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                      {task.size} ({xpVal} XP)
                    </span>
                  </div>

                  {/* Status Indicator */}
                  {isDone ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                      <Check className="w-3.5 h-3.5 text-emerald-600" /> Finished
                    </span>
                  ) : isBlocked ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                      🪨 Blocked
                    </span>
                  ) : isDoing ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full animate-pulse">
                      In Progress
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-slate-400">To Do</span>
                  )}
                </div>

                {/* Title & Notes */}
                <div>
                  <h3 className={`text-sm font-bold ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                    {task.title}
                  </h3>
                  {task.note && (
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {task.note}
                    </p>
                  )}
                  {task.link && (
                    <a
                      href={task.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline mt-1 font-medium"
                    >
                      <ExternalLink className="w-3 h-3" /> View resource
                    </a>
                  )}
                </div>

                {/* Blocked Note Card (if stuck on a rock) */}
                {isBlocked && task.blocked_note && (
                  <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                    <span className="text-base leading-none">🪨</span>
                    <div>
                      <p className="font-bold text-[11px] uppercase text-amber-800 tracking-wider">Stuck on a Rock:</p>
                      <p className="mt-0.5 leading-relaxed">{task.blocked_note}</p>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  {!isDone ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleSetStatus(task.id, 'doing')}
                          disabled={isCutoffPassed || isDoing}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                            isDoing
                              ? 'bg-sky-100 text-sky-800 border border-sky-300 shadow-2xs cursor-default'
                              : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200/80'
                          }`}
                        >
                          {isDoing ? 'Doing Now ⏳' : "I'm doing"}
                        </button>

                        <button
                          onClick={() => {
                            setBlockedModalTask(task);
                            setBlockedNote(task.blocked_note || '');
                          }}
                          disabled={isCutoffPassed}
                          className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                        >
                          <span>🪨</span> Blocked
                        </button>
                      </div>

                      <button
                        onClick={() => handleFinishTask(task.id)}
                        disabled={isCutoffPassed}
                        className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" /> I finished
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        Honesty XP Awarded
                      </span>

                      {!isCutoffPassed ? (
                        <button
                          onClick={() => handleUndoTask(task.id)}
                          className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" /> Undo
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold text-slate-400">Week Locked</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: Blocked / Stuck on a Rock */}
      {blockedModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-lg">
                  🪨
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 font-display">Stuck on a Rock</h3>
                  <p className="text-xs text-slate-500">Flag this task so teammates can help.</p>
                </div>
              </div>
              <button
                onClick={() => setBlockedModalTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">What is blocking you? (optional)</label>
              <textarea
                value={blockedNote}
                onChange={(e) => setBlockedNote(e.target.value)}
                placeholder="e.g. Waiting on API credentials from client..."
                rows={3}
                className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBlockedModalTask(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBlocked}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-xs"
              >
                Confirm Blocked
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Extra Task */}
      {showExtraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={handleSubmitExtra}
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 font-display">Add Extra Task</h3>
                <p className="text-xs text-slate-500">Self-picked tasks earn XP towards your weekly cap.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowExtraModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Task Title</label>
              <input
                type="text"
                value={extraTitle}
                onChange={(e) => setExtraTitle(e.target.value)}
                placeholder="e.g. Update user authentication docs"
                required
                className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Category</label>
                <select
                  value={extraCategory}
                  onChange={(e) => setExtraCategory(e.target.value as TaskCategory)}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold"
                >
                  <option value="Platforms">Platforms</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Clients">Clients</option>
                  <option value="Operations">Operations</option>
                  <option value="Growth">Growth</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Size</label>
                <select
                  value={extraSize}
                  onChange={(e) => setExtraSize(e.target.value as TaskSize)}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold"
                >
                  <option value="small">Small (10 XP)</option>
                  <option value="medium">Medium (30 XP)</option>
                  <option value="big">Big (50 XP)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Note (Optional)</label>
              <textarea
                value={extraNote}
                onChange={(e) => setExtraNote(e.target.value)}
                placeholder="Add optional notes or link..."
                rows={2}
                className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowExtraModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-xs"
              >
                Add Extra
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Executive Assign Task to Member */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={handleSubmitAssign}
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 font-display">Assign Task</h3>
                <p className="text-xs text-slate-500">Assign a weekly task to an active team member.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Team Member</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                required
                className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
              >
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.role_title || 'Member'})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Task Title</label>
              <input
                type="text"
                value={assignTitle}
                onChange={(e) => setAssignTitle(e.target.value)}
                placeholder="e.g. Build API rate limiter"
                required
                className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Category</label>
                <select
                  value={assignCategory}
                  onChange={(e) => setAssignCategory(e.target.value as TaskCategory)}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold"
                >
                  <option value="Platforms">Platforms</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Clients">Clients</option>
                  <option value="Operations">Operations</option>
                  <option value="Growth">Growth</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Size</label>
                <select
                  value={assignSize}
                  onChange={(e) => setAssignSize(e.target.value as TaskSize)}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold"
                >
                  <option value="small">Small (10 XP)</option>
                  <option value="medium">Medium (30 XP)</option>
                  <option value="big">Big (50 XP)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Note or Instructions (Optional)</label>
              <textarea
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
                placeholder="Add specs or context..."
                rows={2}
                className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-xs"
              >
                Assign Task
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

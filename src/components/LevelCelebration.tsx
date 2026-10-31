'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Trophy, X } from 'lucide-react';
import type { OtterLevel } from '@/types/database';

interface LevelCelebrationProps {
  level: OtterLevel;
  totalXP: number;
  isOpen: boolean;
  onClose: () => void;
}

export function LevelCelebration({ level, totalXP, isOpen, onClose }: LevelCelebrationProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm rounded-3xl bg-gradient-to-b from-sky-900 via-slate-900 to-slate-950 p-6 text-white text-center shadow-2xl border border-sky-400/40 transform animate-in zoom-in-95 duration-300">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-white/5 hover:bg-white/10 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Celebration Otter Graphic */}
        <div className="relative mx-auto mb-4 w-24 h-24 rounded-3xl bg-gradient-to-tr from-amber-400 to-amber-600 p-0.5 shadow-xl shadow-amber-500/20">
          <div className="w-full h-full rounded-[22px] bg-slate-900 flex flex-col items-center justify-center">
            <Trophy className="w-10 h-10 text-amber-400 animate-bounce" />
            <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest mt-1">LEVEL UP</span>
          </div>
          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-xs shadow-md">
            ⭐
          </div>
        </div>

        <h3 className="text-2xl font-black text-white font-display">
          New Level Reached!
        </h3>
        <p className="text-sm font-bold text-sky-300 mt-1">
          You are now a <span className="text-amber-300 underline underline-offset-4">{level}</span>!
        </p>

        <p className="text-xs text-sky-200/80 mt-3 leading-relaxed">
          Your hard work has propelled the raft forward. Keep completing tasks before the Saturday cutoff to climb even higher!
        </p>

        <div className="mt-4 py-2 px-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-around text-xs font-semibold">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Total XP</p>
            <p className="text-amber-300 font-extrabold text-sm">{totalXP} XP</p>
          </div>
          <div className="h-6 w-px bg-white/10" />
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Rank Title</p>
            <p className="text-white font-extrabold text-sm">{level}</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-3 rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white font-bold text-sm shadow-lg shadow-sky-500/30 transition transform hover:scale-[1.02] active:scale-[0.98]"
        >
          Carry On, Otter! 🌊
        </button>
      </div>
    </div>
  );
}

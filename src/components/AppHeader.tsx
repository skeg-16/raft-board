'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar } from 'lucide-react';
import { OtterIcon } from '@/components/OtterIcon';
import type { Profile } from '@/types/database';

interface AppHeaderProps {
  currentProfile?: Profile | null;
}

export function AppHeader({ currentProfile }: AppHeaderProps) {
  const pathname = usePathname();

  // Hide header on login or change-password screens
  if (pathname === '/login' || pathname === '/change-password') {
    return null;
  }

  // Calculate days until Saturday meeting
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sunday, 6 is Saturday
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
  const meetingText =
    daysUntilSaturday === 0
      ? 'Meeting Today at 10 AM!'
      : daysUntilSaturday === 1
      ? 'Meeting Tomorrow at 10 AM'
      : `${daysUntilSaturday}d to Sat Meeting`;

  return (
    <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md border-b border-sky-950 text-white shadow-md">
      <div className="max-w-md mx-auto px-4 py-2.5 flex items-center justify-between">
        {/* Brand & Mascot */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 text-sky-100 flex items-center justify-center shadow-md shadow-sky-500/20 group-hover:scale-105 transition transform border border-sky-400/30">
            <OtterIcon className="w-5 h-5 text-sky-100" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm tracking-tight text-white font-display">
                Raft Board
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold tracking-wider uppercase bg-sky-500/20 text-sky-300 border border-sky-400/30">
                OSS
              </span>
            </div>
            <p className="text-[10px] text-sky-200/70 font-medium leading-none mt-0.5">
              Building software like no otter
            </p>
          </div>
        </Link>

        {/* Meeting Countdown / Profile pill */}
        <div className="flex items-center gap-2">
          <div
            title="Next weekly meeting cutoff (Asia/Manila)"
            className="hidden xs:flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-950/80 border border-sky-800 text-[11px] font-medium text-sky-200"
          >
            <Calendar className="w-3 h-3 text-sky-400" />
            <span>{meetingText}</span>
          </div>

          {currentProfile ? (
            <Link
              href="/settings"
              className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-sky-600 to-sky-400 text-white font-bold text-xs flex items-center justify-center shadow-xs border border-white/20 hover:ring-2 hover:ring-sky-300 transition"
              title={`${currentProfile.full_name} (${currentProfile.role_title})`}
            >
              {currentProfile.full_name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-slate-900" />
            </Link>
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-800 animate-pulse" />
          )}
        </div>
      </div>
    </header>
  );
}

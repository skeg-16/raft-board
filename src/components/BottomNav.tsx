'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CalendarCheck2, Users, Trophy, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/my-week', label: 'My Week', icon: CalendarCheck2 },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/leaderboard', label: 'Board', icon: Trophy },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  // Hide bottom nav on auth or pending approval screens
  if (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/pending-approval' ||
    pathname === '/change-password'
  ) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] bottom-nav-safe">
      <div className="max-w-md mx-auto px-2 flex items-center justify-around h-16">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl transition-all duration-150 select-none ${
                isActive
                  ? 'text-sky-700 font-bold scale-105'
                  : 'text-slate-400 hover:text-slate-600 active:scale-95'
              }`}
            >
              <div
                className={`p-1 rounded-xl transition-colors ${
                  isActive ? 'bg-sky-100/90' : 'bg-transparent'
                }`}
              >
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'stroke-[2.5px] text-sky-600' : 'stroke-[1.8px]'
                  }`}
                />
              </div>
              <span
                className={`text-[11px] mt-0.5 tracking-tight ${
                  isActive ? 'font-bold text-sky-950' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, UserCheck, Shield, History, Settings, Key } from 'lucide-react';

export default function AdminNav() {
  const pathname = usePathname();

  const navItems = [
    { href: '/admin/users', label: 'All Users', icon: Users },
    { href: '/admin/pending', label: 'Pending Approvals', icon: UserCheck },
    { href: '/admin/login-log', label: 'Login Logs', icon: History },
    { href: '/settings', label: 'Meeting Settings', icon: Settings },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 border-b border-slate-200 no-scrollbar">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 ${
              isActive
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

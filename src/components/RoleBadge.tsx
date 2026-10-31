import React from 'react';
import { ShieldCheck, Coins } from 'lucide-react';
import type { RoleType } from '@/types/database';

interface RoleBadgeProps {
  roleTitle?: string | null;
  roleType?: RoleType | null;
  isSuperAdmin?: boolean;
  isTreasurer?: boolean;
  size?: 'sm' | 'md';
}

export function RoleBadge({
  roleTitle = 'Member',
  roleType = 'lead',
  isSuperAdmin = false,
  isTreasurer = false,
  size = 'md',
}: RoleBadgeProps) {
  const isExecutive = roleType === 'executive';

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center rounded-lg font-medium tracking-wide ${
          size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
        } ${
          isExecutive
            ? 'bg-sky-100 text-sky-900 border border-sky-300/80 shadow-xs'
            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
        }`}
      >
        {roleTitle || 'Member'}
      </span>

      {isSuperAdmin && (
        <span
          title="Super Admin"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200/80 text-amber-800 text-[10px] font-semibold"
        >
          <ShieldCheck className="w-3 h-3 text-amber-600" />
          Admin
        </span>
      )}

      {isTreasurer && (
        <span
          title="Treasurer"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200/80 text-indigo-800 text-[10px] font-semibold"
        >
          <Coins className="w-3 h-3 text-indigo-600" />
          Treasurer
        </span>
      )}
    </div>
  );
}

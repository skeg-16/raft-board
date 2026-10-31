import { getTeamProfiles } from '@/lib/auth';
import { RoleBadge } from '@/components/RoleBadge';
import { Users, AlertCircle, CheckCircle2 } from 'lucide-react';

export default async function TeamPage() {
  const members = await getTeamProfiles();

  const executives = members.filter((m) => m.role_type === 'executive');
  const leads = members.filter((m) => m.role_type === 'lead');

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 font-display">
            Team Raft
          </h1>
          <p className="text-xs text-slate-500">
            6 otters building software together.
          </p>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
          <Users className="w-5 h-5 text-emerald-600" />
        </div>
      </div>

      {/* Philosophy banner */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200/80 text-xs text-sky-950 flex items-center gap-3">
        <span className="text-2xl select-none" role="img" aria-label="Otter raft">
          🦦
        </span>
        <p className="leading-snug">
          <strong>A raft stays afloat together.</strong> This board makes it obvious who has updated their weekly progress and who hasn't—for team support, not surveillance!
        </p>
      </div>

      {/* Executives Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Executive Otters ({executives.length})
          </h2>
        </div>

        <div className="space-y-2">
          {executives.map((member) => (
            <div
              key={member.id}
              className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-600 to-sky-800 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                  {member.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {member.full_name}
                  </p>
                  <RoleBadge
                    roleTitle={member.role_title}
                    roleType={member.role_type}
                    isSuperAdmin={member.is_super_admin}
                    isTreasurer={member.is_treasurer}
                    size="sm"
                  />
                </div>
              </div>

              {/* Status Indicator */}
              <div className="shrink-0 text-right">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold">
                  <AlertCircle className="w-3 h-3 text-amber-600" />
                  Needs update
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Target: {member.weekly_target_xp} XP
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Leads Section */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Lead Otters ({leads.length})
          </h2>
        </div>

        <div className="space-y-2">
          {leads.map((member) => (
            <div
              key={member.id}
              className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                  {member.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {member.full_name}
                  </p>
                  <RoleBadge
                    roleTitle={member.role_title}
                    roleType={member.role_type}
                    isSuperAdmin={member.is_super_admin}
                    isTreasurer={member.is_treasurer}
                    size="sm"
                  />
                </div>
              </div>

              {/* Status Indicator */}
              <div className="shrink-0 text-right">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold">
                  <AlertCircle className="w-3 h-3 text-amber-600" />
                  Needs update
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Target: {member.weekly_target_xp} XP
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

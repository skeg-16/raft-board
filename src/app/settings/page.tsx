import Link from 'next/link';
import { getCurrentProfile, getSystemSettings } from '@/lib/auth';
import { RoleBadge } from '@/components/RoleBadge';
import { SignOutButton } from '@/components/SignOutButton';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import {
  Settings as SettingsIcon,
  User,
  Clock,
  Shield,
  Smartphone,
  ShieldAlert,
  ArrowRight,
  KeyRound,
} from 'lucide-react';

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  const settings = await getSystemSettings();

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 font-display">
            Settings
          </h1>
          <p className="text-xs text-slate-500">
            Profile preferences and Raft configurations.
          </p>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
          <SettingsIcon className="w-5 h-5 text-sky-600" />
        </div>
      </div>

      {/* Super Admin Console Shortcut */}
      {profile?.is_super_admin && (
        <Link
          href="/admin/pending"
          className="p-4 rounded-3xl bg-gradient-to-r from-amber-500/10 via-amber-400/10 to-sky-500/10 border border-amber-300/60 shadow-xs flex items-center justify-between gap-3 group hover:border-amber-400 transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-amber-950 flex items-center justify-center font-bold shadow-xs">
              <ShieldAlert className="w-5 h-5 text-amber-950" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 font-display flex items-center gap-1.5">
                Pending Member Approvals
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500 text-amber-950 font-extrabold">
                  Admin
                </span>
              </p>
              <p className="text-xs text-slate-500">Review sign-up requests & assign team roles</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-600 group-hover:translate-x-1 transition" />
        </Link>
      )}

      {/* Member Profile Summary */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-bold text-slate-900 font-display">
              Member Profile
            </h2>
          </div>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            {profile?.status === 'active' ? 'Active Member' : 'Pending Member'}
          </span>
        </div>

        {profile ? (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
              <span className="text-slate-500">Full Name</span>
              <span className="font-bold text-slate-800">{profile.full_name}</span>
            </div>

            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
              <span className="text-slate-500">Role Title</span>
              {profile.role_title ? (
                <RoleBadge
                  roleTitle={profile.role_title}
                  roleType={profile.role_type || 'lead'}
                  isSuperAdmin={profile.is_super_admin}
                  isTreasurer={profile.is_treasurer}
                  size="sm"
                />
              ) : (
                <span className="text-amber-600 italic font-medium">Pending Assignment</span>
              )}
            </div>

            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
              <span className="text-slate-500">Weekly XP Target</span>
              <span className="font-bold text-sky-700">{profile.weekly_target_xp} XP</span>
            </div>

            <div className="flex items-center justify-between text-xs py-1">
              <span className="text-slate-500">Privileges</span>
              <span className="font-medium text-slate-700">
                {profile.is_super_admin ? 'Super Admin' : 'Standard Member'}
                {profile.is_treasurer && ' • Treasurer'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Loading profile...</p>
        )}
      </div>

      {/* Change Password Form */}
      <ChangePasswordForm />

      {/* System Cadence Settings */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-bold text-slate-900 font-display">
              Meeting & Timezone Cadence
            </h2>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Database Setting
          </span>
        </div>

        <div className="space-y-2.5 pt-1 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500">Weekly Meeting Day</span>
            <span className="font-bold text-slate-800">{settings.meeting_weekday}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500">Meeting Time</span>
            <span className="font-bold text-slate-800">{settings.meeting_time}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500">Timezone</span>
            <span className="font-bold text-slate-800">{settings.timezone}</span>
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-slate-500">Registration Mode</span>
            <span className="font-semibold text-sky-700">Self-Service with Team Join Code</span>
          </div>
        </div>
      </div>

      {/* PWA & Install Guide */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-sky-600" />
          <h2 className="text-sm font-bold text-slate-900 font-display">
            Install Raft Board (PWA)
          </h2>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Raft Board is built as an installable Progressive Web App:
        </p>

        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70 space-y-1.5 text-xs text-slate-700">
          <p className="font-bold text-slate-900">📱 Mobile Install:</p>
          <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
            <li><strong>iOS Safari:</strong> Tap the Share button (<span className="text-sky-600 font-semibold">Share</span>) → tap <em>"Add to Home Screen"</em>.</li>
            <li><strong>Android Chrome:</strong> Tap the 3-dots menu or the <em>"Install"</em> prompt at the bottom of the screen.</li>
          </ul>
        </div>
      </div>

      {/* Sign Out Card */}
      <div className="pt-2">
        <SignOutButton />
      </div>
    </div>
  );
}

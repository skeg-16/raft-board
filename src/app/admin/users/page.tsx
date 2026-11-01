'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
  Search,
  Filter,
  MoreVertical,
  LogOut,
  KeyRound,
  RotateCcw,
  UserX,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Laptop,
  Clock,
  Sparkles,
  ExternalLink,
  Lock,
} from 'lucide-react';
import AdminNav from '@/components/AdminNav';
import type { Profile, RoleType, MemberStatus } from '@/types/database';

interface EnrichedUser extends Profile {
  email: string;
  active_sessions_count: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<EnrichedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MemberStatus>('all');
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  // Selected user for modals
  const [editUser, setEditUser] = useState<EnrichedUser | null>(null);
  const [sessionsUser, setSessionsUser] = useState<EnrichedUser | null>(null);
  const [userSessions, setUserSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Edit form state
  const [formRoleTitle, setFormRoleTitle] = useState('');
  const [formRoleType, setFormRoleType] = useState<RoleType>('lead');
  const [formIsSuperAdmin, setFormIsSuperAdmin] = useState(false);
  const [formIsTreasurer, setFormIsTreasurer] = useState(false);
  const [formStatus, setFormStatus] = useState<MemberStatus>('active');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch users.');
      }
      setUsers(data.users || []);

      // Also get current profile to identify self
      const meRes = await fetch('/api/settings');
      if (meRes.ok) {
        const meData = await meRes.json();
        // currentProfile from auth
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openEditModal = (u: EnrichedUser) => {
    setEditUser(u);
    setFormRoleTitle(u.role_title || '');
    setFormRoleType(u.role_type || 'lead');
    setFormIsSuperAdmin(Boolean(u.is_super_admin));
    setFormIsTreasurer(Boolean(u.is_treasurer));
    setFormStatus(u.status);
    setActionError(null);
    setActionSuccess(null);
  };

  const handleSaveUser = async () => {
    if (!editUser) return;
    try {
      setActionLoading(true);
      setActionError(null);
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_title: formRoleTitle,
          role_type: formRoleType,
          is_super_admin: formIsSuperAdmin,
          is_treasurer: formIsTreasurer,
          status: formStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user.');
      }
      setActionSuccess('User updated successfully.');
      setTimeout(() => {
        setEditUser(null);
        fetchUsers();
      }, 1000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleDeactivate = async (u: EnrichedUser) => {
    const nextStatus = u.status === 'active' ? 'deactivated' : 'active';
    const confirmMsg =
      nextStatus === 'deactivated'
        ? `Are you sure you want to deactivate ${u.full_name}? They will immediately lose access.`
        : `Reactivate ${u.full_name}?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user status.');
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const handleForcePasswordReset = async (u: EnrichedUser) => {
    if (!window.confirm(`Trigger password reset for ${u.full_name}? Admins never see passwords. A secure link will be sent to ${u.email}.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${u.id}/force-password-reset`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to trigger password reset.');
      alert('Password reset link sent to user email. The user must choose a new password.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  const handleSignOutEverywhere = async (u: EnrichedUser) => {
    if (!window.confirm(`Sign out ${u.full_name} from all devices and invalidate active sessions?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${u.id}/sign-out-everywhere`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sign out user.');
      alert(`${u.full_name} has been signed out everywhere.`);
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Sign out failed');
    }
  };

  const handleReset2FA = async (u: EnrichedUser) => {
    if (!window.confirm(`[ADMIN RECOVERY] Remove 2FA factor for ${u.full_name}? This action is strictly audit-logged.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${u.id}/reset-2fa`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset 2FA.');
      alert(data.message || '2FA factor removed successfully.');
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : '2FA reset failed');
    }
  };

  const viewSessions = async (u: EnrichedUser) => {
    setSessionsUser(u);
    setLoadingSessions(true);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/sessions`);
      const data = await res.json();
      setUserSessions(data.sessions || []);
    } catch {
      setUserSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.role_title && u.role_title.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24">
      {/* Top Header */}
      <div className="bg-[#071927] text-white border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-sky-950/80 border border-sky-800 text-[11px] font-semibold text-sky-400 mb-2">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                <span>Super Admin Console</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Team Member Security & Roles
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Manage roles, active sessions, 2FA factors, and lockout protections.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Link
                href="/admin/mfa/enroll"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-sky-300 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Configure 2FA</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Navigation Tabs */}
        <AdminNav />

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, or role title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-800 placeholder-slate-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Members</option>
              <option value="pending">Pending Approval</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2 mb-6">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Users Roster */}
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span>Loading user directory and security metadata...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-slate-200">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No members match your criteria</p>
            <p className="text-xs text-slate-400 mt-0.5">Try clearing your filters or search terms.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:gap-4">
            {filteredUsers.map((u) => {
              const isSuperAdmin = u.is_super_admin;
              const isTreasurer = u.is_treasurer;
              const isDeactivated = u.status === 'deactivated';
              const isPending = u.status === 'pending';

              return (
                <div
                  key={u.id}
                  className={`p-4 sm:p-5 rounded-2xl bg-white border transition-all ${
                    isDeactivated
                      ? 'border-slate-200 bg-slate-50/60 opacity-75'
                      : 'border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* User Info */}
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-base shrink-0 border border-sky-200/60">
                        {u.full_name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="font-bold text-slate-900 text-base">{u.full_name}</span>

                          {/* Role Badge */}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              u.role_type === 'executive'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {u.role_title || 'Unassigned Role'}
                          </span>

                          {/* Status Badge */}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              u.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                : u.status === 'pending'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                                : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                            }`}
                          >
                            {u.status.toUpperCase()}
                          </span>

                          {/* Super Admin Flag */}
                          {isSuperAdmin && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1">
                              <Shield className="w-3 h-3 text-sky-600" />
                              <span>Super Admin</span>
                            </span>
                          )}

                          {/* Treasurer Flag */}
                          {isTreasurer && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              Treasurer
                            </span>
                          )}

                          {/* 2FA Flag */}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 ${
                              u.mfa_enabled
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            <KeyRound className="w-3 h-3" />
                            <span>{u.mfa_enabled ? '2FA Active' : '2FA Off'}</span>
                          </span>
                        </div>

                        {/* Metadata row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1.5 font-mono">
                          <span className="break-all">{u.email}</span>
                          <span>•</span>
                          <span>Target: {u.weekly_target_xp} XP</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>
                              {u.last_login_at
                                ? `Last active: ${new Date(u.last_login_at).toLocaleDateString()}`
                                : 'Never logged in'}
                            </span>
                          </span>
                          {u.last_device_browser && (
                            <>
                              <span>•</span>
                              <span className="text-slate-600">{u.last_device_browser}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions Button Group */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0 w-full sm:w-auto justify-end mt-3 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <button
                        onClick={() => viewSessions(u)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1"
                      >
                        <Laptop className="w-3.5 h-3.5 text-slate-500" />
                        <span>Sessions ({u.active_sessions_count})</span>
                      </button>

                      <button
                        onClick={() => openEditModal(u)}
                        className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold transition-colors"
                      >
                        Edit Role & Flags
                      </button>

                      <button
                        onClick={() => handleForcePasswordReset(u)}
                        title="Admins never see passwords. Generates user reset link."
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        <span>Reset Password</span>
                      </button>

                      {u.mfa_enabled && (
                        <button
                          onClick={() => handleReset2FA(u)}
                          title="Admin recovery path: remove locked-out admin factor"
                          className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold transition-colors flex items-center gap-1"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                          <span>Reset 2FA</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleSignOutEverywhere(u)}
                        className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
                        title="Sign out user everywhere"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleToggleDeactivate(u)}
                        className={`p-1.5 rounded-xl transition-colors ${
                          isDeactivated
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                        }`}
                        title={isDeactivated ? 'Reactivate user' : 'Deactivate user'}
                      >
                        {isDeactivated ? (
                          <UserCheck className="w-3.5 h-3.5" />
                        ) : (
                          <UserX className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Role & Flags Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Manage Role & Flags</h3>
                <p className="text-xs text-slate-500">{editUser.full_name} ({editUser.email})</p>
              </div>
              <button
                onClick={() => setEditUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{actionError}</span>
              </div>
            )}

            {actionSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{actionSuccess}</span>
              </div>
            )}

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Role Title</label>
                <input
                  type="text"
                  value={formRoleTitle}
                  onChange={(e) => setFormRoleTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  placeholder="e.g. Chief Operating Officer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Role Type</label>
                <select
                  value={formRoleType}
                  onChange={(e) => setFormRoleType(e.target.value as RoleType)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                >
                  <option value="lead">Lead</option>
                  <option value="executive">Executive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Account Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as MemberStatus)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="deactivated">Deactivated</option>
                </select>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsSuperAdmin}
                    onChange={(e) => setFormIsSuperAdmin(e.target.checked)}
                    className="mt-0.5 rounded text-sky-600 focus:ring-sky-500/20"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800">Super Admin Privileges</span>
                    <p className="text-[11px] text-slate-500">
                      Can approve members, change system settings, and manage security console. Lockout protection strictly enforced in database.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsTreasurer}
                    onChange={(e) => setFormIsTreasurer(e.target.checked)}
                    className="mt-0.5 rounded text-amber-600 focus:ring-amber-500/20"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800">Treasurer Privileges</span>
                    <p className="text-[11px] text-slate-500">
                      Grants financial oversight and treasurer badges.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveUser}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Saving Changes...' : 'Save & Audit Log'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Sessions Modal */}
      {sessionsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Active Sessions</h3>
                <p className="text-xs text-slate-500">{sessionsUser.full_name} ({sessionsUser.email})</p>
              </div>
              <button
                onClick={() => setSessionsUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>

            {loadingSessions ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading sessions...</div>
            ) : userSessions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No active sessions found for this user.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {userSessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">{s.device_browser}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        IP: {s.ip_hash} • Last Active: {new Date(s.last_active_at).toLocaleString()}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Active
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  handleSignOutEverywhere(sessionsUser);
                  setSessionsUser(null);
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out Everywhere</span>
              </button>
              <button
                onClick={() => setSessionsUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

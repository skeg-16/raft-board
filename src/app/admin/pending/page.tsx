'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  UserCheck,
  UserX,
  Clock,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  Coins,
  Check,
} from 'lucide-react';
import type { Profile, RoleType } from '@/types/database';

const ROLE_PRESETS = [
  { title: 'Chief Operating Officer', type: 'executive' as RoleType },
  { title: 'Chief Technology Officer', type: 'executive' as RoleType },
  { title: 'Chief Marketing Officer', type: 'executive' as RoleType },
  { title: 'Creatives Lead', type: 'lead' as RoleType },
  { title: 'Backend Lead', type: 'lead' as RoleType },
  { title: 'Operations Lead', type: 'lead' as RoleType },
];

export default function AdminPendingPage() {
  const [pending, setPending] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // Draft forms per pending user
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        roleTitle: string;
        roleType: RoleType;
        isSuperAdmin: boolean;
        isTreasurer: boolean;
      }
    >
  >({});

  const fetchPending = async () => {
    try {
      const res = await fetch('/api/admin/pending');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch pending members.');
      }
      setPending(data.pending || []);

      // Initialize draft options from requested_role_title
      const newDrafts: typeof drafts = {};
      for (const m of data.pending || []) {
        const requested = m.requested_role_title || '';
        const isExec =
          requested.toLowerCase().includes('coo') ||
          requested.toLowerCase().includes('cto') ||
          requested.toLowerCase().includes('cmo') ||
          requested.toLowerCase().includes('chief');

        newDrafts[m.id] = {
          roleTitle: requested || 'Backend Lead',
          roleType: isExec ? 'executive' : 'lead',
          isSuperAdmin: false,
          isTreasurer: false,
        };
      }
      setDrafts(newDrafts);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching pending';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleApprove = async (memberId: string) => {
    const draft = drafts[memberId];
    if (!draft) return;
    setSubmittingId(memberId);

    try {
      const res = await fetch('/api/admin/approve-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          roleTitle: draft.roleTitle,
          roleType: draft.roleType,
          isSuperAdmin: draft.isSuperAdmin,
          isTreasurer: draft.isTreasurer,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed.');

      // Remove from pending list
      setPending((prev) => prev.filter((p) => p.id !== memberId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Approval error');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleReject = async (memberId: string) => {
    if (!confirm('Are you sure you want to reject this registration?')) return;
    setSubmittingId(memberId);

    try {
      const res = await fetch('/api/admin/reject-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rejection failed.');

      setPending((prev) => prev.filter((p) => p.id !== memberId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Rejection error');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="p-2 rounded-xl bg-white border border-slate-200/80 hover:bg-slate-100 text-slate-700 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 font-display">
              Pending Members
            </h1>
            <p className="text-xs text-slate-500">
              Super Admin approval & role assignment console.
            </p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
          {pending.length} Pending
        </span>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">
          Loading pending registrations...
        </div>
      ) : pending.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center space-y-3 border border-slate-200/80 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
            <Check className="w-6 h-6 text-emerald-600" />
          </div>
          <h2 className="text-base font-bold text-slate-900 font-display">
            All Clear! No Pending Requests
          </h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            All team members who joined with the Team Join Code have been reviewed.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((member) => {
            const draft = drafts[member.id] || {
              roleTitle: member.requested_role_title || 'Backend Lead',
              roleType: 'lead' as RoleType,
              isSuperAdmin: false,
              isTreasurer: false,
            };

            const isSubmitting = submittingId === member.id;

            return (
              <div
                key={member.id}
                className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm space-y-3.5"
              >
                {/* Member Identity Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 font-display">
                      {member.full_name}
                    </h2>
                    <p className="text-xs text-slate-500">{member.avatar || 'User ID: ' + member.id.slice(0, 8)}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-slate-400">Requested:</span>
                      <span className="text-[11px] font-semibold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                        {member.requested_role_title || 'None'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Pending
                  </span>
                </div>

                {/* Role Assignment Inputs (Super Admin Authority Only) */}
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Assign Role Title
                    </label>
                    <select
                      value={draft.roleTitle}
                      onChange={(e) => {
                        const val = e.target.value;
                        const preset = ROLE_PRESETS.find((p) => p.title === val);
                        setDrafts((prev) => ({
                          ...prev,
                          [member.id]: {
                            ...draft,
                            roleTitle: val,
                            roleType: preset ? preset.type : draft.roleType,
                          },
                        }));
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      {ROLE_PRESETS.map((p) => (
                        <option key={p.title} value={p.title}>
                          {p.title} ({p.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Role Classification
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setDrafts((prev) => ({
                            ...prev,
                            [member.id]: { ...draft, roleType: 'executive' },
                          }))
                        }
                        className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                          draft.roleType === 'executive'
                            ? 'bg-sky-50 border-sky-400 text-sky-950 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        Executive
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDrafts((prev) => ({
                            ...prev,
                            [member.id]: { ...draft, roleType: 'lead' },
                          }))
                        }
                        className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                          draft.roleType === 'lead'
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        Lead
                      </button>
                    </div>
                  </div>

                  {/* Privilege Toggles */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Privilege Flags
                    </p>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.isSuperAdmin}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [member.id]: { ...draft, isSuperAdmin: e.target.checked },
                          }))
                        }
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span className="text-xs text-slate-700 font-medium flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                        Grant Super Admin
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.isTreasurer}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [member.id]: { ...draft, isTreasurer: e.target.checked },
                          }))
                        }
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span className="text-xs text-slate-700 font-medium flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-indigo-600" />
                        Grant Treasurer
                      </span>
                    </label>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleApprove(member.id)}
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>{isSubmitting ? 'Approving...' : 'Approve & Activate'}</span>
                  </button>

                  <button
                    onClick={() => handleReject(member.id)}
                    disabled={isSubmitting}
                    className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <UserX className="w-4 h-4" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  History,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Clock,
  Shield,
  Laptop,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import AdminNav from '@/components/AdminNav';
import type { LoginLog } from '@/types/database';

export default function AdminLoginLogPage() {
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/login-logs');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch login logs.');
      }
      setLogs(data.loginLogs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((l) => {
    const matchesSearch =
      l.email.toLowerCase().includes(search.toLowerCase()) ||
      (l.device_browser && l.device_browser.toLowerCase().includes(search.toLowerCase())) ||
      (l.failure_reason && l.failure_reason.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
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
                <span>Security Auditing</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Authentication & Login Logs
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Audited record of successful and failed authentication attempts.
              </p>
            </div>
            <button
              onClick={fetchLogs}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-300 transition-colors self-start sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Refresh Logs</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Navigation Tabs */}
        <AdminNav />

        {/* 90-Day Retention & Privacy Notice */}
        <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 text-xs flex items-start gap-3 mb-6">
          <Shield className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-sky-950">Privacy & Retention Policy</span>
            <p className="text-sky-800 leading-relaxed">
              All IP addresses are stored either hashed or with the final octet masked to protect member privacy. Entries are purged automatically after 90 days via scheduled database maintenance (<code className="font-mono bg-sky-100 px-1 py-0.5 rounded">pg_cron</code>).
            </p>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by email, device, or failure reason..."
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
              <option value="all">All Attempts</option>
              <option value="success">Successful Logins</option>
              <option value="failed">Failed Attempts</option>
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

        {/* Log Entries */}
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span>Loading login audit stream...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-slate-200">
            <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No login records found</p>
            <p className="text-xs text-slate-400 mt-0.5">Authentication attempts will appear here as they occur.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-100">
              {filteredLogs.map((log) => {
                const isSuccess = log.status === 'success';
                return (
                  <div
                    key={log.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          isSuccess
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200/60'
                            : 'bg-rose-100 text-rose-700 border border-rose-200/60'
                        }`}
                      >
                        {isSuccess ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm break-all">{log.email}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                              isSuccess
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {log.status}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1 font-mono">
                          <span className="flex items-center gap-1 text-slate-600">
                            <Laptop className="w-3.5 h-3.5 text-slate-400" />
                            <span>{log.device_browser || 'Unknown Device'}</span>
                          </span>
                          <span>•</span>
                          <span>IP: {log.ip_hash}</span>
                        </div>

                        {log.failure_reason && (
                          <p className="text-xs text-rose-600 font-medium mt-1">
                            Reason: {log.failure_reason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-slate-400 flex items-center gap-1 font-mono shrink-0 self-end sm:self-auto">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

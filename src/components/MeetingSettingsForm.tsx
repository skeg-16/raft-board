'use client';

import { useState, useEffect } from 'react';
import { Clock, ShieldAlert, CheckCircle2, AlertTriangle, History, ArrowRight } from 'lucide-react';
import type { Settings, Week } from '@/types/database';

interface MeetingSettingsFormProps {
  initialSettings: Settings;
  initialWeek: Week;
  isSuperAdmin: boolean;
}

export function MeetingSettingsForm({
  initialSettings,
  initialWeek,
  isSuperAdmin,
}: MeetingSettingsFormProps) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [currentWeek, setCurrentWeek] = useState<Week>(initialWeek);

  // Settings form states
  const [weekday, setWeekday] = useState(initialSettings.meeting_weekday);
  const [meetingTime, setMeetingTime] = useState(initialSettings.meeting_time);
  const [timezone, setTimezone] = useState(initialSettings.timezone || 'Asia/Manila');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [settingsErr, setSettingsErr] = useState<string | null>(null);

  // Separate Super Admin Cutoff Override action states
  const [overrideCutoffDate, setOverrideCutoffDate] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [confirmOverride, setConfirmOverride] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [overrideMsg, setOverrideMsg] = useState<string | null>(null);
  const [overrideErr, setOverrideErr] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const fetchAuditLogs = async () => {
    if (!isSuperAdmin) return;
    try {
      const res = await fetch('/api/settings/current-week-cutoff');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.auditLogs || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchAuditLogs();
    }
  }, [isSuperAdmin]);

  // 1. Save default schedule settings (Applies to NEXT week by default)
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMsg(null);
    setSettingsErr(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_weekday: weekday,
          meeting_time: meetingTime,
          timezone,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update settings');
      }

      setSettings(data.settings);
      setSettingsMsg(
        'Schedule updated successfully! Changes will apply starting NEXT week by default. The current open week remains unchanged.'
      );
    } catch (err: unknown) {
      setSettingsErr(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setSavingSettings(false);
    }
  };

  // 2. Separate Super Admin action: Override current week's cutoff with confirmation
  const handleOverrideCutoff = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverriding(true);
    setOverrideMsg(null);
    setOverrideErr(null);

    if (!confirmOverride) {
      setOverrideErr('Confirmation required: Please check the confirmation checkbox before proceeding.');
      setOverriding(false);
      return;
    }

    if (!overrideCutoffDate) {
      setOverrideErr('Please select a new cutoff date and time.');
      setOverriding(false);
      return;
    }

    const selectedTime = new Date(overrideCutoffDate).getTime();
    if (selectedTime <= Date.now()) {
      setOverrideErr('Cannot set cutoff in the past. The new cutoff must be in the future.');
      setOverriding(false);
      return;
    }

    try {
      const res = await fetch('/api/settings/current-week-cutoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_cutoff_at: new Date(overrideCutoffDate).toISOString(),
          confirmed: confirmOverride,
          reason: overrideReason || 'Manual super admin adjustment',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to override current week cutoff');
      }

      setCurrentWeek(data.currentWeek);
      setOverrideMsg('Current week cutoff successfully updated and logged in audit history.');
      setConfirmOverride(false);
      setOverrideCutoffDate('');
      setOverrideReason('');
      await fetchAuditLogs();
    } catch (err: unknown) {
      setOverrideErr(err instanceof Error ? err.message : 'Error updating current week cutoff');
    } finally {
      setOverriding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Default Schedule Settings */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-bold text-slate-900 font-display">
              Meeting & Timezone Cadence
            </h2>
          </div>
          <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200 uppercase tracking-wider">
            Applies Next Week
          </span>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          The weekly game resets at the team meeting. Changes made here apply starting from the <strong>NEXT</strong> week by default. The active open week is never interrupted or closed early.
        </p>

        {settingsMsg && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{settingsMsg}</span>
          </div>
        )}

        {settingsErr && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{settingsErr}</span>
          </div>
        )}

        {isSuperAdmin ? (
          <form onSubmit={handleSaveSettings} className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Meeting Weekday
                </label>
                <select
                  value={weekday}
                  onChange={(e) => setWeekday(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Meeting Time
                </label>
                <input
                  type="text"
                  value={meetingTime}
                  onChange={(e) => setMeetingTime(e.target.value)}
                  placeholder="e.g. 10:00 AM or 14:30"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Timezone
              </label>
              <input
                type="text"
                value={timezone}
                disabled
                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 cursor-not-allowed"
              />
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition shadow-sm disabled:opacity-50"
            >
              {savingSettings ? 'Saving...' : 'Save Schedule for Next Week'}
            </button>
          </form>
        ) : (
          <div className="space-y-2 text-xs pt-1">
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Meeting Day</span>
              <span className="font-bold text-slate-800">{settings.meeting_weekday}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Meeting Time</span>
              <span className="font-bold text-slate-800">{settings.meeting_time}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500">Timezone</span>
              <span className="font-bold text-slate-800">{settings.timezone}</span>
            </div>
          </div>
        )}
      </div>

      {/* Super Admin Action: Change Current Week Cutoff (Confirmation & Audit Log) */}
      {isSuperAdmin && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border-2 border-amber-300/80 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              <h2 className="text-sm font-extrabold text-slate-900 font-display">
                Override Current Week Cutoff
              </h2>
            </div>
            <span className="text-[10px] font-extrabold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300 uppercase tracking-wider">
              Super Admin Action
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Need to extend or alter the <strong>current active week</strong>? This is a separate sensitive action that requires explicit confirmation and generates a permanent audit log entry. Times in the past are strictly rejected.
          </p>

          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
            <p>
              Current Week Cutoff:{' '}
              <strong className="text-slate-900 font-mono">
                {new Date(currentWeek.cutoff_at).toLocaleString('en-US', { timeZone: 'Asia/Manila' })} (Asia/Manila)
              </strong>
            </p>
          </div>

          {overrideMsg && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{overrideMsg}</span>
            </div>
          )}

          {overrideErr && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{overrideErr}</span>
            </div>
          )}

          <form onSubmit={handleOverrideCutoff} className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Cutoff Date & Time (Future only)
              </label>
              <input
                type="datetime-local"
                value={overrideCutoffDate}
                onChange={(e) => setOverrideCutoffDate(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Adjustment
              </label>
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Saturday meeting moved by team agreement"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Explicit Confirmation Checkbox */}
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
              <input
                type="checkbox"
                id="confirmCutoffChange"
                checked={confirmOverride}
                onChange={(e) => setConfirmOverride(e.target.checked)}
                className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <label htmlFor="confirmCutoffChange" className="text-xs text-amber-900 font-medium leading-relaxed">
                <strong>Confirmation Step:</strong> I confirm I am changing the active week's cutoff. I understand this action is recorded in the permanent audit log and cannot be set in the past.
              </label>
            </div>

            <button
              type="submit"
              disabled={overriding || !confirmOverride}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              {overriding ? 'Updating Cutoff...' : 'Confirm & Apply Cutoff Change'}
            </button>
          </form>

          {/* Audit Log Entries */}
          {auditLogs.length > 0 && (
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <History className="w-3.5 h-3.5 text-slate-500" />
                <span>Recent Cutoff Audit Logs</span>
              </div>
              <div className="space-y-1.5">
                {auditLogs.slice(0, 5).map((log: any) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-0.5"
                  >
                    <div className="flex items-center justify-between text-slate-500 text-[10px]">
                      <span>{new Date(log.created_at).toLocaleString()}</span>
                      <span className="font-bold text-amber-700 uppercase">{log.action?.replace(/_/g, ' ') || 'Admin Action'}</span>
                    </div>
                    <p className="font-semibold text-slate-800">
                      {log.details?.reason ? `Reason: ${log.details.reason}` : `Action: ${log.action}`}
                    </p>
                    {log.details?.new_cutoff ? (
                      <p className="text-slate-500 font-mono text-[10px]">
                        New Cutoff: {new Date(log.details?.new_cutoff).toLocaleString()}
                      </p>
                    ) : (
                      <p className="text-slate-500 font-mono text-[10px] truncate">
                        Details: {JSON.stringify(log.details)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

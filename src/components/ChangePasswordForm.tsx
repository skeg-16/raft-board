'use client';

import { useState } from 'react';
import { KeyRound, Check, AlertCircle } from 'lucide-react';

export function ChangePasswordForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password.');
      }

      setMessage('Password updated successfully!');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setIsOpen(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error changing password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-sky-600" />
          <h2 className="text-sm font-bold text-slate-900 font-display">
            Account Security
          </h2>
        </div>
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setError(null);
            setMessage(null);
          }}
          className="text-xs font-bold text-sky-600 hover:text-sky-700"
        >
          {isOpen ? 'Cancel' : 'Change Password'}
        </button>
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="pt-2 space-y-3 animate-in fade-in duration-200">
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
              New Password (min 8 chars)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              minLength={8}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              minLength={8}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-500 active:scale-[0.99] text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1 shadow-xs disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Save New Password'}
          </button>
        </form>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, ArrowRight, ShieldAlert, Sparkles } from 'lucide-react';
import { OtterIcon } from '@/components/OtterIcon';

const SEED_TEST_USERS = [
  { email: 'cto@otter.systems', name: 'Alex Rivera', role: 'CTO (Super Admin)' },
  { email: 'coo@otter.systems', name: 'Samira Chen', role: 'COO (Admin & Treasurer)' },
  { email: 'cmo@otter.systems', name: 'Marcus Vance', role: 'CMO' },
  { email: 'creatives@otter.systems', name: 'Chloe Santos', role: 'Creatives Lead' },
  { email: 'backend@otter.systems', name: 'David Kim', role: 'Backend Lead' },
  { email: 'operations@otter.systems', name: 'Bea Alcantara', role: 'Operations Lead' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('OtterPass2026!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to sign in.');
      }

      if (data.mustChangePassword) {
        router.push('/change-password');
      } else {
        router.push('/');
      }
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const selectTestUser = (userEmail: string) => {
    setEmail(userEmail);
    setPassword('OtterPass2026!');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-sky-950 to-slate-900 flex flex-col justify-center px-4 py-8">
      <div className="max-w-md w-full mx-auto space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-xl shadow-sky-500/25 p-3 mx-auto mb-2 transform hover:scale-105 transition duration-200 border border-sky-300/40 text-white">
            <OtterIcon className="w-12 h-12 text-white" />
          </div>

          <h1 className="text-3xl font-extrabold text-white tracking-tight font-display">
            Raft Board
          </h1>
          <p className="text-sm font-medium text-sky-200/80">
            Otter Software Systems • <span className="text-sky-300 font-semibold">Building software like no otter.</span>
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/95 backdrop-blur-xl p-6 sm:p-8 rounded-3xl shadow-2xl border border-white/20">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900 font-display">
              Sign In to Your Raft
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Invite-only workspace. Use your Otter Systems startup email.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                Startup Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. cto@otter.systems"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <span className="text-[11px] text-sky-700 font-medium">
                  Seed: OtterPass2026!
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-sky-600 hover:bg-sky-500 active:scale-[0.99] text-white font-bold text-sm rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-sky-600/30 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Board the Raft</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Member Switcher for Easy Verification */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-sky-500" />
                Quick Seed Test Logins
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {SEED_TEST_USERS.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => selectTestUser(u.email)}
                  className={`text-left p-2 rounded-xl border text-xs transition ${
                    email === u.email
                      ? 'bg-sky-50 border-sky-400 text-sky-950 font-semibold'
                      : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <p className="truncate font-semibold text-[11px]">{u.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{u.role}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-sky-200/50">
          Raft Board • Internal OSS Team Progress Game
        </p>
      </div>
    </div>
  );
}

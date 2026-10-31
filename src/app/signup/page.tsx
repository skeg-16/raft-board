'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Lock,
  Mail,
  User,
  KeyRound,
  Briefcase,
  ArrowRight,
  ShieldAlert,
  LogIn,
  UserPlus,
  Info,
} from 'lucide-react';
import { OtterIcon } from '@/components/OtterIcon';

const ROLE_OPTIONS = [
  'Chief Operating Officer (COO)',
  'Chief Technology Officer (CTO)',
  'Chief Marketing Officer (CMO)',
  'Creatives Lead',
  'Backend Lead',
  'Operations Lead',
];

export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [desiredRole, setDesiredRole] = useState(ROLE_OPTIONS[0]);
  const [teamJoinCode, setTeamJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          desired_role_title: desiredRole,
          team_join_code: teamJoinCode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed.');
      }

      if (data.status === 'active') {
        router.push('/');
      } else {
        router.push('/pending-approval');
      }
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
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

        {/* Auth Switcher Tabs */}
        <div className="bg-slate-800/80 p-1 rounded-2xl flex border border-slate-700/60 max-w-xs mx-auto">
          <Link
            href="/login"
            className="flex-1 py-2 rounded-xl text-xs font-bold text-center text-slate-400 hover:text-white transition flex items-center justify-center gap-1.5"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Log in</span>
          </Link>
          <div className="flex-1 py-2 rounded-xl text-xs font-bold text-center bg-sky-600 text-white shadow-xs flex items-center justify-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create account</span>
          </div>
        </div>

        {/* Signup Card */}
        <div className="bg-white/95 backdrop-blur-xl p-6 sm:p-8 rounded-3xl shadow-2xl border border-white/20">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-900 font-display">
              Join the Otter Raft
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Create your account. A valid Team Join Code is required to register.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSignUp} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Christian Grey"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@otter.systems"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                Password <span className="text-[10px] text-slate-400 lowercase">(min 8 characters)</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  minLength={8}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                Desired Role Title
              </label>
              <div className="relative">
                <Briefcase className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={desiredRole}
                  onChange={(e) => setDesiredRole(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition appearance-none cursor-pointer"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Requested roles are reviewed and officially assigned by a Super Admin.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                Team Join Code
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={teamJoinCode}
                  onChange={(e) => setTeamJoinCode(e.target.value)}
                  placeholder="Enter secret team join code"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Validated securely on the server. Ask an executive if you don't have it.
              </p>
            </div>

            <div className="p-3 bg-sky-50 rounded-xl border border-sky-100 flex items-start gap-2 text-[11px] text-sky-900">
              <Info className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
              <span>
                New registrations start in <strong>Pending</strong> mode until verified by an active Super Admin.
              </span>
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
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500">
              Already have an account?{' '}
              <Link href="/login" className="text-sky-600 hover:text-sky-700 font-bold">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

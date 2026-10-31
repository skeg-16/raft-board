'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, RefreshCw, LogOut, ShieldCheck, Sparkles } from 'lucide-react';
import { OtterIcon } from '@/components/OtterIcon';

export default function PendingApprovalPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  const handleCheckStatus = () => {
    setChecking(true);
    router.refresh();
    setTimeout(() => {
      setChecking(false);
    }, 600);
  };

  const handleSignOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-sky-950 to-slate-900 flex flex-col justify-center px-4 py-8">
      <div className="max-w-md w-full mx-auto space-y-6 text-center">
        {/* Animated Mascot Badge */}
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-xl shadow-amber-500/20 p-4 mx-auto border border-amber-300/40 text-amber-950">
          <OtterIcon className="w-14 h-14 text-white" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-bold uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            Waiting for Approval
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-display">
            Your Raft is Being Prepared
          </h1>
          <p className="text-xs sm:text-sm text-sky-200/80 max-w-sm mx-auto leading-relaxed">
            Your account has been created! To protect team progress and security, a Super Admin must approve your registration before you can board the board.
          </p>
        </div>

        {/* Approval Card */}
        <div className="bg-white/95 backdrop-blur-xl p-6 rounded-3xl shadow-2xl border border-white/20 text-left space-y-4">
          <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-100 space-y-2 text-xs text-sky-950">
            <div className="flex items-center gap-2 font-bold text-sky-900">
              <ShieldCheck className="w-4 h-4 text-sky-600" />
              <span>What happens next?</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-sky-800/80">
              <li>Super Admins (Christian or Railey) receive your join request.</li>
              <li>They will verify your team credentials and assign your official role.</li>
              <li>Once approved, you will have instant access to log weekly tasks and join the leaderboard!</li>
            </ul>
          </div>

          <div className="pt-2 space-y-2.5">
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-md shadow-sky-600/25 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? 'Checking Status...' : 'Check Approval Status'}</span>
            </button>

            <button
              onClick={handleSignOut}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:scale-[0.99] text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4 text-slate-500" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-sky-200/50">
          Otter Software Systems • "Building software like no otter."
        </p>
      </div>
    </div>
  );
}

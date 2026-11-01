'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Copy,
  Check,
  Smartphone,
  Lock,
} from 'lucide-react';

export default function AdminMfaEnrollPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string>('');
  const [uri, setUri] = useState<string>('');
  const [factorId, setFactorId] = useState<string>('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function initEnroll() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/auth/mfa/enroll', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to initiate 2FA enrollment.');
        }
        setSecret(data.secret);
        setUri(data.uri);
        setFactorId(data.factorId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Enrollment failed');
      } finally {
        setLoading(false);
      }
    }
    initEnroll();
  }, []);

  const handleCopySecret = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 6) {
      setError('Please enter a valid 6-digit code.');
      return;
    }

    try {
      setVerifying(true);
      setError(null);
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, secret, factorId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification failed.');
      }
      setSuccess(true);
      setTimeout(() => {
        router.push('/admin/users');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-sky-100 border border-sky-200 text-sky-700 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-6 h-6 text-sky-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Set Up Two-Factor Authentication
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Super admin accounts are required to have 2FA enabled before accessing administrative tools.
          </p>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900">2FA Verified Successfully!</h3>
              <p className="text-xs text-slate-500">
                Your account is now secured with two-factor authentication. Redirecting to admin console...
              </p>
            </div>
          ) : loading ? (
            <div className="py-12 text-center text-xs text-slate-400">
              <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <span>Generating authenticator secret...</span>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Step 1: App instructions */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Smartphone className="w-4 h-4 text-sky-600" />
                  <span>1. Open your Authenticator App</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Use Google Authenticator, Authy, 1Password, or any standard TOTP app. Add a new account by manually entering this secret key:
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <code className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-200 font-mono text-xs font-bold text-slate-800 tracking-wider text-center select-all">
                    {secret}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors shrink-0"
                    title="Copy Secret"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Step 2: Verification Code Form */}
              <form onSubmit={handleVerify} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    2. Enter 6-digit verification code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="e.g. 123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-center font-mono text-lg font-bold tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-400 mt-1 text-center">
                    (Tip: In local testing, standard TOTP algorithms or test code 123456 are supported)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={verifying || code.length !== 6}
                  className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-all shadow-sm shadow-sky-600/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {verifying ? (
                    <span>Verifying Code...</span>
                  ) : (
                    <>
                      <span>Enable 2FA & Access Console</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="pt-3 border-t border-slate-100 text-center">
                <Link
                  href="/admin/users"
                  className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
                >
                  ← Back to Admin Console
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

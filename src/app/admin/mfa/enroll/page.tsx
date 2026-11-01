'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
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
  const [qrCodeSvg, setQrCodeSvg] = useState<string>('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function initEnroll() {
      try {
        setLoading(true);
        setError(null);
        const supabase = createClient();

        // Built-in Supabase MFA enrollment (TOTP)
        const { data, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'Raft Board Authenticator',
        });

        if (enrollError || !data) {
          throw new Error(enrollError?.message || 'Failed to initiate 2FA enrollment.');
        }

        setFactorId(data.id);
        setSecret(data.totp?.secret || '');
        setUri(data.totp?.uri || '');
        setQrCodeSvg(data.totp?.qr_code || '');
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
      const supabase = createClient();

      // Step 1: Challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError || !challengeData) {
        throw new Error(challengeError?.message || 'Failed to create MFA challenge.');
      }

      // Step 2: Verify TOTP code
      const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: code.trim(),
      });

      if (verifyError) {
        throw new Error(verifyError.message || 'Verification failed. Please check your authenticator code.');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/admin/users');
      }, 1200);
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

        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/50 rounded-3xl border border-slate-200/80 sm:px-10">
          {error && (
            <div className="p-3.5 mb-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-4 mb-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>Two-factor authentication successfully enabled! Redirecting to console...</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <span>Generating Supabase MFA TOTP keys...</span>
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-6">
              {/* Step 1: Add to Authenticator */}
              <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-100 text-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="w-4 h-4 text-sky-700" />
                  <span className="text-xs font-bold text-sky-950 uppercase tracking-wider">
                    1. Open your Authenticator App
                  </span>
                </div>
                <p className="text-xs text-slate-600 mb-3">
                  Use Google Authenticator, Authy, 1Password, or any standard TOTP app. Add a new account by manually entering this secret key:
                </p>

                <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-sky-200/80">
                  <code className="flex-1 font-mono text-sm tracking-wider font-bold text-slate-800 text-center truncate select-all">
                    {secret}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                    title="Copy Secret"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Step 2: Verification Code Input */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  2. Enter 6-digit verification code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={6}
                    pattern="\d{6}"
                    placeholder="e.g. 123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center tracking-[0.3em] font-mono text-lg font-bold py-2.5 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 text-center">
                  (Tip: Enter the 6-digit code currently shown in your authenticator app)
                </p>
              </div>

              <button
                type="submit"
                disabled={verifying || code.length !== 6 || success}
                className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm shadow-md shadow-sky-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
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

              <div className="pt-2 text-center">
                <Link
                  href="/admin/users"
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  ← Back to Admin Console
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

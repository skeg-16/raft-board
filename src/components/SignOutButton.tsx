'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-rose-50 active:scale-[0.99] border border-rose-200 text-rose-700 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition duration-150 disabled:opacity-50"
    >
      <LogOut className="w-4 h-4 text-rose-600" />
      <span>{loading ? 'Disembarking...' : 'Sign Out of Raft Board'}</span>
    </button>
  );
}

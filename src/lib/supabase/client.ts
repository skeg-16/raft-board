import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const isConfigured =
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-ref');

  const client = createBrowserClient<Database>(
    isConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
    isConfigured ? supabaseAnonKey : 'dummy-anon-key'
  );

  // Local / preview runtime proxy for Supabase built-in MFA
  if (!isConfigured) {
    let enrolledFactor: any = null;
    (client.auth as any).mfa = {
      async enroll(params: { factorType: 'totp'; friendlyName?: string; issuer?: string }) {
        const id = `totp-factor-${Date.now()}`;
        const secret = 'JBSWY3DPEHPK3PXP' + Math.random().toString(36).substring(2, 6).toUpperCase();
        const uri = `otpauth://totp/RaftBoard?secret=${secret}&issuer=RaftBoard`;
        const qr_code = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="100%" height="100%" fill="#ffffff"/><text x="50%" y="50%" font-size="12" text-anchor="middle" fill="#0369a1">RaftBoard MFA</text></svg>`;
        enrolledFactor = {
          id,
          type: 'totp',
          friendly_name: params.friendlyName || 'Authenticator App',
          status: 'unverified',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          totp: { secret, qr_code, uri },
        };
        return { data: enrolledFactor, error: null };
      },
      async challenge(params: { factorId: string }) {
        return { data: { id: `chal-${Date.now()}` }, error: null };
      },
      async verify(params: { factorId: string; challengeId: string; code: string }) {
        if (!params.code || params.code.trim().length !== 6) {
          return { data: null, error: { message: 'Invalid 6-digit verification code.' } };
        }
        if (enrolledFactor) {
          enrolledFactor.status = 'verified';
        }
        // Upgrade session cookie to aal2
        try {
          if (typeof document !== 'undefined') {
            const match = document.cookie.match(/raft_user_session=([^;]+)/);
            if (match) {
              const raw = decodeURIComponent(match[1]);
              const parsed = JSON.parse(raw);
              parsed.aal = 'aal2';
              document.cookie = `raft_user_session=${encodeURIComponent(JSON.stringify(parsed))}; path=/; max-age=604800`;
            }
          }
        } catch {
          // ignore
        }
        return {
          data: {
            user: { id: 'current-user' },
            session: { aal: 'aal2' },
          },
          error: null,
        };
      },
      async getAuthenticatorAssuranceLevel() {
        let currentLevel: 'aal1' | 'aal2' = 'aal1';
        try {
          if (typeof document !== 'undefined') {
            const match = document.cookie.match(/raft_user_session=([^;]+)/);
            if (match) {
              const parsed = JSON.parse(decodeURIComponent(match[1]));
              if (parsed.aal === 'aal2') currentLevel = 'aal2';
            }
          }
        } catch {
          // ignore
        }
        return {
          data: {
            currentLevel,
            nextLevel: 'aal2',
            currentAuthenticationMethods: [currentLevel],
          },
          error: null,
        };
      },
      async listFactors() {
        return {
          data: {
            all: enrolledFactor ? [enrolledFactor] : [],
            totp: enrolledFactor ? [enrolledFactor] : [],
          },
          error: null,
        };
      },
      async unenroll(params: { factorId: string }) {
        enrolledFactor = null;
        return { data: { id: params.factorId }, error: null };
      },
    };
  }

  return client;
}

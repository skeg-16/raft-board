import { NextResponse } from 'next/server';
import { getCurrentProfile, getRuntimeUserStore } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateTotpSecret, getTotpUri } from '@/lib/totp';

export async function POST() {
  const profile = await getCurrentProfile();

  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const email = (profile as any).email || `${profile.full_name.toLowerCase().replace(/\s+/g, '.')}@otter.systems`;
  const secret = generateTotpSecret();
  const uri = getTotpUri(email, secret);
  const factorId = `factor-${profile.id}-${Date.now()}`;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    try {
      const adminClient = createAdminClient();
      // Try enrolling with Supabase MFA
      const { data, error } = await (adminClient.auth.mfa as any).enroll({
        factorType: 'totp',
        issuer: 'RaftBoard',
        friendlyName: email,
      });

      if (!error && data) {
        return NextResponse.json({
          factorId: data.id,
          secret: data.totp?.secret || secret,
          uri: data.totp?.uri || uri,
          qrCode: data.totp?.qr_code,
        });
      }
    } catch {
      // Fallback to local TOTP generation
    }
  }

  // Local / Test Store
  const store = getRuntimeUserStore();
  const runtimeUser = store.get(profile.id);
  if (runtimeUser) {
    (runtimeUser as any).temp_totp_secret = secret;
    store.set(profile.id, runtimeUser);
  }

  return NextResponse.json({
    factorId,
    secret,
    uri,
  });
}

import { NextResponse } from 'next/server';

/**
 * @deprecated Custom endpoint removed.
 * Raft Board now strictly uses Supabase's built-in MFA (supabase.auth.mfa.verify).
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Endpoint removed: Use Supabase built-in MFA via supabase.auth.mfa.verify().',
    },
    { status: 410 }
  );
}

export async function GET() {
  return POST();
}

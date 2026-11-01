/**
 * @deprecated Custom TOTP generator/verifier is decommissioned and replaced by
 * Supabase's built-in Multi-Factor Authentication (supabase.auth.mfa).
 *
 * Use `supabase.auth.mfa.enroll({ factorType: 'totp' })`,
 * `supabase.auth.mfa.challenge({ factorId })`, and
 * `supabase.auth.mfa.verify({ factorId, challengeId, code })` directly.
 */

export const IS_CUSTOM_TOTP_DEPRECATED = true;

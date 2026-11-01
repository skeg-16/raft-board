// Edge-safe token and session revocation registry

declare global {
  // eslint-disable-next-line no-var
  var __raft_revoked_tokens: Set<string> | undefined;
  // eslint-disable-next-line no-var
  var __raft_user_revocation_timestamps: Map<string, number> | undefined;
  // eslint-disable-next-line no-var
  var __raft_user_active_tokens: Map<string, Set<string>> | undefined;
}

export function getRevocationStore() {
  if (!globalThis.__raft_revoked_tokens) {
    globalThis.__raft_revoked_tokens = new Set();
  }
  if (!globalThis.__raft_user_revocation_timestamps) {
    globalThis.__raft_user_revocation_timestamps = new Map();
  }
  if (!globalThis.__raft_user_active_tokens) {
    globalThis.__raft_user_active_tokens = new Map();
  }
  return {
    revokedTokens: globalThis.__raft_revoked_tokens,
    userRevocations: globalThis.__raft_user_revocation_timestamps,
    userActiveTokens: globalThis.__raft_user_active_tokens,
  };
}

/**
 * Register a specific token as revoked
 */
export function revokeToken(token: string): void {
  if (!token) return;
  const { revokedTokens } = getRevocationStore();
  revokedTokens.add(token);
}

/**
 * Check if a token or session has been revoked (synchronous check against persistent state & timestamps)
 */
export function isTokenRevoked(token?: string | null, userId?: string | null, tokenIssuedAt?: number): boolean {
  if (!token) return false;
  const { revokedTokens, userRevocations } = getRevocationStore();
  if (revokedTokens.has(token)) return true;

  // Auto-detect userId from session cookie or token payload if not provided
  let effectiveUserId = userId;
  let effectiveIssuedAt = tokenIssuedAt;

  if (!effectiveUserId && (token.includes('id') || token.includes('raft_user_session'))) {
    try {
      let clean = token;
      if (clean.includes('raft_user_session=')) {
        clean = clean.split('raft_user_session=')[1].split(';')[0];
      }
      try {
        clean = decodeURIComponent(clean);
      } catch {
        // already decoded
      }
      const parsed = JSON.parse(clean);
      if (parsed.id) {
        effectiveUserId = parsed.id;
        effectiveIssuedAt = parsed.issuedAt;
      }
    } catch {
      // not json
    }
  }

  if (effectiveUserId && userRevocations.has(effectiveUserId)) {
    const revokedAt = userRevocations.get(effectiveUserId)!;
    if (!effectiveIssuedAt || effectiveIssuedAt <= revokedAt) {
      return true;
    }
  }
  return false;
}

/**
 * Asynchronously checks if a session is still active in the database (auth.sessions, active_sessions, and profiles).
 * Used on every protected request to guarantee revoked sessions cannot continue making requests.
 */
export async function isSessionActiveInDb(
  sessionId?: string | null,
  userId?: string | null,
  tokenIssuedAt?: number
): Promise<boolean> {
  // 1. Fast path check
  if (isTokenRevoked(sessionId, userId, tokenIssuedAt)) {
    return false;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  if (isConfigured) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const admin = createAdminClient();

      // Query database procedure check_session_validity which verifies:
      // - auth.sessions (whether the session_id exists)
      // - active_sessions tracking
      // - profiles.sessions_revoked_before
      const { data, error } = await (admin as any).rpc('check_session_validity', {
        p_session_id: sessionId || null,
        p_user_id: userId || null,
        p_token_issued_at: tokenIssuedAt ? new Date(tokenIssuedAt).toISOString() : null,
      });

      if (!error && typeof data === 'boolean') {
        return data;
      }
    } catch {
      // Continue to next check if RPC is unavailable
    }
  }

  return true;
}

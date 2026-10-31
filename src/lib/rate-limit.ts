import { createAdminClient } from '@/lib/supabase/admin';

interface RateLimitConfig {
  maxAttempts: number;
  windowSeconds: number;
}

const LIMITS: Record<'login' | 'signup', RateLimitConfig> = {
  login: {
    maxAttempts: 10,
    windowSeconds: 5 * 60, // 10 attempts per 5 minutes
  },
  signup: {
    maxAttempts: 5,
    windowSeconds: 10 * 60, // 5 attempts per 10 minutes
  },
};

// In-memory fallback cache for development or when database is unreachable
const memoryFallback = new Map<string, { count: number; resetAt: number }>();

export async function checkRateLimit(
  identifier: string,
  action: 'login' | 'signup'
): Promise<{ success: boolean; remaining: number; resetInSeconds: number }> {
  const config = LIMITS[action];
  const key = `${action}:${identifier}`;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured =
    supabaseUrl &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !supabaseUrl.includes('your-project-ref');

  // 1. Persistent Database Rate Limiting (Serverless & multi-instance safe)
  if (isConfigured) {
    try {
      const adminClient = createAdminClient();
      const { data, error } = await (adminClient as any).rpc('consume_rate_limit', {
        p_key: key,
        p_max_attempts: config.maxAttempts,
        p_window_seconds: config.windowSeconds,
      });

      if (!error && data && data.length > 0) {
        const row = data[0];
        return {
          success: Boolean(row.allowed),
          remaining: Number(row.remaining),
          resetInSeconds: Number(row.reset_in_seconds),
        };
      }
      if (error) {
        console.warn('Persistent rate limiter error, falling back to memory:', error.message);
      }
    } catch (err) {
      console.warn('Persistent rate limiter connection failed, using memory fallback:', err);
    }
  }

  // 2. In-memory fallback
  const now = Date.now();
  const record = memoryFallback.get(key);

  if (!record || now > record.resetAt) {
    memoryFallback.set(key, {
      count: 1,
      resetAt: now + config.windowSeconds * 1000,
    });
    return {
      success: true,
      remaining: config.maxAttempts - 1,
      resetInSeconds: config.windowSeconds,
    };
  }

  if (record.count >= config.maxAttempts) {
    const resetInSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return {
      success: false,
      remaining: 0,
      resetInSeconds,
    };
  }

  record.count += 1;
  const remaining = config.maxAttempts - record.count;
  const resetInSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));

  return {
    success: true,
    remaining,
    resetInSeconds,
  };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

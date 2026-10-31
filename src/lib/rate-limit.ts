interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

const LIMITS: Record<'login' | 'signup', RateLimitConfig> = {
  login: {
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000, // 10 attempts per 5 minutes
  },
  signup: {
    maxAttempts: 5,
    windowMs: 10 * 60 * 1000, // 5 attempts per 10 minutes
  },
};

export function checkRateLimit(
  identifier: string,
  action: 'login' | 'signup'
): { success: boolean; remaining: number; resetInSeconds: number } {
  const now = Date.now();
  const key = `${action}:${identifier}`;
  const config = LIMITS[action];

  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return {
      success: true,
      remaining: config.maxAttempts - 1,
      resetInSeconds: Math.ceil(config.windowMs / 1000),
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

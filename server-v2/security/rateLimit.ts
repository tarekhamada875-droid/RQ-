export type RateLimitDecision = Readonly<{
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}>;

type WindowState = Readonly<{ startedAt: number; count: number }>;

export class InMemoryRateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(private readonly maxRequests: number, private readonly windowMs: number) {
    if (!Number.isInteger(maxRequests) || maxRequests < 1) throw new Error('Invalid rate limit');
    if (!Number.isInteger(windowMs) || windowMs < 1) throw new Error('Invalid rate window');
  }

  check(key: string, now = Date.now()): RateLimitDecision {
    if (!key) throw new Error('Rate-limit key is required');
    const current = this.windows.get(key);
    const isNewWindow = !current || now - current.startedAt >= this.windowMs;
    const window = isNewWindow ? { startedAt: now, count: 0 } : current;
    if (window.count >= this.maxRequests) {
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, window.startedAt + this.windowMs - now) };
    }
    const updated = { startedAt: window.startedAt, count: window.count + 1 };
    this.windows.set(key, updated);
    return { allowed: true, remaining: this.maxRequests - updated.count, retryAfterMs: 0 };
  }
}

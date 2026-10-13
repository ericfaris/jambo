// ============================================================================
// In-memory fixed-window rate limiter for the auth endpoints. The server is a
// single process, so memory is enough; a restart simply resets the windows.
// ============================================================================

export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the current window resets (0 when allowed). */
  retryAfterMs: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Whether `key` is currently over its limit, without counting an attempt. */
  check(key: string): RateLimitResult {
    const window = this.current(key);
    if (window && window.count >= this.limit) {
      return { allowed: false, retryAfterMs: window.resetAt - this.now() };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Counts one attempt against `key` and reports whether it was within the limit. */
  hit(key: string): RateLimitResult {
    const now = this.now();
    let window = this.current(key);
    if (!window) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    if (window.count > this.limit) {
      return { allowed: false, retryAfterMs: window.resetAt - now };
    }
    if (this.windows.size > 10_000) this.prune();
    return { allowed: true, retryAfterMs: 0 };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  clear(): void {
    this.windows.clear();
  }

  private current(key: string): Window | null {
    const window = this.windows.get(key);
    if (!window) return null;
    if (window.resetAt <= this.now()) {
      this.windows.delete(key);
      return null;
    }
    return window;
  }

  private prune(): void {
    const now = this.now();
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

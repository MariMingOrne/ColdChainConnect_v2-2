/**
 * Small in-memory failed-attempt limiter (no dependency).
 *
 * Counts *failures* per key inside a sliding window; once `max` failures are
 * reached the key is blocked until the oldest failure ages out. Successful
 * logins clear the key. State is per server process, which is enough to stop
 * password / MFA-code guessing against a single instance.
 */
export interface AttemptLimiter {
  /** Seconds until the key may try again, or 0 if it is not blocked. */
  retryAfter(key: string): number;
  recordFailure(key: string): void;
  reset(key: string): void;
  clear(): void;
}

export function createAttemptLimiter({ max, windowMs }: { max: number; windowMs: number }): AttemptLimiter {
  const failures = new Map<string, number[]>();

  const recent = (key: string, now: number) => {
    const kept = (failures.get(key) ?? []).filter((t) => now - t < windowMs);
    if (kept.length) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  };

  return {
    retryAfter(key) {
      const now = Date.now();
      const list = recent(key, now);
      if (list.length < max) return 0;
      return Math.max(1, Math.ceil((list[list.length - max] + windowMs - now) / 1000));
    },
    recordFailure(key) {
      const now = Date.now();
      const list = recent(key, now);
      list.push(now);
      failures.set(key, list);
      // Bound memory if someone sprays random usernames.
      if (failures.size > 10_000) failures.delete(failures.keys().next().value as string);
    },
    reset(key) {
      failures.delete(key);
    },
    clear() {
      failures.clear();
    },
  };
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * 5 wrong passwords per username (independent of IP, so a shared proxy IP or a
 * spoofed one changes nothing), plus 30 per client IP, within 15 minutes.
 * Counts live in this process: on serverless each warm instance counts separately.
 */
export const loginLimiter = createAttemptLimiter({ max: 5, windowMs: FIFTEEN_MINUTES });
export const loginIpLimiter = createAttemptLimiter({ max: 30, windowMs: FIFTEEN_MINUTES });

/** 5 wrong 6-digit codes per account within 15 minutes. */
export const mfaLimiter = createAttemptLimiter({ max: 5, windowMs: FIFTEEN_MINUTES });

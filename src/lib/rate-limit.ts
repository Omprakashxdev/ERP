import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let ratelimit: Ratelimit | null = null;
let mobileRatelimit: Ratelimit | null = null;

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const IP_LIMIT = 10;
const MOBILE_LIMIT = 120;
const WINDOW_MS = 60_000;

if (redisUrl && redisToken) {
  ratelimit = new Ratelimit({
    redis: new Redis({ url: redisUrl, token: redisToken }),
    limiter: Ratelimit.slidingWindow(IP_LIMIT, "1m"),
    analytics: true,
  });
  // Field staff sync bursts — a wider window than the strict login limiter.
  mobileRatelimit = new Ratelimit({
    redis: new Redis({ url: redisUrl, token: redisToken }),
    limiter: Ratelimit.slidingWindow(MOBILE_LIMIT, "1m"),
    analytics: true,
  });
}

// In-memory sliding-window fallback when Upstash is not configured.
// Accurate for the single fork-mode erp-adelphos PM2 process; counters
// reset on restart and are per-process, so multi-instance deployments
// must use Upstash instead.
const hits = new Map<string, number[]>();
let lastSweep = 0;

export function memoryLimit(
  limit: number,
  identifier: string
): { success: boolean; limit: number; remaining: number; reset: number } {
  const now = Date.now();
  if (now - lastSweep > WINDOW_MS) {
    lastSweep = now;
    for (const [k, v] of hits) {
      const live = v.filter((t) => now - t < WINDOW_MS);
      if (live.length === 0) hits.delete(k);
      else hits.set(k, live);
    }
  }
  const arr = (hits.get(identifier) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= limit) {
    hits.set(identifier, arr);
    return { success: false, limit, remaining: 0, reset: arr[0] + WINDOW_MS };
  }
  arr.push(now);
  hits.set(identifier, arr);
  return {
    success: true,
    limit,
    remaining: limit - arr.length,
    reset: now + WINDOW_MS,
  };
}

/**
 * Fail-closed startup check — called from instrumentation register().
 * In production a missing rate-limiter backend must never go unnoticed:
 * either Upstash is configured or RATE_LIMIT_FALLBACK=memory is an
 * explicit operator opt-in to the per-process in-memory limiter.
 */
export function assertRateLimitConfig(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (redisUrl && redisToken) return;
  if (process.env.RATE_LIMIT_FALLBACK === "memory") {
    console.warn(
      "[rate-limit] UPSTASH_REDIS_* not set — in-memory limiter active " +
        "(single-process only; counters reset on restart)."
    );
    return;
  }
  throw new Error(
    "RATE LIMITING UNCONFIGURED: set UPSTASH_REDIS_REST_URL and " +
      "UPSTASH_REDIS_REST_TOKEN, or set RATE_LIMIT_FALLBACK=memory to " +
      "explicitly opt in to the per-process in-memory limiter."
  );
}

export async function rateLimitByIp(identifier: string) {
  if (!ratelimit) {
    return memoryLimit(IP_LIMIT, identifier);
  }
  return ratelimit.limit(identifier);
}

export async function rateLimitMobile(identifier: string) {
  if (!mobileRatelimit) {
    return memoryLimit(MOBILE_LIMIT, identifier);
  }
  return mobileRatelimit.limit(identifier);
}

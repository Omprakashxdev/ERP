import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let ratelimit: Ratelimit | null = null;

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (redisUrl && redisToken) {
  ratelimit = new Ratelimit({
    redis: new Redis({ url: redisUrl, token: redisToken }),
    limiter: Ratelimit.slidingWindow(10, "1m"),
    analytics: true,
  });
}

export async function rateLimitByIp(identifier: string) {
  if (!ratelimit) {
    return { success: true, limit: 10, remaining: 10, reset: 0 };
  }
  return ratelimit.limit(identifier);
}

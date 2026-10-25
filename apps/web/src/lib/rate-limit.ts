/**
 * Fixed-window in-memory rate limiter. Good enough for a single instance and local development;
 * on multi-instance deployments (Vercel), put a shared limiter (e.g. Upstash Redis or Vercel WAF rules) in front.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return true;
  }
  bucket.count++;
  return bucket.count <= limit;
}

export function resetRateLimits() {
  buckets.clear();
}
